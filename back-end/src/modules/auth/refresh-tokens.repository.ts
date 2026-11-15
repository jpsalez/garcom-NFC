import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreateRefreshTokenData, IRefreshTokenRepository } from "./refresh-tokens.repository.interface.ts";

// refresh_tokens não tem restaurant_id: pertence ao usuário (o tenant dele vem do banco a cada renovação)
@injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreateRefreshTokenData) {
    return this.db.refresh_tokens.create({ data });
  }

  findByHash(tokenHash: string) {
    return this.db.refresh_tokens.findUnique({ where: { token_hash: tokenHash } });
  }

  revokeIfActive(id: string, now: Date) {
    return this.db.refresh_tokens.updateMany({
      where: { id, revoked_at: null, expires_at: { gt: now } },
      data: { revoked_at: now },
    });
  }

  revokeAllByUser(userId: string, now: Date) {
    return this.db.refresh_tokens.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } });
  }
}
