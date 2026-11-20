import { inject, injectable } from "tsyringe";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { requireCapability } from "../../shared/authorization/capabilities.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { encodeCursor } from "../../shared/utils/cursor.ts";
import { enqueueOriginal } from "../printing/print-job.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { closeSessionResources } from "../sessions/close-session.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import { sessionTtlMs } from "../sessions/sessions.service.ts";
import { TableRepository } from "../tables/tables.repository.ts";
import type { IOrdersService } from "./orders.interfaces.ts";
import { OrdersRepository } from "./orders.repository.ts";
import type { IOrdersRepository, OrderRecord, TableContext } from "./orders.repository.interface.ts";
import { OrderSettingsRepository } from "./order-settings.repository.ts";
import { priceSubmission, submissionHash } from "./order-pricing.ts";
import { move, orderView } from "./order-progress.ts";
import {
  posSubmitSchema,
  submitSchema,
  transitionsSchema,
  type OrdersQuery,
  type Submission,
} from "./orders.schemas.ts";

@injectable()
export class OrdersService implements IOrdersService {
  constructor(
    @inject("OrdersRepository") private repository: IOrdersRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
  ) {}
  private tenant(actor: ActorContext) {
    if (!actor.restaurantId) throw new NotFoundError();
    return actor.restaurantId;
  }
  private notify(order: OrderRecord, event: string) {
    try {
      this.notifier.toOrders(order.restaurant_id, event, { order_id: order.id, version: order.version });
    } catch {
      console.error("Falha ao emitir evento de pedido", { order_id: order.id });
    }
  }
  private notifyRestaurant(restaurantId: string, event: string, payload: unknown) {
    try {
      this.notifier.toRestaurant(restaurantId, event, payload);
    } catch {
      console.error("Falha ao emitir evento de atendimento", { event, restaurant_id: restaurantId });
    }
  }
  private async priceFromPublished(db: DbClient, restaurantId: string, publicationId: string, input: Submission) {
    const menu = new MenuRepository(db),
      publication = await menu.published(restaurantId);
    if (!publication) throw new ConflictError("Cardápio não está recebendo pedidos", "MENU_NOT_ORDERABLE");
    if (publication.id !== publicationId)
      throw new ConflictError("Cardápio mudou; revise o pedido", "MENU_REVISION_CHANGED");
    return {
      publicationId: publication.id,
      ...priceSubmission(publication.content, await menu.availability(restaurantId), input),
    };
  }
  private async resolvePosSession(db: DbClient, restaurantId: string, tableId: string, now: Date) {
    const sessions = new TableSessionRepository(db);
    const active = await sessions.findActiveByTable(restaurantId, tableId);
    if (active && (active.keep_open || active.expires_at > now))
      return { session: active, opened: false, expiredId: null as string | null };
    if (active) await closeSessionResources(db, restaurantId, active.id, now, "TIMEOUT");
    const created = await sessions.create({
      restaurant_id: restaurantId,
      table_id: tableId,
      expires_at: new Date(now.getTime() + sessionTtlMs()),
    });
    return { session: created, opened: true, expiredId: active?.id ?? null };
  }
  async submit(context: TableContext, input: unknown) {
    const parsed = submitSchema.parse(input),
      hash = submissionHash(parsed);
    const result = await this.unit.run(context.restaurantId, async ({ db, now }) => {
      const repo = new OrdersRepository(db);
      const session = await repo.device(context, now);
      const previous = await repo.findSubmission(context.restaurantId, parsed.submission_key);
      if (previous) {
        if (
          previous.session_id !== context.sessionId ||
          previous.submitted_by_token_id !== context.tokenId ||
          previous.request_hash !== hash
        )
          throw new ConflictError("Chave de envio já utilizada", "IDEMPOTENCY_CONFLICT");
        return { record: previous, replayed: true };
      }
      const settings = await new OrderSettingsRepository(db).get(context.restaurantId);
      if (!settings.customer_ordering_enabled)
        throw new ConflictError("Pedidos pelo cardápio estão desabilitados", "CUSTOMER_ORDERING_DISABLED");
      const { publicationId, lines, total } = await this.priceFromPublished(
        db,
        context.restaurantId,
        parsed.publication_id,
        parsed,
      );
      const record = await repo.create({
        restaurantId: context.restaurantId,
        source: "LOCAL_MENU",
        sessionId: context.sessionId,
        tabNumberSnapshot: session.tab_number,
        tableLabelSnapshot: session.table.label,
        submittedByTokenId: context.tokenId,
        submittedByUserId: null,
        publicationId,
        submissionKey: parsed.submission_key,
        requestHash: hash,
        totalCents: total,
        lines,
      });
      await enqueueOriginal(db, record);
      return { record, replayed: false };
    });
    if (!result.replayed) this.notify(result.record, "order:created");
    return { order: orderView(result.record), replayed: result.replayed };
  }
  async posSubmit(actor: ActorContext, input: unknown) {
    const parsed = posSubmitSchema.parse(input),
      hash = submissionHash(parsed, parsed.table_id),
      restaurantId = this.tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async ({ db, now, actor: current }) => {
        const live = current ?? actor,
          repo = new OrdersRepository(db);
        const previous = await repo.findSubmission(restaurantId, parsed.submission_key);
        if (previous) {
          if (
            previous.source !== "POS" ||
            previous.submitted_by_user_id !== live.id ||
            previous.session?.table_id !== parsed.table_id ||
            previous.request_hash !== hash
          )
            throw new ConflictError("Chave de envio já utilizada", "IDEMPOTENCY_CONFLICT");
          return { record: previous, replayed: true, openedSession: null, tableLabel: null, expiredId: null };
        }
        const table = await new TableRepository(db).findById(restaurantId, parsed.table_id);
        if (!table) throw new NotFoundError("Mesa não encontrada");
        if (!table.active) throw new ConflictError("A mesa está inativa", "TABLE_INACTIVE");
        const { session, opened, expiredId } = await this.resolvePosSession(db, restaurantId, table.id, now);
        const { publicationId, lines, total } = await this.priceFromPublished(
          db,
          restaurantId,
          parsed.publication_id,
          parsed,
        );
        const record = await repo.create({
          restaurantId,
          source: "POS",
          sessionId: session.id,
          tabNumberSnapshot: session.tab_number,
          tableLabelSnapshot: table.label,
          submittedByTokenId: null,
          submittedByUserId: live.id,
          publicationId,
          submissionKey: parsed.submission_key,
          requestHash: hash,
          totalCents: total,
          lines,
          actor: live,
        });
        await enqueueOriginal(db, record);
        return {
          record,
          replayed: false,
          openedSession: opened ? session : null,
          tableLabel: table.label,
          expiredId,
        };
      },
      { actor, capability: "orders:create" },
    );
    if (result.expiredId)
      this.notifyRestaurant(restaurantId, "session:closed", { id: result.expiredId, reason: "TIMEOUT" });
    if (result.openedSession && result.tableLabel)
      this.notifyRestaurant(restaurantId, "session:opened", {
        id: result.openedSession.id,
        tab_number: result.openedSession.tab_number,
        table: { id: result.openedSession.table_id, label: result.tableLabel },
        expires_at: result.openedSession.expires_at,
      });
    if (!result.replayed) this.notify(result.record, "order:created");
    return { order: orderView(result.record, true), replayed: result.replayed };
  }
  private page(records: OrderRecord[], limit: number, staff: boolean) {
    const rows = records.slice(0, limit),
      last = rows.at(-1);
    return {
      items: rows.map((row) => orderView(row, staff)),
      next_cursor: records.length > limit && last ? encodeCursor(last) : null,
      server_time: new Date(),
    };
  }
  async list(actor: ActorContext, query: OrdersQuery) {
    requireCapability(actor, "orders:read");
    return this.page(await this.repository.list(this.tenant(actor), query), query.limit, true);
  }
  async get(actor: ActorContext, id: string) {
    requireCapability(actor, "orders:read");
    return orderView(await this.repository.get(this.tenant(actor), id), true);
  }
  async deviceList(context: TableContext, query: OrdersQuery) {
    return this.unit.run(context.restaurantId, async ({ db, now }) => {
      const repo = new OrdersRepository(db);
      await repo.device(context, now);
      return this.page(
        await repo.list(
          context.restaurantId,
          { ...query, session_id: context.sessionId, progress: undefined },
          context.tokenId,
        ),
        query.limit,
        false,
      );
    });
  }
  async deviceGet(context: TableContext, id: string) {
    return this.unit.run(context.restaurantId, async ({ db, now }) => {
      const repo = new OrdersRepository(db);
      await repo.device(context, now);
      const record = await repo.get(context.restaurantId, id);
      if (record.session_id !== context.sessionId || record.submitted_by_token_id !== context.tokenId)
        throw new NotFoundError("Pedido não encontrado");
      return orderView(record);
    });
  }
  async transition(actor: ActorContext, id: string, input: unknown) {
    const parsed = transitionsSchema.parse(input);
    const result = await this.unit.run(
      this.tenant(actor),
      async ({ db, actor: current }) => {
        const live = current ?? actor,
          repo = new OrdersRepository(db),
          record = await repo.get(this.tenant(actor), id);
        if (record.version !== parsed.expected_version)
          throw new ConflictError("Pedido foi alterado; atualize a página", "ORDER_VERSION_CONFLICT");
        const changes = parsed.operations.map((op) => {
          requireCapability(
            live,
            op.to_stage === "CANCELLED"
              ? "orders:cancel"
              : op.to_stage === "DELIVERED"
                ? "orders:deliver"
                : "orders:prepare",
          );
          const item = record.items.find((row) => row.id === op.item_id);
          if (!item) throw new NotFoundError("Item do pedido não encontrado");
          return { op, counters: move(item, op) };
        });
        await repo.claim(this.tenant(actor), id, parsed.expected_version, changes.length);
        for (const [index, change] of changes.entries()) {
          await repo.updateCounters(this.tenant(actor), change.op.item_id, change.counters);
          await repo.event(
            this.tenant(actor),
            id,
            change.op,
            record.last_event_sequence + index + 1,
            record.version + 1,
            live,
          );
        }
        return repo.get(this.tenant(actor), id);
      },
      { actor, capability: "orders:read" },
    );
    this.notify(result, "order:updated");
    return orderView(result, true);
  }
  async events(actor: ActorContext, id: string, after: number, limit: number) {
    requireCapability(actor, "orders:read");
    await this.repository.get(this.tenant(actor), id);
    // Leitura sem unidade de escrita; repository concreto preserva a paginação da auditoria.
    const rows = await this.repository.events(this.tenant(actor), id, after, limit);
    return {
      items: rows.slice(0, limit),
      next_sequence: rows.length > limit ? (rows[limit - 1]?.sequence ?? null) : null,
    };
  }
  async context(context: TableContext) {
    return this.unit.run(context.restaurantId, async ({ db, now }) => {
      const session = await new OrdersRepository(db).device(context, now),
        settings = await new OrderSettingsRepository(db).get(context.restaurantId),
        publication = await new MenuRepository(db).published(context.restaurantId);
      return {
        session_id: session.id,
        tab_number: session.tab_number,
        expires_at: session.expires_at,
        table: { label: session.table.label },
        can_order: settings.customer_ordering_enabled && Boolean(publication),
        reason: !settings.customer_ordering_enabled
          ? "CUSTOMER_ORDERING_DISABLED"
          : !publication
            ? "MENU_NOT_PUBLISHED"
            : null,
      };
    });
  }
}
