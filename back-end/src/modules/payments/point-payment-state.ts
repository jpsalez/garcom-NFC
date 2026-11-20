import type { payment_provider_accounts, payment_terminals } from "../../../generated/prisma/client.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type {
  IRestaurantUnitOfWork,
  RestaurantTransaction,
} from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { decryptSecret } from "../../shared/utils/crypto.ts";
import { applyPaymentToCashShift } from "../cash-shifts/cash-shift-balance.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { notifyPaymentRequestUpdated } from "../tabs/payment-request-events.ts";
import { PaymentRequestsRepository } from "../tabs/payment-requests.repository.ts";
import { notifyTabUpdated } from "../tabs/tab-events.ts";
import { loadTabLedger, summarizeLedger } from "../tabs/tab-ledger.ts";
import { TabsRepository } from "../tabs/tabs.repository.ts";
import { ensureOpenTab, getTab } from "../tabs/tabs-state.ts";
import { notifyPayment } from "./payment-events.ts";
import { PaymentProviderAccountsRepository } from "./payment-provider-accounts.repository.ts";
import { PaymentTerminalsRepository } from "./payment-terminals.repository.ts";
import type { PaymentRecord, UpdatePaymentData } from "./payments.repository.interface.ts";
import { PaymentsRepository } from "./payments.repository.ts";
import type { CreatePayment } from "./payments.schemas.ts";
import { activePointAccount } from "./point-account.ts";
import { PointProviderError } from "./providers/mercado-pago-http.ts";
import { isPointMethod } from "./providers/mercado-pago-order.ts";
import type { PointChargeResult } from "./providers/payment-provider.interface.ts";

export const pendingPointStatuses = ["PENDING", "PROCESSING"] as const;
const failedPointStatuses = new Set<PaymentRecord["status"]>(["DECLINED", "CANCELLED", "EXPIRED"]);
export const pointExpiryMs = 5 * 60 * 1_000;
// A última retomada pode criar a order perto dos 5 min, e ela ainda vale outros 5 no terminal.
const pointReviewAfterMs = 2 * pointExpiryMs + 60 * 1_000;

export type PointPayment = {
  payment: PaymentRecord;
  account: payment_provider_accounts;
  terminal: payment_terminals;
  deviceId: string;
};

// Sem ID externo após a validade da order, só uma pessoa conferindo o terminal sabe se houve cobrança.
export function needsPointReview(payment: PaymentRecord, now = Date.now()) {
  return (
    payment.provider === "MERCADO_PAGO" &&
    payment.status === "PENDING" &&
    !payment.external_payment_id &&
    payment.created_at.getTime() <= now - pointReviewAfterMs
  );
}

export const notReviewable = () =>
  new ConflictError("Cobrança não está aguardando conferência", "POINT_PAYMENT_NOT_REVIEWABLE");

export async function pointBinding(db: DbClient, restaurantId: string, input: CreatePayment, now: Date) {
  if (
    !input.terminal_id ||
    !isPointMethod(input.method) ||
    input.received_cents !== null ||
    input.manual_details ||
    input.auto_close ||
    (input.method !== "CREDIT" && input.installments > 1)
  )
    throw new ConflictError("Parâmetros inválidos para cobrança Point", "INVALID_POINT_PAYMENT");

  const terminal = await new PaymentTerminalsRepository(db).get(restaurantId, input.terminal_id);
  if (
    !terminal?.active ||
    terminal.provider !== "MERCADO_PAGO" ||
    !terminal.provider_account_id ||
    !terminal.external_device_id
  )
    throw new ConflictError("Terminal Point indisponível", "PAYMENT_TERMINAL_UNAVAILABLE");
  const account = activePointAccount(
    await new PaymentProviderAccountsRepository(db).findById(restaurantId, terminal.provider_account_id),
  );
  if (account.token_expires_at && account.token_expires_at <= now)
    throw new ConflictError("Credencial do Mercado Pago vencida", "PAYMENT_PROVIDER_CREDENTIALS_EXPIRED");
  decryptSecret(account.access_token_encrypted);
  return { terminal_id: terminal.id, provider_account_id: account.id };
}

export function validatePointCharge({ payment, account, deviceId }: PointPayment, charge: PointChargeResult) {
  if (
    (payment.external_payment_id && payment.external_payment_id !== charge.id) ||
    charge.reference !== payment.id ||
    charge.merchantId !== account.external_account_id ||
    charge.deviceId !== deviceId ||
    charge.amountCents !== payment.amount_cents ||
    (charge.status === "APPROVED" &&
      (charge.method !== payment.method || charge.paidCents !== payment.amount_cents))
  )
    throw new PointProviderError();
}

export function pointStatusData(charge: PointChargeResult): UpdatePaymentData {
  return {
    external_payment_id: charge.id,
    status: charge.status,
    nsu: charge.nsu,
    card_brand: charge.brand,
    authorization_code: charge.authorizationCode,
    installments: charge.installments,
    raw_provider_payload: { transaction_id: charge.providerPaymentId },
  };
}

async function remainsBound(
  { db, restaurant }: RestaurantTransaction,
  context: PointPayment,
  current: PaymentRecord,
) {
  const { payment, account, terminal, deviceId } = context;
  if (
    current.provider !== "MERCADO_PAGO" ||
    current.tab_id !== payment.tab_id ||
    current.provider_account_id !== account.id ||
    current.terminal_id !== terminal.id ||
    current.amount_cents !== payment.amount_cents ||
    current.method !== payment.method
  )
    return false;
  const currentAccount = await new PaymentProviderAccountsRepository(db).findById(restaurant.id, account.id);
  const currentTerminal = await new PaymentTerminalsRepository(db).get(restaurant.id, terminal.id);
  return (
    currentAccount?.provider === "MERCADO_PAGO" &&
    currentAccount.external_account_id === account.external_account_id &&
    currentTerminal?.provider === "MERCADO_PAGO" &&
    currentTerminal.provider_account_id === account.id &&
    currentTerminal.external_device_id === deviceId
  );
}

