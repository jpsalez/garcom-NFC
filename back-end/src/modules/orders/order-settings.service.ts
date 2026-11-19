import { inject, injectable } from "tsyringe";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import { NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { settingsSchema } from "./orders.schemas.ts";
import type { IOrderSettingsRepository } from "./order-settings.repository.interface.ts";
import { OrderSettingsRepository } from "./order-settings.repository.ts";
export interface IOrderSettingsService {
  get(actor: ActorContext): Promise<{ customer_ordering_enabled: boolean; version: number }>;
  set(actor: ActorContext, input: unknown): Promise<{ customer_ordering_enabled: boolean; version: number }>;
}
@injectable()
export class OrderSettingsService implements IOrderSettingsService {
  constructor(
    @inject("OrderSettingsRepository") private repository: IOrderSettingsRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}
  async get(actor: ActorContext) {
    requireCapability(actor, "ordering:configure");
    if (!actor.restaurantId) throw new NotFoundError();
    const row = await this.repository.get(actor.restaurantId);
    return { customer_ordering_enabled: row.customer_ordering_enabled, version: row.version };
  }
  async set(actor: ActorContext, input: unknown) {
    const data = settingsSchema.parse(input);
    if (!actor.restaurantId) throw new NotFoundError();
    const rest = actor.restaurantId;
    return this.unit.run(
      rest,
      async ({ db, actor: current }) => {
        const repository = new OrderSettingsRepository(db),
          before = await repository.get(rest);
        const after = await repository.set(
          rest,
          data.expected_version,
          data.customer_ordering_enabled,
          actor.id,
        );
        await new MenuRepository(db).audit(
          current ?? actor,
          "ORDERING_CHANGED",
          "ORDERING_SETTINGS",
          rest,
          { enabled: before.customer_ordering_enabled },
          { enabled: after.customer_ordering_enabled },
        );
        return { customer_ordering_enabled: after.customer_ordering_enabled, version: after.version };
      },
      { actor, capability: "ordering:configure" },
    );
  }
}
