import { api } from "@/lib/api";
import type {
  PrinterSetup,
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

export function provisionKitchenPrinter() {
  return api<PrinterSetup>("/printing/kitchen/printer", { method: "POST" });
}

export function revokeKitchenPrinter() {
  return api<void>("/printing/kitchen/printer", { method: "DELETE" });
}

export function queueKitchenPrintTest() {
  return api<PrintingStatus>("/printing/kitchen/test", { method: "POST" });
}

export function listPrintJobs(query: PrintJobsQuery = {}) {
  return api<PrintJobPage>(`/print-jobs${queryString(query)}`);
}

// Reutilize a mesma idempotency_key e o mesmo motivo ao repetir uma tentativa de segunda via.
export function requestOrderReprint(orderId: string, body: PrintReprintInput) {
  return api<PrintJob>(`/orders/${encodeURIComponent(orderId)}/reprints`, { method: "POST", body });
}
