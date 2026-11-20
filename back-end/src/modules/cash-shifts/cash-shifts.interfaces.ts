import type { cash_movements, cash_shifts, payment_method } from "../../../generated/prisma/client.ts";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type { CashMovement, CashShiftsQuery, CloseCashShift, OpenCashShift } from "./cash-shifts.schemas.ts";

export type CashShiftSummary = Omit<cash_shifts, "restaurant_id">;
export type CashShiftDetail = CashShiftSummary & {
  movements: Omit<cash_movements, "restaurant_id" | "cash_shift_id">[];
  totals_by_method: Partial<Record<payment_method, number>>;
};

export interface ICashShiftsService {
  open(actor: ActorContext, input: OpenCashShift): Promise<{ shift: CashShiftSummary }>;
  current(actor: ActorContext): Promise<{ shift: CashShiftDetail | null }>;
  list(actor: ActorContext, query: CashShiftsQuery): Promise<{ shifts: CashShiftSummary[] }>;
  get(actor: ActorContext, id: string): Promise<{ shift: CashShiftDetail }>;
  movement(actor: ActorContext, id: string, input: CashMovement): Promise<{ shift: CashShiftDetail }>;
  close(actor: ActorContext, id: string, input: CloseCashShift): Promise<{ shift: CashShiftDetail }>;
}
