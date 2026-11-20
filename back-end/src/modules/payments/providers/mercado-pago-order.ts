import { z } from "zod";
import { PointProviderError } from "./mercado-pago-http.ts";
import type {
  PointChargeInput,
  PointChargeResult,
  PointPaymentMethod,
} from "./payment-provider.interface.ts";

export const pointMethods = {
  CREDIT: "credit_card",
  DEBIT: "debit_card",
  VOUCHER: "voucher_card",
  PIX: "qr",
} as const;

export function isPointMethod(method: string): method is PointPaymentMethod {
  return Object.hasOwn(pointMethods, method);
}

const referenceId = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(64);
const cents = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [real, fraction = ""] = value.split(".");
    return Number(real) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().int().min(0).max(2_147_483_647));

const externalPayment = z.object({
  id: referenceId,
  amount: cents,
  paid_amount: cents.optional(),
  status: z.string(),
  status_detail: z.string().optional(),
  reference_id: referenceId.optional(),
  reference: z.object({ id: referenceId }).optional(),
  authorization_code: referenceId.optional(),
  payment_method: z
    .object({
      id: referenceId.max(32),
      type: z.string(),
      installments: z.coerce.number().int().min(1).max(99).optional(),
    })
    .optional(),
});

export const pointOrderSchema = z.object({
  id: z
    .string()
    .regex(/^ORD[A-Z0-9]+$/i)
    .max(128),
  type: z.literal("point"),
  user_id: z.union([z.string().regex(/^\d+$/).max(128), z.number().int().positive()]).transform(String),
  status: z.string(),
  external_reference: referenceId,
  currency: z.literal("BRL").optional(),
  total_amount: cents.optional(),
  total_paid_amount: cents.optional(),
  config: z.object({ point: z.object({ terminal_id: z.string().min(1).max(128) }) }),
  transactions: z.object({ payments: z.tuple([externalPayment]) }),
});

type PointOrder = z.infer<typeof pointOrderSchema>;

function paymentMethod(method: z.infer<typeof externalPayment>["payment_method"]) {
  if (!method) return;
  if (method.id === "pix" && ["bank_transfer", "qr", "pix"].includes(method.type)) return "PIX";
  if (method.type === "credit_card") return "CREDIT";
  if (method.type === "debit_card") return "DEBIT";
  if (method.type === "voucher_card") return "VOUCHER";
}

function orderStatus(order: PointOrder): PointChargeResult["status"] {
  const [payment] = order.transactions.payments;
  if (
    order.status === "processed" &&
    payment.status === "processed" &&
    payment.status_detail === "accredited"
  )
    return "APPROVED";
  if (order.status === "expired" && payment.status === "expired") return "EXPIRED";
  if (order.status === "canceled" && payment.status === "canceled") return "CANCELLED";
  if (order.status === "failed" && payment.status === "failed" && payment.status_detail !== "in_review")
    return "DECLINED";
  return "PROCESSING";
}

export function pointChargeResult(order: PointOrder): PointChargeResult {
  const [payment] = order.transactions.payments;
  const method = paymentMethod(payment.payment_method);
  if (order.total_amount !== undefined && order.total_amount !== payment.amount)
    throw new PointProviderError();
  if (
    order.total_paid_amount !== undefined &&
    payment.paid_amount !== undefined &&
    order.total_paid_amount !== payment.paid_amount
  )
    throw new PointProviderError();
  return {
    id: order.id,
    reference: order.external_reference,
    merchantId: order.user_id,
    deviceId: order.config.point.terminal_id,
    amountCents: payment.amount,
    status: orderStatus(order),
    canCancel:
      order.status === "created" ||
      (order.status === "at_terminal" && payment.status_detail !== "cancellation_requested"),
    method,
    paidCents: payment.paid_amount ?? order.total_paid_amount,
    brand: method === "CREDIT" || method === "DEBIT" ? payment.payment_method?.id : undefined,
    installments: payment.payment_method?.installments,
    nsu: payment.reference_id ?? payment.reference?.id,
    authorizationCode: payment.authorization_code,
    providerPaymentId: payment.id,
  };
}

export function createOrderBody(input: PointChargeInput) {
  const cardTerms =
    input.method === "CREDIT"
      ? {
          default_installments: input.installments,
          installments_cost: input.installments > 1 ? "seller" : undefined,
        }
      : {};
  return {
    type: "point",
    external_reference: input.id,
    expiration_time: "PT5M",
    transactions: { payments: [{ amount: (input.amount_cents / 100).toFixed(2) }] },
    config: {
      point: { terminal_id: input.deviceId },
      payment_method: { default_type: pointMethods[input.method], ...cardTerms },
    },
  };
}
