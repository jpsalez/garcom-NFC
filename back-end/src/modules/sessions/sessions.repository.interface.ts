import type {
  Prisma,
  reason,
  session_tokens,
  table_sessions,
  tableStatus,
} from "../../../generated/prisma/client.ts";

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

export type TableSessionListItem = Prisma.table_sessionsGetPayload<{
  include: {
    table: { select: { id: true; label: true } };
    _count: { select: { session_tokens: true } };
  };
}>;

export interface ITableSessionRepository {
  create(data: CreateTableSessionData): Promise<table_sessions>;
  findById(restaurantId: string, id: string): Promise<table_sessions | null>;
  findActiveByTable(restaurantId: string, tableId: string): Promise<table_sessions | null>;
  findMany(restaurantId: string, filter?: { status?: tableStatus }): Promise<TableSessionListItem[]>;
  findExpired(now: Date): Promise<table_sessions[]>;
  update(restaurantId: string, id: string, data: UpdateTableSessionData): Promise<table_sessions>;
  lockActive(restaurantId: string, id: string): Promise<boolean>;
  closeIfActive(restaurantId: string, id: string, data: UpdateTableSessionData): Promise<Prisma.BatchPayload>;
}

export type CreateSessionTokenData = {
  session_id: string;
  token_hash: string;
};

export type SessionTokenWithSession = Prisma.session_tokensGetPayload<{
  include: { table_session: { include: { table: { select: { label: true } } } } };
}>;

export interface ISessionTokenRepository {
  create(data: CreateSessionTokenData): Promise<session_tokens>;
  findByHash(tokenHash: string): Promise<SessionTokenWithSession | null>;
  revokeAllBySession(sessionId: string, revokedAt: Date): Promise<Prisma.BatchPayload>;
}
