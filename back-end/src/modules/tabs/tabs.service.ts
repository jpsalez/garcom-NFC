import type { FiscalEmissionService } from "../fiscal/fiscal-emission.service.ts";
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
import { cancelOpenOrderItems } from "../orders/cancel-order-items.ts";
import { PaymentsRepository } from "../payments/payments.repository.ts";
import { OrdersRepository } from "../orders/orders.repository.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import { closeTab, closeTabResources, notifyClosedTab, notifyClosedTabResources } from "./close-tab.ts";
import { notifyPaymentRequestUpdated } from "./payment-request-events.ts";
import { PaymentRequestsRepository } from "./payment-requests.repository.ts";
import { TabAdjustmentsRepository } from "./tab-adjustments.repository.ts";
import { loadTabLedger, summarizeLedger } from "./tab-ledger.ts";
import { splitEqually } from "./tabs-pricing.ts";
import { notifyTabOpened, notifyTabUpdated } from "./tab-events.ts";
import type { ITabsService } from "./tabs.interfaces.ts";
import type { ITabsRepository } from "./tabs.repository.interface.ts";
import { TabsRepository } from "./tabs.repository.ts";
import type {
  CancelTab,
  CloseTab,
  ListTabs,
  MergeTab,
  OpenTab,
  TransferTab,
  UpdateTab,
} from "./tabs.schemas.ts";
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
    @inject("FiscalEmissionService") private fiscal: FiscalEmissionService,
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
      tabs: tabs.map((tab) =>
        tabSummary(tab, tab._count.orders > 0, {
          pendingCents: tab.payments.reduce((sum, payment) => sum + payment.amount_cents, 0),
          openRequests: tab._count.payment_requests,
        }),
      ),
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
        return { tab: tabDetail(tab, await loadTabLedger(db, tab)) };
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
        const ledger = await loadTabLedger(db, updated);
        return { tab: updated, ...summarizeLedger(ledger) };
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabUpdated(this.notifier, result.tab, result.pendingCents);
    return { tab: tabSummary(result.tab, result.hasPendingKitchenItems, result) };
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
        const ledger = await loadTabLedger(db, updated);
        return { tab: updated, orders: ledger.orders, ...summarizeLedger(ledger) };
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabUpdated(this.notifier, result.tab, result.pendingCents);
    for (const order of result.orders) notifyOrder(this.notifier, order, "order:updated");
    return { tab: tabSummary(result.tab, result.hasPendingKitchenItems, result) };
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
        return this.mergeInto(db, source, target, current ?? actor);
      },
      { actor, capability: "tabs:manage" },
    );
    notifyTabUpdated(this.notifier, result.cancelled);
    notifyTabUpdated(this.notifier, result.tab, result.pendingCents);
    for (const order of result.movedOrders) notifyOrder(this.notifier, order, "order:updated");
    for (const request of result.movedRequests)
      notifyPaymentRequestUpdated(this.notifier, { ...request, tab_id: result.tab.id });
    return { tab: tabSummary(result.tab, result.hasPendingKitchenItems, result) };
  }

  private async mergeInto(db: DbClient, source: tabs, target: tabs, actor: ActorContext) {
    const ledger = await loadTabLedger(db, source);
    if (summarizeLedger(ledger).pendingCents)
      throw new ConflictError("A origem tem pagamentos pendentes", "TAB_HAS_PENDING_PAYMENTS");

    const cancelled = await this.moveTabRecords(db, source, target);
    const updated = await recalculateTab(db, target);
    await auditTab(db, actor, "TAB_MERGED", source, cancelled);
    await auditTab(db, actor, "TAB_MERGE_RECEIVED", target, updated.tab);
    return {
      ...updated,
      cancelled,
      movedOrders: ledger.orders,
      movedRequests: ledger.requests.filter(({ status }) => status === "OPEN" || status === "ACCEPTED"),
    };
  }

  private async moveTabRecords(db: DbClient, source: tabs, target: tabs) {
    const { restaurant_id: restaurantId } = source;
    await new PaymentsRepository(db).moveToTab(restaurantId, source.id, target.id);
    await new TabAdjustmentsRepository(db).moveToTab(restaurantId, source.id, target.id);
    await new PaymentRequestsRepository(db).moveToTab(restaurantId, source.id, target.id);
    await new OrdersRepository(db).moveToTab(restaurantId, source.id, target.id, orderTableLabel(target));
    await new TableSessionRepository(db).moveToTab(restaurantId, source.id, target.id);
    return new TabsRepository(db).update(restaurantId, source.id, {
      status: "CANCELLED",
      cancel_reason: `Unida à comanda #${target.number}`,
      subtotal_cents: 0,
      service_fee_cents: 0,
      total_cents: 0,
      paid_cents: 0,
      adjustments_cents: 0,
      version: source.version + 1,
    });
  }

  async preBill(actor: ActorContext, id: string, splitBy?: number) {
    const restaurantId = tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async ({ db }) => {
        const repository = new TabsRepository(db);
        const tab = await getTab(repository, restaurantId, id);
        ensureOpenTab(tab);
        const changed = tab.status === "OPEN";
        const closing = changed
          ? await repository.update(restaurantId, id, { status: "CLOSING", version: tab.version + 1 })
          : tab;
        return { tab: closing, ledger: await loadTabLedger(db, closing), changed };
      },
      { actor, capability: "tabs:read" },
    );
    const detail = tabDetail(result.tab, result.ledger);
    if (result.changed) notifyTabUpdated(this.notifier, result.tab, detail.pending_cents);
    return {
      tab: detail,
      ...(splitBy && { equal_split_preview: splitEqually(detail.remaining_cents, splitBy) }),
    };
  }

  async close(actor: ActorContext, id: string, input: CloseTab) {
    const restaurantId = tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async (transaction) => {
        const tab = await getTab(new TabsRepository(transaction.db), restaurantId, id);
        checkVersion(tab, input.expected_version);
        const balance = summarizeLedger(await loadTabLedger(transaction.db, tab));
        return closeTab(transaction, tab, balance, transaction.actor ?? actor, input.customer_document);
      },
      { actor, capability: "tabs:close" },
    );
    notifyClosedTab(this.notifier, result);
    const fiscal = result.fiscalDocument ? await this.fiscal.dispatch(result.fiscalDocument) : null;
    return { tab: tabSummary(result.tab, false), fiscal_document: fiscal };
  }

  async cancel(actor: ActorContext, id: string, input: CancelTab) {
    const restaurantId = tenant(actor);
    const result = await this.unit.run(
      restaurantId,
      async (transaction) => {
        const { db } = transaction;
        const repository = new TabsRepository(db);
        const tab = await getTab(repository, restaurantId, id);
        checkVersion(tab, input.expected_version);
        ensureOpenTab(tab);
        const ledger = await loadTabLedger(db, tab);
        if (tab.paid_cents || ledger.payments.some(({ status }) => status === "APPROVED"))
          throw new ConflictError("Estorne os pagamentos antes de cancelar", "TAB_HAS_APPROVED_PAYMENTS");
        if (summarizeLedger(ledger).pendingCents)
          throw new ConflictError("A comanda tem pagamentos pendentes", "TAB_HAS_PENDING_PAYMENTS");
        const live = transaction.actor ?? actor;
        const affectedOrders = await cancelOpenOrderItems(db, ledger.orders, live, input.reason);
        const recalculated = await recalculateTab(db, tab);
        const cancelled = await repository.update(restaurantId, id, {
          status: "CANCELLED",
          cancel_reason: input.reason,
        });
        const resources = await closeTabResources(transaction, cancelled, live.id);
        await new MenuRepository(db).audit(live, "TAB_CANCELLED", "TAB", id, auditSnapshot(tab), {
          ...auditSnapshot(cancelled),
          reason: input.reason,
        });
        return { ...recalculated, ...resources, tab: cancelled, affectedOrders };
      },
      { actor, capability: "tabs:cancel" },
    );
    notifyClosedTabResources(this.notifier, result);
    for (const order of result.affectedOrders) notifyOrder(this.notifier, order, "order:updated");
    notifyTabUpdated(this.notifier, result.tab);
    return { tab: tabSummary(result.tab, false) };
  }
}
