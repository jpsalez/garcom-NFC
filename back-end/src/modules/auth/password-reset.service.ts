import { inject, injectable } from "tsyringe";
import { AppError } from "../../shared/errors/AppError.ts";
import type { IMailer } from "../../shared/mail/mailer.ts";
import { runInTransaction } from "../../shared/providers/prisma.ts";
import { passwordHash } from "../../shared/utils/password.ts";
import { generateSessionToken, hashToken } from "../../shared/utils/token.ts";
import { UserRepository } from "../users/users.repository.ts";
import type { IUserRepository } from "../users/users.repository.interface.ts";
import type { IPasswordResetService } from "./password-reset.interfaces.ts";
import { PasswordResetRepository } from "./password-reset.repository.ts";
import type { IPasswordResetRepository } from "./password-reset.repository.interface.ts";
import { RefreshTokenRepository } from "./refresh-tokens.repository.ts";

const RESET_TTL_MS = 60 * 60 * 1000; // o link vale 1 hora

@injectable()
export class PasswordResetService implements IPasswordResetService {
  private readonly userRepository: IUserRepository;
  private readonly resetRepository: IPasswordResetRepository;
  private readonly mailer: IMailer;

  constructor(
    @inject("UserRepository") userRepository: IUserRepository,
    @inject("PasswordResetRepository") resetRepository: IPasswordResetRepository,
    @inject("Mailer") mailer: IMailer,
  ) {
    this.userRepository = userRepository;
    this.resetRepository = resetRepository;
    this.mailer = mailer;
  }

  async request(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user?.active) return;

    const { token, tokenHash } = generateSessionToken();
    await this.resetRepository.create({ user_id: user.id, token_hash: tokenHash, expires_at: new Date(Date.now() + RESET_TTL_MS) });

    const link = `${process.env.PUBLIC_APP_URL}/redefinir-senha?token=${token}`;
    const text = `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse (o link vale por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.`;
    // Sem await: o tempo da resposta não revela se o e-mail existe. A falha vai para o log sem o link.
    this.mailer.send(user.email, "Redefinição de senha", text).catch(() => console.error("Falha ao enviar o e-mail de redefinição de senha"));
  }

  async reset(token: string, password: string) {
    const invalid = () => new AppError("Link inválido ou expirado", 400, undefined, "RESET_TOKEN_INVALID");
    const saved = await this.resetRepository.findByHash(hashToken(token));
    if (!saved || saved.used_at || saved.expires_at <= new Date()) throw invalid();

    const newHash = await passwordHash(password);
    await runInTransaction(async (tx) => {
      const now = new Date();
      // Consumir o link vem primeiro: dois usos simultâneos não passam os dois
      const { count } = await new PasswordResetRepository(tx).useIfValid(saved.id, now);
      if (count === 0) throw invalid();
      await new UserRepository(tx).setPassword(saved.user_id, newHash);
      await new PasswordResetRepository(tx).useAllByUser(saved.user_id, now);
      // Quem estava logado com a senha antiga precisa entrar de novo
      await new RefreshTokenRepository(tx).revokeAllByUser(saved.user_id, now);
    });
  }
}
