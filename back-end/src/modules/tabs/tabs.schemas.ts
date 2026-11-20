import { z } from "zod";

const tabKind = z.enum(["TABLE", "COUNTER"]);
const tabStatus = z.enum(["OPEN", "CLOSING", "CLOSED", "CANCELLED"]);
const label = z.string().trim().min(1).max(80);
const guestsCount = z.number().int().min(1).max(2147483647);
const expectedVersion = z.number().int().positive();

const tabFields = { label: label.optional(), guests_count: guestsCount.optional() };
export const openTabSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("TABLE"), table_id: z.uuid(), ...tabFields }),
  z.strictObject({ kind: z.literal("COUNTER"), ...tabFields }),
]);
export const updateTabSchema = z
  .strictObject({
    expected_version: expectedVersion,
    label: label.nullable().optional(),
    guests_count: guestsCount.nullable().optional(),
  })
  .refine(
    (body) => body.label !== undefined || body.guests_count !== undefined,
    "Informe o nome ou a quantidade de pessoas",
  );
export const transferTabSchema = z.strictObject({
  expected_version: expectedVersion,
  target_table_id: z.uuid(),
});
export const mergeTabSchema = z.strictObject({ expected_version: expectedVersion, source_tab_id: z.uuid() });
const dateOrTime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
export const listTabsQuery = z.strictObject({
  status: z
    .string()
    .transform((value) => value.split(",").map((status) => status.trim()))
    .pipe(z.array(tabStatus).min(1).max(4))
    .optional(),
  kind: tabKind.optional(),
  table_id: z.uuid().optional(),
  business_date: z.iso.date().optional(),
  from: dateOrTime.optional(),
  to: dateOrTime.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type OpenTab = z.infer<typeof openTabSchema>;
export type UpdateTab = z.infer<typeof updateTabSchema>;
export type TransferTab = z.infer<typeof transferTabSchema>;
export type MergeTab = z.infer<typeof mergeTabSchema>;
export type ListTabs = z.infer<typeof listTabsQuery>;

const scopeReason = z.string().trim().min(3).max(500);
export const preBillQuery = z.strictObject({ split_by: z.coerce.number().int().min(2).max(100).optional() });
export const closeTabSchema = z.strictObject({
  expected_version: expectedVersion,
  customer_document: z
    .string()
    .regex(/^(?:[0-9]{11}|[0-9]{14})$/)
    .optional(),
});
export const cancelTabSchema = z.strictObject({ expected_version: expectedVersion, reason: scopeReason });

export const tabAdjustmentSchema = z
  .strictObject({
    type: z.enum(["DISCOUNT", "COUVERT", "TIP"]),
    mode: z.enum(["FIXED_CENTS", "PERCENT_BPS"]),
    value: z.number().int().min(1).max(2_147_483_647),
    reason: scopeReason,
  })
  .refine((input) => input.mode !== "PERCENT_BPS" || input.value <= 10_000, "Percentual máximo de 100%");
export const waiveFeeSchema = z.strictObject({ waived: z.boolean(), reason: scopeReason });

export type CloseTab = z.infer<typeof closeTabSchema>;
export type CancelTab = z.infer<typeof cancelTabSchema>;
export type TabAdjustment = z.infer<typeof tabAdjustmentSchema>;
export type WaiveFee = z.infer<typeof waiveFeeSchema>;
