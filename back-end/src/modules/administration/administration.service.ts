import { inject, injectable } from "tsyringe";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { IAuthCache } from "../../shared/cache/auth-cache.ts";
import type { ISessionsService } from "../sessions/sessions.interfaces.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IAdministrationService } from "./administration.interfaces.ts";
import type { createRestaurantInput } from "./administration.schema.ts";

// Operações da plataforma (só SUPER_ADMIN): não filtram por restaurante do token
@injectable()
export class AdministrationService implements IAdministrationService {
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly authCache: IAuthCache;
  private readonly notifier: INotifier;
  private readonly sessionsService: ISessionsService;

  constructor(
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("AuthCache") authCache: IAuthCache,
    @inject("Notifier") notifier: INotifier,
    @inject("SessionsService") sessionsService: ISessionsService,
  ) {
    this.restaurantRepository = restaurantRepository;
    this.authCache = authCache;
    this.notifier = notifier;
    this.sessionsService = sessionsService;
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

  async setRestaurantActive(id: string, active: boolean, userId: string) {
    if (!(await this.restaurantRepository.findById(id))) {
      throw new NotFoundError("Restaurante não encontrado");
    }
    const restaurant = await this.restaurantRepository.update(id, { active });
    // Todos os usuários do restaurante precisam ser reavaliados
    this.authCache.invalidateRestaurant(id);
    if (!active) {
      // Desativado não mantém atendimentos abertos (reativar não os reabre); depois derruba os sockets
      await this.sessionsService.closeAllActive(id, userId);
      this.notifier.disconnectRestaurant(id);
    }
    return restaurant;
  }
}
