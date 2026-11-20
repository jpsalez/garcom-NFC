import type { tabs } from "../../../generated/prisma/client.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import type { OrderRecord } from "../orders/orders.repository.interface.ts";

export function activeLineCents(
  item: Pick<OrderRecord["items"][number], "unit_price_cents" | "quantity" | "cancelled_quantity">,
) {
  return item.unit_price_cents * (item.quantity - item.cancelled_quantity);
}

export function serviceFeeCents(subtotal: number, tab: Pick<tabs, "service_fee_bps" | "service_fee_waived">) {
  return tab.service_fee_waived ? 0 : Math.round((subtotal * tab.service_fee_bps) / 10_000);
}

export function tabTotals(orders: OrderRecord[], tab: tabs) {
  const subtotal = orders.reduce(
    (sum, order) => sum + order.items.reduce((items, item) => items + activeLineCents(item), 0),
    0,
  );
  const serviceFee = serviceFeeCents(subtotal, tab);
  const total = Math.max(0, subtotal + serviceFee + tab.adjustments_cents);
  if (subtotal > 2_147_483_647 || total > 2_147_483_647)
    throw new ConflictError("O valor da comanda excede o limite", "TAB_TOTAL_LIMIT");
  if (total < tab.paid_cents)
    throw new ConflictError("O total não pode ficar abaixo do valor pago", "TOTAL_BELOW_PAID");
  return { subtotal_cents: subtotal, service_fee_cents: serviceFee, total_cents: total };
}
