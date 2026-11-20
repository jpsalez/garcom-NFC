import { ApiError } from "@/lib/api";
import type { PrintJobStatus, PrintReprintInput } from "@/lib/printingTypes";

export const agentOfflineMs = 5 * 60 * 1000;

export const printJobStatusOptions: { value: "" | PrintJobStatus; label: string }[] = [
  { value: "", label: "Todos os estados" },
  { value: "FAILED", label: "Falhou" },
  { value: "UNCERTAIN", label: "Resultado incerto" },
  { value: "REVIEW_REQUIRED", label: "Revisão necessária" },
  { value: "PENDING", label: "Na fila" },
  { value: "SENDING", label: "Enviando" },
  { value: "SENT", label: "Enviada" },
  { value: "SUPPRESSED", label: "Descartada" },
];

export const printJobStatusLabel: Record<PrintJobStatus, string> = {
  PENDING: "Na fila",
  SENDING: "Enviando",
  SENT: "Enviada",
  FAILED: "Falhou",
  SUPPRESSED: "Descartada",
  UNCERTAIN: "Resultado incerto",
  REVIEW_REQUIRED: "Revisão necessária",
};

export function isAttentionPrintStatus(status: PrintJobStatus) {
  return status === "FAILED" || status === "UNCERTAIN";
}

export function isAgentRecentlyOnline(lastContactAt: string | null, nowMs = Date.now()) {
  if (!lastContactAt) return false;
  return nowMs - Date.parse(lastContactAt) < agentOfflineMs;
}

export type ReprintAttempt = {
  orderId: string;
  idempotencyKey: string;
  reason: string;
  busy: boolean;
  error: string | null;
};

export function startReprintAttempt(orderId: string, idempotencyKey = crypto.randomUUID()): ReprintAttempt {
  return { orderId, idempotencyKey, reason: "", busy: false, error: null };
}

export async function submitReprintAttempt(
  attempt: ReprintAttempt,
  send: (orderId: string, body: PrintReprintInput) => Promise<unknown>,
): Promise<{ ok: true; attempt: null } | { ok: false; attempt: ReprintAttempt }> {
  const reason = attempt.reason.trim();
  if (reason.length < 3) {
    return {
      ok: false,
      attempt: { ...attempt, busy: false, error: "Informe um motivo com pelo menos 3 caracteres." },
    };
  }
  try {
    await send(attempt.orderId, { idempotency_key: attempt.idempotencyKey, reason });
    return { ok: true, attempt: null };
  } catch (err) {
    return {
      ok: false,
      attempt: {
        ...attempt,
        busy: false,
        error: err instanceof ApiError ? err.message : "Não foi possível solicitar a segunda via.",
      },
    };
  }
}
