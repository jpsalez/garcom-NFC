import type { restaurant_order_settings } from "../../../generated/prisma/client.ts";
export interface IOrderSettingsRepository {
  get(restaurantId: string): Promise<restaurant_order_settings>;
  set(
    restaurantId: string,
    expectedVersion: number,
    enabled: boolean,
    userId: string,
  ): Promise<restaurant_order_settings>;
}
