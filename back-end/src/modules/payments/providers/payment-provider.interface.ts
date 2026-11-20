import type {
  payment_method,
  payment_provider_type,
  payment_status,
} from "../../../../generated/prisma/enums.ts";

export type ManualChargeInput = {
  method: payment_method;
  amount_cents: number;
  received_cents: number | null;
};

export interface IPaymentProvider {
  readonly kind: payment_provider_type;
  recordCharge(input: ManualChargeInput): { status: payment_status; change_cents: number };
}
