import { inject, injectable } from "tsyringe";
import type { users } from "../../../generated/prisma/client.ts";
import type { role } from "../../../generated/prisma/enums.ts";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { IAuthCache } from "../../shared/cache/auth-cache.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { passwordHash } from "../../shared/utils/password.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import { toPublicUser } from "./public-user.ts";
import type { IUserRepository } from "./users.repository.interface.ts";
import type { IUsersService } from "./users.interfaces.ts";
import type { createRestaurantUserInput, updateUserInput } from "./users.schema.ts";

@injectable()
export class UsersService implements IUsersService {
  private readonly userRepository: IUserRepository;
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly authCache: IAuthCache;
  private readonly notifier: INotifier;

  constructor(
    @inject("UserRepository") userRepository: IUserRepository,
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("AuthCache") authCache: IAuthCache,
    @inject("Notifier") notifier: INotifier,
  ) {
    this.userRepository = userRepository;
    this.restaurantRepository = restaurantRepository;
    this.authCache = authCache;
    this.notifier = notifier;
  }

  async list(restaurantId: string, allowedRoles: role[]) {
    const users = await this.userRepository.findMany(restaurantId);
    return users.filter((user) => allowedRoles.includes(user.role)).map(toPublicUser);
  }

  async create(restaurantId: string, input: createRestaurantUserInput) {
    const restaurant = await this.restaurantRepository.findById(restaurantId);
    if (!restaurant) throw new NotFoundError("Restaurante não encontrado");
    if (!restaurant.active) throw new ConflictError("Restaurante desativado: reative antes de criar usuários", "RESTAURANT_INACTIVE");
    if (await this.userRepository.findByEmail(input.email)) {
      throw new ConflictError("E-mail já cadastrado");
    }

    const user = await this.userRepository.create({
      name: input.name,
      email: input.email,
      password_hash: await passwordHash(input.password),
      role: input.role,
      restaurant_id: restaurantId,
      category: input.category,
    });
    return toPublicUser(user);
  }

  async update(restaurantId: string, id: string, input: updateUserInput, allowedRoles: role[]) {
    const user = await this.findManaged(restaurantId, id, allowedRoles);

    if (input.category && user.role !== "STAFF") {
      throw new BadRequestError("Categoria só vale para STAFF");
    }
    if (input.active === false) await this.ensureNotLastOwner(restaurantId, user);

    const updated = await this.userRepository.update(restaurantId, id, {
      name: input.name,
      category: input.category,
      active: input.active,
    });
    this.authCache.invalidateUser(id);
    if (input.active === false) this.notifier.disconnectUser(id);
    return toPublicUser(updated);
  }

  async remove(restaurantId: string, id: string, allowedRoles: role[]) {
    const user = await this.findManaged(restaurantId, id, allowedRoles);
    await this.ensureNotLastOwner(restaurantId, user);
    // Histórico de chamados e atendimentos fica: closed_by e done_by viram nulos (SET NULL)
    await this.userRepository.delete(restaurantId, id);
    this.authCache.invalidateUser(id);
    this.notifier.disconnectUser(id);
  }

  private async findManaged(restaurantId: string, id: string, allowedRoles: role[]) {
    const user = await this.userRepository.findById(restaurantId, id);
    if (!user || !allowedRoles.includes(user.role)) throw new NotFoundError("Usuário não encontrado");
    return user;
  }

  // Desativar ou excluir o único OWNER ativo deixaria o restaurante sem dono
  private async ensureNotLastOwner(restaurantId: string, user: users) {
    if (user.role !== "OWNER" || !user.active) return;
    const users = await this.userRepository.findMany(restaurantId);
    const otherOwners = users.filter((other) => other.role === "OWNER" && other.active && other.id !== user.id);
    if (otherOwners.length === 0) throw new ConflictError("O restaurante precisa de ao menos um OWNER ativo");
  }
}
