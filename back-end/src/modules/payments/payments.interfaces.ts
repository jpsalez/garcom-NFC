import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { TabSummary } from "../tabs/tabs.interfaces.ts";
import type { paymentView } from "./payment-view.ts";
import type { CreatePayment, RefundPayment } from "./payments.schemas.ts";

export type PaymentResult = { payment: ReturnType<typeof paymentView>; tab: TabSummary };

export interface IPaymentsService {
  create(
    actor: ActorContext,
    id: string,
    input: CreatePayment,
  ): Promise<PaymentResult & { replayed: boolean; auto_closed: boolean }>;
  refund(actor: ActorContext, id: string, paymentId: string, input: RefundPayment): Promise<PaymentResult>;
}
