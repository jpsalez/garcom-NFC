import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { payment_method } from "../generated/prisma/enums.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const shiftsPath = "/api/v1/cash-shifts";
const shiftPath = (id: string) => `${shiftsPath}/${id}`;
const open = (token: string, opening_cents: number) =>
  api().post(`${shiftsPath}/open`).set(auth(token)).send({ opening_cents });
const current = (token: string) => api().get(`${shiftsPath}/current`).set(auth(token));
const list = (token: string) => api().get(shiftsPath).set(auth(token));
const detail = (token: string, shiftId: string) => api().get(shiftPath(shiftId)).set(auth(token));
const movement = (token: string, shiftId: string, type: "SANGRIA" | "SUPRIMENTO", amount_cents: number) =>
  api()
    .post(`${shiftPath(shiftId)}/movements`)
    .set(auth(token))
    .send({ type, amount_cents, reason: "Ajuste de gaveta" });
const close = (token: string, shiftId: string, counted_cash_cents: number) =>
  api()
    .post(`${shiftPath(shiftId)}/close`)
    .set(auth(token))
    .send({ counted_cash_cents, notes: "Conferência final" });

type MenuFixture = Awaited<ReturnType<typeof menuFixture>>;

async function orderTab(fixture: MenuFixture, quantity = 1) {
  const order = await api()
    .post("/api/v1/public/orders")
    .set("X-Table-Token", fixture.deviceToken)
    .send(fixture.submission(quantity));
  expect(order.status).toBe(201);
  return (await prisma.orders.findUniqueOrThrow({ where: { id: order.body.order.id } })).tab_id;
}

const pay = (token: string, tabId: string, body: object) =>
  api().post(`/api/v1/tabs/${tabId}/payments`).set(auth(token)).send(body);
const paymentBody = (method: payment_method, amount_cents: number) => ({
  idempotency_key: randomUUID(),
  provider: "MANUAL",
  method,
  amount_cents,
});
const refund = (token: string, tabId: string, paymentId: string) =>
  api()
    .post(`/api/v1/tabs/${tabId}/payments/${paymentId}/refund`)
    .set(auth(token))
    .send({ reason: "Pagamento em duplicidade" });

