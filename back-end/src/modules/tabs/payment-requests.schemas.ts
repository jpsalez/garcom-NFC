import { z } from "zod";
import {
  allocationsSchema,
  guestLabelSchema,
  moneyCents,
  paymentMethodSchema,
} from "../payments/payments.schemas.ts";

export const guestSchema = z.strictObject({ guest_label: guestLabelSchema.nullable() });
const requestFields = {
  preferred_method: paymentMethodSchema,
  include_service_fee: z.boolean().default(false),
};
export const paymentRequestSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("MY_ORDERS"), ...requestFields }),
  z.strictObject({ mode: z.literal("ITEMS"), ...requestFields, items: allocationsSchema }),
  z.strictObject({ mode: z.literal("AMOUNT"), ...requestFields, amount_cents: moneyCents }),
]);
export const paymentRequestSelectionSchema = z.strictObject({
  mode: z.enum(["MY_ORDERS", "ITEMS", "AMOUNT"]),
  include_service_fee: z.boolean(),
  items: z.array(allocationsSchema.element).optional(),
});
export type PaymentRequestInput = z.infer<typeof paymentRequestSchema>;
