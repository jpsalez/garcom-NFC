import { inject, injectable } from "tsyringe";
import type { IAuthService, LoginResult, RegisterResult } from "./auth.interfaces.ts";
import type { IUserRepository } from "../users/users.repository.interface.ts";
import type { IRefreshTokenRepository } from "./refresh-tokens.repository.interface.ts";
import { UserRepository } from "../users/users.repository.ts";
import { toPublicRestaurant } from "../restaurants/public-restaurant.ts";
import { RestaurantRepository } from "../restaurants/restaurants.repository.ts";
import { slugify, withRandomSuffix } from "../restaurants/slug.ts";
import { runInTransaction } from "../../shared/providers/prisma.ts";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { changePasswordInput, createUserInput, loginUserInput } from "./auth.schema.ts";
import type { users } from "../../../generated/prisma/client.ts";
import { role } from "../../../generated/prisma/enums.ts";
import { DUMMY_PASSWORD_HASH, comparePassword, passwordHash } from "../../shared/utils/password.ts";
import { toPublicUser } from "../users/public-user.ts";
import { signToken } from "../../shared/utils/jwt.ts";
import { RefreshTokenRepository } from "./refresh-tokens.repository.ts";
import { generateSessionToken, hashToken } from "../../shared/utils/token.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ConflictError, UnauthorizedError } from "../../shared/errors/http-errors.ts";

@injectable()
export class AuthService implements IAuthService {
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly userRepository: IUserRepository;
  private readonly refreshTokenRepository: IRefreshTokenRepository;

  constructor(
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("UserRepository") userRepository: IUserRepository,
    @inject("RefreshTokenRepository") refreshTokenRepository: IRefreshTokenRepository,
  ) {
    this.restaurantRepository = restaurantRepository;
    this.userRepository = userRepository;
    this.refreshTokenRepository = refreshTokenRepository;
  }

  // Auto-cadastro (fluxo B): cria o OWNER e o restaurante dele numa transação
  async register(input: createUserInput): Promise<RegisterResult> {
    // Mensagem genérica: não confirma se o e-mail já existe
    if (await this.userRepository.findByEmail(input.email)) {
      throw new ConflictError("Não foi possível concluir o cadastro");
    }

    const slug = await this.availableSlug(input.restaurantName);
    const password_hash = await passwordHash(input.password);

    const { user, restaurant } = await runInTransaction(async (tx) => {
      const restaurant = await new RestaurantRepository(tx).create({ name: input.restaurantName, slug });
      const user = await new UserRepository(tx).create({
        name: input.name,
        email: input.email,
        password_hash,
        role: role.OWNER,
        restaurant_id: restaurant.id,
      });
      return { user, restaurant };
    });

    return { user: toPublicUser(user), restaurant: toPublicRestaurant(restaurant) };
  }

  // Login vale para SUPER_ADMIN, OWNER e STAFF: a role vem do banco e vai dentro do token
  async login(credentials: loginUserInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(credentials.email);

    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails existem
    // Compara sempre (hash falso se o e-mail não existe) para não revelar e-mails pelo tempo de resposta
    const validPassword = await comparePassword(
      credentials.password,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !validPassword || !(await this.isActive(user))) {
      throw new UnauthorizedError("E-mail ou senha inválidos");
    }

    return this.issueTokens(user);
  }

  // Renova o login: o refresh token vale uma vez e é trocado por um par novo
  async refresh(refreshToken: string): Promise<LoginResult> {
    const invalid = () => new UnauthorizedError("Sessão expirada. Entre novamente");
    const saved = await this.refreshTokenRepository.findByHash(hashToken(refreshToken));
    if (!saved) throw invalid();
    // Token já usado voltando: pode ter sido copiado, então encerra todas as sessões do usuário
    if (saved.revoked_at) {
      await this.refreshTokenRepository.revokeAllByUser(saved.user_id, new Date());
      throw invalid();
    }

    const { count } = await this.refreshTokenRepository.revokeIfActive(saved.id, new Date());
    const user = count > 0 ? await this.userRepository.findForAuth(saved.user_id) : null;
    if (!user || !(await this.isActive(user))) throw invalid();
    return this.issueTokens(user);
  }

  // Sair: revoga o refresh token (um token desconhecido ou já revogado não é erro)
  async logout(refreshToken: string) {
    const saved = await this.refreshTokenRepository.findByHash(hashToken(refreshToken));
    if (saved) await this.refreshTokenRepository.revokeIfActive(saved.id, new Date());
  }

  async changePassword(userId: string, input: changePasswordInput) {
    const user = await this.userRepository.findForAuth(userId);
    if (!user) throw new UnauthorizedError("Não autenticado");
    // 400 e não 401: o front trata 401 como token vencido e tentaria renovar a sessão
    if (!(await comparePassword(input.currentPassword, user.password_hash))) {
      throw new AppError("Senha atual incorreta", 400, undefined, "INVALID_CURRENT_PASSWORD");
    }

    const newHash = await passwordHash(input.newPassword);
    await runInTransaction(async (tx) => {
      await new UserRepository(tx).setPassword(user.id, newHash);
      await new RefreshTokenRepository(tx).revokeAllByUser(user.id, new Date());
    });
    return this.issueTokens(user);
  }

  async me(userId: string) {
    const user = await this.userRepository.findForAuth(userId);
    if (!user) throw new UnauthorizedError("Não autenticado");
    return toPublicUser(user);
  }

  // JWT de acesso curto (JWT_EXPIRES_IN) e refresh token longo (REFRESH_TOKEN_TTL_DAYS), só o hash vai ao banco
  private async issueTokens(user: users): Promise<LoginResult> {
    const { token: refreshToken, tokenHash } = generateSessionToken();
    const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;
    await this.refreshTokenRepository.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    });
    const token = signToken({ sub: user.id, restaurantId: user.restaurant_id, role: user.role });
    return { token, refreshToken, user: toPublicUser(user) };
  }

  private async availableSlug(restaurantName: string) {
    const slug = slugify(restaurantName);
    return (await this.restaurantRepository.findBySlug(slug)) ? withRandomSuffix(slug) : slug;
  }

  // Usuário desativado, ou de restaurante desativado, não entra
  private async isActive(user: users) {
    if (!user.active) return false;
    if (!user.restaurant_id) return true;
    const restaurant = await this.restaurantRepository.findById(user.restaurant_id);
    return restaurant?.active === true;
  }
}
