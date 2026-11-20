import { z } from "zod";

const environment = z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX");
const label = z.string().trim().min(1).max(80);

export const pointEnvironmentQuery = z.strictObject({ environment });
export const pointCallbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(2_048),
});
export const createTerminalSchema = z.strictObject({
  environment,
  external_device_id: z.string().trim().min(1).max(128),
  label,
});
export const updateTerminalSchema = z
  .strictObject({
    label: label.optional(),
    active: z.boolean().optional(),
  })
  .refine((input) => input.label !== undefined || input.active !== undefined, "Informe a alteração");

export type CreateTerminal = z.infer<typeof createTerminalSchema>;
export type UpdateTerminal = z.infer<typeof updateTerminalSchema>;
