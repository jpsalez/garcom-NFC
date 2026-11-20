import { inject, injectable } from "tsyringe";
import type { tabs } from "../../../generated/prisma/client.ts";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyOrder } from "../../shared/realtime/order-events.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { encodeCursor } from "../../shared/utils/cursor.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { hasPendingOrderItems } from "../orders/order-progress.ts";
import { OrdersRepository } from "../orders/orders.repository.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import { notifyTabOpened, notifyTabUpdated } from "./tab-events.ts";
import type { ITabsService } from "./tabs.interfaces.ts";
import type { ITabsRepository } from "./tabs.repository.interface.ts";
import { TabsRepository } from "./tabs.repository.ts";
import type { ListTabs, MergeTab, OpenTab, TransferTab, UpdateTab } from "./tabs.schemas.ts";
import {
  createTab,
  ensureOpenTab,
  findOpenTableTab,
  getActiveTable,
  getTab,
  recalculateTab,
} from "./tabs-state.ts";
import { orderTableLabel, tabDetail, tabSummary } from "./tabs-view.ts";

function tenant(actor: ActorContext) {
  if (!actor.restaurantId) throw new ForbiddenError("Usuário sem restaurante");
  return actor.restaurantId;
}

function checkVersion(tab: tabs, expected: number) {
  if (tab.version !== expected)
    throw new ConflictError("Comanda foi alterada; atualize a página", "VERSION_CONFLICT");
}

function occupiedTable(): never {
  throw new ConflictError("A mesa já tem comanda ou atendimento aberto", "TAB_ALREADY_OPEN");
}

function auditSnapshot(tab: tabs | null) {
  return tab
    ? {
        status: tab.status,
        table_id: tab.table_id,
        label: tab.label,
        guests_count: tab.guests_count,
        version: tab.version,
        total_cents: tab.total_cents,
      }
    : {};
}

function auditTab(db: DbClient, actor: ActorContext, action: string, before: tabs | null, after: tabs) {
  return new MenuRepository(db).audit(
    actor,
    action,
    "TAB",
    after.id,
    auditSnapshot(before),
    auditSnapshot(after),
  );
}

@injectable()
export class TabsService implements ITabsService {
  constructor(
    @inject("TabsRepository") private repository: ITabsRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
  ) {}

