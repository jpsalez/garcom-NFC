import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type {
  CashShiftListFilter,
  CreateCashMovementData,
  CreateCashShiftData,
  ICashShiftsRepository,
  UpdateCashShiftData,
} from "./cash-shifts.repository.interface.ts";

@injectable()
export class CashShiftsRepository implements ICashShiftsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  create(restaurantId: string, data: CreateCashShiftData) {
    return this.db.cash_shifts.create({ data: { ...data, restaurant_id: restaurantId } });
  }

  get(restaurantId: string, id: string) {
    return this.db.cash_shifts.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  findOpenByOperator(restaurantId: string, operatorId: string) {
    return this.db.cash_shifts.findFirst({
      where: { restaurant_id: restaurantId, opened_by_user_id: operatorId, status: "OPEN" },
    });
  }

  list(restaurantId: string, filter: CashShiftListFilter = {}) {
    return this.db.cash_shifts.findMany({
      where: { restaurant_id: restaurantId, opened_by_user_id: filter.operatorId, status: filter.status },
      orderBy: [{ opened_at: "desc" }, { id: "desc" }],
      take: filter.limit ?? 50,
      skip: filter.offset,
    });
  }

  update(restaurantId: string, id: string, data: UpdateCashShiftData) {
    return this.db.cash_shifts.update({ where: { id, restaurant_id: restaurantId }, data });
  }

  createMovement(restaurantId: string, shiftId: string, data: CreateCashMovementData) {
    return this.db.cash_movements.create({
      data: { ...data, restaurant_id: restaurantId, cash_shift_id: shiftId },
    });
  }

  movements(restaurantId: string, shiftId: string) {
    return this.db.cash_movements.findMany({
      where: { restaurant_id: restaurantId, cash_shift_id: shiftId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  paymentTotals(restaurantId: string, shiftId: string) {
    return this.db.payments.groupBy({
      by: ["method"],
      where: { restaurant_id: restaurantId, cash_shift_id: shiftId, status: "APPROVED" },
      _sum: { amount_cents: true },
    });
  }
}
