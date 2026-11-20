import { inject, injectable } from "tsyringe";
import type { Prisma, payment_provider_type } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";

type CreateTerminalData = Pick<
  Prisma.payment_terminalsUncheckedCreateInput,
  | "provider"
  | "provider_account_id"
  | "external_device_id"
  | "serial_number"
  | "label"
  | "active"
  | "last_seen_at"
  | "metadata_json"
>;
type SyncedTerminalData = CreateTerminalData & { provider_account_id: string; external_device_id: string };
type TerminalListFilter = { active?: boolean; provider?: payment_provider_type; accountId?: string };

@injectable()
export class PaymentTerminalsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  get(restaurantId: string, id: string) {
    return this.db.payment_terminals.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  list(restaurantId: string, filter: TerminalListFilter = {}) {
    return this.db.payment_terminals.findMany({
      where: {
        restaurant_id: restaurantId,
        active: filter.active,
        provider: filter.provider,
        provider_account_id: filter.accountId,
      },
      orderBy: [{ label: "asc" }, { id: "asc" }],
    });
  }

  create(restaurantId: string, data: CreateTerminalData) {
    return this.db.payment_terminals.create({ data: { ...data, restaurant_id: restaurantId } });
  }

  update(restaurantId: string, id: string, data: { label?: string; active?: boolean }) {
    return this.db.payment_terminals.update({ where: { id, restaurant_id: restaurantId }, data });
  }

  async upsertSynced(restaurantId: string, data: SyncedTerminalData) {
    const existing = await this.db.payment_terminals.findFirst({
      where: {
        restaurant_id: restaurantId,
        provider: data.provider,
        external_device_id: data.external_device_id,
      },
    });
    if (!existing) return this.create(restaurantId, data);
    if (existing.provider_account_id !== data.provider_account_id) return null;
    return this.db.payment_terminals.update({
      where: { id: existing.id, restaurant_id: restaurantId },
      data: {
        serial_number: data.serial_number,
        last_seen_at: data.last_seen_at,
        metadata_json: data.metadata_json,
      },
    });
  }
}
