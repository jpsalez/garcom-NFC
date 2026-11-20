import type { payment_requests, tabs } from "../../../generated/prisma/client.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyPos } from "../../shared/realtime/pos-events.ts";

export function notifyPaymentRequestCreated(notifier: INotifier, row: payment_requests, tab: tabs) {
  notifyPos(notifier, row.restaurant_id, "payment_request:created", {
    request_id: row.id,
    tab_id: row.tab_id,
    table_label: tab.table_label_snapshot,
    payer_label: row.payer_label,
    preferred_method: row.preferred_method,
    requested_amount_cents: row.requested_amount_cents,
  });
}

export function notifyPaymentRequestUpdated(notifier: INotifier, row: payment_requests) {
  notifyPos(notifier, row.restaurant_id, "payment_request:updated", {
    request_id: row.id,
    tab_id: row.tab_id,
    status: row.status,
  });
}
