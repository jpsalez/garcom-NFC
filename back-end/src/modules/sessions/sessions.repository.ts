import { inject, injectable } from "tsyringe";
import { tableStatus, type Prisma } from "../../../generated/prisma/client.ts";
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

  findActiveByTable(tableId: string) {
    return this.db.table_sessions.findFirst({
      where: { table_id: tableId, status: tableStatus.ACTIVE },
    });
  }

  findMany(restaurantId: string, filter: { status?: tableStatus } = {}) {
    return this.db.table_sessions.findMany({
      where: { restaurant_id: restaurantId, status: filter.status },
      include: {
        table: { select: { id: true, label: true } },
        _count: { select: { session_tokens: { where: { revoked_at: null } } } },
      },
    });
  }

  // Usado pelo job de expiração (sem tenant: varre todos os restaurantes)
  findExpired(now: Date) {
    return this.db.table_sessions.findMany({
      where: { status: tableStatus.ACTIVE, keep_open: false, expires_at: { lte: now } },
    });
  }

  update(restaurantId: string, id: string, data: UpdateTableSessionData) {
    return this.db.table_sessions.update({ where: { id, restaurant_id: restaurantId }, data });
  }

  delete(restaurantId: string, id: string) {
    return this.db.table_sessions.delete({ where: { id, restaurant_id: restaurantId } });
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

  findById(id: string) {
    return this.db.session_tokens.findUnique({ where: { id } });
  }

  findByHash(tokenHash: string) {
    return this.db.session_tokens.findUnique({
      where: { token_hash: tokenHash },
      include: { table_session: true },
    });
  }

  findManyBySession(restaurantId: string, sessionId: string) {
    return this.db.session_tokens.findMany({
      where: { session_id: sessionId, table_session: { restaurant_id: restaurantId } },
    });
  }

  update(id: string, data: Prisma.session_tokensUpdateInput) {
    return this.db.session_tokens.update({ where: { id }, data });
  }

  // Retorna { count } com a quantidade de tokens revogados
  revokeAllBySession(sessionId: string, revokedAt: Date) {
    return this.db.session_tokens.updateMany({
      where: { session_id: sessionId, revoked_at: null },
      data: { revoked_at: revokedAt },
    });
  }

  delete(id: string) {
    return this.db.session_tokens.delete({ where: { id } });
  }
}
