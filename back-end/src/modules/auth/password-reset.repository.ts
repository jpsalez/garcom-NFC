import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { CreatePasswordResetData, IPasswordResetRepository } from "./password-reset.repository.interface.ts";

// password_resets pertence ao usuário (sem restaurant_id), como refresh_tokens
@injectable()
export class PasswordResetRepository implements IPasswordResetRepository {
  private readonly db: DbClient;

  constructor(@inject("DbClient") db: DbClient) {
    this.db = db;
  }

  create(data: CreatePasswordResetData) {
    return this.db.password_resets.create({ data });
  }

  findByHash(tokenHash: string) {
    return this.db.password_resets.findUnique({ where: { token_hash: tokenHash } });
  }

  useIfValid(id: string, now: Date) {
    return this.db.password_resets.updateMany({ where: { id, used_at: null, expires_at: { gt: now } }, data: { used_at: now } });
  }

  useAllByUser(userId: string, now: Date) {
    return this.db.password_resets.updateMany({ where: { user_id: userId, used_at: null }, data: { used_at: now } });
  }
}
