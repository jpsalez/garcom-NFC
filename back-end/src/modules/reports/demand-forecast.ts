import { rankProducts } from "./abc-curve.ts";
import { type ForecastProduct, forecastDemand, maxOccurrences, trendFactor } from "./forecast.engine.ts";
import { addDays, formatDay, sameDay } from "./report-dates.ts";
import type { ReportsRepository } from "./reports.repository.ts";

type DailyRows = Awaited<ReturnType<ReportsRepository["dailyRange"]>>;
type ProductRows = Awaited<ReturnType<ReportsRepository["productRange"]>>;

const netBetween = (days: DailyRows, from: Date, to: Date) =>
  days
    .filter(({ business_date }) => business_date >= from && business_date <= to)
    .reduce((sum, { net_sales_cents }) => sum + net_sales_cents, 0);

function forecastProducts(rows: ProductRows, occurrences: Date[]): ForecastProduct[] {
  return rankProducts(rows).map((ranked) => {
    const own = rows.filter(({ product_id }) => product_id === ranked.product_id);
    const quantity_by_hour = new Map<number, number>();
    for (const row of own)
      quantity_by_hour.set(row.hour_bucket, (quantity_by_hour.get(row.hour_bucket) ?? 0) + row.quantity_sold);
    const quantities = occurrences.map((day) =>
      own
        .filter(({ business_date }) => sameDay(business_date, day))
        .reduce((sum, { quantity_sold }) => sum + quantity_sold, 0),
    );
    return { ...ranked, quantities, quantity_by_hour };
  });
}

// Usa as últimas ocorrências do mesmo dia da semana em que o restaurante abriu.
export async function demandForecast(
  repository: ReportsRepository,
  restaurantId: string,
  target: Date,
  limit: number,
) {
  const until = addDays(target, -1);
  const days = await repository.dailyRange(restaurantId, {
    from: addDays(target, -7 * maxOccurrences),
    to: until,
  });
  const occurrences = days
    .filter(
      ({ business_date, tabs_closed_count }) =>
        tabs_closed_count > 0 && business_date.getUTCDay() === target.getUTCDay(),
    )
    .map(({ business_date }) => business_date)
    .reverse()
    .slice(0, maxOccurrences);
  const trend = trendFactor(
    netBetween(days, addDays(target, -14), until),
    netBetween(days, addDays(target, -28), addDays(target, -15)),
  );
  const oldest = occurrences.at(-1);
  const rows =
    oldest && occurrences.length >= 3
      ? (await repository.productRange(restaurantId, { from: oldest, to: until })).filter(
          ({ business_date }) => occurrences.some((day) => sameDay(day, business_date)),
        )
      : [];
  return {
    target_date: formatDay(target),
    weekday: target.getUTCDay(),
    occurrences: occurrences.length,
    ...forecastDemand(forecastProducts(rows, occurrences), occurrences.length, trend, limit),
  };
}
