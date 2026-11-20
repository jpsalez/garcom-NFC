import { inject, injectable } from "tsyringe";
import type { payment_requests, tabs } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/http-errors.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type {
  IRestaurantUnitOfWork,
  RestaurantTransaction,
} from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { Device } from "../calls/calls.interfaces.ts";
import { orderView } from "../orders/order-progress.ts";
import { OrdersRepository } from "../orders/orders.repository.ts";
import {
  allocatedByItem,
  proportionalCharge,
  validateAllocations,
  validatePaymentAmount,
} from "../payments/payment-allocation.ts";
import { SessionTokenRepository, TableSessionRepository } from "../sessions/sessions.repository.ts";
import { notifyPaymentRequestCreated, notifyPaymentRequestUpdated } from "./payment-request-events.ts";
import { paymentRequestView } from "./payment-request-view.ts";
import { PaymentRequestsRepository } from "./payment-requests.repository.ts";
import { type PaymentRequestInput, paymentRequestSelectionSchema } from "./payment-requests.schemas.ts";
import { loadTabLedger, summarizeLedger, type TabLedger } from "./tab-ledger.ts";
import { activeLineCents, serviceFeeCents } from "./tabs-pricing.ts";
import { isOpenTab } from "./tabs-state.ts";
import { TabsRepository } from "./tabs.repository.ts";

async function deviceTab({ db, now }: RestaurantTransaction, device: Device) {
  const session = await new OrdersRepository(db).device(device, now);
  const tab = session.tab_id ? await new TabsRepository(db).get(device.restaurantId, session.tab_id) : null;
  return isOpenTab(tab) ? tab : null;
}

function selectRequest(tab: tabs, ledger: TabLedger, tokenId: string, input: PaymentRequestInput) {
  const allocated = allocatedByItem(ledger.payments);
  const { pendingCents } = summarizeLedger(ledger);
  if (input.mode === "AMOUNT") {
    validatePaymentAmount(tab, pendingCents, input.amount_cents, []);
    return {
      amount: input.amount_cents,
      selection: { mode: input.mode, include_service_fee: input.include_service_fee },
    };
  }

  const items =
    input.mode === "ITEMS"
      ? input.items
      : ledger.orders
          .filter(({ submitted_by_token_id }) => submitted_by_token_id === tokenId)
          .flatMap((order) =>
            order.items.map((item) => ({
              order_item_id: item.id,
              covered_cents: activeLineCents(item) - (allocated.get(item.id)?.cents ?? 0),
            })),
          )
          .filter(({ covered_cents }) => covered_cents > 0);
  validateAllocations(ledger.orders, allocated, items);
  const amount = proportionalCharge(items, tab, pendingCents, input.include_service_fee);
  if (amount <= 0) throw new ConflictError("A seleção não tem valor a cobrar", "PAYMENT_REQUEST_EMPTY");
  return { amount, selection: { mode: input.mode, items, include_service_fee: input.include_service_fee } };
}

export async function requestForConversion({ db, now }: RestaurantTransaction, tab: tabs, id: string) {
  const { restaurant_id } = tab;
  const request = await new PaymentRequestsRepository(db).findById(restaurant_id, tab.id, id);
  if (!request) throw new NotFoundError("Solicitação de pagamento não encontrada");
  const available = request.status === "OPEN" || request.status === "ACCEPTED";
  const session = await new TableSessionRepository(db).findById(restaurant_id, request.session_id);
  const token = await new SessionTokenRepository(db).findActiveForSession(
    restaurant_id,
    request.session_id,
    request.session_token_id,
  );
  if (
    !available ||
    !token ||
    session?.status !== "ACTIVE" ||
    session.tab_id !== tab.id ||
    (!session.keep_open && session.expires_at <= now)
  )
    throw new ConflictError("A solicitação não está mais ativa", "PAYMENT_REQUEST_NOT_ACTIVE");
  const selection = paymentRequestSelectionSchema.parse(request.selection_json);
  return { request, selection };
}

