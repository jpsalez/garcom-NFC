import type { RestaurantTransaction } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { type DateRange, ReportsRepository } from "./reports.repository.ts";
import {
  addContribution,
  type Contribution,
  emptyContribution,
  isEmptyProduct,
  tabContribution,
} from "./sales-contribution.ts";

// Contribuição atual de uma comanda fechada; null para abertas, canceladas ou legadas.
export async function tabSales({ db, restaurant }: RestaurantTransaction, tabId: string) {
  const tab = await new ReportsRepository(db).closedTab(restaurant.id, tabId);
  if (!tab?.business_date) return null;
  return { businessDate: tab.business_date, contribution: tabContribution(tab, restaurant.timezone) };
}

// Chamar no mesmo unit.run que fecha a comanda ou altera seus pagamentos depois do fechamento.
export async function applyTabSalesChange(
  transaction: RestaurantTransaction,
  tabId: string,
  before: Awaited<ReturnType<typeof tabSales>> = null,
) {
  const after = await tabSales(transaction, tabId);
  const businessDate = after?.businessDate ?? before?.businessDate;
  if (!businessDate) return;
  const delta = emptyContribution();
  if (after) addContribution(delta, after.contribution);
  if (before) addContribution(delta, before.contribution, -1);
  await applyDelta(transaction, businessDate, delta);
}

async function applyDelta(
  { db, restaurant, now }: RestaurantTransaction,
  businessDate: Date,
  delta: Contribution,
) {
  const repository = new ReportsRepository(db);
  await repository.addDaily(restaurant.id, businessDate, delta.daily, now);
  for (const row of delta.products.values())
    if (!isEmptyProduct(row)) await repository.addProduct(restaurant.id, businessDate, row);
}

export async function rebuildRange({ db, restaurant, now }: RestaurantTransaction, range: DateRange) {
  const repository = new ReportsRepository(db);
  const days = new Map<number, Contribution>();
  for (const tab of await repository.closedTabs(restaurant.id, range)) {
    if (!tab.business_date) continue;
    const key = tab.business_date.getTime();
    const day = days.get(key) ?? emptyContribution();
    days.set(key, addContribution(day, tabContribution(tab, restaurant.timezone)));
  }
  const rows = [...days].map(([time, { daily, products }]) => ({
    businessDate: new Date(time),
    daily,
    products: [...products.values()].filter((row) => !isEmptyProduct(row)),
  }));
  await repository.replaceRange(restaurant.id, range, rows, now);
  return rows.length;
}
