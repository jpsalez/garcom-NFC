import { inject, injectable } from "tsyringe";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import { NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import type { RestaurantSettings, RestaurantSettingsPatch } from "./restaurant-settings.schema.ts";
import type { IRestaurantRepository } from "./restaurants.repository.interface.ts";
import { RestaurantRepository } from "./restaurants.repository.ts";

export interface IRestaurantSettingsService {
  get(actor: ActorContext): Promise<RestaurantSettings>;
  update(actor: ActorContext, data: RestaurantSettingsPatch): Promise<RestaurantSettings>;
}

function settingsOf({ timezone, business_day_cutoff_minutes, service_fee_bps }: RestaurantSettings) {
  return { timezone, business_day_cutoff_minutes, service_fee_bps };
}

@injectable()
export class RestaurantSettingsService implements IRestaurantSettingsService {
  constructor(
    @inject("RestaurantRepository") private repository: IRestaurantRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}

  async get(actor: ActorContext) {
    requireCapability(actor, "restaurant:configure");
    const restaurant = actor.restaurantId ? await this.repository.findById(actor.restaurantId) : null;
    if (!restaurant?.active) throw new NotFoundError("Restaurante não encontrado");
    return settingsOf(restaurant);
  }

  async update(actor: ActorContext, data: RestaurantSettingsPatch) {
    requireCapability(actor, "restaurant:configure");
    const restaurantId = actor.restaurantId;
    if (!restaurantId) throw new NotFoundError("Restaurante não encontrado");
    return this.unit.run(
      restaurantId,
      async ({ db, restaurant, actor: current }) => {
        const updated = await new RestaurantRepository(db).update(restaurantId, data);
        const settings = settingsOf(updated);
        await new MenuRepository(db).audit(
          current ?? actor,
          "RESTAURANT_SETTINGS_CHANGED",
          "RESTAURANT_SETTINGS",
          restaurantId,
          settingsOf(restaurant),
          settings,
        );
        return settings;
      },
      { actor, capability: "restaurant:configure" },
    );
  }
}
