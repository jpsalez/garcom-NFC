import { fiscalDocumentView } from "../fiscal/fiscal-document.ts";
import type { tabs } from "../../../generated/prisma/client.ts";
import { orderView } from "../orders/order-progress.ts";
import { allocatedByItem, type AllocationTotals } from "../payments/payment-allocation.ts";
import { paymentView } from "../payments/payment-view.ts";
import { paymentRequestView } from "./payment-request-view.ts";
import { summarizeLedger, type TabLedger } from "./tab-ledger.ts";
import type { TabOrderRecord } from "./tabs.repository.interface.ts";
import { activeLineCents, serviceFeeCents } from "./tabs-pricing.ts";

export function orderTableLabel(tab: Pick<tabs, "table_label_snapshot" | "label" | "number">) {
  return tab.table_label_snapshot ?? tab.label ?? `Balcão #${tab.number}`;
}

export function tabSummary(
  tab: tabs,
  hasPendingKitchenItems: boolean,
  { pendingCents = 0, openRequests = 0 } = {},
) {
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
    pending_cents: pendingCents,
    closed_refunded_cents: tab.closed_refunded_cents,
    remaining_cents: tab.total_cents - tab.paid_cents,
    has_pending_kitchen_items: hasPendingKitchenItems,
    open_payment_requests_count: openRequests,
    opened_at: tab.opened_at,
    version: tab.version,
  };
}

function byGuest(tab: tabs, orders: TabOrderRecord[]) {
  const groups = new Map<
    string,
    { key: string; label: string; subtotal_cents: number; item_ids: string[] }
  >();
  for (const order of orders) {
    const key = order.submitted_by_token_id ? `token:${order.submitted_by_token_id}` : "staff";
    const group = groups.get(key) ?? {
      key,
      label: order.submitted_by_token_id
        ? (order.submitted_by_token?.guest_label ?? "Aparelho da mesa")
        : "Mesa / Equipe",
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

function tabOrder(order: TabOrderRecord, totals: AllocationTotals) {
  const view = orderView(order, true);
  return {
    ...view,
    submitted_by_token_id: order.submitted_by_token_id,
    guest_label: order.submitted_by_token?.guest_label ?? null,
    items: view.items.map((item, index) => {
      const active = activeLineCents(item);
      const allocated = totals.get(item.id)?.cents ?? 0;
      return {
        ...item,
        category_id_snapshot: order.items[index]?.category_id_snapshot ?? null,
        category_name_snapshot: order.items[index]?.category_name_snapshot ?? null,
        active_line_cents: active,
        allocated_cents: allocated,
        unallocated_cents: active - allocated,
      };
    }),
  };
}

export function tabDetail(tab: tabs, ledger: TabLedger) {
  const summary = summarizeLedger(ledger);
  const allocations = allocatedByItem(ledger.payments);
  return {
    ...tabSummary(tab, summary.hasPendingKitchenItems, summary),
    orders: ledger.orders.map((order) => tabOrder(order, allocations)),
    by_guest: byGuest(tab, ledger.orders),
    adjustments: ledger.adjustments,
    payments: ledger.payments.map(paymentView),
    payment_requests: ledger.requests.map(paymentRequestView),
    fiscal_documents: ledger.fiscalDocuments.map(fiscalDocumentView),
  };
}
