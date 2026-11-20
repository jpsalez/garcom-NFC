import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyPos } from "../../shared/realtime/pos-events.ts";
import type { PaymentRecord } from "./payments.repository.interface.ts";

export function notifyPayment(notifier: INotifier, payment: PaymentRecord) {
  notifyPos(notifier, payment.restaurant_id, "payment:updated", {
    payment_id: payment.id,
    tab_id: payment.tab_id,
    status: payment.status,
    amount_cents: payment.amount_cents,
    method: payment.method,
    provider: payment.provider,
  });
}
