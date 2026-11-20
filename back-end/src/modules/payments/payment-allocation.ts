import type { tabs } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/http-errors.ts";
import type { OrderRecord } from "../orders/orders.repository.interface.ts";
import { activeLineCents, serviceFeeCents } from "../tabs/tabs-pricing.ts";
import type { PaymentRecord } from "./payments.repository.interface.ts";
import type { PaymentAllocation } from "./payments.schemas.ts";

export type AllocationTotals = Map<string, { cents: number; unitsBps: number }>;

export function allocatedByItem(payments: PaymentRecord[]): AllocationTotals {
  const totals: AllocationTotals = new Map();
  for (const payment of payments) {
    if (payment.status !== "APPROVED" && payment.status !== "PENDING" && payment.status !== "PROCESSING")
      continue;
    for (const row of payment.allocations) {
      const current = totals.get(row.order_item_id) ?? { cents: 0, unitsBps: 0 };
      totals.set(row.order_item_id, {
        cents: current.cents + row.covered_cents,
        unitsBps: current.unitsBps + (row.covered_units_bps ?? 0),
      });
    }
  }
  return totals;
}

function assertItemBalance(item: OrderRecord["items"][number], cents: number, unitsBps: number) {
  const availableBps = Math.round(((item.quantity - item.cancelled_quantity) * 10_000) / item.quantity);
  if (cents > activeLineCents(item) || unitsBps > availableBps)
    throw new ConflictError("A alocação excede o saldo do item", "ALLOCATION_EXCEEDS_ITEM");
}

export function validateAllocations(
  orders: OrderRecord[],
  totals: AllocationTotals,
  requested: PaymentAllocation[],
) {
  const items = orders.flatMap(({ items }) => items);
  for (const { order_item_id, covered_cents, covered_units_bps } of requested) {
    const item = items.find(({ id }) => id === order_item_id);
    if (!item) throw new NotFoundError("Item não encontrado na comanda");
    const active = totals.get(item.id);
    assertItemBalance(
      item,
      (active?.cents ?? 0) + covered_cents,
      (active?.unitsBps ?? 0) + (covered_units_bps ?? 0),
    );
  }
}

export function validateExistingAllocations(orders: OrderRecord[], totals: AllocationTotals) {
  for (const { items } of orders)
    for (const item of items) {
      const active = totals.get(item.id);
      if (active) assertItemBalance(item, active.cents, active.unitsBps);
    }
}

function allocationPrincipal(allocations: PaymentAllocation[]) {
  return allocations.reduce((sum, { covered_cents }) => sum + covered_cents, 0);
}

function availableForAllocation(tab: tabs, pendingCents: number, principal: number) {
  const available = tab.total_cents - tab.paid_cents - pendingCents;
  if (principal > 0 && principal > available)
    throw new ConflictError("As alocações superam o saldo disponível da comanda", "TOTAL_BELOW_PAID");
  return available;
}

export function proportionalCharge(
  allocations: PaymentAllocation[],
  tab: tabs,
  pendingCents: number,
  includeFee: boolean,
) {
  const principal = allocationPrincipal(allocations);
  const available = availableForAllocation(tab, pendingCents, principal);
  const fee = includeFee ? serviceFeeCents(principal, tab) : 0;
  return principal + Math.min(fee, available - principal);
}

export function validatePaymentAmount(
  tab: tabs,
  pendingCents: number,
  amount: number,
  allocations: PaymentAllocation[],
  includeFee?: boolean,
) {
  const principal = allocationPrincipal(allocations);
  const available = availableForAllocation(tab, pendingCents, principal);
  if (amount > available)
    throw new ConflictError("O pagamento excede o saldo disponível", "PAYMENT_EXCEEDS_BALANCE");
  if (principal > amount)
    throw new ValidationError(undefined, "A soma das alocações excede o valor do pagamento");
  if (
    includeFee !== undefined &&
    allocations.length &&
    amount !== proportionalCharge(allocations, tab, pendingCents, includeFee)
  )
    throw new ValidationError(undefined, "Valor incompatível com os itens e a taxa informada");
}
