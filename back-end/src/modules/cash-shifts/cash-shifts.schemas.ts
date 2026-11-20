import { z } from "zod";
import { cash_movement_type, cash_shift_status } from "../../../generated/prisma/enums.ts";

const drawerCents = z.number().int().min(0).max(2_147_483_647);
export const openCashShiftSchema = z.strictObject({ opening_cents: drawerCents });
export const closeCashShiftSchema = z.strictObject({
  counted_cash_cents: drawerCents,
  notes: z.string().trim().max(500).optional(),
});
export const cashMovementSchema = z.strictObject({
  type: z.enum(cash_movement_type),
  amount_cents: drawerCents.min(1),
  reason: z.string().trim().min(3).max(500),
});
export const cashShiftsQuery = z.strictObject({
  status: z.enum(cash_shift_status).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
});

export type OpenCashShift = z.infer<typeof openCashShiftSchema>;
export type CloseCashShift = z.infer<typeof closeCashShiftSchema>;
export type CashMovement = z.infer<typeof cashMovementSchema>;
export type CashShiftsQuery = z.infer<typeof cashShiftsQuery>;
