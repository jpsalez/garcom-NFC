import type { product_sales_daily } from "../../../generated/prisma/client.ts";

type SalesRow = Pick<
  product_sales_daily,
  | "product_id"
  | "product_name_snapshot"
  | "category_name_snapshot"
  | "quantity_sold"
  | "quantity_cancelled"
  | "revenue_cents"
>;
export type AbcClass = "A" | "B" | "C";

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 10_000) / 100 : 0);

// Linhas em ordem cronológica: o nome mais recente do snapshot prevalece.
export function rankProducts(rows: SalesRow[]) {
  const totals = new Map<
    string,
    Omit<SalesRow, "product_name_snapshot" | "category_name_snapshot"> & {
      product_name: string;
      category_name: string;
    }
  >();
  for (const row of rows) {
    const current = totals.get(row.product_id);
    totals.set(row.product_id, {
      product_id: row.product_id,
      product_name: row.product_name_snapshot,
      category_name: row.category_name_snapshot,
      quantity_sold: (current?.quantity_sold ?? 0) + row.quantity_sold,
      quantity_cancelled: (current?.quantity_cancelled ?? 0) + row.quantity_cancelled,
      revenue_cents: (current?.revenue_cents ?? 0) + row.revenue_cents,
    });
  }
  const ranked = [...totals.values()].sort(
    (a, b) => b.revenue_cents - a.revenue_cents || a.product_id.localeCompare(b.product_id),
  );
  const total = ranked.reduce((sum, { revenue_cents }) => sum + revenue_cents, 0);
  let cumulative = 0;
  return ranked.map((product) => {
    // O produto que cruza o limite ainda pertence à classe: o primeiro é sempre A.
    const before = total ? cumulative / total : 1;
    cumulative += product.revenue_cents;
    const abc_class: AbcClass = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
    return {
      ...product,
      revenue_share_pct: percent(product.revenue_cents, total),
      cumulative_pct: percent(cumulative, total),
      abc_class,
    };
  });
}
