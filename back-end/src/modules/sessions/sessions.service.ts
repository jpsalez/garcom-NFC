import { inject, injectable } from "tsyringe";
import type { reason, tableStatus } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { generateSessionToken, isPublicCode } from "../../shared/utils/token.ts";
import { closeSessionResources } from "./close-session.ts";
import { OrdersRepository } from "../orders/orders.repository.ts";
import type { ITableRepository } from "../tables/tables.repository.interface.ts";
import { TableRepository } from "../tables/tables.repository.ts";
import type { ISessionsService } from "./sessions.interfaces.ts";
import type { ITableSessionRepository } from "./sessions.repository.interface.ts";
import { SessionTokenRepository, TableSessionRepository } from "./sessions.repository.ts";

const sessionTtlMs = () => (Number(process.env.TABLE_SESSION_TTL) || 14400) * 1000;
@injectable()
export class SessionsService implements ISessionsService {
  constructor(
    @inject("TableRepository") private tableRepository: ITableRepository,
    @inject("TableSessionRepository") private sessionRepository: ITableSessionRepository,
    @inject("Notifier") private notifier: INotifier,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}
  async scan(publicCode: string) {
    const table = isPublicCode(publicCode) ? await this.tableRepository.findByPublicCode(publicCode) : null;
    if (!table?.active || !table.restaurant.active) throw new NotFoundError("Mesa não encontrada");
    const result = await this.unit.run(table.restaurant_id, async ({ db, now }) => {
      const fresh = await new TableRepository(db).findByPublicCode(publicCode);
      if (!fresh?.active || !fresh.restaurant.active) throw new NotFoundError("Mesa não encontrada");
      const sessions = new TableSessionRepository(db);
      let session = await sessions.findActiveByTable(fresh.restaurant_id, fresh.id);
      let expiredId: string | null = null;
      if (session && !session.keep_open && session.expires_at <= now) {
        expiredId = session.id;
        await this.finishInTransaction(db, fresh.restaurant_id, session.id, "TIMEOUT", now);
        session = null;
      }
      const opened = !session;
      session ??= await sessions.create({
        restaurant_id: fresh.restaurant_id,
        table_id: fresh.id,
        expires_at: new Date(now.getTime() + sessionTtlMs()),
      });
      const { token, tokenHash } = generateSessionToken();
      await new SessionTokenRepository(db).create({ session_id: session.id, token_hash: tokenHash });
      return { session, token, opened, expiredId, table: fresh };
    });
    if (result.expiredId)
      this.notifier.toRestaurant(table.restaurant_id, "session:closed", {
        id: result.expiredId,
        reason: "TIMEOUT",
      });
    if (result.opened)
      this.notifier.toRestaurant(table.restaurant_id, "session:opened", {
        id: result.session.id,
        table: { id: table.id, label: result.table.label },
        expires_at: result.session.expires_at,
      });
    return {
      token: result.token,
      expires_at: result.session.expires_at,
      table: { label: result.table.label },
      restaurant: { name: result.table.restaurant.name },
    };
  }
  async open(restaurantId: string, tableId: string) {
    const result = await this.unit.run(restaurantId, async ({ db, now }) => {
      const table = await new TableRepository(db).findById(restaurantId, tableId);
      if (!table) throw new NotFoundError("Mesa não encontrada");
      if (!table.active) throw new ConflictError("A mesa está inativa", "TABLE_INACTIVE");
      const sessions = new TableSessionRepository(db),
        active = await sessions.findActiveByTable(restaurantId, tableId);
      if (active && (active.keep_open || active.expires_at > now))
        throw new ConflictError("A mesa já tem um atendimento ativo", "SESSION_ALREADY_ACTIVE");
      if (active) await this.finishInTransaction(db, restaurantId, active.id, "TIMEOUT", now);
      return {
        table,
        expiredId: active?.id,
        session: await sessions.create({
          restaurant_id: restaurantId,
          table_id: tableId,
          expires_at: new Date(now.getTime() + sessionTtlMs()),
        }),
      };
    });
    if (result.expiredId)
      this.notifier.toRestaurant(restaurantId, "session:closed", { id: result.expiredId, reason: "TIMEOUT" });
    this.notifier.toRestaurant(restaurantId, "session:opened", {
      id: result.session.id,
      table: { id: tableId, label: result.table.label },
      expires_at: result.session.expires_at,
    });
    return result.session;
  }
  async close(restaurantId: string, id: string, userId: string) {
    if (!(await this.sessionRepository.findById(restaurantId, id)))
      throw new NotFoundError("Atendimento não encontrado");
    const closed = await this.finish(restaurantId, id, "STAFF", userId, true);
    if (!closed) throw new ConflictError("O atendimento já foi encerrado", "SESSION_CLOSED");
    return closed;
  }
  async extend(restaurantId: string, id: string) {
    const session = await this.unit.run(restaurantId, async ({ db, now }) => {
      const repository = new TableSessionRepository(db),
        current = await repository.findById(restaurantId, id);
      if (!current) throw new NotFoundError("Atendimento não encontrado");
      if (current.status !== "ACTIVE")
        throw new ConflictError("O atendimento já foi encerrado", "SESSION_CLOSED");
      await repository.extendIfActive(
        restaurantId,
        id,
        new Date(Math.max(current.expires_at.getTime(), now.getTime()) + sessionTtlMs()),
      );
      return repository.findById(restaurantId, id);
    });
    if (!session) throw new NotFoundError();
    this.notifier.toRestaurant(restaurantId, "session:extended", { id, expires_at: session.expires_at });
    return session;
  }
  async closeActiveOfTable(restaurantId: string, tableId: string, userId: string) {
    const active = await this.sessionRepository.findActiveByTable(restaurantId, tableId);
    if (active) await this.finish(restaurantId, active.id, "STAFF", userId);
  }
  async closeAllActive(restaurantId: string, userId: string) {
    for (const session of await this.sessionRepository.findMany(restaurantId, { status: "ACTIVE" }))
      await this.tryFinish(restaurantId, session.id, "STAFF", userId);
  }
  async expireDue() {
    let closed = 0;
    for (const session of await this.sessionRepository.findExpired(new Date()))
      if (await this.tryFinish(session.restaurant_id, session.id, "TIMEOUT")) closed++;
    return closed;
  }
  list(restaurantId: string, status: tableStatus, page: { limit: number; offset: number }) {
    return this.sessionRepository.findMany(restaurantId, { status, ...page });
  }
  private async tryFinish(restaurantId: string, id: string, closedReason: reason, closedBy?: string) {
    try {
      return Boolean(await this.finish(restaurantId, id, closedReason, closedBy));
    } catch (error) {
      console.error("Falha ao encerrar atendimento", {
        id,
        message: error instanceof Error ? error.message : "Erro inesperado",
      });
      return false;
    }
  }
  private async finishInTransaction(
    db: DbClient,
    restaurantId: string,
    id: string,
    closedReason: reason,
    now: Date,
    closedBy?: string,
    manual = false,
  ) {
    const sessions = new TableSessionRepository(db),
      current = await sessions.findById(restaurantId, id);
    if (current?.status !== "ACTIVE") return null;
    if (closedReason === "TIMEOUT" && (current.keep_open || current.expires_at > now)) return null;
    if (manual && (await new OrdersRepository(db).hasPendingForSession(restaurantId, id)))
      throw new ConflictError("Conclua ou cancele os pedidos pendentes", "SESSION_HAS_PENDING_ORDERS");
    return closeSessionResources(db, restaurantId, id, now, closedReason, closedBy);
  }
  private async finish(
    restaurantId: string,
    id: string,
    closedReason: reason,
    closedBy?: string,
    manual = false,
  ) {
    const closed = await this.unit.run(
      restaurantId,
      ({ db, now }) => this.finishInTransaction(db, restaurantId, id, closedReason, now, closedBy, manual),
      { allowInactive: true },
    );
    if (closed) this.notifier.toRestaurant(restaurantId, "session:closed", { id, reason: closedReason });
    return closed;
  }
}
