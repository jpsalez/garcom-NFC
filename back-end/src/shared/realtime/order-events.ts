import type { INotifier } from "./notifier.ts";

export function notifyOrder(
  notifier: INotifier,
  order: { restaurant_id: string; id: string; version: number },
  event: string,
) {
  try {
    notifier.toOrders(order.restaurant_id, event, { order_id: order.id, version: order.version });
  } catch {
    console.error("Falha ao emitir evento de pedido", { order_id: order.id });
  }
}
