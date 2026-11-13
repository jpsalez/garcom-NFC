import { inject, injectable } from "tsyringe";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { IAuthCache } from "../../shared/cache/auth-cache.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IAdministrationService } from "./administration.interfaces.ts";
import type { createRestaurantInput } from "./administration.schema.ts";

// Operações da plataforma (só SUPER_ADMIN): não filtram por restaurante do token
@injectable()
export class AdministrationService implements IAdministrationService {
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly authCache: IAuthCache;

  constructor(
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("AuthCache") authCache: IAuthCache,
  ) {
    this.restaurantRepository = restaurantRepository;
    this.authCache = authCache;
  }

  async createRestaurant(input: createRestaurantInput) {
    if (await this.restaurantRepository.findBySlug(input.slug)) {
      throw new ConflictError("Slug já em uso");
    }
    return this.restaurantRepository.create({ name: input.name, slug: input.slug });
  }

  listRestaurants() {
    return this.restaurantRepository.findAll();
  }

  async setRestaurantActive(id: string, active: boolean) {
    if (!(await this.restaurantRepository.findById(id))) {
      throw new NotFoundError("Restaurante não encontrado");
    }
    const restaurant = await this.restaurantRepository.update(id, { active });
    // Todos os usuários do restaurante precisam ser reavaliados
    this.authCache.invalidateRestaurant(id);
    return restaurant;
  }
}
