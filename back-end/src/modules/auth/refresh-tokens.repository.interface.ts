import type { Prisma, refresh_tokens } from "../../../generated/prisma/client.ts";

export type CreateRefreshTokenData = {
  user_id: string;
  token_hash: string;
  expires_at: Date;
};

export interface IRefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<refresh_tokens>;
  findByHash(tokenHash: string): Promise<refresh_tokens | null>;
  // Só revoga se ainda valer: dois pedidos com o mesmo token não passam os dois ({ count: 0 } = perdeu)
  revokeIfActive(id: string, now: Date): Promise<Prisma.BatchPayload>;
  revokeAllByUser(userId: string, now: Date): Promise<Prisma.BatchPayload>;
  // Vencido não serve mais nem para detectar reuso: pode sair do banco
  deleteExpired(now: Date): Promise<Prisma.BatchPayload>;
}
