import { Prisma, tableStatus, reason } from "../../../generated/prisma/client.ts";
import { prisma, type DbClient } from "../../shared/providers/prisma.ts";

export type CreateTableSessionData = {
  restaurant_id: string;
  table_id: string;
  expires_at: Date;
};

export type UpdateTableSessionData = {
  status?: tableStatus;
  keep_open?: boolean;
  expires_at?: Date;
  closed_reason?: reason;
  closed_by?: string;
};

export class TableSessionRepository {
  private readonly db: DbClient;

  constructor(db: DbClient = prisma) {
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

export type CreateSessionTokenData = {
  session_id: string;
  token_hash: string;
};

// session_tokens não tem restaurant_id: o tenant é checado pela sessão
export class SessionTokenRepository {
  private readonly db: DbClient;

  constructor(db: DbClient = prisma) {
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
