import { rankProducts } from "./abc-curve.ts";
import {
  cancellationSpike,
  cashDifferenceRecurrent,
  type DayFigures,
  discountSpike,
  productTrends,
  revenueDrop,
} from "./anomaly.engine.ts";
import { addDays, formatDay, sameDay } from "./report-dates.ts";
import type { ReportsRepository } from "./reports.repository.ts";

type ProductRows = Awaited<ReturnType<ReportsRepository["productRange"]>>;

const revenueSince = (rows: ProductRows, productId: string, from: Date, to: Date) =>
  rows
    .filter((row) => row.product_id === productId && row.business_date >= from && row.business_date <= to)
    .reduce((sum, { revenue_cents }) => sum + revenue_cents, 0);

function trendsOf(rows: ProductRows, date: Date) {
  const recentFrom = addDays(date, -13);
  return rankProducts(rows).map((product) => ({
    product_id: product.product_id,
    product_name: product.product_name,
    abc_class: product.abc_class,
    recent_cents: revenueSince(rows, product.product_id, recentFrom, date),
    previous_cents: revenueSince(rows, product.product_id, addDays(date, -27), addDays(date, -14)),
  }));
}

export async function salesAlerts(repository: ReportsRepository, restaurantId: string, date: Date) {
  const history: DayFigures[] = await repository.dailyRange(restaurantId, {
    from: addDays(date, -42),
    to: date,
  });
  const day = history.find(({ business_date }) => sameDay(business_date, date));
  const products = await repository.productRange(restaurantId, { from: addDays(date, -27), to: date });
  const cancelledItems = products
    .filter(({ business_date }) => sameDay(business_date, date))
    .reduce((sum, { quantity_cancelled }) => sum + quantity_cancelled, 0);
  // Turnos fechados nos 7 dias que terminam na data avaliada (limites em UTC).
  const shifts = await repository.closedCashShifts(restaurantId, addDays(date, -6), addDays(date, 1));
  const dayAlerts = day?.tabs_closed_count
    ? [
        revenueDrop(day, history),
        cancellationSpike(day, history, cancelledItems),
        discountSpike(day, history),
      ]
    : [];
  const alerts = [
    ...dayAlerts,
    ...productTrends(trendsOf(products, date)),
    cashDifferenceRecurrent(shifts.map(({ difference_cents }) => difference_cents)),
  ];
  return { date: formatDay(date), alerts: alerts.filter((alert) => alert !== null) };
}
