import type { tab_adjustments, tabs } from "../../../generated/prisma/client.ts";
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

export function adjustmentCents(
  subtotal: number,
  adjustment: Pick<tab_adjustments, "mode" | "type" | "value">,
) {
  const amount =
    adjustment.mode === "FIXED_CENTS" ? adjustment.value : Math.round((subtotal * adjustment.value) / 10_000);
  return adjustment.type === "DISCOUNT" ? -amount : amount;
}

export function tabTotals(
  orders: OrderRecord[],
  tab: tabs,
  adjustments: tab_adjustments[],
  pendingCents: number,
) {
  const subtotal = orders
    .flatMap((order) => order.items)
    .reduce((sum, item) => sum + activeLineCents(item), 0);
  const serviceFee = serviceFeeCents(subtotal, tab);
  const computed = adjustments
    .filter(({ removed_at }) => !removed_at)
    .map((adjustment) => ({
      adjustment,
      cents: adjustmentCents(subtotal, adjustment),
    }));
  const adjustmentTotal = computed.reduce((sum, { cents }) => sum + cents, 0);
  const total = Math.max(0, subtotal + serviceFee + adjustmentTotal);
  if (Math.max(subtotal, total, Math.abs(adjustmentTotal)) > 2_147_483_647)
    throw new ConflictError("O valor da comanda excede o limite", "TAB_TOTAL_LIMIT");
  if (total < tab.paid_cents + pendingCents)
    throw new ConflictError(
      "O total não pode ficar abaixo dos valores pagos ou reservados",
      "TOTAL_BELOW_PAID",
    );
  return {
    cents: {
      subtotal_cents: subtotal,
      service_fee_cents: serviceFee,
      adjustments_cents: adjustmentTotal,
      total_cents: total,
    },
    computed,
  };
}

export function splitEqually(amount: number, people: number) {
  const quotient = Math.floor(amount / people);
  return Array.from({ length: people }, (_, index) =>
    index === people - 1 ? amount - quotient * (people - 1) : quotient,
  );
}
