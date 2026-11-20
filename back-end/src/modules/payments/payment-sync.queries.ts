import type { payment_provider_type } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";

// Busca somente o vínculo local. O chamador valida a assinatura e confirma o estado no provedor e no tenant.
const paymentKey = {
  id: true,
  restaurant_id: true,
  tab_id: true,
  provider_account_id: true,
  external_payment_id: true,
} as const;

export async function findPaymentForWebhook(
  db: DbClient,
  provider: payment_provider_type,
  externalId: string,
) {
  const matches = await db.payments.findMany({
    where: { provider, external_payment_id: externalId },
    select: paymentKey,
    take: 2,
  });
  return matches.length === 1 ? matches[0] : null;
}

export function findPaymentsToReconcile(
  db: DbClient,
  provider: payment_provider_type,
  staleBefore: Date,
  limit: number,
  retryWithoutIdSince: Date,
) {
  return db.payments.findMany({
    where: {
      provider,
      provider_account: { status: "ACTIVE" },
      status: { in: ["PENDING", "PROCESSING"] },
      updated_at: { lt: staleBefore },
      OR: [
        { external_payment_id: { not: null } },
        { status: "PENDING", created_at: { gt: retryWithoutIdSince } },
      ],
    },
    select: { ...paymentKey, status: true, created_at: true, updated_at: true },
    orderBy: [{ updated_at: "asc" }, { id: "asc" }],
    take: limit,
  });
}

export function findProviderAccountsToRefresh(
  db: DbClient,
  provider: payment_provider_type,
  expiresBefore: Date,
  limit: number,
) {
  return db.payment_provider_accounts.findMany({
    where: {
      provider,
      status: "ACTIVE",
      refresh_token_encrypted: { not: null },
      token_expires_at: { lt: expiresBefore },
    },
    select: { id: true, restaurant_id: true },
    orderBy: [{ token_expires_at: "asc" }, { id: "asc" }],
    take: limit,
  });
}
