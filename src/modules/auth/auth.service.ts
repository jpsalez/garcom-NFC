import { inject, injectable } from "tsyringe";
import type { IAuthService, LoginResult, RegisterResult } from "./auth.interfaces.ts";
import type { IUserRepository } from "../users/users.repository.interface.ts";
import { UserRepository } from "../users/users.repository.ts";
import { RestaurantRepository } from "../restaurants/restaurants.repository.ts";
import { slugify, withRandomSuffix } from "../restaurants/slug.ts";
import { runInTransaction } from "../../shared/providers/prisma.ts";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { createUserInput, loginUserInput } from "./auth.schema.ts";
import type { users } from "../../../generated/prisma/client.ts";
import { role } from "../../../generated/prisma/enums.ts";
import { DUMMY_PASSWORD_HASH, comparePassword, passwordHash } from "../../shared/utils/password.ts";
import { toPublicUser } from "../users/public-user.ts";
import { signToken } from "../../shared/utils/jwt.ts";
import { ConflictError, UnauthorizedError } from "../../shared/errors/http-errors.ts";

@injectable()
export class AuthService implements IAuthService {
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly userRepository: IUserRepository;

  constructor(
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("UserRepository") userRepository: IUserRepository,
  ) {
    this.restaurantRepository = restaurantRepository;
    this.userRepository = userRepository;
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

    return { user: toPublicUser(user), restaurant };
  }

  // Login vale para SUPER_ADMIN, OWNER e STAFF: a role vem do banco e vai dentro do token
  async login(credentials: loginUserInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(credentials.email);

    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails existem
    // Compara sempre (hash falso se o e-mail não existe) para não revelar e-mails pelo tempo de resposta
    const validPassword = await comparePassword(credentials.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !validPassword || !(await this.isActive(user))) {
      throw new UnauthorizedError("E-mail ou senha inválidos");
    }

    const token = signToken({
      sub: user.id,
      restaurantId: user.restaurant_id,
      role: user.role,
    });

    return { token, user: toPublicUser(user) };
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
