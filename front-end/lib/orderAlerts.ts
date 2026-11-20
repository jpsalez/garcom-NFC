import type { Order } from "@/lib/orderTypes";

export const READY_DELAY_MS = 5 * 60_000;
export const READY_REMINDER_INTERVAL_MS = 2 * 60_000;

export function elapsedSince(timestamp: string | null | undefined, now: number) {
  const start = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(start) ? Math.max(0, now - start) : 0;
}

export function isReadyOverdue(order: Order, now: number) {
  return order.progress.ready > 0 && elapsedSince(order.ready_since, now) >= READY_DELAY_MS;
}

export type OrderAlert = { kind: "order-new" | "order-ready"; orderId: string; table: string };

export function detectOrderAlerts(previous: Order[] | undefined, current: Order[]): OrderAlert[] {
  if (!previous) return [];
  const before = new Map(previous.map((order) => [order.id, order]));
  const alerts: OrderAlert[] = [];
  for (const order of current) {
    const prior = before.get(order.id);
    if (!prior) alerts.push({ kind: "order-new", orderId: order.id, table: order.table_label });
    if (order.progress.ready > 0 && (!prior?.progress.ready ||
      (order.ready_sequence ?? 0) > (prior.ready_sequence ?? 0))) {
      alerts.push({ kind: "order-ready", orderId: order.id, table: order.table_label });
    }
  }
  return alerts;
}
