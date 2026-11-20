export type Confidence = "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH";
export type ForecastProduct = {
  product_id: string;
  product_name: string;
  category_name: string;
  abc_class: "A" | "B" | "C";
  // Quantidade por ocorrência, da mais recente para a mais antiga (0 quando não vendeu).
  quantities: number[];
  quantity_by_hour: Map<number, number>;
};

export const maxOccurrences = 12;
const decay = 0.75;

export function confidenceFor(occurrences: number): Confidence {
  if (occurrences < 3) return "INSUFFICIENT_DATA";
  if (occurrences <= 5) return "LOW";
  if (occurrences <= 11) return "MEDIUM";
  return "HIGH";
}

export function trendFactor(recentCents: number, previousCents: number) {
  if (recentCents <= 0 || previousCents <= 0) return 1;
  const ratio = recentCents / previousCents;
  return Math.round(Math.min(1.25, Math.max(0.8, ratio)) * 100) / 100;
}

export function weightedMean(values: number[]) {
  let weighted = 0;
  let weights = 0;
  values.forEach((value, k) => {
    weighted += value * decay ** k;
    weights += decay ** k;
  });
  return weights ? weighted / weights : 0;
}

function standardDeviation(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function peakHours(byHour: Map<number, number>) {
  return [...byHour]
    .filter(([, quantity]) => quantity > 0)
    .sort(([hourA, a], [hourB, b]) => b - a || hourA - hourB)
    .slice(0, 3)
    .map(([hour]) => hour)
    .sort((a, b) => a - b);
}

export function forecastProduct(product: ForecastProduct, trend: number) {
  const expected = Math.round(weightedMean(product.quantities) * trend);
  const sigma = standardDeviation(product.quantities);
  return {
    product_id: product.product_id,
    product_name: product.product_name,
    category_name: product.category_name,
    abc_class: product.abc_class,
    expected_qty: expected,
    range_min: Math.max(0, Math.floor(expected - sigma)),
    range_max: Math.ceil(expected + sigma),
    peak_hours: peakHours(product.quantity_by_hour),
  };
}

export function forecastDemand(
  products: ForecastProduct[],
  occurrences: number,
  trend: number,
  limit: number,
) {
  const confidence = confidenceFor(occurrences);
  if (confidence === "INSUFFICIENT_DATA") return { confidence, trend_factor: null, items: [] };
  const items = products
    .map((product) => forecastProduct(product, trend))
    .filter(({ expected_qty }) => expected_qty > 0)
    .sort((a, b) => b.expected_qty - a.expected_qty || a.product_id.localeCompare(b.product_id))
    .slice(0, limit);
  return { confidence, trend_factor: trend, items };
}
