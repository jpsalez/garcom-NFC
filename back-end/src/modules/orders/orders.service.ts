import { inject, injectable } from "tsyringe";
import type { tabs } from "../../../generated/prisma/client.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { requireCapability } from "../../shared/authorization/capabilities.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type {
  IRestaurantUnitOfWork,
  RestaurantTransaction,
} from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyOrder } from "../../shared/realtime/order-events.ts";
import { encodeCursor } from "../../shared/utils/cursor.ts";
import { enqueueOriginal } from "../printing/print-job.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import { loadTabLedger, summarizeLedger } from "../tabs/tab-ledger.ts";
import { notifyTabOpened, notifyTabUpdated } from "../tabs/tab-events.ts";
import {
  ensureOpenTab,
  getActiveTable,
  getOrCreateForTable,
  getTab,
  isOpenTab,
  recalculateTab,
} from "../tabs/tabs-state.ts";
import { orderTableLabel, tabSummary } from "../tabs/tabs-view.ts";
import { TabsRepository } from "../tabs/tabs.repository.ts";
import type { IOrdersService } from "./orders.interfaces.ts";
import { OrdersRepository } from "./orders.repository.ts";
import type { IOrdersRepository, OrderRecord, TableContext } from "./orders.repository.interface.ts";
import { OrderSettingsRepository } from "./order-settings.repository.ts";
import { priceSubmission, submissionHash } from "./order-pricing.ts";
import { hasPendingOrderItems, move, orderView } from "./order-progress.ts";
import {
  posSubmitSchema,
  submitSchema,
  transitionsSchema,
  type OrdersQuery,
  type Submission,
  type Transition,
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
  async submit(context: TableContext, input: unknown) {
    const parsed = submitSchema.parse(input);
    const hash = submissionHash(parsed);
    const result = await this.unit.run(context.restaurantId, async (transaction) => {
      const { db, now } = transaction;
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
        return { record: previous, replayed: true, wakeStation: false, changedTab: null };
      }
      const settings = await new OrderSettingsRepository(db).get(context.restaurantId);
      if (!settings.customer_ordering_enabled)
        throw new ConflictError("Pedidos pelo cardápio estão desabilitados", "CUSTOMER_ORDERING_DISABLED");
      const { lines, total } = await this.price(db, context.restaurantId, parsed);
      const { tab, opened } = await getOrCreateForTable(transaction, session.table, session);
      const record = await repo.create(
        context.restaurantId,
        {
          tab_id: tab.id,
          session_id: session.id,
          submitted_by_token_id: context.tokenId,
          source: "LOCAL_MENU",
          fulfillment_type: "DINE_IN",
          table_label_snapshot:
            tab.table_id === session.table_id ? session.table.label : orderTableLabel(tab),
          publication_id: parsed.publication_id,
          total_cents: total,
          request_hash: hash,
          submission_key: parsed.submission_key,
        },
        lines,
      );
      return this.finishSubmission(db, record, tab, opened);
    });
    this.notifySubmission(result);
    return { order: orderView(result.record), replayed: result.replayed };
  }

  async posSubmit(actor: ActorContext, input: unknown) {
    const { tab_id, table_id, items, ...body } = posSubmitSchema.parse(input);
    const submission = {
      ...body,
      items: items.map(({ options, ...item }) => ({ ...item, selections: options })),
    };
    const hash = submissionHash(submission, { tab_id, table_id });
    const restaurantId = this.tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async (transaction) => {
        const orders = new OrdersRepository(transaction.db);
        const live = transaction.actor ?? actor;
        const previous = await orders.findSubmission(restaurantId, submission.submission_key);
        if (previous) return this.replayPosSubmission(transaction.db, live, previous, hash);
        const target = await this.posTarget(transaction, tab_id, table_id);
        const { lines, total } = await this.price(transaction.db, restaurantId, submission);
        const record = await orders.create(
          restaurantId,
          {
            tab_id: target.tab.id,
            session_id: target.sessionId,
            actor: live,
            source: "POS",
            fulfillment_type: target.tab.kind === "TABLE" ? "DINE_IN" : "COUNTER",
            table_label_snapshot: orderTableLabel(target.tab),
            publication_id: submission.publication_id,
            total_cents: total,
            request_hash: hash,
            submission_key: submission.submission_key,
          },
          lines,
        );
        const result = await this.finishSubmission(transaction.db, record, target.tab, target.opened);
        return { ...result, summary: tabSummary(result.changedTab, result.hasPendingKitchenItems, result) };
      },
      { actor, capability: "orders:create" },
    );
    this.notifySubmission(result);
    return { order: orderView(result.record, true), tab: result.summary, replayed: result.replayed };
  }

  private async price(db: DbClient, restaurantId: string, submission: Submission) {
    const menu = new MenuRepository(db);
    const publication = await menu.published(restaurantId);
    if (!publication) throw new ConflictError("Cardápio não está recebendo pedidos", "MENU_NOT_ORDERABLE");
    if (publication.id !== submission.publication_id)
      throw new ConflictError("Cardápio mudou; revise o pedido", "MENU_REVISION_CHANGED");
    return priceSubmission(publication.content, await menu.availability(restaurantId), submission);
  }

  private async posTarget(transaction: RestaurantTransaction, tabId?: string, tableId?: string) {
    const { db, restaurant, now } = transaction;
    const sessions = new TableSessionRepository(db);
    const activeSession = async (id: string) => {
      const session = await sessions.findActiveByTable(restaurant.id, id);
      return session && (session.keep_open || session.expires_at > now) ? session : null;
    };
    if (tabId) {
      const tab = await getTab(new TabsRepository(db), restaurant.id, tabId);
      ensureOpenTab(tab);
      const session = tab.table_id ? await activeSession(tab.table_id) : null;
      return { tab, opened: false, sessionId: session?.tab_id === tab.id ? session.id : undefined };
    }
    if (!tableId) throw new NotFoundError("Mesa não encontrada");
    const table = await getActiveTable(db, restaurant.id, tableId);
    const session = await activeSession(table.id);
    const tab = await getOrCreateForTable(transaction, table, session);
    return { ...tab, sessionId: session?.id };
  }

  private async replayPosSubmission(db: DbClient, actor: ActorContext, record: OrderRecord, hash: string) {
    if (record.source !== "POS" || record.submitted_by_user_id !== actor.id || record.request_hash !== hash)
      throw new ConflictError("Chave de envio já utilizada", "IDEMPOTENCY_CONFLICT");
    const repository = new TabsRepository(db);
    const tab = await getTab(repository, record.restaurant_id, record.tab_id);
    const summary = summarizeLedger(await loadTabLedger(db, tab));
    return {
      record,
      summary: tabSummary(tab, summary.hasPendingKitchenItems, summary),
      replayed: true,
      changedTab: null,
      wakeStation: false,
    };
  }

  private async finishSubmission(db: DbClient, record: OrderRecord, tab: tabs, opened: boolean) {
    const recalculated = await recalculateTab(db, tab, { reopen: true });
    return {
      record,
      replayed: false,
      opened,
      changedTab: recalculated.tab,
      hasPendingKitchenItems: recalculated.hasPendingKitchenItems,
      pendingCents: recalculated.pendingCents,
      openRequests: recalculated.openRequests,
      wakeStation: await enqueueOriginal(db, record),
    };
  }

  private notifySubmission(result: {
    record: OrderRecord;
    replayed: boolean;
    opened?: boolean;
    changedTab: tabs | null;
    pendingCents?: number;
    wakeStation: boolean;
  }) {
    if (result.replayed) return;
    notifyOrder(this.notifier, result.record, "order:created");
    if (result.changedTab) {
      if (result.opened) notifyTabOpened(this.notifier, result.changedTab);
      notifyTabUpdated(this.notifier, result.changedTab, result.pendingCents);
    }
    if (result.wakeStation) this.notifier.wakePrintStation(result.record.restaurant_id);
  }
  private page(
    records: OrderRecord[],
    limit: number,
    staff: boolean,
    sortField: "created_at" | "updated_at" = "created_at",
  ) {
    const rows = records.slice(0, limit),
      last = rows.at(-1);
    return {
      items: rows.map((row) => orderView(row, staff)),
      next_cursor:
        records.length > limit && last ? encodeCursor({ id: last.id, created_at: last[sortField] }) : null,
      server_time: new Date(),
    };
  }
  async list(actor: ActorContext, query: OrdersQuery) {
    requireCapability(actor, "orders:read");
    return this.page(
      await this.repository.list(this.tenant(actor), query),
      query.limit,
      true,
      query.progress === "closed" ? "updated_at" : "created_at",
    );
  }
  async get(actor: ActorContext, id: string) {
    requireCapability(actor, "orders:read");
    return orderView(await this.repository.get(this.tenant(actor), id, { includeReadyHistory: true }), true);
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
    const restaurantId = this.tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async ({ db, actor: current }) => {
        const live = current ?? actor;
        const repo = new OrdersRepository(db);
        const order = await repo.get(restaurantId, id);
        if (order.version !== parsed.expected_version)
          throw new ConflictError("Pedido foi alterado; atualize a página", "ORDER_VERSION_CONFLICT");
        const changes = this.planTransitions(order, parsed.operations, live);
        const tab = changes.some(({ op }) => op.to_stage === "CANCELLED")
          ? await getTab(new TabsRepository(db), restaurantId, order.tab_id)
          : null;
        if (tab) ensureOpenTab(tab);
        await this.applyTransitions(repo, order, changes, live);
        const updated = await repo.get(restaurantId, id, { includeReadyHistory: true });
        return {
          order: updated,
          tabChange: tab
            ? await recalculateTab(db, tab)
            : await this.finishTabDelivery(db, updated, parsed.operations),
        };
      },
      { actor, capability: "orders:read" },
    );
    notifyOrder(this.notifier, result.order, "order:updated");
    if (result.tabChange)
      notifyTabUpdated(this.notifier, result.tabChange.tab, result.tabChange.pendingCents);
    return orderView(result.order, true);
  }

  private async finishTabDelivery(db: DbClient, order: OrderRecord, operations: Transition[]) {
    if (!operations.some((op) => op.to_stage === "DELIVERED") || hasPendingOrderItems([order])) return null;
    const repository = new TabsRepository(db);
    const restaurantId = order.restaurant_id;
    const tab = await getTab(repository, restaurantId, order.tab_id);
    if (!isOpenTab(tab)) return null;
    const state = summarizeLedger(await loadTabLedger(db, tab));
    if (state.hasPendingKitchenItems) return null;
    const updated = await repository.update(restaurantId, tab.id, { version: tab.version + 1 });
    return { tab: updated, pendingCents: state.pendingCents };
  }

  private planTransitions(order: OrderRecord, operations: Transition[], actor: ActorContext) {
    return operations.map((op) => {
      requireCapability(
        actor,
        op.to_stage === "CANCELLED"
          ? "orders:cancel"
          : op.to_stage === "DELIVERED"
            ? "orders:deliver"
            : "orders:prepare",
      );
      const item = order.items.find((row) => row.id === op.item_id);
      if (!item) throw new NotFoundError("Item do pedido não encontrado");
      return { op, counters: move(item, op) };
    });
  }

  private async applyTransitions(
    repo: OrdersRepository,
    order: OrderRecord,
    changes: ReturnType<OrdersService["planTransitions"]>,
    actor: ActorContext,
  ) {
    await repo.claim(order.restaurant_id, order.id, order.version, changes.length);
    for (const [index, { op, counters }] of changes.entries()) {
      await repo.updateCounters(order.restaurant_id, op.item_id, counters);
      await repo.event(
        order.restaurant_id,
        order.id,
        op,
        order.last_event_sequence + index + 1,
        order.version + 1,
        actor,
      );
    }
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
