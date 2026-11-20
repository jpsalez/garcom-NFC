import type { Order } from "@/lib/orderTypes";
import type { User } from "@/lib/session";

export function canAccessKitchen(user: User) {
  return user.role === "OWNER" ||
    (user.role === "STAFF" && (user.category === "MANAGER" || user.category === "KITCHEN"));
}

export function canConfigurePrinting(user: User) {
  return user.role === "OWNER" || (user.role === "STAFF" && user.category === "MANAGER");
}

export function groupKitchenOrders(orders: Order[]) {
  const sorted = [...orders].sort((a, b) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
  const incoming: Order[] = [];
  const preparing: Order[] = [];
  const pickup: Order[] = [];
  for (const order of sorted) {
    if (order.progress.pending > 0) incoming.push(order);
    if (order.progress.preparing > 0) preparing.push(order);
    if (order.progress.ready > 0) pickup.push(order);
  }
  return { incoming, preparing, pickup };
}
