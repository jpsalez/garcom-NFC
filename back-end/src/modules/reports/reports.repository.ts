import type { DbClient } from "../../shared/providers/prisma.ts";
import { type DailyFigures, dailyFields, type ProductFigures } from "./sales-contribution.ts";

const closedTabInclude = {
  orders: { include: { items: true }, orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }] },
  payments: true,
  adjustments: true,
};
const closedTabsWhere = (restaurantId: string) =>
  ({ restaurant_id: restaurantId, status: "CLOSED", legacy_closed: false }) as const;

export type DateRange = { from: Date; to: Date };

export class ReportsRepository {
  constructor(private readonly db: DbClient) {}

  businessClock(restaurantId: string) {
    return this.db.restaurants.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true, business_day_cutoff_minutes: true },
    });
  }

  closedTab(restaurantId: string, tabId: string) {
    return this.db.tabs.findFirst({
      where: { ...closedTabsWhere(restaurantId), id: tabId },
      include: closedTabInclude,
    });
  }

  closedTabs(restaurantId: string, { from, to }: DateRange) {
    return this.db.tabs.findMany({
      where: { ...closedTabsWhere(restaurantId), business_date: { gte: from, lte: to } },
      include: closedTabInclude,
      orderBy: [{ closed_at: "asc" }, { id: "asc" }],
    });
  }

  // Incrementa e só cria a linha quando ela não existe; o lock do restaurante serializa as escritas.
  // Sem CHECK de não-negativo: um agregado defasado nunca bloqueia um estorno; o rebuild corrige.
  async addDaily(restaurantId: string, businessDate: Date, figures: DailyFigures, now: Date) {
    const { total_stay_seconds, ...cents } = figures;
    const where = { restaurant_id: restaurantId, business_date: businessDate };
    const increments = Object.fromEntries(
      Object.entries(cents).map(([field, value]) => [field, { increment: value }]),
    );
    const updated = await this.db.daily_sales.updateMany({
      where,
      data: { ...increments, total_stay_seconds: { increment: BigInt(total_stay_seconds) }, rebuilt_at: now },
    });
    if (updated.count) return;
    await this.db.daily_sales.create({
      data: { ...where, ...cents, total_stay_seconds: BigInt(total_stay_seconds), rebuilt_at: now },
    });
  }

  async addProduct(restaurantId: string, businessDate: Date, row: ProductFigures) {
    const { product_id, variant_id, hour_bucket, quantity_sold, quantity_cancelled, revenue_cents } = row;
    const updated = await this.db.product_sales_daily.updateMany({
      where: {
        restaurant_id: restaurantId,
        business_date: businessDate,
        product_id,
        variant_id,
        hour_bucket,
      },
      data: {
        quantity_sold: { increment: quantity_sold },
        quantity_cancelled: { increment: quantity_cancelled },
        revenue_cents: { increment: revenue_cents },
      },
    });
    if (updated.count) return;
    await this.db.product_sales_daily.create({
      data: { ...row, restaurant_id: restaurantId, business_date: businessDate },
    });
  }

  async replaceRange(
    restaurantId: string,
    range: DateRange,
    days: { businessDate: Date; daily: DailyFigures; products: ProductFigures[] }[],
    now: Date,
  ) {
    const where = { restaurant_id: restaurantId, business_date: { gte: range.from, lte: range.to } };
    await this.db.daily_sales.deleteMany({ where });
    await this.db.product_sales_daily.deleteMany({ where });
    await this.db.daily_sales.createMany({
      data: days.map(({ businessDate, daily }) => ({
        ...daily,
        total_stay_seconds: BigInt(daily.total_stay_seconds),
        restaurant_id: restaurantId,
        business_date: businessDate,
        rebuilt_at: now,
      })),
    });
    await this.db.product_sales_daily.createMany({
      data: days.flatMap(({ businessDate, products }) =>
        products.map((row) => ({ ...row, restaurant_id: restaurantId, business_date: businessDate })),
      ),
    });
  }

  async dailyRange(restaurantId: string, { from, to }: DateRange) {
    const rows = await this.db.daily_sales.findMany({
      where: { restaurant_id: restaurantId, business_date: { gte: from, lte: to } },
      orderBy: { business_date: "asc" },
    });
    return rows.map((row) => ({
      business_date: row.business_date,
      ...(Object.fromEntries(dailyFields.map((field) => [field, Number(row[field])])) as DailyFigures),
    }));
  }

  productRange(restaurantId: string, { from, to }: DateRange) {
    return this.db.product_sales_daily.findMany({
      where: { restaurant_id: restaurantId, business_date: { gte: from, lte: to } },
      orderBy: [
        { business_date: "asc" },
        { product_id: "asc" },
        { variant_id: "asc" },
        { hour_bucket: "asc" },
      ],
    });
  }

  basketTabs(restaurantId: string, { from, to }: DateRange) {
    return this.db.tabs.findMany({
      where: { ...closedTabsWhere(restaurantId), business_date: { gte: from, lte: to } },
      select: {
        orders: {
          select: {
            items: {
              select: {
                product_id: true,
                product_name_snapshot: true,
                quantity: true,
                cancelled_quantity: true,
              },
            },
          },
        },
      },
    });
  }

  // Do envio ao primeiro item pronto, nos pedidos das comandas fechadas do período.
  prepSamples(restaurantId: string, { from, to }: DateRange) {
    return this.db.orders.findMany({
      where: {
        restaurant_id: restaurantId,
        tab: { status: "CLOSED", legacy_closed: false, business_date: { gte: from, lte: to } },
      },
      select: {
        created_at: true,
        events: {
          where: { action: "TRANSITIONED", to_stage: "READY" },
          orderBy: { created_at: "asc" },
          take: 1,
          select: { created_at: true },
        },
      },
    });
  }

  closedCashShifts(restaurantId: string, since: Date) {
    return this.db.cash_shifts.findMany({
      where: { restaurant_id: restaurantId, status: "CLOSED", closed_at: { gte: since } },
      select: { difference_cents: true },
    });
  }
}
