import type { tabs } from "../../../generated/prisma/client.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import type { RestaurantTransaction } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { closeSessionResources, notifySessionClosed, type ClosedSession } from "../sessions/close-session.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import { notifyPaymentRequestUpdated } from "./payment-request-events.ts";
import { PaymentRequestsRepository } from "./payment-requests.repository.ts";
import { businessDate } from "./tab-business-date.ts";
import { notifyTabClosed } from "./tab-events.ts";
import { ensureOpenTab } from "./tabs-state.ts";
import { TabsRepository } from "./tabs.repository.ts";

export type CloseBalance = { pendingCents: number; hasPendingKitchenItems: boolean };

export function assertTabCanClose(tab: tabs, balance: CloseBalance) {
  ensureOpenTab(tab);
  if (balance.pendingCents)
    throw new ConflictError("A comanda tem pagamentos pendentes", "TAB_HAS_PENDING_PAYMENTS");
  if (tab.total_cents !== tab.paid_cents)
    throw new ConflictError("A comanda ainda tem saldo em aberto", "TAB_HAS_UNPAID_BALANCE");
  if (balance.hasPendingKitchenItems)
    throw new ConflictError("Conclua ou cancele os pedidos pendentes", "TAB_HAS_PENDING_ORDERS");
}

export async function closeTabResources({ db, now }: RestaurantTransaction, tab: tabs, userId: string) {
  const { restaurant_id: restaurantId, id } = tab;
  const active = await new TableSessionRepository(db).findActiveByTab(restaurantId, id);
  const closedSessions: ClosedSession[] = [];
  for (const session of active) {
    const closed = await closeSessionResources(db, restaurantId, session.id, now, "STAFF", userId);
    if (closed) closedSessions.push(closed);
  }
  const closedRequests = await new PaymentRequestsRepository(db).closeOpenForTab(
    restaurantId,
    id,
    "CANCELLED",
  );
  return { closedSessions, closedRequests };
}

export async function closeTab(
  transaction: RestaurantTransaction,
  tab: tabs,
  balance: CloseBalance,
  actor: ActorContext,
) {
  assertTabCanClose(tab, balance);
  const { db, now, restaurant } = transaction;
  const closed = await new TabsRepository(db).update(restaurant.id, tab.id, {
    status: "CLOSED",
    closed_at: now,
    closed_by_user_id: actor.id,
    business_date: businessDate(now, restaurant),
    version: tab.version + 1,
  });
  const resources = await closeTabResources(transaction, tab, actor.id);
  await new MenuRepository(db).audit(
    actor,
    "TAB_CLOSED",
    "TAB",
    tab.id,
    { status: tab.status, paid_cents: tab.paid_cents },
    { status: closed.status, total_cents: closed.total_cents },
  );
  return { tab: closed, ...resources };
}

export function notifyClosedTabResources(
  notifier: INotifier,
  resources: Awaited<ReturnType<typeof closeTabResources>>,
) {
  for (const session of resources.closedSessions) notifySessionClosed(notifier, session);
  for (const request of resources.closedRequests) notifyPaymentRequestUpdated(notifier, request);
}

export function notifyClosedTab(notifier: INotifier, result: Awaited<ReturnType<typeof closeTab>>) {
  notifyClosedTabResources(notifier, result);
  notifyTabClosed(notifier, result.tab);
}
