import { inject, injectable } from "tsyringe";
import type { cash_shifts } from "../../../generated/prisma/client.ts";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { MenuRepository } from "../menu/menu.repository.ts";
import { expectedCashAfter } from "./cash-shift-balance.ts";
import type { CashShiftDetail, ICashShiftsService } from "./cash-shifts.interfaces.ts";
import type { ICashShiftsRepository } from "./cash-shifts.repository.interface.ts";
import { CashShiftsRepository } from "./cash-shifts.repository.ts";
import type { CashMovement, CashShiftsQuery, CloseCashShift, OpenCashShift } from "./cash-shifts.schemas.ts";

function tenant(actor: ActorContext) {
  if (!actor.restaurantId) throw new ForbiddenError("Usuário sem restaurante");
  return actor.restaurantId;
}

function managesAllShifts(actor: ActorContext) {
  return actor.role === "OWNER" || actor.category === "MANAGER";
}

async function getVisibleShift(
  repository: ICashShiftsRepository,
  restaurantId: string,
  id: string,
  actor: ActorContext,
) {
  const shift = await repository.get(restaurantId, id);
  if (!shift || (!managesAllShifts(actor) && shift.opened_by_user_id !== actor.id))
    throw new NotFoundError("Turno de caixa não encontrado");
  return shift;
}

function assertOpen(shift: cash_shifts) {
  if (shift.status !== "OPEN")
    throw new ConflictError("O turno de caixa já foi encerrado", "CASH_SHIFT_CLOSED");
}

function shiftSummary({ restaurant_id, ...shift }: cash_shifts) {
  return shift;
}

async function shiftDetail(repository: ICashShiftsRepository, shift: cash_shifts): Promise<CashShiftDetail> {
  const { restaurant_id, id } = shift;
  const movements = await repository.movements(restaurant_id, id);
  const totals = await repository.paymentTotals(restaurant_id, id);
  return {
    ...shiftSummary(shift),
    movements: movements.map(({ restaurant_id, cash_shift_id, ...movement }) => movement),
    totals_by_method: Object.fromEntries(totals.map((row) => [row.method, row._sum.amount_cents ?? 0])),
  };
}

@injectable()
export class CashShiftsService implements ICashShiftsService {
  constructor(
    @inject("CashShiftsRepository") private repository: ICashShiftsRepository,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}

  async open(actor: ActorContext, { opening_cents }: OpenCashShift) {
    const restaurantId = tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now, actor: current }) => {
        const repository = new CashShiftsRepository(db);
        if (await repository.findOpenByOperator(restaurantId, actor.id))
          throw new ConflictError(
            "Já existe um turno de caixa aberto para este operador",
            "CASH_SHIFT_ALREADY_OPEN",
          );
        const shift = await repository.create(restaurantId, {
          opening_cents,
          expected_cash_cents: opening_cents,
          opened_by_user_id: actor.id,
          opened_at: now,
        });
        await new MenuRepository(db).audit(
          current ?? actor,
          "CASH_SHIFT_OPENED",
          "CASH_SHIFT",
          shift.id,
          {},
          { opening_cents },
        );
        return { shift: shiftSummary(shift) };
      },
      { actor, capability: "cash_shift:operate" },
    );
  }

  async current(actor: ActorContext) {
    const restaurantId = tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db }) => {
        const repository = new CashShiftsRepository(db);
        const shift = await repository.findOpenByOperator(restaurantId, actor.id);
        return { shift: shift ? await shiftDetail(repository, shift) : null };
      },
      { actor, capability: "cash_shift:operate" },
    );
  }

  async list(actor: ActorContext, query: CashShiftsQuery) {
    requireCapability(actor, "cash_shift:operate");
    const operatorId = managesAllShifts(actor) ? undefined : actor.id;
    const rows = await this.repository.list(tenant(actor), { ...query, operatorId });
    return { shifts: rows.map(shiftSummary) };
  }

  async get(actor: ActorContext, id: string) {
    const restaurantId = tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, actor: current }) => {
        const repository = new CashShiftsRepository(db);
        const shift = await getVisibleShift(repository, restaurantId, id, current ?? actor);
        return { shift: await shiftDetail(repository, shift) };
      },
      { actor, capability: "cash_shift:operate" },
    );
  }

  async movement(actor: ActorContext, id: string, input: CashMovement) {
    const restaurantId = tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now, actor: current }) => {
        const live = current ?? actor;
        const repository = new CashShiftsRepository(db);
        const shift = await getVisibleShift(repository, restaurantId, id, live);
        assertOpen(shift);

        const delta = input.type === "SANGRIA" ? -input.amount_cents : input.amount_cents;
        const expected_cash_cents = expectedCashAfter(shift, delta);
        const movement = await repository.createMovement(restaurantId, id, {
          ...input,
          actor_user_id: live.id,
          created_at: now,
        });
        const updated = await repository.update(restaurantId, id, { expected_cash_cents });
        await new MenuRepository(db).audit(
          live,
          "CASH_SHIFT_MOVEMENT",
          "CASH_SHIFT",
          id,
          { expected_cash_cents: shift.expected_cash_cents },
          { expected_cash_cents, movement_id: movement.id, ...input },
        );
        return { shift: await shiftDetail(repository, updated) };
      },
      { actor, capability: "cash_shift:operate" },
    );
  }

  async close(actor: ActorContext, id: string, { counted_cash_cents, notes }: CloseCashShift) {
    const restaurantId = tenant(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now, actor: current }) => {
        const live = current ?? actor;
        const repository = new CashShiftsRepository(db);
        const shift = await getVisibleShift(repository, restaurantId, id, live);
        assertOpen(shift);

        const difference_cents = counted_cash_cents - shift.expected_cash_cents;
        const closed = await repository.update(restaurantId, id, {
          status: "CLOSED",
          closed_at: now,
          closed_by_user_id: live.id,
          counted_cash_cents,
          difference_cents,
          notes,
        });
        await new MenuRepository(db).audit(
          live,
          "CASH_SHIFT_CLOSED",
          "CASH_SHIFT",
          id,
          { status: shift.status },
          {
            status: closed.status,
            expected_cash_cents: closed.expected_cash_cents,
            counted_cash_cents,
            difference_cents,
            notes,
          },
        );
        return { shift: await shiftDetail(repository, closed) };
      },
      { actor, capability: "cash_shift:operate" },
    );
  }
}
