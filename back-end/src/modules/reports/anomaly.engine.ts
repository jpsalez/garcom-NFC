import type { AbcClass } from "./abc-curve.ts";

export type Severity = "INFO" | "WARNING" | "CRITICAL" | "POSITIVE";
export type Alert = { code: string; severity: Severity; message: string; data: Record<string, unknown> };
export type DayFigures = {
  business_date: Date;
  tabs_closed_count: number;
  net_sales_cents: number;
  gross_sales_cents: number;
  discounts_cents: number;
  cancelled_items_cents: number;
};
export type ProductTrend = {
  product_id: string;
  product_name: string;
  abc_class: AbcClass;
  recent_cents: number;
  previous_cents: number;
};

const dayMs = 24 * 60 * 60 * 1000;
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round = (value: number) => Math.round(value * 10) / 10;

export function revenueDrop(day: DayFigures, history: DayFigures[]): Alert | null {
  const sameWeekday = history
    .filter(
      ({ business_date, tabs_closed_count }) => tabs_closed_count > 0 && business_date < day.business_date,
    )
    .filter(({ business_date }) => business_date.getUTCDay() === day.business_date.getUTCDay())
    .slice(-6);
  if (sameWeekday.length < 3) return null;
  const baseline = average(sameWeekday.map(({ net_sales_cents }) => net_sales_cents));
  const drop = baseline ? 1 - day.net_sales_cents / baseline : 0;
  if (drop <= 0.25) return null;
  return {
    code: "REVENUE_DROP",
    severity: drop > 0.4 ? "CRITICAL" : "WARNING",
    message: "Faturamento abaixo da média do mesmo dia da semana",
    data: {
      net_sales_cents: day.net_sales_cents,
      baseline_cents: Math.round(baseline),
      drop_pct: round(drop * 100),
    },
  };
}

function last30Days(day: DayFigures, history: DayFigures[]) {
  const since = day.business_date.getTime() - 30 * dayMs;
  return history.filter(
    ({ business_date }) => business_date < day.business_date && business_date.getTime() >= since,
  );
}

const cancellationRate = ({ gross_sales_cents, cancelled_items_cents }: DayFigures) => {
  const ordered = gross_sales_cents + cancelled_items_cents;
  return ordered ? cancelled_items_cents / ordered : 0;
};

export function cancellationSpike(
  day: DayFigures,
  history: DayFigures[],
  cancelledItems: number,
): Alert | null {
  const baseline = average(last30Days(day, history).map(cancellationRate));
  const rate = cancellationRate(day);
  if (cancelledItems < 3 || rate <= 2 * baseline) return null;
  return {
    code: "CANCELLATION_SPIKE",
    severity: "WARNING",
    message: "Cancelamentos acima do dobro da média de 30 dias",
    data: {
      rate_pct: round(rate * 100),
      baseline_pct: round(baseline * 100),
      cancelled_items: cancelledItems,
    },
  };
}

export function discountSpike(day: DayFigures, history: DayFigures[]): Alert | null {
  const baseline = average(last30Days(day, history).map(({ discounts_cents }) => discounts_cents));
  if (!baseline || day.discounts_cents <= 2 * baseline) return null;
  return {
    code: "DISCOUNT_SPIKE",
    severity: "WARNING",
    message: "Descontos acima do dobro da média de 30 dias",
    data: { discounts_cents: day.discounts_cents, baseline_cents: Math.round(baseline) },
  };
}

export function productTrends(products: ProductTrend[]): Alert[] {
  return products.flatMap((product): Alert[] => {
    const { previous_cents: previous, recent_cents: recent } = product;
    if (!previous) return [];
    const change = recent / previous - 1;
    const data = {
      product_id: product.product_id,
      product_name: product.product_name,
      change_pct: round(change * 100),
    };
    if (product.abc_class === "A" && change < -0.3)
      return [{ code: "PRODUCT_TREND_DOWN", severity: "INFO", message: "Produto curva A em queda", data }];
    if (product.abc_class !== "A" && change > 0.5)
      return [{ code: "PRODUCT_TREND_UP", severity: "POSITIVE", message: "Produto em alta", data }];
    return [];
  });
}

export function cashDifferenceRecurrent(differences: (number | null)[]): Alert | null {
  const shortages = differences.filter((difference) => difference !== null && difference < -1000).length;
  if (shortages < 2) return null;
  return {
    code: "CASH_DIFF_RECURRENT",
    severity: "CRITICAL",
    message: "Quebras de caixa acima de R$ 10,00 em turnos recentes",
    data: { shifts: shortages },
  };
}