describe("operação de caixa", () => {
  it("permite um único turno por operador na abertura concorrente", async () => {
    const owner = await ownerOf("turno-concorrente");
    const cashier = await categoryToken(owner.restaurantId, "CASHIER");
    const results = await Promise.all([open(cashier.token, 12000), open(cashier.token, 12000)]);

    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(results.find(({ status }) => status === 409)?.body.code).toBe("CASH_SHIFT_ALREADY_OPEN");
    expect(
      await prisma.cash_shifts.count({ where: { restaurant_id: owner.restaurantId, status: "OPEN" } }),
    ).toBe(1);
    const active = await current(cashier.token);
    expect(active.status).toBe(200);
    expect(active.body.shift).toMatchObject({
      status: "OPEN",
      opening_cents: 12000,
      expected_cash_cents: 12000,
    });
  });

  it("contabiliza dinheiro líquido de troco, cartão e movimentos e apura a diferença", async () => {
    const f = await menuFixture();
    const cashier = await categoryToken(f.restaurantId, "CASHIER");
    const tabId = await orderTab(f, 2);
    const opened = await open(cashier.token, 10000);
    expect(opened.status).toBe(201);
    const shiftId = opened.body.shift.id;

    const cashInput = { ...paymentBody("CASH", 2500), received_cents: 3000 };
    const cash = await pay(cashier.token, tabId, cashInput);
    expect(cash.status).toBe(201);
    expect(cash.body.payment.change_cents).toBe(500);
    const replay = await pay(cashier.token, tabId, cashInput);
    expect(replay.status).toBe(200);
    expect(replay.body.payment.id).toBe(cash.body.payment.id);
    expect((await current(cashier.token)).body.shift.expected_cash_cents).toBe(12500);

    const credit = await pay(cashier.token, tabId, paymentBody("CREDIT", 1200));
    expect(credit.status).toBe(201);
    const beforeMovements = await current(cashier.token);
    expect(beforeMovements.body.shift).toMatchObject({
      expected_cash_cents: 12500,
      totals_by_method: { CASH: 2500, CREDIT: 1200 },
    });
    expect(await prisma.payments.count({ where: { cash_shift_id: shiftId } })).toBe(2);

    const withdrawal = await movement(cashier.token, shiftId, "SANGRIA", 5000);
    expect(withdrawal.status).toBe(201);
    expect(withdrawal.body.shift.expected_cash_cents).toBe(7500);
    const deposit = await movement(cashier.token, shiftId, "SUPRIMENTO", 1500);
    expect(deposit.status).toBe(201);
    expect(deposit.body.shift.expected_cash_cents).toBe(9000);

    const closed = await close(cashier.token, shiftId, 8900);
    expect(closed.status).toBe(200);
    expect(closed.body.shift).toMatchObject({
      status: "CLOSED",
      expected_cash_cents: 9000,
      counted_cash_cents: 8900,
      difference_cents: -100,
      totals_by_method: { CASH: 2500, CREDIT: 1200 },
      movements: [
        { type: "SANGRIA", amount_cents: 5000 },
        { type: "SUPRIMENTO", amount_cents: 1500 },
      ],
    });
    expect((await current(cashier.token)).body).toEqual({ shift: null });
    expect((await open(cashier.token, 0)).status).toBe(201);
  });

  it.each(["OPEN", "CLOSED"] as const)("aplica o estorno ao caixa vinculado no estado %s", async (status) => {
    const f = await menuFixture();
    const cashier = await categoryToken(f.restaurantId, "CASHIER");
    const manager = await categoryToken(f.restaurantId, "MANAGER");
    const tabId = await orderTab(f);
    const cashierShift = await open(cashier.token, 1000);
    const managerShift = await open(manager.token, 2000);
    expect([cashierShift.status, managerShift.status]).toEqual([201, 201]);
    const shiftId = cashierShift.body.shift.id;

    const paid = await pay(cashier.token, tabId, paymentBody("CASH", 700));
    expect(paid.status).toBe(201);
    if (status === "CLOSED") {
      const closed = await close(cashier.token, shiftId, 1650);
      expect(closed.status).toBe(200);
      expect(closed.body.shift.difference_cents).toBe(-50);
    }
    const refunded = await refund(manager.token, tabId, paid.body.payment.id);
    expect(refunded.status).toBe(200);

    const shift = (await detail(cashier.token, shiftId)).body.shift;
    expect(shift).toMatchObject({
      status,
      expected_cash_cents: 1000,
      counted_cash_cents: status === "CLOSED" ? 1650 : null,
      difference_cents: status === "CLOSED" ? 650 : null,
    });
    expect(shift.totals_by_method.CASH ?? 0).toBe(0);
    expect((await current(manager.token)).body.shift.expected_cash_cents).toBe(2000);
    expect(await prisma.payments.findUniqueOrThrow({ where: { id: paid.body.payment.id } })).toMatchObject({
      cash_shift_id: shiftId,
      status: "REFUNDED",
    });
  });

  it("rejeita sangria e estorno sem saldo de gaveta sem alterar os registros", async () => {
    const f = await menuFixture();
    const tabId = await orderTab(f);
    const opened = await open(f.token, 1000);
    expect(opened.status).toBe(201);
    const shiftId = opened.body.shift.id;
    const paid = await pay(f.token, tabId, paymentBody("CASH", 700));
    expect(paid.status).toBe(201);

    const excessive = await movement(f.token, shiftId, "SANGRIA", 1701);
    expect([excessive.status, excessive.body.code]).toEqual([409, "CASH_SHIFT_INSUFFICIENT_CASH"]);
    expect(await prisma.cash_movements.count({ where: { cash_shift_id: shiftId } })).toBe(0);
    expect((await current(f.token)).body.shift.expected_cash_cents).toBe(1700);

    const withdrawal = await movement(f.token, shiftId, "SANGRIA", 1100);
    expect(withdrawal.status).toBe(201);
    expect(withdrawal.body.shift.expected_cash_cents).toBe(600);
    const paymentId = paid.body.payment.id;
    const rejected = await refund(f.token, tabId, paymentId);
    expect([rejected.status, rejected.body.code]).toEqual([409, "CASH_SHIFT_INSUFFICIENT_CASH"]);
    expect(await prisma.payments.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({
      status: "APPROVED",
      refunded_at: null,
    });
    expect(await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } })).toMatchObject({
      paid_cents: 700,
      version: paid.body.tab.version,
    });
    expect((await current(f.token)).body.shift.expected_cash_cents).toBe(600);
    expect(await prisma.cash_movements.count({ where: { cash_shift_id: shiftId } })).toBe(1);
  });

  it("continua recebendo sem turno aberto e não usa o caixa de outro operador", async () => {
    const f = await menuFixture();
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const tabId = await orderTab(f);
    expect((await open(f.token, 5000)).status).toBe(201);

    const paid = await pay(waiter.token, tabId, paymentBody("CASH", 700));
    expect(paid.status).toBe(201);
    expect(await prisma.payments.findUniqueOrThrow({ where: { id: paid.body.payment.id } })).toMatchObject({
      cash_shift_id: null,
    });
    expect((await current(f.token)).body.shift.expected_cash_cents).toBe(5000);
  });
});

