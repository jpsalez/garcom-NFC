import { createHash } from "node:crypto";
import { inject, injectable } from "tsyringe";
import type { tabs } from "../../../generated/prisma/client.ts";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import { notifyPos } from "../../shared/realtime/pos-events.ts";
import type {
  IRestaurantUnitOfWork,
  RestaurantTransaction,
} from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { applyPaymentToCashShift } from "../cash-shifts/cash-shift-balance.ts";
import { CashShiftsRepository } from "../cash-shifts/cash-shifts.repository.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { closeTab, notifyClosedTab } from "../tabs/close-tab.ts";
import { notifyPaymentRequestUpdated } from "../tabs/payment-request-events.ts";
import { PaymentRequestsRepository } from "../tabs/payment-requests.repository.ts";
import { requestForConversion } from "../tabs/payment-requests.service.ts";
import { businessDate } from "../tabs/tab-business-date.ts";
import { notifyTabUpdated } from "../tabs/tab-events.ts";
import { loadTabLedger, summarizeLedger } from "../tabs/tab-ledger.ts";
import { ensureOpenTab, getTab } from "../tabs/tabs-state.ts";
import { tabSummary } from "../tabs/tabs-view.ts";
import { TabsRepository } from "../tabs/tabs.repository.ts";
import { allocatedByItem, validateAllocations, validatePaymentAmount } from "./payment-allocation.ts";
import { paymentView } from "./payment-view.ts";
import type { IPaymentsService } from "./payments.interfaces.ts";
import type { PaymentRecord } from "./payments.repository.interface.ts";
import { PaymentsRepository } from "./payments.repository.ts";
import type { CreatePayment, PaymentAllocation, RefundPayment } from "./payments.schemas.ts";
import type { PaymentProviderRegistry } from "./providers/payment-provider.registry.ts";

function restaurantOf(actor: ActorContext) {
  if (!actor.restaurantId) throw new ForbiddenError("Usuário sem restaurante");
  return actor.restaurantId;
}

function sortedAllocations(rows: PaymentAllocation[]) {
  return [...rows].sort((a, b) => a.order_item_id.localeCompare(b.order_item_id));
}

function requestHash(tabId: string, input: CreatePayment) {
  const allocations = input.allocations && sortedAllocations(input.allocations);
  return createHash("sha256")
    .update(JSON.stringify({ tabId, ...input, allocations }))
    .digest("hex");
}

function notifyPayment(notifier: INotifier, payment: PaymentRecord) {
  notifyPos(notifier, payment.restaurant_id, "payment:updated", {
    payment_id: payment.id,
    tab_id: payment.tab_id,
    status: payment.status,
    amount_cents: payment.amount_cents,
    method: payment.method,
    provider: payment.provider,
  });
}

function matchesAllocations(input: PaymentAllocation[], saved: PaymentAllocation[]) {
  if (input.length !== saved.length) return false;
  return input.every((row) =>
    saved.some(
      (original) =>
        original.order_item_id === row.order_item_id &&
        original.covered_cents === row.covered_cents &&
        (original.covered_units_bps === undefined || original.covered_units_bps === row.covered_units_bps),
    ),
  );
}

async function resolvePaymentInput(transaction: RestaurantTransaction, tab: tabs, input: CreatePayment) {
  if (!input.payment_request_id) {
    if (input.amount_cents === undefined)
      throw new ValidationError(undefined, "Informe o valor do pagamento");
    return {
      amount: input.amount_cents,
      allocations: input.allocations ?? [],
      payerLabel: input.payer_label,
      includeFee: input.include_service_fee,
      request: null,
    };
  }
  const { request, selection } = await requestForConversion(transaction, tab, input.payment_request_id);
  const items = selection.items ?? [];
  if (
    (input.allocations && !matchesAllocations(input.allocations, items)) ||
    (input.amount_cents !== undefined && input.amount_cents !== request.requested_amount_cents) ||
    (items.length &&
      input.include_service_fee !== undefined &&
      input.include_service_fee !== selection.include_service_fee)
  )
    throw new ConflictError("O pagamento deve corresponder à solicitação", "PAYMENT_REQUEST_CHANGED");
  return {
    amount: request.requested_amount_cents,
    allocations: input.allocations ?? items,
    payerLabel: input.payer_label ?? request.payer_label,
    includeFee: items.length ? selection.include_service_fee : undefined,
    request,
  };
}

@injectable()
export class PaymentsService implements IPaymentsService {
  constructor(
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
    @inject("PaymentProviderRegistry") private providers: PaymentProviderRegistry,
  ) {}

