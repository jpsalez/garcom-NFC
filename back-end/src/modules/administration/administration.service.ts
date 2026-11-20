import { inject, injectable } from "tsyringe";
import type { IRestaurantRepository } from "../restaurants/restaurants.repository.interface.ts";
import type { IAuthCache } from "../../shared/cache/auth-cache.ts";
import { closeSessionResources, notifySessionClosed, type ClosedSession } from "../sessions/close-session.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IAdministrationService } from "./administration.interfaces.ts";
import type { createRestaurantInput } from "./administration.schema.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { toPublicRestaurant } from "../restaurants/public-restaurant.ts";
import { RestaurantRepository } from "../restaurants/restaurants.repository.ts";

// Operações da plataforma (só SUPER_ADMIN): não filtram por restaurante do token
@injectable()
export class AdministrationService implements IAdministrationService {
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly authCache: IAuthCache;
  private readonly notifier: INotifier;

  constructor(
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("AuthCache") authCache: IAuthCache,
    @inject("Notifier") notifier: INotifier,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {
    this.restaurantRepository = restaurantRepository;
    this.authCache = authCache;
    this.notifier = notifier;
  }

  async createRestaurant(input: createRestaurantInput) {
    if (await this.restaurantRepository.findBySlug(input.slug)) {
      throw new ConflictError("Slug já em uso");
    }
    const restaurant = await this.restaurantRepository.create({ name: input.name, slug: input.slug });
    return toPublicRestaurant(restaurant);
  }

  async listRestaurants() {
    return (await this.restaurantRepository.findAll()).map(toPublicRestaurant);
  }

  async setRestaurantActive(id: string, active: boolean, userId: string) {
    if (!(await this.restaurantRepository.findById(id))) {
      throw new NotFoundError("Restaurante não encontrado");
    }
    const result = await this.unit.run(
      id,
      async ({ db, now }) => {
        const restaurant = await new RestaurantRepository(db).update(id, { active });
        const closedSessions: ClosedSession[] = [];
        if (!active)
          for (const session of await new TableSessionRepository(db).findMany(id, { status: "ACTIVE" })) {
            const closed = await closeSessionResources(db, id, session.id, now, "STAFF", userId);
            if (closed) closedSessions.push(closed);
          }
        return { restaurant, closedSessions };
      },
      { allowInactive: true },
    );
    // Todos os usuários do restaurante precisam ser reavaliados
    this.authCache.invalidateRestaurant(id);
    if (!active) {
      // Desativado não mantém atendimentos abertos (reativar não os reabre); depois derruba os sockets
      for (const closed of result.closedSessions) notifySessionClosed(this.notifier, closed);
      this.notifier.disconnectRestaurant(id);
    }
    return toPublicRestaurant(result.restaurant);
  }
}