function publicTabView(tab: tabs, ledger: TabLedger, tokenId: string, request: payment_requests | null) {
  const orders = ledger.orders.map((order) => ({
    ...orderView(order),
    is_mine: order.submitted_by_token_id === tokenId,
    guest_label: order.submitted_by_token?.guest_label ?? null,
  }));
  const mySubtotal = orders
    .filter(({ is_mine }) => is_mine)
    .reduce((sum, order) => sum + order.active_total_cents, 0);
  return {
    number: tab.number,
    table_label: tab.table_label_snapshot,
    status: tab.status,
    subtotal_cents: tab.subtotal_cents,
    service_fee_cents: tab.service_fee_cents,
    adjustments_cents: tab.adjustments_cents,
    total_cents: tab.total_cents,
    paid_cents: tab.paid_cents,
    remaining_cents: tab.total_cents - tab.paid_cents,
    my_subtotal_cents: mySubtotal,
    my_estimated_total_cents: mySubtotal + serviceFeeCents(mySubtotal, tab),
    orders,
    my_open_payment_request: request ? paymentRequestView(request) : null,
  };
}

export interface IPaymentRequestsService {
  guest(device: Device, label: string | null): ReturnType<PaymentRequestsService["guest"]>;
  getTab(device: Device): ReturnType<PaymentRequestsService["getTab"]>;
  create(device: Device, input: PaymentRequestInput): ReturnType<PaymentRequestsService["create"]>;
  cancel(device: Device, id: string): Promise<void>;
}

@injectable()
export class PaymentRequestsService implements IPaymentRequestsService {
  constructor(
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
  ) {}

  async guest(device: Device, label: string | null) {
    const { restaurantId, tokenId } = device;
    return this.unit.run(restaurantId, async ({ db, now }) => {
      await new OrdersRepository(db).device(device, now);
      const updated = await new SessionTokenRepository(db).setGuestLabel(restaurantId, tokenId, label);
      if (!updated.count) throw new UnauthorizedError("Token da mesa inválido ou expirado");
      return { guest_label: label };
    });
  }

  async getTab(device: Device) {
    return this.unit.run(device.restaurantId, async (transaction) => {
      const tab = await deviceTab(transaction, device);
      if (!tab) return { tab: null };
      const ledger = await loadTabLedger(transaction.db, tab);
      const mine = ledger.requests.find(
        (request) => request.session_token_id === device.tokenId && request.status === "OPEN",
      );
      return { tab: publicTabView(tab, ledger, device.tokenId, mine ?? null) };
    });
  }

  async create(device: Device, input: PaymentRequestInput) {
    const { restaurantId, tokenId, sessionId } = device;
    const result = await this.unit.run(restaurantId, async (transaction) => {
      const { db, now } = transaction;
      const tab = await deviceTab(transaction, device);
      if (!tab) throw new NotFoundError("Comanda aberta não encontrada");
      const repository = new PaymentRequestsRepository(db);
      if (await repository.findOpenByToken(restaurantId, tab.id, tokenId))
        throw new ConflictError("Já existe uma solicitação em aberto", "PAYMENT_REQUEST_ALREADY_OPEN");
      const token = await new SessionTokenRepository(db).findActiveForSession(
        restaurantId,
        sessionId,
        tokenId,
      );
      if (!token) throw new UnauthorizedError("Token da mesa inválido ou expirado");
      const selection = selectRequest(tab, await loadTabLedger(db, tab), tokenId, input);
      const request = await repository.create(restaurantId, tab.id, {
        session_id: sessionId,
        session_token_id: tokenId,
        payer_label: token.guest_label ?? "Cliente da mesa",
        preferred_method: input.preferred_method,
        requested_amount_cents: selection.amount,
        selection_json: selection.selection,
        created_at: now,
      });
      return { tab, request };
    });
    notifyPaymentRequestCreated(this.notifier, result.request, result.tab);
    return { payment_request: paymentRequestView(result.request) };
  }

  async cancel(device: Device, id: string) {
    const { restaurantId, tokenId } = device;
    const updated = await this.unit.run(restaurantId, async (transaction) => {
      const tab = await deviceTab(transaction, device);
      if (!tab) throw new NotFoundError("Solicitação de pagamento não encontrada");
      const repository = new PaymentRequestsRepository(transaction.db);
      const request = await repository.findById(restaurantId, tab.id, id);
      if (!request || request.session_token_id !== tokenId)
        throw new NotFoundError("Solicitação de pagamento não encontrada");
      if (request.status === "CANCELLED") return null;
      if (request.status !== "OPEN")
        throw new ConflictError("A solicitação não está mais aberta", "PAYMENT_REQUEST_NOT_ACTIVE");
      return repository.update(restaurantId, tab.id, id, { status: "CANCELLED" });
    });
    if (updated) notifyPaymentRequestUpdated(this.notifier, updated);
  }
}
