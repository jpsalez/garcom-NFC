import type { tabs } from "../../../generated/prisma/client.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyPos } from "../../shared/realtime/pos-events.ts";

export function notifyTabOpened(notifier: INotifier, tab: tabs) {
  notifyPos(notifier, tab.restaurant_id, "tab:opened", {
    tab_id: tab.id,
    number: tab.number,
    kind: tab.kind,
    table_id: tab.table_id,
  });
}

export function notifyTabUpdated(notifier: INotifier, tab: tabs, pendingCents = 0) {
  notifyPos(notifier, tab.restaurant_id, "tab:updated", {
    tab_id: tab.id,
    version: tab.version,
    status: tab.status,
    total_cents: tab.total_cents,
    paid_cents: tab.paid_cents,
    pending_cents: pendingCents,
  });
}

export function notifyTabClosed(notifier: INotifier, tab: tabs) {
  notifyPos(notifier, tab.restaurant_id, "tab:closed", {
    tab_id: tab.id,
    number: tab.number,
    table_id: tab.table_id,
  });
}