export async function updatePointPayment(
  unit: IRestaurantUnitOfWork,
  notifier: INotifier,
  context: PointPayment,
  data: UpdatePaymentData,
) {
  const { restaurant_id: restaurantId, id } = context.payment;
  const change = await unit.run(
    restaurantId,
    async (transaction) => {
      const { db, now } = transaction;
      const repository = new PaymentsRepository(db);
      const current = await repository.get(restaurantId, id);
      if (!current || (current.status !== "PENDING" && current.status !== "PROCESSING")) return null;
      if (!(await remainsBound(transaction, context, current))) return null;
      if (current.external_payment_id && current.external_payment_id !== data.external_payment_id)
        return null;
      return (await writePointUpdate(transaction, current, data)).change;
    },
    { allowInactive: true },
  );
  if (change) notifyPointChange(notifier, change);
}

export async function linkPointOrder(
  unit: IRestaurantUnitOfWork,
  notifier: INotifier,
  actor: ActorContext,
  context: PointPayment,
  data: UpdatePaymentData,
) {
  const { restaurant_id: restaurantId, id } = context.payment;
  const change = await unit.run(
    restaurantId,
    async (transaction) => {
      const current = await new PaymentsRepository(transaction.db).get(restaurantId, id);
      if (!current || !needsPointReview(current, transaction.now.getTime())) throw notReviewable();
      if (!(await remainsBound(transaction, context, current))) throw notReviewable();
      const { updated, change } = await writePointUpdate(transaction, current, data);
      if (!updated) throw notReviewable();
      await new MenuRepository(transaction.db).audit(
        transaction.actor ?? actor,
        "POINT_PAYMENT_ORDER_LINKED",
        "PAYMENT",
        id,
        { status: current.status },
        { tab_id: current.tab_id, order_id: data.external_payment_id, status: updated.status },
      );
      return change;
    },
    { actor, capability: "payments:create" },
  );
  if (change) notifyPointChange(notifier, change);
}

async function writePointUpdate(
  transaction: RestaurantTransaction,
  current: PaymentRecord,
  data: UpdatePaymentData,
) {
  const { restaurant_id: restaurantId, id } = current;
  const repository = new PaymentsRepository(transaction.db);
  const updated = await repository.transition(restaurantId, id, [...pendingPointStatuses], {
    ...data,
    updated_at: transaction.now,
    confirmed_at: data.status === "APPROVED" ? transaction.now : undefined,
  });
  if (!updated || data.status === undefined || data.status === current.status)
    return { updated, change: null };
  await repository.auditPointTransition(restaurantId, updated, current.status);
  return { updated, change: await updateTabAfterPoint(transaction, updated) };
}

export async function releasePointPayment(
  unit: IRestaurantUnitOfWork,
  notifier: INotifier,
  actor: ActorContext,
  { restaurant_id: restaurantId, id }: PaymentRecord,
  reason: string,
) {
  const change = await unit.run(
    restaurantId,
    async (transaction) => {
      const { db, now } = transaction;
      const repository = new PaymentsRepository(db);
      const current = await repository.get(restaurantId, id);
      if (!current || !needsPointReview(current, now.getTime())) throw notReviewable();
      const released = await repository.transition(restaurantId, id, ["PENDING"], {
        status: "CANCELLED",
        updated_at: now,
      });
      if (!released) throw notReviewable();
      await new MenuRepository(db).audit(
        transaction.actor ?? actor,
        "POINT_PAYMENT_RELEASED",
        "PAYMENT",
        id,
        { status: current.status },
        { tab_id: current.tab_id, amount_cents: current.amount_cents, reason },
      );
      return updateTabAfterPoint(transaction, released);
    },
    { actor, capability: "payments:create" },
  );
  notifyPointChange(notifier, change);
}

function notifyPointChange(notifier: INotifier, change: Awaited<ReturnType<typeof updateTabAfterPoint>>) {
  notifyPayment(notifier, change.payment);
  notifyTabUpdated(notifier, change.tab, change.pendingCents);
  for (const request of change.reopened) notifyPaymentRequestUpdated(notifier, request);
}

async function updateTabAfterPoint({ db }: RestaurantTransaction, payment: PaymentRecord) {
  const repository = new TabsRepository(db);
  const tab = await getTab(repository, payment.restaurant_id, payment.tab_id);
  ensureOpenTab(tab);
  const approved = payment.status === "APPROVED";
  const ledger = summarizeLedger(await loadTabLedger(db, tab));
  const paid = tab.paid_cents + (approved ? payment.amount_cents : 0);
  if (paid + ledger.pendingCents > tab.total_cents) throw new PointProviderError();
  await applyPaymentToCashShift(db, payment);
  const updated = await repository.update(tab.restaurant_id, tab.id, {
    version: tab.version + 1,
    paid_cents: paid,
  });
  // A cobrança que não foi aprovada devolve a solicitação do cliente ao balcão.
  const reopened = failedPointStatuses.has(payment.status)
    ? await new PaymentRequestsRepository(db).reopenForPayment(payment.restaurant_id, payment.id)
    : [];
  return { tab: updated, payment, pendingCents: ledger.pendingCents, reopened };
}