  async open(actor: ActorContext, input: OpenTab) {
    const restaurantId = tenant(actor);
    const tab = await this.unit.run(
      restaurantId,
      async (transaction) => {
        const { db } = transaction;
        const table = input.kind === "TABLE" ? await getActiveTable(db, restaurantId, input.table_id) : null;
        const sessions = new TableSessionRepository(db);
        const session = table ? await sessions.findActiveByTable(restaurantId, table.id) : null;
        if (table && (await findOpenTableTab(db, restaurantId, table.id, session))) occupiedTable();
        const opened = await createTab(transaction, table, input);
        if (session) await sessions.linkTab(restaurantId, session.id, opened.id);
        await auditTab(db, transaction.actor ?? actor, "TAB_OPENED", null, opened);
        return opened;
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabOpened(this.notifier, tab);
    return { tab: tabSummary(tab, false) };
  }

  async list(actor: ActorContext, query: ListTabs) {
    requireCapability(actor, "tabs:read");
    const { from, to, business_date, ...page } = query;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to.length === 10 ? `${to}T23:59:59.999Z` : to) : undefined;
    if (fromDate && toDate && fromDate > toDate) throw new ValidationError(undefined, "Período inválido");
    const rows = await this.repository.list(tenant(actor), {
      ...page,
      from: fromDate,
      to: toDate,
      business_date: business_date ? new Date(business_date) : undefined,
    });
    const tabs = rows.slice(0, page.limit);
    const last = tabs.at(-1);
    return {
      tabs: tabs.map((tab) => tabSummary(tab, tab._count.orders > 0)),
      nextCursor:
        rows.length > page.limit && last ? encodeCursor({ id: last.id, created_at: last.opened_at }) : null,
      serverTime: new Date(),
    };
  }

  async getDetail(actor: ActorContext, id: string) {
    const restaurantId = tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db }) => {
        const repository = new TabsRepository(db);
        const tab = await getTab(repository, restaurantId, id);
        return { tab: tabDetail(tab, await repository.orders(restaurantId, id)) };
      },
      { actor, capability: "tabs:read" },
    );
  }

  async update(actor: ActorContext, id: string, input: UpdateTab) {
    const restaurantId = tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async ({ db, actor: current }) => {
        const repository = new TabsRepository(db);
        const tab = await getTab(repository, restaurantId, id);
        checkVersion(tab, input.expected_version);
        ensureOpenTab(tab);
        const updated = await repository.update(restaurantId, id, {
          label: input.label,
          guests_count: input.guests_count,
          version: tab.version + 1,
        });
        await auditTab(db, current ?? actor, "TAB_UPDATED", tab, updated);
        const orders = await repository.orders(restaurantId, id);
        return { tab: updated, hasPendingKitchenItems: hasPendingOrderItems(orders) };
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabUpdated(this.notifier, result.tab);
    return { tab: tabSummary(result.tab, result.hasPendingKitchenItems) };
  }

  async transferTable(actor: ActorContext, id: string, input: TransferTab) {
    const restaurantId = tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async ({ db, actor: current }) => {
        const repository = new TabsRepository(db);
        const tab = await getTab(repository, restaurantId, id);
        checkVersion(tab, input.expected_version);
        ensureOpenTab(tab);
        const table = await getActiveTable(db, restaurantId, input.target_table_id);
        const sessions = new TableSessionRepository(db);
        const destination = await sessions.findActiveByTable(restaurantId, table.id);
        if (destination || (await repository.findOpenByTable(restaurantId, table.id))) occupiedTable();
        const updated = await repository.update(restaurantId, id, {
          kind: "TABLE",
          table_id: table.id,
          table_label_snapshot: table.label,
          version: tab.version + 1,
        });
        if (tab.table_id) await sessions.moveActiveToTable(restaurantId, id, tab.table_id, table.id);
        await new OrdersRepository(db).relabelForTab(restaurantId, id, table.label);
        await auditTab(db, current ?? actor, "TAB_TRANSFERRED", tab, updated);
        const orders = await repository.orders(restaurantId, id);
        return { tab: updated, orders };
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabUpdated(this.notifier, result.tab);
    for (const order of result.orders) notifyOrder(this.notifier, order, "order:updated");
    return { tab: tabSummary(result.tab, hasPendingOrderItems(result.orders)) };
  }

  async merge(actor: ActorContext, id: string, input: MergeTab) {
    const restaurantId = tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async ({ db, actor: current }) => {
        const repository = new TabsRepository(db);
        const target = await getTab(repository, restaurantId, id);
        checkVersion(target, input.expected_version);
        ensureOpenTab(target);
        if (id === input.source_tab_id)
          throw new ConflictError("Escolha duas comandas diferentes", "TAB_MERGE_SAME_TAB");
        const source = await getTab(repository, restaurantId, input.source_tab_id);
        ensureOpenTab(source);
        const movedOrders = await repository.orders(restaurantId, source.id);
        await new OrdersRepository(db).moveToTab(restaurantId, source.id, id, orderTableLabel(target));
        await new TableSessionRepository(db).moveToTab(restaurantId, source.id, id);
        const cancelled = await repository.update(restaurantId, source.id, {
          status: "CANCELLED",
          cancel_reason: `Unida à comanda #${target.number}`,
          subtotal_cents: 0,
          service_fee_cents: 0,
          total_cents: 0,
          version: source.version + 1,
        });
        const updated = await recalculateTab(db, target);
        await auditTab(db, current ?? actor, "TAB_MERGED", source, cancelled);
        await auditTab(db, current ?? actor, "TAB_MERGE_RECEIVED", target, updated.tab);
        return { ...updated, cancelled, movedOrders };
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabUpdated(this.notifier, result.cancelled);
    notifyTabUpdated(this.notifier, result.tab);
    for (const order of result.movedOrders) notifyOrder(this.notifier, order, "order:updated");
    return { tab: tabSummary(result.tab, result.hasPendingKitchenItems) };
  }
}
