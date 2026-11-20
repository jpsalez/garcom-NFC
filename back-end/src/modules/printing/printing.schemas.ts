import { z } from "zod";

export const printingSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export const printerCredentialSchema = z.string().regex(/^cloud_[A-Za-z0-9_-]{43}$/);
export const cloudPollSchema = z.object({
  statusCode: z.string().max(120),
  jobToken: z.string().max(100).nullish(),
  printingInProgress: z.boolean().nullish(),
});
export const cloudGetSchema = z.object({ token: z.uuid(), type: z.string().max(100).optional() });
export const cloudResultSchema = z.object({ token: z.uuid(), code: z.string().max(120) });

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

export type PrintingJobsQuery = z.infer<typeof printingJobsQuery>;
export type PrintReprint = z.infer<typeof reprintSchema>;
export type PrintReview = z.infer<typeof printingReviewSchema>["review"];

export const browserStationCredentialSchema = z.string().regex(/^station_[A-Za-z0-9_-]{43}$/);
export const browserStationSetupSchema = z.strictObject({ paper_width: z.union([z.literal(58), z.literal(80)]) });
export const browserStationResultSchema = z.strictObject({ token: z.uuid(), submitted: z.boolean() });
export const browserTestConfirmSchema = z.strictObject({ token: z.uuid() });
