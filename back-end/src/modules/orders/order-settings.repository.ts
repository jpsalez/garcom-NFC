import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IOrderSettingsRepository } from "./order-settings.repository.interface.ts";
@injectable()
export class OrderSettingsRepository implements IOrderSettingsRepository {
  constructor(@inject("DbClient") private db: DbClient) {}
  async get(restaurantId: string) {
    const settings = await this.db.restaurant_order_settings.findUnique({
      where: { restaurant_id: restaurantId },
    });
    if (!settings) throw new NotFoundError("Configuração não encontrada");
    return settings;
  }
  async set(restaurantId: string, expectedVersion: number, enabled: boolean, userId: string) {
    const result = await this.db.restaurant_order_settings.updateMany({
      where: { restaurant_id: restaurantId, version: expectedVersion },
      data: { customer_ordering_enabled: enabled, version: { increment: 1 }, updated_by: userId },
    });
    if (!result.count)
      throw new ConflictError("Configuração foi alterada", "ORDERING_SETTINGS_VERSION_CONFLICT");
    return this.get(restaurantId);
  }
}
