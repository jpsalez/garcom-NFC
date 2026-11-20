import type {
  Prisma,
  payment_allocations,
  payment_status,
  payments,
} from "../../../generated/prisma/client.ts";

export type PaymentRecord = payments & { allocations: payment_allocations[] };

export type CreatePaymentData = Omit<
  Prisma.paymentsUncheckedCreateInput,
  "restaurant_id" | "allocations" | "payment_request"
>;
export type CreatePaymentAllocationData = Pick<
  Prisma.payment_allocationsUncheckedCreateInput,
  "order_item_id" | "covered_cents" | "covered_units_bps"
>;
export type UpdatePaymentData = Partial<
  Pick<
    payments,
    | "status"
    | "updated_at"
    | "confirmed_at"
    | "refund_reason"
    | "refunded_by_user_id"
    | "refunded_at"
    | "external_payment_id"
    | "provider_fee_cents"
    | "nsu"
    | "authorization_code"
    | "card_brand"
    | "acquirer_cnpj"
    | "installments"
  >
> &
  Pick<Prisma.paymentsUncheckedUpdateInput, "raw_provider_payload">;

export type PaymentAllocationTotal = {
  order_item_id: string;
  _sum: { covered_cents: number | null; covered_units_bps: number | null };
};

export interface IPaymentsRepository {
  create(
    restaurantId: string,
    data: CreatePaymentData,
    allocations?: CreatePaymentAllocationData[],
  ): Promise<PaymentRecord>;
  findIdempotency(restaurantId: string, key: string): Promise<PaymentRecord | null>;
  get(restaurantId: string, id: string): Promise<PaymentRecord | null>;
  findById(restaurantId: string, tabId: string, id: string): Promise<PaymentRecord | null>;
  list(restaurantId: string, tabId: string): Promise<PaymentRecord[]>;
  update(restaurantId: string, tabId: string, id: string, data: UpdatePaymentData): Promise<PaymentRecord>;
  transition(
    restaurantId: string,
    id: string,
    expectedStatuses: payment_status[],
    data: UpdatePaymentData,
  ): Promise<PaymentRecord | null>;
  auditPointTransition(
    restaurantId: string,
    payment: PaymentRecord,
    previousStatus: payment_status,
  ): Promise<unknown>;
  allocationTotals(restaurantId: string, tabId: string): Promise<PaymentAllocationTotal[]>;
  moveToTab(restaurantId: string, sourceTabId: string, targetTabId: string): Promise<Prisma.BatchPayload>;
}
