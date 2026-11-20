import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { OrderRecord } from "./orders.repository.interface.ts";
import { OrdersRepository } from "./orders.repository.ts";
import type { Transition } from "./orders.schemas.ts";

function pendingCancellations(order: OrderRecord, reason: string) {
  return order.items.flatMap((item) => {
    const stages = [
      ["PENDING", item.pending_quantity],
      ["PREPARING", item.preparing_quantity],
      ["READY", item.ready_quantity],
    ] as const;
    return stages
      .filter(([, quantity]) => quantity > 0)
      .map(
        ([stage, quantity]): Transition => ({
          item_id: item.id,
          from_stage: stage,
          to_stage: "CANCELLED",
          quantity,
          reason,
        }),
      );
  });
}

export async function cancelOpenOrderItems(
  db: DbClient,
  orders: OrderRecord[],
  actor: ActorContext,
  reason: string,
) {
  const repository = new OrdersRepository(db);
  const affected: { restaurant_id: string; id: string; version: number }[] = [];
  for (const order of orders) {
    const { restaurant_id: restaurantId, id, version } = order;
    const changes = pendingCancellations(order, reason);
    if (!changes.length) continue;
    await repository.claim(restaurantId, id, version, changes.length);
    for (const item of order.items) {
      const removed = item.pending_quantity + item.preparing_quantity + item.ready_quantity;
      if (removed)
        await repository.updateCounters(restaurantId, item.id, {
          pending_quantity: 0,
          preparing_quantity: 0,
          ready_quantity: 0,
          cancelled_quantity: item.cancelled_quantity + removed,
          delivered_quantity: item.delivered_quantity,
        });
    }
    for (const [index, change] of changes.entries())
      await repository.event(
        restaurantId,
        id,
        change,
        order.last_event_sequence + index + 1,
        version + 1,
        actor,
      );
    affected.push({ restaurant_id: restaurantId, id, version: version + 1 });
  }
  return affected;
}