  async create(actor: ActorContext, id: string, input: CreatePayment) {
    const restaurantId = restaurantOf(actor);
    const hash = requestHash(id, input);
    const result = await this.unit.run(
      restaurantId,
      async (transaction) => {
        const { db } = transaction;
        const tab = await getTab(new TabsRepository(db), restaurantId, id);
        const saved = await new PaymentsRepository(db).findIdempotency(restaurantId, input.idempotency_key);
        if (saved) {
          if (saved.request_hash !== hash)
            throw new ConflictError("Chave de pagamento já utilizada", "IDEMPOTENCY_CONFLICT");
          return this.replay(transaction, saved, input.auto_close);
        }
        ensureOpenTab(tab);
        const recorded = await this.recordPayment(transaction, tab, transaction.actor ?? actor, input, hash);
        return { ...recorded, replayed: false };
      },
      { actor, capability: "payments:create" },
    );
    if (!result.replayed) {
      notifyPayment(this.notifier, result.payment);
      if (result.converted) notifyPaymentRequestUpdated(this.notifier, result.converted);
      if (result.closed) notifyClosedTab(this.notifier, result.closed);
      else notifyTabUpdated(this.notifier, result.tab, result.state.pendingCents);
    }
    return {
      payment: paymentView(result.payment),
      tab: tabSummary(result.tab, result.state.hasPendingKitchenItems, result.state),
      auto_closed: result.autoClosed,
      replayed: result.replayed,
    };
  }

  private async replay({ db }: RestaurantTransaction, payment: PaymentRecord, autoClose: boolean) {
    const tab = await getTab(new TabsRepository(db), payment.restaurant_id, payment.tab_id);
    const state = summarizeLedger(await loadTabLedger(db, tab));
    const autoClosed =
      autoClose && Boolean(tab.closed_at && tab.closed_at.getTime() === payment.confirmed_at?.getTime());
    return { payment, tab, state, autoClosed, replayed: true, closed: null, converted: null };
  }

  private async recordPayment(
    transaction: RestaurantTransaction,
    tab: tabs,
    actor: ActorContext,
    input: CreatePayment,
    hash: string,
  ) {
    const { db } = transaction;
    const ledger = await loadTabLedger(db, tab);
    const state = summarizeLedger(ledger);
    const data = await resolvePaymentInput(transaction, tab, input);
    validateAllocations(ledger.orders, allocatedByItem(ledger.payments), data.allocations);
    validatePaymentAmount(tab, state.pendingCents, data.amount, data.allocations, data.includeFee);

    const payment = await this.persistManualPayment(transaction, tab, actor, { input, data, hash });
    const converted = await this.convertRequest(db, payment, data.request, actor);
    const paid = await this.applyApprovedPayment(db, tab, payment, actor);
    const closed = await this.maybeClose(transaction, paid, actor, state, input.auto_close);
    return {
      payment,
      converted,
      tab: closed?.tab ?? paid,
      closed,
      autoClosed: closed !== null,
      state: {
        ...state,
        openRequests: closed ? 0 : state.openRequests - Number(data.request?.status === "OPEN"),
      },
    };
  }

  private async persistManualPayment(
    { db, now }: RestaurantTransaction,
    tab: tabs,
    actor: ActorContext,
    {
      input,
      data,
      hash,
    }: { input: CreatePayment; data: Awaited<ReturnType<typeof resolvePaymentInput>>; hash: string },
  ) {
    if (input.tip_cents > data.amount)
      throw new ValidationError(undefined, "A gorjeta não pode exceder o pagamento");
    const provider = this.providers.get(input.provider);
    if (input.terminal_id) throw new ValidationError(undefined, "O pagamento manual não usa terminal");
    const { method, received_cents, tip_cents, installments, idempotency_key } = input;
    const amount_cents = data.amount;
    const charge = provider.recordCharge({ method, amount_cents, received_cents });
    const shift = await new CashShiftsRepository(db).findOpenByOperator(tab.restaurant_id, actor.id);
    return new PaymentsRepository(db).create(
      tab.restaurant_id,
      {
        ...charge,
        ...input.manual_details,
        provider: provider.kind,
        tab_id: tab.id,
        cash_shift_id: shift?.id,
        method,
        amount_cents,
        received_cents,
        tip_cents,
        installments,
        idempotency_key,
        payer_label: data.payerLabel,
        actor_user_id: actor.id,
        request_hash: hash,
        confirmed_at: now,
        created_at: now,
      },
      data.allocations,
    );
  }

