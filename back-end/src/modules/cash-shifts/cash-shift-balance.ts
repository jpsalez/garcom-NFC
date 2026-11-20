import type { cash_shifts, payments } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { CashShiftsRepository } from "./cash-shifts.repository.ts";

export function expectedCashAfter(shift: cash_shifts, deltaCents: number) {
  const expected = shift.expected_cash_cents + deltaCents;
  if (expected < 0)
    throw new ConflictError("O caixa não tem saldo suficiente", "CASH_SHIFT_INSUFFICIENT_CASH");
  if (expected > 2_147_483_647)
    throw new ConflictError("O saldo do caixa excede o limite", "CASH_SHIFT_CASH_LIMIT");
  return expected;
}

// Executar na mesma transação que confirma ou estorna o pagamento.
export async function applyPaymentToCashShift(db: DbClient, payment: payments) {
  const { cash_shift_id, restaurant_id, method, status } = payment;
  if (!cash_shift_id || method !== "CASH" || (status !== "APPROVED" && status !== "REFUNDED")) return;

  const repository = new CashShiftsRepository(db);
  const shift = await repository.get(restaurant_id, cash_shift_id);
  if (!shift) throw new NotFoundError("Turno de caixa não encontrado");

  const delta = status === "REFUNDED" ? -payment.amount_cents : payment.amount_cents;
  const expected = expectedCashAfter(shift, delta);
  return repository.update(restaurant_id, shift.id, {
    expected_cash_cents: expected,
    difference_cents: shift.counted_cash_cents === null ? null : shift.counted_cash_cents - expected,
  });
}
