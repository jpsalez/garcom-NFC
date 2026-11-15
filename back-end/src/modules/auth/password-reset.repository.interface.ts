import type { Prisma, password_resets } from "../../../generated/prisma/client.ts";

export type CreatePasswordResetData = {
  user_id: string;
  token_hash: string;
  expires_at: Date;
};

export interface IPasswordResetRepository {
  create(data: CreatePasswordResetData): Promise<password_resets>;
  findByHash(tokenHash: string): Promise<password_resets | null>;
  // Só consome se ainda valer: dois usos do mesmo link não passam os dois ({ count: 0 } = perdeu)
  useIfValid(id: string, now: Date): Promise<Prisma.BatchPayload>;
  useAllByUser(userId: string, now: Date): Promise<Prisma.BatchPayload>;
  deleteExpired(now: Date): Promise<Prisma.BatchPayload>;
}
