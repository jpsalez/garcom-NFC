import type { FiscalEmissionService } from "../../modules/fiscal/fiscal-emission.service.ts";
import { logOperation } from "../utils/request-context.ts";

// Emite o que ficou sem envio e consulta as NFC-e em andamento (Notaas responde 202 e confirma depois).
export function startFiscalReconciliationJob(service: FiscalEmissionService) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    await service.reconcile().catch(() => logOperation({ event: "fiscal.reconciliation_failed" }));
    running = false;
  };
  setInterval(() => void run(), 30_000).unref();
}
