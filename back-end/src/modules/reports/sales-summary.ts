import type { payment_method } from "../../../generated/prisma/client.ts";
import { type DailyFigures, dailyFields, methodField } from "./sales-contribution.ts";

type DailyRow = DailyFigures & { business_date: Date };

const ratio = (part: number, total: number) => (total ? Math.round(part / total) : 0);
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 10_000) / 100 : 0);
const deltaPct = (current: number, previous: number) =>
  previous ? Math.round((current / previous - 1) * 1000) / 10 : null;

export function sumDays(rows: DailyRow[]) {
  const total = Object.fromEntries(dailyFields.map((field) => [field, 0])) as DailyFigures;
  for (const row of rows) for (const field of dailyFields) total[field] += row[field];
  return total;
}

export function kpis(total: DailyFigures) {
  return {
    gross_sales_cents: total.gross_sales_cents,
    discounts_cents: total.discounts_cents,
    cancelled_items_cents: total.cancelled_items_cents,
    service_fee_cents: total.service_fee_cents,
    couvert_cents: total.couvert_cents,
    tips_cents: total.tips_cents,
    net_sales_cents: total.net_sales_cents,
    provider_fees_cents: total.provider_fees_cents,
    net_after_fees_cents: total.net_sales_cents - total.provider_fees_cents,
    tabs_closed_count: total.tabs_closed_count,
    table_tabs_count: total.table_tabs_count,
    counter_tabs_count: total.counter_tabs_count,
    guests_total: total.guests_total,
    avg_ticket_cents: ratio(total.net_sales_cents, total.tabs_closed_count),
    avg_ticket_per_guest_cents: ratio(total.net_sales_cents, total.guests_total),
    avg_stay_seconds: ratio(total.total_stay_seconds, total.tabs_closed_count),
  };
}

export function paymentMix(total: DailyFigures) {
  return (Object.keys(methodField) as payment_method[])
    .map((method) => ({ method, amount_cents: total[methodField[method]] }))
    .filter(({ amount_cents }) => amount_cents > 0)
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .map((row) => ({ ...row, share_pct: pct(row.amount_cents, total.net_sales_cents) }));
}

export function comparison(current: ReturnType<typeof kpis>, previous: ReturnType<typeof kpis>) {
  return {
    net_sales_delta_pct: deltaPct(current.net_sales_cents, previous.net_sales_cents),
    tabs_closed_delta_pct: deltaPct(current.tabs_closed_count, previous.tabs_closed_count),
    avg_ticket_delta_pct: deltaPct(current.avg_ticket_cents, previous.avg_ticket_cents),
  };
}

// Semana começa na segunda-feira, como o date_trunc('week') do PostgreSQL.
export function bucketStart(day: Date, granularity: "day" | "week" | "month") {
  if (granularity === "month") return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  if (granularity === "day") return day;
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * 24 * 60 * 60 * 1000);
}

export function historyBuckets(rows: DailyRow[], granularity: "day" | "week" | "month") {
  const buckets = new Map<number, DailyRow[]>();
  for (const row of rows) {
    const key = bucketStart(row.business_date, granularity).getTime();
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return [...buckets].map(([time, days]) => {
    const total = sumDays(days);
    return {
      bucket_date: new Date(time).toISOString().slice(0, 10),
      ...kpis(total),
      payment_mix: paymentMix(total),
    };
  });
}
