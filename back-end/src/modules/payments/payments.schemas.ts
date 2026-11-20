import { z } from "zod";
import { payment_method, payment_provider_type } from "../../../generated/prisma/enums.ts";

export const moneyCents = z.number().int().min(1).max(2_147_483_647);
export const paymentMethodSchema = z.enum(payment_method);
export const paymentReason = z.string().trim().min(3).max(500);
export const guestLabelSchema = z.string().trim().min(1).max(60);

export const allocationsSchema = z
  .array(
    z.strictObject({
      order_item_id: z.uuid(),
      covered_cents: moneyCents,
      covered_units_bps: z.number().int().min(1).max(10_000).optional(),
    }),
  )
  .min(1)
  .max(100)
  .refine((rows) => new Set(rows.map((row) => row.order_item_id)).size === rows.length, "Item repetido");

const manualDetails = z.strictObject({
  nsu: z.string().trim().min(1).max(64).optional(),
  authorization_code: z.string().trim().min(1).max(64).optional(),
  card_brand: z.string().trim().min(1).max(32).optional(),
  acquirer_cnpj: z
    .string()
    .regex(/^[0-9]{14}$/)
    .optional(),
});

export const createPaymentSchema = z
  .strictObject({
    idempotency_key: z.uuid(),
    provider: z.enum(payment_provider_type).default("MANUAL"),
    terminal_id: z.uuid().optional(),
    method: paymentMethodSchema,
    amount_cents: moneyCents.optional(),
    received_cents: moneyCents.nullish().transform((value) => value ?? null),
    tip_cents: z.number().int().min(0).max(2_147_483_647).default(0),
    installments: z.number().int().min(1).max(99).default(1),
    payer_label: guestLabelSchema.optional(),
    payment_request_id: z.uuid().optional(),
    allocations: allocationsSchema.optional(),
    include_service_fee: z.boolean().optional(),
    manual_details: manualDetails.optional(),
    auto_close: z.boolean().default(false),
  })
  .refine(
    (input) => input.amount_cents !== undefined || input.payment_request_id !== undefined,
    "Informe o valor ou uma solicitação",
  );

export const refundPaymentSchema = z.strictObject({ reason: paymentReason });
export type PaymentAllocation = z.infer<typeof allocationsSchema>[number];
export type CreatePayment = z.infer<typeof createPaymentSchema>;
export type RefundPayment = z.infer<typeof refundPaymentSchema>;
