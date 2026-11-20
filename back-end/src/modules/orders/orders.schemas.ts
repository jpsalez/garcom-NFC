import { z } from "zod";
export const selectionSchema = z.strictObject({
  option_id: z.uuid(),
  quantity: z.number().int().min(1).max(50),
});
export const submitSchema = z.strictObject({
  submission_key: z.uuid(),
  publication_id: z.uuid(),
  items: z
    .array(
      z.strictObject({
        product_id: z.uuid(),
        variant_id: z.uuid(),
        quantity: z.number().int().min(1).max(20),
        selections: z
          .array(selectionSchema)
          .max(1000)
          .refine((rows) => new Set(rows.map((row) => row.option_id)).size === rows.length, "Opção repetida"),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export const stages = z.enum(["PENDING", "PREPARING", "READY", "DELIVERED", "CANCELLED"]);
export const transitionsSchema = z.strictObject({
  expected_version: z.number().int().positive(),
  operations: z
    .array(
      z.strictObject({
        item_id: z.uuid(),
        from_stage: stages,
        to_stage: stages,
        quantity: z.number().int().min(1).max(20),
        reason: z.string().trim().min(3).max(500).optional(),
      }),
    )
    .min(1)
    .max(50)
    .refine((rows) => new Set(rows.map((row) => row.item_id)).size === rows.length, "Item repetido no lote"),
});
export const settingsSchema = z.strictObject({
  expected_version: z.number().int().positive(),
  customer_ordering_enabled: z.boolean(),
});
export const ordersQuery = z.strictObject({
  session_id: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  progress: z.enum(["open", "ready", "completed", "cancelled", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});
export const deviceOrdersQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});
export const eventsQuery = z.strictObject({
  after_sequence: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type Submission = z.infer<typeof submitSchema>;
export type Transition = z.infer<typeof transitionsSchema>["operations"][number];
export type OrdersQuery = z.infer<typeof ordersQuery>;
