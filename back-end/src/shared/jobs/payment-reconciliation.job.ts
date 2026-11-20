import type { PointCredentialRefreshService } from "../../modules/payments/point-credential-refresh.service.ts";
import type { PointPaymentsService } from "../../modules/payments/point-payments.service.ts";
import { container } from "../container/container.ts";
import { logOperation } from "../utils/request-context.ts";

const day = 24 * 60 * 60 * 1_000;

export async function reconcilePayments() {
  await container.resolve<PointPaymentsService>("PointPaymentsService").reconcile();
}

function runPeriodically(task: () => Promise<void>, everyMs: number, event: string) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch {
      logOperation({ event });
    } finally {
      running = false;
    }
  };
  setInterval(() => void run(), everyMs).unref();
  void run();
}

export function startPaymentReconciliationJob() {
  runPeriodically(reconcilePayments, 30_000, "point.reconciliation_failed");
  runPeriodically(
    () => container.resolve<PointCredentialRefreshService>("PointCredentialRefreshService").run(),
    day,
    "point.credential_job_failed",
  );
}
