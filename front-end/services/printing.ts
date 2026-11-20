import { api } from "@/lib/api";
import type {
  BrowserPrintJob,
  PrinterSetup,
  PrintPaperWidth,
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

export function connectBrowserPrintStation(paperWidth: PrintPaperWidth) {
  return api<void>("/printing/station/connect", { method: "POST", body: { paper_width: paperWidth } });
}

export function verifyBrowserPrintTest(token: string) {
  return api<PrintingStatus>("/printing/station/verify-test", { method: "POST", body: { token } });
}

export function getPrintStationSocketTicket() {
  return api<{ ticket: string }>("/printing/station/socket-ticket", {
    method: "POST", renew: false, signal: AbortSignal.timeout(10_000),
  });
}

export function claimBrowserPrintJob() {
  return api<BrowserPrintJob | undefined>("/printing/station/next", { method: "POST", renew: false, signal: AbortSignal.timeout(10_000) });
}

export function reportBrowserPrintJob(token: string, submitted: boolean) {
  return api<void>("/printing/station/result", { method: "POST", body: { token, submitted }, renew: false, signal: AbortSignal.timeout(10_000) });
}
