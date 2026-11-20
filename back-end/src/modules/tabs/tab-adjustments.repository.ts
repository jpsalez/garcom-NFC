import { inject, injectable } from "tsyringe";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";

type CreateAdjustmentData = Pick<
  Prisma.tab_adjustmentsUncheckedCreateInput,
  "type" | "mode" | "value" | "computed_cents" | "reason" | "created_by_user_id" | "created_at"
>;

@injectable()
export class TabAdjustmentsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  create(restaurantId: string, tabId: string, data: CreateAdjustmentData) {
    return this.db.tab_adjustments.create({ data: { ...data, restaurant_id: restaurantId, tab_id: tabId } });
  }

  list(restaurantId: string, tabId: string) {
    return this.db.tab_adjustments.findMany({
      where: { restaurant_id: restaurantId, tab_id: tabId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  updateComputed(restaurantId: string, tabId: string, id: string, computedCents: number) {
    return this.db.tab_adjustments.update({
      where: { id, restaurant_id: restaurantId, tab_id: tabId, removed_at: null },
      data: { computed_cents: computedCents },
    });
  }

  remove(
    restaurantId: string,
    tabId: string,
    id: string,
    data: {
      removed_at: Date;
      removed_by_user_id: string;
      remove_reason: string;
    },
  ) {
    return this.db.tab_adjustments.update({
      where: { id, restaurant_id: restaurantId, tab_id: tabId, removed_at: null },
      data,
    });
  }

  moveToTab(restaurantId: string, sourceTabId: string, targetTabId: string) {
    return this.db.tab_adjustments.updateMany({
      where: { restaurant_id: restaurantId, tab_id: sourceTabId },
      data: { tab_id: targetTabId },
    });
  }
}
