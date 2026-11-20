import { inject, injectable } from "tsyringe";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { decryptSecret } from "../../shared/utils/crypto.ts";
import { logOperation } from "../../shared/utils/request-context.ts";
import { PaymentProviderAccountsRepository } from "./payment-provider-accounts.repository.ts";
import { findPaymentForWebhook, findPaymentsToReconcile } from "./payment-sync.queries.ts";
import { PaymentTerminalsRepository } from "./payment-terminals.repository.ts";
import type { PaymentRecord } from "./payments.repository.interface.ts";
import { PaymentsRepository } from "./payments.repository.ts";
import type { ResolvePointPayment } from "./payments.schemas.ts";
import { activePointAccount } from "./point-account.ts";
import {
  linkPointOrder,
  notReviewable,
  type PointPayment,
  pointExpiryMs,
  pointStatusData,
  releasePointPayment,
  updatePointPayment,
  validatePointCharge,
} from "./point-payment-state.ts";
import { PointProviderError } from "./providers/mercado-pago-http.ts";
import { isPointMethod } from "./providers/mercado-pago-order.ts";
import type { PaymentProviderRegistry } from "./providers/payment-provider.registry.ts";

type PaymentKey = Pick<PaymentRecord, "id" | "restaurant_id">;

@injectable()
export class PointPaymentsService {
  constructor(
    @inject("DbClient") private db: DbClient,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("Notifier") private notifier: INotifier,
    @inject("PaymentProviderRegistry") private providers: PaymentProviderRegistry,
  ) {}

  async dispatch(payment: PaymentKey) {
    const context = await this.context(payment);
    if (context?.payment.status !== "PENDING" || context.payment.external_payment_id) return;
    try {
      await this.sendCharge(context);
    } catch (error) {
      if (!(error instanceof PointProviderError)) throw error;
      if (error.definitiveRejection) {
        await updatePointPayment(this.unit, this.notifier, context, { status: "CANCELLED" });
        throw error;
      }
      logOperation({ event: "point.charge_undetermined", payment_id: payment.id });
    }
  }

  async resolve(actor: ActorContext, payment: PaymentRecord, input: ResolvePointPayment) {
    if (input.outcome === "NOT_CHARGED")
      return releasePointPayment(this.unit, this.notifier, actor, payment, input.reason);
    const context = await this.context(payment);
    if (!context) throw notReviewable();
    // A order informada só vale se a consulta ao provedor confirmar referência, conta, terminal e valor.
    const linked = { ...context, payment: { ...payment, external_payment_id: input.order_id } };
    const charge = await this.fetchCharge(linked, input.order_id);
    await linkPointOrder(this.unit, this.notifier, actor, linked, pointStatusData(charge));
  }

  async handleWebhook(dataId: unknown, requestId?: string, signature?: string) {
    const id = this.providers.get("MERCADO_PAGO").parseWebhook(dataId, requestId, signature);
    const key = await findPaymentForWebhook(this.db, "MERCADO_PAGO", id);
    if (!key) return;
    const context = await this.context(key);
    if (!context || context.payment.external_payment_id !== id) return;
    await this.sync(context);
  }

  async reconcile() {
    const now = Date.now();
    const candidates = await findPaymentsToReconcile(
      this.db,
      "MERCADO_PAGO",
      new Date(now - 20_000),
      20,
      new Date(now - pointExpiryMs),
    );
    for (const key of candidates) {
      let context: PointPayment | null = null;
      try {
        context = await this.context(key);
        if (!context) continue;
        if (context.payment.external_payment_id)
          await this.reconcileOrder(context, context.payment.external_payment_id);
        else if (context.payment.created_at.getTime() > Date.now() - pointExpiryMs)
          await this.retryCharge(context);
      } catch {
        // Uma tentativa inconclusiva não pode liberar a reserva nem monopolizar o próximo lote.
        logOperation({ event: "point.reconciliation_undetermined", payment_id: key.id });
        if (context) await this.defer(context).catch(() => undefined);
      }
    }
  }

