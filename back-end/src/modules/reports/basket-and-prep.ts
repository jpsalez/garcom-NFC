import type { ReportsRepository } from "./reports.repository.ts";

type BasketTabs = Awaited<ReturnType<ReportsRepository["basketTabs"]>>;
type PrepSamples = Awaited<ReturnType<ReportsRepository["prepSamples"]>>;

export const minimumCoOccurrences = 3;

function soldProducts(tab: BasketTabs[number]) {
  const products = new Map<string, string>();
  for (const order of tab.orders)
    for (const item of order.items)
      if (item.quantity > item.cancelled_quantity) products.set(item.product_id, item.product_name_snapshot);
  return [...products].sort(([a], [b]) => a.localeCompare(b));
}

export function basketPairs(tabs: BasketTabs, limit = 20) {
  const pairs = new Map<string, { a: [string, string]; b: [string, string]; count: number }>();
  for (const tab of tabs) {
    const products = soldProducts(tab);
    products.forEach((a, index) => {
      for (const b of products.slice(index + 1)) {
        const key = `${a[0]}:${b[0]}`;
        pairs.set(key, { a, b, count: (pairs.get(key)?.count ?? 0) + 1 });
      }
    });
  }
  return [...pairs.values()]
    .filter(({ count }) => count >= minimumCoOccurrences)
    .sort((x, y) => y.count - x.count || `${x.a[0]}${x.b[0]}`.localeCompare(`${y.a[0]}${y.b[0]}`))
    .slice(0, limit)
    .map(({ a, b, count }) => ({
      product_a_id: a[0],
      product_a_name: a[1],
      product_b_id: b[0],
      product_b_name: b[1],
      co_occurrences: count,
    }));
}

// Percentil contínuo, como o PERCENTILE_CONT do PostgreSQL.
function percentile(sorted: number[], fraction: number) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  return low + ((sorted[upper] ?? low) - low) * (position - lower);
}

export function prepTimeStats(samples: PrepSamples) {
  const seconds = samples
    .flatMap(({ created_at, events: [ready] }) =>
      ready ? [(ready.created_at.getTime() - created_at.getTime()) / 1000] : [],
    )
    .sort((a, b) => a - b);
  if (!seconds.length) return { samples: 0, avg_prep_seconds: null, p90_prep_seconds: null };
  return {
    samples: seconds.length,
    avg_prep_seconds: Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length),
    p90_prep_seconds: Math.round(percentile(seconds, 0.9)),
  };
}