describe("permissões do turno", () => {
  it("nega todos os pontos de entrada ao WAITER", async () => {
    const owner = await ownerOf("turno-garcom");
    const waiter = await categoryToken(owner.restaurantId, "WAITER");
    const shiftId = randomUUID();
    const responses = await Promise.all([
      open(waiter.token, 1000),
      current(waiter.token),
      list(waiter.token),
      detail(waiter.token, shiftId),
      movement(waiter.token, shiftId, "SUPRIMENTO", 50),
      close(waiter.token, shiftId, 1000),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it("restringe CASHIER ao próprio turno e OWNER/MANAGER ao próprio restaurante", async () => {
    const owner = await ownerOf("turno-a");
    const outsider = await ownerOf("turno-b");
    const cashier = await categoryToken(owner.restaurantId, "CASHIER");
    const colleague = await categoryToken(owner.restaurantId, "CASHIER");
    const manager = await categoryToken(owner.restaurantId, "MANAGER");
    const results = await Promise.all([
      open(cashier.token, 1000),
      open(colleague.token, 2000),
      open(outsider.token, 3000),
    ]);
    expect(results.map(({ status }) => status)).toEqual([201, 201, 201]);
    const [ownShift, colleagueShift, foreignShift] = results.map(({ body }) => body.shift);

    const cashierList = await list(cashier.token);
    expect(cashierList.status).toBe(200);
    expect(cashierList.body.shifts).toMatchObject([{ id: ownShift.id }]);
    expect((await current(cashier.token)).body.shift.id).toBe(ownShift.id);
    expect((await detail(cashier.token, ownShift.id)).status).toBe(200);
    expect((await detail(manager.token, colleagueShift.id)).status).toBe(200);
    const ownerList = await list(owner.token);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.shifts.map((row: { id: string }) => row.id).sort()).toEqual(
      [ownShift.id, colleagueShift.id].sort(),
    );

    const denied = await Promise.all([
      detail(cashier.token, colleagueShift.id),
      movement(cashier.token, colleagueShift.id, "SUPRIMENTO", 100),
      close(cashier.token, colleagueShift.id, 2000),
      detail(owner.token, foreignShift.id),
      movement(owner.token, foreignShift.id, "SUPRIMENTO", 100),
      close(manager.token, foreignShift.id, 3000),
    ]);
    expect(denied.map(({ status }) => status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(await prisma.cash_movements.count()).toBe(0);
    expect(await prisma.cash_shifts.count({ where: { status: "OPEN" } })).toBe(3);
  });
});
