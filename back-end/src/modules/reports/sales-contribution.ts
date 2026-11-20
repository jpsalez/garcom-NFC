import type {
  order_items,
  orders,
  payment_method,
  payments,
  tab_adjustments,
  tabs,
} from "../../../generated/prisma/client.ts";
import { localHour } from "../tabs/tab-business-date.ts";
import { activeLineCents } from "../tabs/tabs-pricing.ts";

export const dailyFields = [
  "tabs_closed_count",
  "table_tabs_count",
  "counter_tabs_count",
  "guests_total",
  "gross_sales_cents",
  "cancelled_items_cents",
  "discounts_cents",
  "service_fee_cents",
  "couvert_cents",
  "tips_cents",
  "net_sales_cents",
  "cash_cents",
  "credit_cents",
  "debit_cents",
  "pix_cents",
  "voucher_cents",
  "other_cents",
  "provider_fees_cents",
  "total_stay_seconds",
] as const;

export type DailyFigures = Record<(typeof dailyFields)[number], number>;
export type ProductFigures = {
  product_id: string;
  variant_id: string;
  hour_bucket: number;
  product_name_snapshot: string;
  variant_name_snapshot: string;
  category_name_snapshot: string;
  quantity_sold: number;
  quantity_cancelled: number;
  revenue_cents: number;
};
export type Contribution = { daily: DailyFigures; products: Map<string, ProductFigures> };
export type ClosedTabRecord = tabs & {
  orders: (orders & { items: order_items[] })[];
  payments: payments[];
  adjustments: tab_adjustments[];
};

export const methodField: Record<payment_method, keyof DailyFigures> = {
  CASH: "cash_cents",
  CREDIT: "credit_cents",
  DEBIT: "debit_cents",
  PIX: "pix_cents",
  VOUCHER: "voucher_cents",
  OTHER: "other_cents",
};

const adjustmentField = { DISCOUNT: "discounts_cents", COUVERT: "couvert_cents", TIP: "tips_cents" } as const;

export function emptyContribution(): Contribution {
  const daily = Object.fromEntries(dailyFields.map((field) => [field, 0])) as DailyFigures;
  return { daily, products: new Map() };
}

// Fonte única do incremental e do rebuild: os dois somam exatamente estes números.
export function tabContribution(tab: ClosedTabRecord, timezone: string): Contribution {
  const contribution = emptyContribution();
  const { daily } = contribution;
  daily.tabs_closed_count = 1;
  daily[tab.kind === "TABLE" ? "table_tabs_count" : "counter_tabs_count"] = 1;
  daily.guests_total = tab.guests_count ?? 0;
  daily.gross_sales_cents = tab.subtotal_cents;
  daily.service_fee_cents = tab.service_fee_cents;
  const closedAt = tab.closed_at ?? tab.opened_at;
  daily.total_stay_seconds = Math.max(0, Math.floor((closedAt.getTime() - tab.opened_at.getTime()) / 1000));
  for (const adjustment of tab.adjustments.filter(({ removed_at }) => !removed_at))
    daily[adjustmentField[adjustment.type]] += Math.abs(adjustment.computed_cents);
  for (const payment of tab.payments.filter(({ status }) => status === "APPROVED")) {
    daily.net_sales_cents += payment.amount_cents;
    daily[methodField[payment.method]] += payment.amount_cents;
    daily.provider_fees_cents += payment.provider_fee_cents ?? 0;
  }
  for (const order of tab.orders) addOrderItems(contribution, order, timezone);
  return contribution;
}

function addOrderItems(
  contribution: Contribution,
  order: ClosedTabRecord["orders"][number],
  timezone: string,
) {
  const hour = localHour(order.created_at, timezone);
  for (const item of order.items) {
    contribution.daily.cancelled_items_cents += item.unit_price_cents * item.cancelled_quantity;
    addProduct(contribution.products, {
      product_id: item.product_id,
      variant_id: item.variant_id,
      hour_bucket: hour,
      product_name_snapshot: item.product_name_snapshot,
      variant_name_snapshot: item.variant_name_snapshot,
      category_name_snapshot: item.category_name_snapshot,
      quantity_sold: item.quantity - item.cancelled_quantity,
      quantity_cancelled: item.cancelled_quantity,
      revenue_cents: activeLineCents(item),
    });
  }
}

const productKey = ({ product_id, variant_id, hour_bucket }: ProductFigures) =>
  `${product_id}:${variant_id}:${hour_bucket}`;

function addProduct(products: Map<string, ProductFigures>, row: ProductFigures, sign = 1) {
  const key = productKey(row);
  const current = products.get(key);
  if (!current) {
    products.set(key, {
      ...row,
      quantity_sold: sign * row.quantity_sold,
      quantity_cancelled: sign * row.quantity_cancelled,
      revenue_cents: sign * row.revenue_cents,
    });
    return;
  }
  current.quantity_sold += sign * row.quantity_sold;
  current.quantity_cancelled += sign * row.quantity_cancelled;
  current.revenue_cents += sign * row.revenue_cents;
}

export function addContribution(target: Contribution, source: Contribution, sign = 1) {
  for (const field of dailyFields) target.daily[field] += sign * source.daily[field];
  for (const row of source.products.values()) addProduct(target.products, row, sign);
  return target;
}

export const isEmptyProduct = (row: ProductFigures) =>
  !row.quantity_sold && !row.quantity_cancelled && !row.revenue_cents;
