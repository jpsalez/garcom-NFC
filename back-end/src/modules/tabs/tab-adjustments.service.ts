import { inject, injectable } from "tsyringe";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { ForbiddenError } from "../../shared/errors/http-errors.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { TabAdjustmentsRepository } from "./tab-adjustments.repository.ts";
import { notifyTabUpdated } from "./tab-events.ts";
import { adjustmentCents } from "./tabs-pricing.ts";
import { TabsRepository } from "./tabs.repository.ts";
import type { TabAdjustment, WaiveFee } from "./tabs.schemas.ts";
import { ensureOpenTab, getTab, recalculateTab } from "./tabs-state.ts";
import { tabSummary } from "./tabs-view.ts";

export interface ITabAdjustmentsService {
  add(actor: ActorContext, id: string, input: TabAdjustment): ReturnType<TabAdjustmentsService["add"]>;
  waive(actor: ActorContext, id: string, input: WaiveFee): ReturnType<TabAdjustmentsService["waive"]>;
}

@injectable()
export class TabAdjustmentsService implements ITabAdjustmentsService {
  constructor(
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
  ) {}

  async add(actor: ActorContext, id: string, input: TabAdjustment) {
    const restaurantId = actor.restaurantId;
    if (!restaurantId) throw new ForbiddenError("Usuário sem restaurante");
    const capability = input.type === "DISCOUNT" ? "tabs:discount" : "tabs:manage";
    const result = await this.unit.run(
      restaurantId,
      async ({ db, actor: current, now }) => {
        const tab = await getTab(new TabsRepository(db), restaurantId, id);
        ensureOpenTab(tab);
        const adjustment = await new TabAdjustmentsRepository(db).create(restaurantId, id, {
          ...input,
          computed_cents: adjustmentCents(tab.subtotal_cents, input),
          created_at: now,
          created_by_user_id: actor.id,
        });
        const recalculated = await recalculateTab(db, tab);
        await new MenuRepository(db).audit(
          current ?? actor,
          "TAB_ADJUSTED",
          "TAB",
          id,
          { total_cents: tab.total_cents },
          {
            total_cents: recalculated.tab.total_cents,
            type: input.type,
            reason: input.reason,
            adjustment_id: adjustment.id,
          },
        );
        return { ...recalculated, adjustment };
      },
      { actor, capability },
    );
    notifyTabUpdated(this.notifier, result.tab, result.pendingCents);
    return {
      tab: tabSummary(result.tab, result.hasPendingKitchenItems, result),
      adjustment: result.adjustment,
    };
  }

  async waive(actor: ActorContext, id: string, input: WaiveFee) {
    const restaurantId = actor.restaurantId;
    if (!restaurantId) throw new ForbiddenError("Usuário sem restaurante");
    const result = await this.unit.run(
      restaurantId,
      async ({ db, actor: current }) => {
        const tab = await getTab(new TabsRepository(db), restaurantId, id);
        ensureOpenTab(tab);
        const fee = {
          service_fee_waived: input.waived,
          service_fee_waive_reason: input.waived ? input.reason : null,
        };
        const recalculated = await recalculateTab(db, tab, { fee });
        await new MenuRepository(db).audit(
          current ?? actor,
          "TAB_SERVICE_FEE_CHANGED",
          "TAB",
          id,
          { waived: tab.service_fee_waived, service_fee_cents: tab.service_fee_cents },
          { ...input, service_fee_cents: recalculated.tab.service_fee_cents },
        );
        return recalculated;
      },
      { actor, capability: "tabs:service_fee_waive" },
    );
    notifyTabUpdated(this.notifier, result.tab, result.pendingCents);
    return { tab: tabSummary(result.tab, result.hasPendingKitchenItems, result) };
  }
}
