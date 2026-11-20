import type { fiscal_documents } from "../../../generated/prisma/client.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyPos } from "../../shared/realtime/pos-events.ts";

export function notifyFiscal(notifier: INotifier, document: fiscal_documents) {
  notifyPos(notifier, document.restaurant_id, "fiscal:updated", {
    document_id: document.id,
    tab_id: document.tab_id,
    status: document.status,
    qrcode_url: document.qrcode_url,
  });
}
