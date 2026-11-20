import type {
  Prisma,
  cash_movement_type,
  cash_movements,
  cash_shift_status,
  cash_shifts,
  payment_method,
} from "../../../generated/prisma/client.ts";

export type CreateCashShiftData = Pick<
  Prisma.cash_shiftsUncheckedCreateInput,
  "opened_by_user_id" | "opening_cents" | "opened_at"
> & { expected_cash_cents: number };

export type UpdateCashShiftData = Partial<
  Pick<
    cash_shifts,
    | "status"
    | "expected_cash_cents"
    | "counted_cash_cents"
    | "difference_cents"
    | "closed_by_user_id"
    | "closed_at"
    | "notes"
  >
>;

export type CreateCashMovementData = {
  type: cash_movement_type;
  amount_cents: number;
  reason: string;
  actor_user_id?: string;
  created_at?: Date;
};

export type CashShiftListFilter = {
  operatorId?: string;
  status?: cash_shift_status;
  limit?: number;
  offset?: number;
};

export type CashShiftPaymentTotal = { method: payment_method; _sum: { amount_cents: number | null } };

export interface ICashShiftsRepository {
  create(restaurantId: string, data: CreateCashShiftData): Promise<cash_shifts>;
  get(restaurantId: string, id: string): Promise<cash_shifts | null>;
  findOpenByOperator(restaurantId: string, operatorId: string): Promise<cash_shifts | null>;
  list(restaurantId: string, filter?: CashShiftListFilter): Promise<cash_shifts[]>;
  update(restaurantId: string, id: string, data: UpdateCashShiftData): Promise<cash_shifts>;
  createMovement(
    restaurantId: string,
    shiftId: string,
    data: CreateCashMovementData,
  ): Promise<cash_movements>;
  movements(restaurantId: string, shiftId: string): Promise<cash_movements[]>;
  paymentTotals(restaurantId: string, shiftId: string): Promise<CashShiftPaymentTotal[]>;
}
