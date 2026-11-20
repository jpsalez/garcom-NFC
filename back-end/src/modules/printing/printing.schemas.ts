import { z } from "zod";

export const printingSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export const pairingCodeSchema = z.string().regex(/^[a-f0-9]{20}$/);
export const printingPairSchema = z.object({ code: pairingCodeSchema }).strict();
export const printAgentCredentialSchema = z.string().regex(/^print_[A-Za-z0-9_-]{43}$/);

export const printClaimSchema = z.strictObject({}).default({});
export const printResultSchema = z.strictObject({
  reservation_id: z.uuid(),
  outcome: z.enum(["SENT", "FAILED_BEFORE_SEND", "UNCERTAIN"]),
});
export const printingJobsQuery = z.strictObject({
  status: z
    .enum(["PENDING", "SENDING", "SENT", "FAILED", "SUPPRESSED", "UNCERTAIN", "REVIEW_REQUIRED"])
    .optional(),
  destination: z.enum(["KITCHEN"]).optional(),
  order_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});
export const reprintSchema = z.strictObject({
  idempotency_key: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export const printingReviewSchema = z.strictObject({
  review: z.strictObject({
    job_ids: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, "Comanda repetida"),
    decision: z.enum(["RELEASE", "DISCARD"]),
  }),
});
export const printingPatchSchema = z.union([printingSettingsSchema, printingReviewSchema]);

export type PrintResult = z.infer<typeof printResultSchema>;
export type PrintingJobsQuery = z.infer<typeof printingJobsQuery>;
export type PrintReprint = z.infer<typeof reprintSchema>;
export type PrintReview = z.infer<typeof printingReviewSchema>["review"];
