import { inject, injectable } from "tsyringe";
import type { ITokenCleanupService } from "./auth.interfaces.ts";
import type { IPasswordResetRepository } from "./password-reset.repository.interface.ts";
import type { IRefreshTokenRepository } from "./refresh-tokens.repository.interface.ts";

// session_tokens fica de fora: os chamados apontam para eles e o histórico precisa deles
@injectable()
export class TokenCleanupService implements ITokenCleanupService {
  private readonly refreshTokenRepository: IRefreshTokenRepository;
  private readonly passwordResetRepository: IPasswordResetRepository;

  constructor(
    @inject("RefreshTokenRepository") refreshTokenRepository: IRefreshTokenRepository,
    @inject("PasswordResetRepository") passwordResetRepository: IPasswordResetRepository,
  ) {
    this.refreshTokenRepository = refreshTokenRepository;
    this.passwordResetRepository = passwordResetRepository;
  }

  async purgeExpired() {
    const now = new Date();
    const refreshTokens = await this.refreshTokenRepository.deleteExpired(now);
    const resets = await this.passwordResetRepository.deleteExpired(now);
    return refreshTokens.count + resets.count;
  }
}
