import { inject, injectable } from "tsyringe";
import type { payment_status } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type {
  CreatePaymentAllocationData,
  CreatePaymentData,
  IPaymentsRepository,
  PaymentRecord,
  UpdatePaymentData,
} from "./payments.repository.interface.ts";

@injectable()
export class PaymentsRepository implements IPaymentsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  create(restaurantId: string, data: CreatePaymentData, allocations: CreatePaymentAllocationData[] = []) {
    return this.db.payments.create({
      data: { ...data, restaurant_id: restaurantId, allocations: { create: allocations } },
      include: { allocations: true },
    });
  }

  findIdempotency(restaurantId: string, key: string) {
    return this.db.payments.findUnique({
      where: { restaurant_id_idempotency_key: { restaurant_id: restaurantId, idempotency_key: key } },
      include: { allocations: true },
    });
  }

  get(restaurantId: string, id: string) {
    return this.db.payments.findUnique({
      where: { id, restaurant_id: restaurantId },
      include: { allocations: true },
    });
  }

  findById(restaurantId: string, tabId: string, id: string) {
    return this.db.payments.findUnique({
      where: { id, restaurant_id: restaurantId, tab_id: tabId },
      include: { allocations: true },
    });
  }

  list(restaurantId: string, tabId: string) {
    return this.db.payments.findMany({
      where: { restaurant_id: restaurantId, tab_id: tabId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      include: { allocations: true },
    });
  }

  update(restaurantId: string, tabId: string, id: string, data: UpdatePaymentData) {
    return this.db.payments.update({
      where: { id, restaurant_id: restaurantId, tab_id: tabId },
      data,
      include: { allocations: true },
    });
  }

  async transition(
    restaurantId: string,
    id: string,
    expectedStatuses: payment_status[],
    data: UpdatePaymentData,
  ) {
    const result = await this.db.payments.updateMany({
      where: { id, restaurant_id: restaurantId, status: { in: expectedStatuses } },
      data,
    });
    return result.count ? this.get(restaurantId, id) : null;
  }

  auditPointTransition(restaurantId: string, payment: PaymentRecord, previousStatus: payment_status) {
    return this.db.restaurant_operation_events.create({
      data: {
        restaurant_id: restaurantId,
        entity_type: "PAYMENT",
        entity_id: payment.id,
        action: "POINT_PAYMENT_STATUS_CHANGED",
        actor_type: "SYSTEM",
        previous_value: { status: previousStatus },
        new_value: { status: payment.status, tab_id: payment.tab_id, amount_cents: payment.amount_cents },
      },
    });
  }

  allocationTotals(restaurantId: string, tabId: string) {
    return this.db.payment_allocations.groupBy({
      by: ["order_item_id"],
      where: {
        restaurant_id: restaurantId,
        payment: {
          restaurant_id: restaurantId,
          tab_id: tabId,
          status: { in: ["PENDING", "PROCESSING", "APPROVED"] },
        },
      },
      _sum: { covered_cents: true, covered_units_bps: true },
    });
  }

  moveToTab(restaurantId: string, sourceTabId: string, targetTabId: string) {
    return this.db.payments.updateMany({
      where: { restaurant_id: restaurantId, tab_id: sourceTabId },
      data: { tab_id: targetTabId },
    });
  }
}