  private async sendCharge(context: PointPayment) {
    const { payment, account, deviceId } = context;
    const { method, id, amount_cents, installments, idempotency_key } = payment;
    if (!isPointMethod(method)) throw new PointProviderError();
    const access = decryptSecret(account.access_token_encrypted);
    const charge = await this.providers
      .get("MERCADO_PAGO")
      .createCharge(access, { id, amount_cents, installments, idempotency_key, method, deviceId });
    validatePointCharge(context, charge);
    // Só a consulta autenticada pode consolidar um recebimento.
    await updatePointPayment(this.unit, this.notifier, context, {
      status: "PROCESSING",
      external_payment_id: charge.id,
      raw_provider_payload: { transaction_id: charge.providerPaymentId },
    });
  }

  // Na nova tentativa, 409 ou 401 podem vir da order criada pela tentativa ambígua anterior.
  // Só a recusa do próprio payload prova que nenhuma order existe.
  private async retryCharge(context: PointPayment) {
    try {
      await this.sendCharge(context);
    } catch (error) {
      if (error instanceof PointProviderError && (error.status === 400 || error.status === 422))
        await updatePointPayment(this.unit, this.notifier, context, { status: "CANCELLED" });
      throw error;
    }
  }

  private async fetchCharge(context: PointPayment, id: string) {
    const access = decryptSecret(context.account.access_token_encrypted);
    const charge = await this.providers.get("MERCADO_PAGO").getChargeStatus(access, id);
    validatePointCharge(context, charge);
    return charge;
  }

  private async sync(context: PointPayment) {
    const id = context.payment.external_payment_id;
    if (!id) return;
    const charge = await this.fetchCharge(context, id);
    await updatePointPayment(this.unit, this.notifier, context, pointStatusData(charge));
    return charge;
  }

  private async reconcileOrder(context: PointPayment, id: string) {
    const { payment, account } = context;
    const charge = await this.sync(context);
    if (
      !charge?.canCancel ||
      charge.status !== "PROCESSING" ||
      payment.created_at.getTime() > Date.now() - pointExpiryMs
    )
      return;

    const provider = this.providers.get("MERCADO_PAGO");
    const access = decryptSecret(account.access_token_encrypted);
    const cancelled = await provider.cancelCharge(access, id);
    if (!cancelled) return;
    validatePointCharge(context, cancelled);
    if (cancelled.status === "CANCELLED" || cancelled.status === "EXPIRED")
      await updatePointPayment(this.unit, this.notifier, context, {
        ...pointStatusData(cancelled),
        status: "EXPIRED",
      });
  }

  private defer(context: PointPayment) {
    return updatePointPayment(this.unit, this.notifier, context, {
      external_payment_id: context.payment.external_payment_id ?? undefined,
    });
  }

  private async context({ restaurant_id: restaurantId, id }: PaymentKey): Promise<PointPayment | null> {
    const payment = await new PaymentsRepository(this.db).get(restaurantId, id);
    if (
      payment?.provider !== "MERCADO_PAGO" ||
      (payment.status !== "PENDING" && payment.status !== "PROCESSING") ||
      !payment.provider_account_id ||
      !payment.terminal_id
    )
      return null;
    const account = activePointAccount(
      await new PaymentProviderAccountsRepository(this.db).findById(
        restaurantId,
        payment.provider_account_id,
      ),
    );
    const terminal = await new PaymentTerminalsRepository(this.db).get(restaurantId, payment.terminal_id);
    if (
      !terminal?.external_device_id ||
      terminal.provider !== "MERCADO_PAGO" ||
      terminal.provider_account_id !== account.id
    )
      throw new PointProviderError();
    return { payment, account, terminal, deviceId: terminal.external_device_id };
  }
}
