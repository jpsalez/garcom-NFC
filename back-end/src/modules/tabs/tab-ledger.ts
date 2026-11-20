import type { tabs } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { hasPendingOrderItems } from "../orders/order-progress.ts";
import { FiscalRepository } from "../fiscal/fiscal.repository.ts";
import { PaymentsRepository } from "../payments/payments.repository.ts";
import { PaymentRequestsRepository } from "./payment-requests.repository.ts";
import { TabAdjustmentsRepository } from "./tab-adjustments.repository.ts";
import { TabsRepository } from "./tabs.repository.ts";

export async function loadTabLedger(db: DbClient, tab: tabs) {
  const { restaurant_id: rest, id } = tab;
  const orders = await new TabsRepository(db).orders(rest, id);
  const payments = await new PaymentsRepository(db).list(rest, id);
  const requests = await new PaymentRequestsRepository(db).list(rest, id);
  const adjustments = await new TabAdjustmentsRepository(db).list(rest, id);
  const fiscal = await new FiscalRepository(db).documentByTab(rest, id);
  return { orders, payments, requests, adjustments, fiscalDocuments: fiscal ? [fiscal] : [] };
}

export type TabLedger = Awaited<ReturnType<typeof loadTabLedger>>;

export function summarizeLedger({ orders, payments, requests }: TabLedger) {
  return {
    hasPendingKitchenItems: hasPendingOrderItems(orders),
    pendingCents: payments.reduce(
      (sum, payment) =>
        payment.status === "PENDING" || payment.status === "PROCESSING" ? sum + payment.amount_cents : sum,
      0,
    ),
    openRequests: requests.filter(({ status }) => status === "OPEN").length,
  };
}
