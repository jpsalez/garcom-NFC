import type { tabs } from "../../../generated/prisma/client.ts";
import { hasPendingOrderItems, orderView } from "../orders/order-progress.ts";
import type { OrderRecord } from "../orders/orders.repository.interface.ts";
import { activeLineCents, serviceFeeCents } from "./tabs-pricing.ts";

export function orderTableLabel(tab: Pick<tabs, "table_label_snapshot" | "label" | "number">) {
  return tab.table_label_snapshot ?? tab.label ?? `Balcão #${tab.number}`;
}

export function tabSummary(tab: tabs, hasPendingKitchenItems: boolean) {
  return {
    id: tab.id,
    number: tab.number,
    kind: tab.kind,
    table_id: tab.table_id,
    table_label: tab.table_label_snapshot,
    label: tab.label,
    guests_count: tab.guests_count,
    status: tab.status,
    subtotal_cents: tab.subtotal_cents,
    service_fee_cents: tab.service_fee_cents,
    adjustments_cents: tab.adjustments_cents,
    total_cents: tab.total_cents,
    paid_cents: tab.paid_cents,
    pending_cents: 0,
    remaining_cents: tab.total_cents - tab.paid_cents,
    has_pending_kitchen_items: hasPendingKitchenItems,
    open_payment_requests_count: 0,
    opened_at: tab.opened_at,
    version: tab.version,
  };
}

function byGuest(tab: tabs, orders: OrderRecord[]) {
  const groups = new Map<
    string,
    { key: string; label: string; subtotal_cents: number; item_ids: string[] }
  >();
  for (const order of orders) {
    const key = order.submitted_by_token_id ? `token:${order.submitted_by_token_id}` : "staff";
    const group = groups.get(key) ?? {
      key,
      label: order.submitted_by_token_id ? "Aparelho da mesa" : "Mesa / Equipe",
      subtotal_cents: 0,
      item_ids: [],
    };
    for (const item of order.items) {
      group.subtotal_cents += activeLineCents(item);
      group.item_ids.push(item.id);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    estimated_service_fee_cents: serviceFeeCents(group.subtotal_cents, tab),
  }));
}

function tabOrder(order: OrderRecord) {
  const view = orderView(order, true);
  return {
    ...view,
    submitted_by_token_id: order.submitted_by_token_id,
    guest_label: null,
    items: view.items.map((item, index) => {
      const active = activeLineCents(item);
      return {
        ...item,
        category_id_snapshot: order.items[index]?.category_id_snapshot ?? null,
        category_name_snapshot: order.items[index]?.category_name_snapshot ?? null,
        active_line_cents: active,
        allocated_cents: 0,
        unallocated_cents: active,
      };
    }),
  };
}

export function tabDetail(tab: tabs, orders: OrderRecord[]) {
  return {
    ...tabSummary(tab, hasPendingOrderItems(orders)),
    orders: orders.map(tabOrder),
    by_guest: byGuest(tab, orders),
    adjustments: [],
    payments: [],
    payment_requests: [],
    fiscal_documents: [],
  };
}
