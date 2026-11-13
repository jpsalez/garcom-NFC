import { z } from "zod";

const label = z.string().trim().min(1).max(60);

// O public_code não entra: quem gera é o sistema
export const createTableSchema = z.object({ label });
export type createTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = z.object({
  label: label.optional(),
  active: z.boolean().optional(),
});
export type updateTableInput = z.infer<typeof updateTableSchema>;
