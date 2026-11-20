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
  const production: Order[] = [];
  const pickup: Order[] = [];
  for (const order of sorted) {
    const { pending, preparing, ready } = order.progress;
    if (pending > 0 || preparing > 0) production.push(order);
    else if (ready > 0) pickup.push(order);
  }
  return { production, pickup };
}
