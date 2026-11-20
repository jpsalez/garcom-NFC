import type { IReportsService } from "../../modules/reports/reports.interfaces.ts";
import { logOperation } from "../utils/request-context.ts";

const day = 24 * 60 * 60 * 1_000;

// Corrige qualquer desvio do incremental reconstruindo a semana a partir das comandas fechadas.
export function startReportsReconciliationJob(service: IReportsService) {
  const run = () => service.reconcile().catch(() => logOperation({ event: "reports.reconciliation_failed" }));
  setInterval(() => void run(), day).unref();
  void run();
}
