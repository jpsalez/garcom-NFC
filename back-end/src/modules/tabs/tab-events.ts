import type { tabs } from "../../../generated/prisma/client.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";

function emitTabEvent(notifier: INotifier, tab: tabs, event: string, payload: object) {
  try {
    notifier.toPos(tab.restaurant_id, event, payload);
  } catch {
    console.error("Falha ao emitir evento de comanda", { tab_id: tab.id, event });
  }
}

export function notifyTabOpened(notifier: INotifier, tab: tabs) {
  emitTabEvent(notifier, tab, "tab:opened", {
    tab_id: tab.id,
    number: tab.number,
    kind: tab.kind,
    table_id: tab.table_id,
  });
}

export function notifyTabUpdated(notifier: INotifier, tab: tabs) {
  emitTabEvent(notifier, tab, "tab:updated", {
    tab_id: tab.id,
    version: tab.version,
    status: tab.status,
    total_cents: tab.total_cents,
    paid_cents: tab.paid_cents,
    pending_cents: 0,
  });
}

export function notifyTabClosed(notifier: INotifier, tab: tabs) {
  emitTabEvent(notifier, tab, "tab:closed", {
    tab_id: tab.id,
    number: tab.number,
    table_id: tab.table_id,
  });
}
