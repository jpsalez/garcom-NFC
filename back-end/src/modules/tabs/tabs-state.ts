import type { table_sessions, tables, tabs } from "../../../generated/prisma/client.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { RestaurantTransaction } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { allocatedByItem, validateExistingAllocations } from "../payments/payment-allocation.ts";
import { RestaurantRepository } from "../restaurants/restaurants.repository.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import { TableRepository } from "../tables/tables.repository.ts";
import { loadTabLedger, summarizeLedger } from "./tab-ledger.ts";
import { TabAdjustmentsRepository } from "./tab-adjustments.repository.ts";
import { tabTotals } from "./tabs-pricing.ts";
import type { ITabsRepository } from "./tabs.repository.interface.ts";
import { TabsRepository } from "./tabs.repository.ts";

export function isOpenTab(tab: tabs | null): tab is tabs {
  return tab?.status === "OPEN" || tab?.status === "CLOSING";
}

export async function getTab(repository: ITabsRepository, restaurantId: string, id: string) {
  const tab = await repository.get(restaurantId, id);
  if (!tab) throw new AppError("Comanda não encontrada", 404, undefined, "TAB_NOT_FOUND");
  return tab;
}

export function ensureOpenTab(tab: tabs) {
  if (!isOpenTab(tab)) throw new ConflictError("A comanda não está aberta", "TAB_NOT_OPEN");
}

export async function getActiveTable(db: DbClient, restaurantId: string, tableId: string) {
  const table = await new TableRepository(db).findById(restaurantId, tableId);
  if (!table) throw new AppError("Mesa não encontrada", 404, undefined, "TABLE_NOT_FOUND");
  if (!table.active) throw new ConflictError("A mesa está inativa", "TABLE_INACTIVE");
  return table;
}

export async function findOpenTableTab(
  db: DbClient,
  restaurantId: string,
  tableId: string,
  session: Pick<table_sessions, "tab_id"> | null,
) {
  const repository = new TabsRepository(db);
  const linked = session?.tab_id ? await repository.get(restaurantId, session.tab_id) : null;
  return isOpenTab(linked) ? linked : repository.findOpenByTable(restaurantId, tableId);
}

export async function createTab(
  { db, restaurant, now, actor }: RestaurantTransaction,
  table: Pick<tables, "id" | "label"> | null,
  fields: { label?: string; guests_count?: number } = {},
) {
  const number = await new RestaurantRepository(db).nextTabNumber(restaurant.id);
  return new TabsRepository(db).create(restaurant.id, {
    kind: table ? "TABLE" : "COUNTER",
    table_id: table?.id,
    table_label_snapshot: table?.label,
    label: fields.label,
    guests_count: fields.guests_count,
    opened_by_user_id: actor?.id,
    service_fee_bps: restaurant.service_fee_bps,
    opened_at: now,
    number,
  });
}

export async function getOrCreateForTable(
  transaction: RestaurantTransaction,
  table: Pick<tables, "id" | "label">,
  session: table_sessions | null,
) {
  const restaurantId = transaction.restaurant.id;
  const current = await findOpenTableTab(transaction.db, restaurantId, table.id, session);
  const tab = current ?? (await createTab(transaction, table));
  if (session && session.tab_id !== tab.id)
    await new TableSessionRepository(transaction.db).linkTab(restaurantId, session.id, tab.id);
  return { tab, opened: current === null };
}

export async function recalculateTab(
  db: DbClient,
  tab: tabs,
  {
    reopen = false,
    fee,
  }: { reopen?: boolean; fee?: Pick<tabs, "service_fee_waived" | "service_fee_waive_reason"> } = {},
) {
  const { restaurant_id: restaurantId, id } = tab;
  const ledger = await loadTabLedger(db, tab);
  const summary = summarizeLedger(ledger);
  const paid_cents = ledger.payments.reduce(
    (sum, payment) => (payment.status === "APPROVED" ? sum + payment.amount_cents : sum),
    0,
  );
  const totals = tabTotals(
    ledger.orders,
    { ...tab, ...fee, paid_cents },
    ledger.adjustments,
    summary.pendingCents,
  );
  validateExistingAllocations(ledger.orders, allocatedByItem(ledger.payments));
  const adjustments = new TabAdjustmentsRepository(db);
  for (const { adjustment, cents } of totals.computed)
    if (cents !== adjustment.computed_cents)
      await adjustments.updateComputed(restaurantId, id, adjustment.id, cents);
  const updated = await new TabsRepository(db).update(restaurantId, id, {
    ...totals.cents,
    ...fee,
    paid_cents,
    version: tab.version + 1,
    status: reopen ? "OPEN" : undefined,
  });
  return { tab: updated, ...summary };
}
