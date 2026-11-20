import { api } from "@/lib/api";
import type {
  PairingCode,
  PrintingStatus,
  PrintJob,
  PrintJobPage,
  PrintJobsQuery,
  PrintReprintInput,
  PrintReviewInput,
} from "@/lib/printingTypes";

function queryString(query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function getKitchenPrinting() {
  return api<PrintingStatus>("/printing/kitchen");
}

export function updateKitchenPrinting(body: { enabled: boolean } | { review: PrintReviewInput }) {
  return api<PrintingStatus>("/printing/kitchen", { method: "PATCH", body });
}

export function issueKitchenPairingCode() {
  return api<PairingCode>("/printing/kitchen/pairing", { method: "POST" });
}

export function revokeKitchenPairing() {
  return api<void>("/printing/kitchen/pairing", { method: "DELETE" });
}

export function listPrintJobs(query: PrintJobsQuery = {}) {
  return api<PrintJobPage>(`/print-jobs${queryString(query)}`);
}

// Reutilize a mesma idempotency_key e o mesmo motivo ao repetir uma tentativa de segunda via.
export function requestOrderReprint(orderId: string, body: PrintReprintInput) {
  return api<PrintJob>(`/orders/${encodeURIComponent(orderId)}/reprints`, { method: "POST", body });
}