  private async convertRequest(
    db: DbClient,
    payment: PaymentRecord,
    request: Awaited<ReturnType<typeof resolvePaymentInput>>["request"],
    actor: ActorContext,
  ) {
    if (!request) return null;
    return new PaymentRequestsRepository(db).update(payment.restaurant_id, payment.tab_id, request.id, {
      status: "CONVERTED",
      payment_id: payment.id,
      handled_by_user_id: actor.id,
    });
  }

  private async applyApprovedPayment(db: DbClient, tab: tabs, payment: PaymentRecord, actor: ActorContext) {
    await applyPaymentToCashShift(db, payment);
    const paid = await new TabsRepository(db).update(tab.restaurant_id, tab.id, {
      paid_cents: tab.paid_cents + payment.amount_cents,
      version: tab.version + 1,
    });
    await new MenuRepository(db).audit(
      actor,
      "PAYMENT_RECORDED",
      "PAYMENT",
      payment.id,
      {},
      { tab_id: tab.id, amount_cents: payment.amount_cents, status: payment.status, method: payment.method },
    );
    return paid;
  }

  private async maybeClose(
    transaction: RestaurantTransaction,
    tab: tabs,
    actor: ActorContext,
    state: ReturnType<typeof summarizeLedger>,
    autoClose: boolean,
  ) {
    if (
      !autoClose ||
      tab.paid_cents !== tab.total_cents ||
      state.pendingCents ||
      state.hasPendingKitchenItems
    )
      return null;
    requireCapability(actor, "tabs:close");
    return closeTab(transaction, tab, state, actor);
  }

  async refund(actor: ActorContext, id: string, paymentId: string, { reason }: RefundPayment) {
    const result = await this.unit.run(
      restaurantOf(actor),
      (transaction) =>
        this.refundInTransaction(transaction, transaction.actor ?? actor, id, paymentId, reason),
      { actor, capability: "payments:refund" },
    );
    if (!result.replayed) {
      notifyPayment(this.notifier, result.payment);
      notifyTabUpdated(this.notifier, result.tab, result.state.pendingCents);
    }
    return {
      payment: paymentView(result.payment),
      tab: tabSummary(result.tab, result.state.hasPendingKitchenItems, result.state),
    };
  }

  private async refundInTransaction(
    transaction: RestaurantTransaction,
    actor: ActorContext,
    id: string,
    paymentId: string,
    reason: string,
  ) {
    const { db, now, restaurant } = transaction;
    const tab = await getTab(new TabsRepository(db), restaurant.id, id);
    const payment = await new PaymentsRepository(db).findById(restaurant.id, id, paymentId);
    if (!payment) throw new NotFoundError("Pagamento não encontrado");

    const state = summarizeLedger(await loadTabLedger(db, tab));
    if (payment.status === "REFUNDED" && payment.refund_reason === reason)
      return { tab, state, payment, replayed: true };
    if (payment.status !== "APPROVED")
      throw new ConflictError("Somente pagamentos aprovados podem ser estornados", "PAYMENT_NOT_APPROVED");
    if (tab.status === "CLOSED" && tab.business_date?.getTime() !== businessDate(now, restaurant).getTime())
      throw new ConflictError("O dia operacional do estorno terminou", "REFUND_WINDOW_EXPIRED");

    this.providers.get(payment.provider);
    const refunded = await this.applyRefund(transaction, tab, payment, actor, reason);
    return { ...refunded, state, replayed: false };
  }

  private async applyRefund(
    { db, now }: RestaurantTransaction,
    tab: tabs,
    payment: PaymentRecord,
    actor: ActorContext,
    reason: string,
  ) {
    const { restaurant_id, id: tabId } = tab;
    const refunded = await new PaymentsRepository(db).update(restaurant_id, tabId, payment.id, {
      status: "REFUNDED",
      refund_reason: reason,
      refunded_at: now,
      refunded_by_user_id: actor.id,
    });
    await applyPaymentToCashShift(db, refunded);
    const updated = await new TabsRepository(db).update(restaurant_id, tabId, {
      paid_cents: tab.paid_cents - payment.amount_cents,
      version: tab.version + 1,
      closed_refunded_cents:
        tab.status === "CLOSED" ? tab.closed_refunded_cents + payment.amount_cents : undefined,
    });
    await new MenuRepository(db).audit(
      actor,
      "PAYMENT_REFUNDED",
      "PAYMENT",
      payment.id,
      { status: payment.status },
      { tab_id: tabId, status: refunded.status, amount_cents: payment.amount_cents, reason },
    );
    return { tab: updated, payment: refunded };
  }
}
