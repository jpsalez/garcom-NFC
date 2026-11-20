import { inject, injectable } from "tsyringe";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { ForbiddenError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { logOperation } from "../../shared/utils/request-context.ts";
import { RestaurantRepository } from "../restaurants/restaurants.repository.ts";
import { businessDate } from "../tabs/tab-business-date.ts";
import { rankProducts } from "./abc-curve.ts";
import { basketPairs, prepTimeStats } from "./basket-and-prep.ts";
import { demandForecast } from "./demand-forecast.ts";
import { addDays, parseDay } from "./report-dates.ts";
import type { IReportsService } from "./reports.interfaces.ts";
import { type DateRange, ReportsRepository } from "./reports.repository.ts";
import type {
  AlertsQuery,
  ForecastQuery,
  HistoryQuery,
  RangeQuery,
  RebuildInput,
  SummaryQuery,
} from "./reports.schemas.ts";
import { rebuildRange } from "./sales-aggregator.ts";
import { salesAlerts } from "./sales-alerts.ts";
import { comparison, historyBuckets, kpis, paymentMix, sumDays } from "./sales-summary.ts";

function restaurantOf(actor: ActorContext) {
  if (!actor.restaurantId) throw new ForbiddenError("Usuário sem restaurante");
  return actor.restaurantId;
}

const toRange = ({ from, to }: RangeQuery): DateRange => ({ from: parseDay(from), to: parseDay(to) });

@injectable()
export class ReportsService implements IReportsService {
  constructor(
    @inject("DbClient") private db: DbClient,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}

  private repository() {
    return new ReportsRepository(this.db);
  }

  async summary(actor: ActorContext, query: SummaryQuery) {
    const restaurantId = restaurantOf(actor);
    const range = toRange(query);
    const total = sumDays(await this.repository().dailyRange(restaurantId, range));
    const days = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) + 1;
    const current = kpis(total);
    const result = { period: { ...query, days }, kpis: current, payment_mix: paymentMix(total) };
    if (!query.compare) return result;
    const previous = { from: addDays(range.from, -days), to: addDays(range.from, -1) };
    const before = kpis(sumDays(await this.repository().dailyRange(restaurantId, previous)));
    return { ...result, comparison: comparison(current, before) };
  }

  async history(actor: ActorContext, query: HistoryQuery) {
    const rows = await this.repository().dailyRange(restaurantOf(actor), toRange(query));
    return { granularity: query.granularity, items: historyBuckets(rows, query.granularity) };
  }

  async products(actor: ActorContext, query: RangeQuery) {
    return { items: rankProducts(await this.repository().productRange(restaurantOf(actor), toRange(query))) };
  }

  async basket(actor: ActorContext, query: RangeQuery) {
    return { items: basketPairs(await this.repository().basketTabs(restaurantOf(actor), toRange(query))) };
  }

  async heatmap(actor: ActorContext, query: RangeQuery) {
    const cells = new Map<
      string,
      { weekday: number; hour_bucket: number; items_sold: number; revenue_cents: number }
    >();
    for (const row of await this.repository().productRange(restaurantOf(actor), toRange(query))) {
      const weekday = row.business_date.getUTCDay();
      const key = `${weekday}:${row.hour_bucket}`;
      const cell = cells.get(key) ?? {
        weekday,
        hour_bucket: row.hour_bucket,
        items_sold: 0,
        revenue_cents: 0,
      };
      cell.items_sold += row.quantity_sold;
      cell.revenue_cents += row.revenue_cents;
      cells.set(key, cell);
    }
    const items = [...cells.values()].sort((a, b) => a.weekday - b.weekday || a.hour_bucket - b.hour_bucket);
    return { items };
  }

  async prepTime(actor: ActorContext, query: RangeQuery) {
    return prepTimeStats(await this.repository().prepSamples(restaurantOf(actor), toRange(query)));
  }

  forecast(actor: ActorContext, query: ForecastQuery) {
    return demandForecast(this.repository(), restaurantOf(actor), parseDay(query.target_date), query.limit);
  }

  async alerts(actor: ActorContext, query: AlertsQuery) {
    const restaurantId = restaurantOf(actor);
    const now = new Date();
    const repository = this.repository();
    const clock = await repository.businessClock(restaurantId);
    // Sem data, avalia o último dia operacional completo.
    const date = query.date ? parseDay(query.date) : addDays(businessDate(now, clock), -1);
    return salesAlerts(repository, restaurantId, date, now);
  }

  async rebuild(actor: ActorContext, input: RebuildInput) {
    if (actor.role !== "OWNER") throw new ForbiddenError("Somente o dono reconstrói os relatórios");
    const { from, to } = toRange(input);
    const days = await this.rebuildDays(restaurantOf(actor), from, to, actor);
    return { from: input.from, to: input.to, days_with_sales: days };
  }

  // Job diário: reconstrói os últimos 7 dias operacionais de cada restaurante ativo.
  async reconcile() {
    const restaurants = await new RestaurantRepository(this.db).findAll();
    for (const { id } of restaurants.filter(({ active }) => active)) {
      try {
        const today = businessDate(new Date(), await this.repository().businessClock(id));
        await this.rebuildDays(id, addDays(today, -6), today);
      } catch {
        logOperation({ event: "reports.reconciliation_failed", restaurant_id: id });
      }
    }
  }

  // Uma transação por dia: o lock do restaurante fica preso só pelo tempo de um dia.
  private async rebuildDays(restaurantId: string, from: Date, to: Date, actor?: ActorContext) {
    const options = actor ? { actor, capability: "reports:read" as const } : undefined;
    let daysWithSales = 0;
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const range = { from: day, to: day };
      daysWithSales += await this.unit.run(restaurantId, (tx) => rebuildRange(tx, range), options);
    }
    return daysWithSales;
  }
}
