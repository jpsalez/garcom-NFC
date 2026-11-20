import { inject, injectable } from "tsyringe";
import { tableStatus } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type {
  CreateSessionTokenData,
  CreateTableSessionData,
  ISessionTokenRepository,
  ITableSessionRepository,
  UpdateTableSessionData,
} from "./sessions.repository.interface.ts";

@injectable()
export class TableSessionRepository implements ITableSessionRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateTableSessionData) {
    return this.db.table_sessions.create({ data });
  }

  findById(restaurantId: string, id: string) {
    return this.db.table_sessions.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  findActiveByTable(restaurantId: string, tableId: string) {
    return this.db.table_sessions.findFirst({
      where: { restaurant_id: restaurantId, table_id: tableId, status: tableStatus.ACTIVE },
    });
  }

  findActiveByTab(restaurantId: string, tabId: string) {
    return this.db.table_sessions.findMany({
      where: { restaurant_id: restaurantId, tab_id: tabId, status: tableStatus.ACTIVE },
    });
  }

  findMany(restaurantId: string, filter: { status?: tableStatus; limit?: number; offset?: number } = {}) {
    return this.db.table_sessions.findMany({
      where: { restaurant_id: restaurantId, status: filter.status },
      // Mais recentes primeiro; o id desempata para a paginação não repetir nem pular linhas
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: filter.limit,
      skip: filter.offset,
      include: {
        table: { select: { id: true, label: true } },
        _count: { select: { session_tokens: { where: { revoked_at: null } } } },
      },
    });
  }

  linkTab(restaurantId: string, id: string, tabId: string) {
    return this.db.table_sessions.updateMany({
      where: { restaurant_id: restaurantId, id, status: tableStatus.ACTIVE },
      data: { tab_id: tabId },
    });
  }

  moveActiveToTable(restaurantId: string, tabId: string, fromTableId: string, tableId: string) {
    return this.db.table_sessions.updateMany({
      where: {
        restaurant_id: restaurantId,
        tab_id: tabId,
        table_id: fromTableId,
        status: tableStatus.ACTIVE,
      },
      data: { table_id: tableId },
    });
  }

  moveToTab(restaurantId: string, sourceTabId: string, targetTabId: string) {
    return this.db.table_sessions.updateMany({
      where: { restaurant_id: restaurantId, tab_id: sourceTabId },
      data: { tab_id: targetTabId },
    });
  }

  // Usado pelo job de expiração (sem tenant: varre todos os restaurantes)
  findExpired(now: Date) {
    return this.db.table_sessions.findMany({
      where: { status: tableStatus.ACTIVE, keep_open: false, expires_at: { lte: now } },
    });
  }

  // Só estende se ainda estiver ACTIVE: um encerramento simultâneo não é desfeito nem anunciado depois ({ count: 0 } = perdeu)
  extendIfActive(restaurantId: string, id: string, expiresAt: Date) {
    return this.db.table_sessions.updateMany({
      where: { id, restaurant_id: restaurantId, status: tableStatus.ACTIVE },
      data: { expires_at: expiresAt },
    });
  }

  // Trava a linha enquanto a transação durar, se a sessão ainda estiver ACTIVE: um encerramento simultâneo espera
  async lockActive(restaurantId: string, id: string) {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM table_sessions WHERE id = ${id} AND restaurant_id = ${restaurantId} AND status = 'ACTIVE' FOR SHARE`;
    return rows.length > 0;
  }

  // Só atualiza se ainda estiver ACTIVE: dois encerramentos simultâneos não se sobrescrevem ({ count: 0 } = perdeu)
  closeIfActive(restaurantId: string, id: string, data: UpdateTableSessionData) {
    return this.db.table_sessions.updateMany({
      where: { id, restaurant_id: restaurantId, status: tableStatus.ACTIVE },
      data: { ...data, status: tableStatus.CLOSED, closed_at: new Date() },
    });
  }
}

// session_tokens não tem restaurant_id: o tenant é checado pela sessão
@injectable()
export class SessionTokenRepository implements ISessionTokenRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateSessionTokenData) {
    return this.db.session_tokens.create({ data });
  }

  findByHash(tokenHash: string) {
    return this.db.session_tokens.findUnique({
      where: { token_hash: tokenHash },
      include: { table_session: { include: { table: { select: { label: true } } } } },
    });
  }

  findActiveForSession(restaurantId: string, sessionId: string, tokenId: string) {
    return this.db.session_tokens.findFirst({
      where: {
        id: tokenId,
        session_id: sessionId,
        revoked_at: null,
        table_session: { restaurant_id: restaurantId, status: tableStatus.ACTIVE, table: { active: true } },
      },
      select: { guest_label: true },
    });
  }

  setGuestLabel(restaurantId: string, tokenId: string, guestLabel: string | null) {
    return this.db.session_tokens.updateMany({
      where: {
        id: tokenId,
        revoked_at: null,
        table_session: { restaurant_id: restaurantId, status: tableStatus.ACTIVE },
      },
      data: { guest_label: guestLabel },
    });
  }

  // Retorna { count } com a quantidade de tokens revogados
  revokeAllBySession(sessionId: string, revokedAt: Date) {
    return this.db.session_tokens.updateMany({
      where: { session_id: sessionId, revoked_at: null },
      data: { revoked_at: revokedAt },
    });
  }
}
