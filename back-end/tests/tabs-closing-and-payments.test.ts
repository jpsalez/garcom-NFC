import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { payment_method } from "../generated/prisma/enums.ts";
import type { ISessionsService } from "../src/modules/sessions/sessions.interfaces.ts";
import { PaymentsRepository } from "../src/modules/payments/payments.repository.ts";
import { container } from "../src/shared/container/container.ts";
import type { INotifier } from "../src/shared/realtime/notifier.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

type MenuFixture = Awaited<ReturnType<typeof menuFixture>>;
const tabPath = (id: string) => `/api/v1/tabs/${id}`;
const readTab = (token: string, id: string) => api().get(tabPath(id)).set(auth(token));
const postToTab = (token: string, id: string, path: string, body: object) =>
  api()
    .post(`${tabPath(id)}/${path}`)
    .set(auth(token))
    .send(body);
const paymentBody = (amount_cents: number, method: payment_method = "PIX") => ({
  idempotency_key: randomUUID(),
  provider: "MANUAL",
  method,
  amount_cents,
});
const discount = (value: number) => ({
  type: "DISCOUNT",
  mode: "FIXED_CENTS",
  value,
  reason: "Cortesia da casa",
});
const waive = { waived: true, reason: "Cliente pediu remoção da taxa" };
const refund = { reason: "Pagamento em duplicidade" };
const deviceAuth = (token: string) => ({ "X-Table-Token": token });

async function submitOrder(fixture: MenuFixture, quantity = 1, deviceToken = fixture.deviceToken) {
  const response = await api()
    .post("/api/v1/public/orders")
    .set(deviceAuth(deviceToken))
    .send(fixture.submission(quantity));
  expect(response.status).toBe(201);
  const {
    items: [item],
    ...order
  } = await prisma.orders.findUniqueOrThrow({
    where: { id: response.body.order.id },
    include: { items: true },
  });
  if (!item) throw new Error("Pedido da fixture sem item");
  return { ...order, item };
}

const moveItems = (
  token: string,
  order: Awaited<ReturnType<typeof submitOrder>>,
  to_stage: "DELIVERED" | "CANCELLED",
  quantity = order.item.quantity,
) =>
  api()
    .post(`/api/v1/orders/${order.id}/transitions`)
    .set(auth(token))
    .send({
      expected_version: order.version,
      operations: [
        {
          item_id: order.item.id,
          from_stage: "PENDING",
          to_stage,
          quantity,
          ...(to_stage === "CANCELLED" ? { reason: "Cliente desistiu" } : {}),
        },
      ],
    });

function requestsFrom(deviceToken: string) {
  return api().post("/api/v1/public/tab/payment-requests").set(deviceAuth(deviceToken));
}

describe("pagamento manual e fechamento", () => {
  it("divide entre uma pessoa por itens, outra por valor e outra em dinheiro com troco", async () => {
    const f = await menuFixture();
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const single = await submitOrder(f);
    const shared = await submitOrder(f, 3);
    const { tab_id: tabId } = single;
    const session = await prisma.table_sessions.findFirstOrThrow({ where: { tab_id: tabId } });

    const call = await api()
      .post("/api/v1/public/calls")
      .set(deviceAuth(f.deviceToken))
      .send({ type: "BILL" });
    expect(call.status).toBe(201);
    const request = await requestsFrom(f.deviceToken).send({
      preferred_method: "PIX",
      mode: "AMOUNT",
      amount_cents: 2000,
    });
    expect(request.status).toBe(201);
    expect((await moveItems(f.token, single, "DELIVERED")).status).toBe(200);
    expect((await moveItems(f.token, shared, "DELIVERED")).status).toBe(200);

    const itemPayment = await postToTab(waiter.token, tabId, "payments", {
      ...paymentBody(6600, "CREDIT"),
      include_service_fee: true,
      allocations: [
        { order_item_id: single.item.id, covered_cents: 3000, covered_units_bps: 10000 },
        { order_item_id: shared.item.id, covered_cents: 3000, covered_units_bps: 3333 },
      ],
    });
    expect(itemPayment.status).toBe(201);
    expect(itemPayment.body.tab).toMatchObject({
      total_cents: 13200,
      paid_cents: 6600,
      remaining_cents: 6600,
    });
    expect(
      await prisma.payment_allocations.findMany({ where: { payment_id: itemPayment.body.payment.id } }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ order_item_id: single.item.id, covered_cents: 3000 }),
        expect.objectContaining({
          order_item_id: shared.item.id,
          covered_cents: 3000,
          covered_units_bps: 3333,
        }),
      ]),
    );

    const freePayment = await postToTab(waiter.token, tabId, "payments", paymentBody(2500));
    expect(freePayment.status).toBe(201);
    expect(freePayment.body.tab.remaining_cents).toBe(4100);
    const cashPayment = await postToTab(waiter.token, tabId, "payments", {
      ...paymentBody(4100, "CASH"),
      received_cents: 5000,
    });
    expect(cashPayment.status).toBe(201);
    expect(cashPayment.body.payment).toMatchObject({
      amount_cents: 4100,
      received_cents: 5000,
      change_cents: 900,
    });
    expect(cashPayment.body.tab).toMatchObject({ paid_cents: 13200, remaining_cents: 0 });

    const closed = await postToTab(waiter.token, tabId, "close", {
      expected_version: cashPayment.body.tab.version,
    });
    expect(closed.status).toBe(200);
    expect(closed.body.tab).toMatchObject({ status: "CLOSED", remaining_cents: 0 });
    expect(await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      status: "CLOSED",
      closed_by: waiter.user.id,
    });
    expect(await prisma.session_tokens.count({ where: { session_id: session.id, revoked_at: null } })).toBe(
      0,
    );
    expect(await prisma.calls.findUniqueOrThrow({ where: { id: call.body.id } })).toMatchObject({
      status: "CANCELLED",
    });
    expect(
      await prisma.payment_requests.findUniqueOrThrow({ where: { id: request.body.payment_request.id } }),
    ).toMatchObject({ status: "CANCELLED" });
  });

  it("apresenta pré-conta e fecha automaticamente ao quitar sem pendências", async () => {
    const f = await menuFixture();
    const order = await submitOrder(f);
    expect((await moveItems(f.token, order, "DELIVERED")).status).toBe(200);
    const { tab_id: tabId } = order;

    const preview = await api()
      .post(`${tabPath(tabId)}/pre-bill`)
      .set(auth(f.token))
      .query({ split_by: 7 });
    expect(preview.status).toBe(200);
    expect(preview.body.tab).toMatchObject({ status: "CLOSING", remaining_cents: 3300 });
    expect(preview.body.equal_split_preview).toEqual([471, 471, 471, 471, 471, 471, 474]);

    const events = vi.spyOn(container.resolve<INotifier>("Notifier"), "toPos");
    const closed = await postToTab(f.token, tabId, "payments", { ...paymentBody(3300), auto_close: true });
    expect(closed.status).toBe(201);
    expect(closed.body).toMatchObject({ auto_closed: true, tab: { status: "CLOSED", remaining_cents: 0 } });
    expect(events).toHaveBeenCalledWith(
      f.restaurantId,
      "tab:closed",
      expect.objectContaining({ tab_id: tabId }),
    );
  });

  it("não fecha automaticamente nem manualmente enquanto a cozinha tem itens pendentes", async () => {
    const f = await menuFixture();
    const { tab_id: tabId } = await submitOrder(f);
    const payment = await postToTab(f.token, tabId, "payments", { ...paymentBody(3300), auto_close: true });

    expect(payment.status).toBe(201);
    expect(payment.body).toMatchObject({ auto_closed: false, tab: { status: "OPEN", remaining_cents: 0 } });
    const close = await postToTab(f.token, tabId, "close", { expected_version: payment.body.tab.version });
    expect(close.status).toBe(409);
    expect(close.body.code).toBe("TAB_HAS_PENDING_ORDERS");
  });

  it("bloqueia fechar com saldo, alocar acima do item e baixar o total abaixo do que foi pago", async () => {
    const f = await menuFixture();
    const order = await submitOrder(f, 2);
    const { tab_id: tabId } = order;
    const tab = (await readTab(f.token, tabId)).body.tab;

    const unpaid = await postToTab(f.token, tabId, "close", { expected_version: tab.version });
    expect([unpaid.status, unpaid.body.code]).toEqual([409, "TAB_HAS_UNPAID_BALANCE"]);
    const overAllocated = await postToTab(f.token, tabId, "payments", {
      ...paymentBody(6001),
      allocations: [{ order_item_id: order.item.id, covered_cents: 6001 }],
    });
    expect([overAllocated.status, overAllocated.body.code]).toEqual([409, "ALLOCATION_EXCEEDS_ITEM"]);

    const paid = await postToTab(f.token, tabId, "payments", paymentBody(4000));
    expect(paid.status).toBe(201);
    const tooMuch = await postToTab(f.token, tabId, "adjustments", discount(3000));
    const cancelled = await moveItems(f.token, order, "CANCELLED", 1);
    expect([tooMuch.status, tooMuch.body.code]).toEqual([409, "TOTAL_BELOW_PAID"]);
    expect([cancelled.status, cancelled.body.code]).toEqual([409, "TOTAL_BELOW_PAID"]);
    expect((await readTab(f.token, tabId)).body.tab).toMatchObject({ total_cents: 6600, paid_cents: 4000 });
    expect(await prisma.tab_adjustments.count()).toBe(0);
    expect(await prisma.payments.count()).toBe(1);
    expect(await prisma.order_items.findUniqueOrThrow({ where: { id: order.item.id } })).toMatchObject({
      cancelled_quantity: 0,
    });
  });

  it.each([true, false])(
    "bloqueia alocação acima do saldo com include_service_fee=%s",
    async (include_service_fee) => {
      const f = await menuFixture();
      const order = await submitOrder(f);
      const { tab_id: tabId } = order;
      const free = await postToTab(f.token, tabId, "payments", paymentBody(1000));
      expect(free.status).toBe(201);
      expect(free.body.tab.remaining_cents).toBe(2300);

      const allocated = await postToTab(f.token, tabId, "payments", {
        ...paymentBody(2300),
        include_service_fee,
        allocations: [{ order_item_id: order.item.id, covered_cents: 3000 }],
      });
      expect([allocated.status, allocated.body.code]).toEqual([409, "TOTAL_BELOW_PAID"]);
      expect(await prisma.payments.count({ where: { tab_id: tabId } })).toBe(1);
      expect(await prisma.payment_allocations.count()).toBe(0);
    },
  );

  it("reaproveita uma cobrança concorrente e rejeita a mesma chave com valor diferente", async () => {
    const f = await menuFixture();
    const { tab_id: tabId } = await submitOrder(f);
    const body = paymentBody(1000);
    const pay = (input: object) => postToTab(f.token, tabId, "payments", input);
    const attempts = await Promise.all([pay(body), pay(body)]);

    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 201]);
    const created = attempts.find(({ status }) => status === 201)?.body;
    expect(attempts.find(({ status }) => status === 200)?.body).toMatchObject({
      replayed: true,
      payment: { id: created.payment.id },
    });
    const conflict = await pay({ ...body, amount_cents: 1100 });
    expect([conflict.status, conflict.body.code]).toEqual([409, "IDEMPOTENCY_CONFLICT"]);
    expect(await prisma.payments.count({ where: { tab_id: tabId } })).toBe(1);
  });
});

describe("permissões e estorno", () => {
  it.each(["WAITER", "CASHIER"] as const)("respeita o limite de autorização de %s", async (category) => {
    const f = await menuFixture();
    const staff = await categoryToken(f.restaurantId, category);
    const { tab_id: tabId } = await submitOrder(f);
    const paid = await postToTab(staff.token, tabId, "payments", paymentBody(500));
    expect(paid.status).toBe(201);

    const forbidden = [
      await postToTab(staff.token, tabId, "adjustments", discount(100)),
      await postToTab(staff.token, tabId, `payments/${paid.body.payment.id}/refund`, refund),
      await postToTab(staff.token, tabId, "cancel", {
        expected_version: paid.body.tab.version,
        reason: "Pedido incorreto",
      }),
    ];
    expect(forbidden.map(({ status }) => status)).toEqual([403, 403, 403]);
    const waived = await postToTab(staff.token, tabId, "service-fee/waive", waive);
    expect(waived.status).toBe(category === "CASHIER" ? 200 : 403);
    if (category === "CASHIER") {
      expect(waived.body.tab).toMatchObject({ service_fee_cents: 0, total_cents: 3000 });
      expect(await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } })).toMatchObject({
        service_fee_waive_reason: waive.reason,
      });
    }
  });

  it.each(["OWNER", "MANAGER"] as const)(
    "permite a %s dar desconto, remover taxa, estornar e cancelar",
    async (role) => {
      const f = await menuFixture();
      const { token } = role === "OWNER" ? f : await categoryToken(f.restaurantId, "MANAGER");
      const { tab_id: tabId } = await submitOrder(f);

      expect((await postToTab(token, tabId, "adjustments", discount(100))).status).toBe(201);
      expect((await postToTab(token, tabId, "service-fee/waive", waive)).status).toBe(200);
      const paid = await postToTab(token, tabId, "payments", paymentBody(500));
      expect(paid.status).toBe(201);
      const activePayment = await postToTab(token, tabId, "cancel", {
        expected_version: paid.body.tab.version,
        reason: "Pedido incorreto",
      });
      expect([activePayment.status, activePayment.body.code]).toEqual([409, "TAB_HAS_APPROVED_PAYMENTS"]);

      const refunded = await postToTab(token, tabId, `payments/${paid.body.payment.id}/refund`, refund);
      expect(refunded.status).toBe(200);
      expect(refunded.body.payment.status).toBe("REFUNDED");
      const cancelled = await postToTab(token, tabId, "cancel", {
        expected_version: refunded.body.tab.version,
        reason: "Pedido incorreto",
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.tab.status).toBe("CANCELLED");
    },
  );

  it("estorna no dia operacional mantendo CLOSED e bloqueia estorno de outro dia", async () => {
    const f = await menuFixture();
    const manager = await categoryToken(f.restaurantId, "MANAGER");
    const order = await submitOrder(f);
    const { tab_id: tabId } = order;
    expect((await moveItems(f.token, order, "DELIVERED")).status).toBe(200);

    const first = await postToTab(f.token, tabId, "payments", paymentBody(1000));
    const second = await postToTab(f.token, tabId, "payments", { ...paymentBody(2300), auto_close: true });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.tab.status).toBe("CLOSED");
    const firstRefund = await postToTab(
      manager.token,
      tabId,
      `payments/${first.body.payment.id}/refund`,
      refund,
    );
    expect(firstRefund.status).toBe(200);
    expect(firstRefund.body.payment.status).toBe("REFUNDED");
    expect(await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } })).toMatchObject({
      status: "CLOSED",
      total_cents: 3300,
      paid_cents: 2300,
      closed_refunded_cents: 1000,
    });

    const previousDay = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await prisma.tabs.update({
      where: { id: tabId },
      data: { business_date: previousDay, closed_at: previousDay },
    });
    const late = await postToTab(manager.token, tabId, `payments/${second.body.payment.id}/refund`, refund);
    expect([late.status, late.body.code]).toEqual([409, "REFUND_WINDOW_EXPIRED"]);
    expect(await prisma.payments.findUniqueOrThrow({ where: { id: second.body.payment.id } })).toMatchObject({
      status: "APPROVED",
    });
  });
});

describe("solicitação pelo NFC", () => {
  it("distingue pedidos por aparelho e converte a seleção de quem pediu em pagamento do garçom", async () => {
    const f = await menuFixture();
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const scan = await api().post(`/api/v1/public/tables/${f.table.public_code}/scan`);
    expect(scan.status).toBe(201);
    const other = scan.body.token;
    const guest = await api()
      .patch("/api/v1/public/table-session/guest")
      .set(deviceAuth(f.deviceToken))
      .send({
        guest_label: "João",
      });
    expect(guest.status).toBe(200);
    expect(guest.body.guest_label).toBe("João");

    const own = await submitOrder(f);
    const shared = await submitOrder(f, 2, other);
    const { tab_id: tabId } = own;
    const view = await api().get("/api/v1/public/tab").set(deviceAuth(f.deviceToken));
    expect(view.status).toBe(200);
    expect(view.body.tab).toMatchObject({ my_subtotal_cents: 3000, my_estimated_total_cents: 3300 });
    expect(view.body.tab.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: own.id, is_mine: true, guest_label: "João" }),
        expect.objectContaining({ id: shared.id, is_mine: false }),
      ]),
    );

    const events = vi.spyOn(container.resolve<INotifier>("Notifier"), "toPos");
    const created = await requestsFrom(f.deviceToken).send({
      mode: "MY_ORDERS",
      preferred_method: "PIX",
      include_service_fee: true,
    });
    expect(created.status).toBe(201);
    const request = created.body.payment_request;
    expect(request).toMatchObject({ payer_label: "João", requested_amount_cents: 3300, status: "OPEN" });
    expect(events).toHaveBeenCalledWith(
      f.restaurantId,
      "payment_request:created",
      expect.objectContaining({
        request_id: request.id,
        tab_id: tabId,
        requested_amount_cents: 3300,
      }),
    );
    const foreignDelete = await api()
      .delete(`/api/v1/public/tab/payment-requests/${request.id}`)
      .set(deviceAuth(other));
    expect([403, 404]).toContain(foreignDelete.status);

    const paid = await postToTab(waiter.token, tabId, "payments", {
      ...paymentBody(3300),
      payment_request_id: request.id,
    });
    expect(paid.status).toBe(201);
    expect(await prisma.payment_requests.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
      status: "CONVERTED",
      payment_id: paid.body.payment.id,
      handled_by_user_id: waiter.user.id,
    });
    expect(
      await prisma.payment_allocations.findMany({ where: { payment_id: paid.body.payment.id } }),
    ).toMatchObject([{ order_item_id: own.item.id, covered_cents: 3000 }]);
    expect(events).toHaveBeenCalledWith(
      f.restaurantId,
      "payment_request:updated",
      expect.objectContaining({
        request_id: request.id,
        tab_id: tabId,
        status: "CONVERTED",
      }),
    );
  });

  it.each(["ITEMS", "MY_ORDERS"] as const)("bloqueia seleção NFC %s acima do saldo", async (mode) => {
    const f = await menuFixture();
    const order = await submitOrder(f);
    const free = await postToTab(f.token, order.tab_id, "payments", paymentBody(1000));
    expect(free.status).toBe(201);
    expect(free.body.tab.remaining_cents).toBe(2300);

    const request = await requestsFrom(f.deviceToken).send({
      preferred_method: "PIX",
      mode,
      include_service_fee: true,
      ...(mode === "ITEMS" ? { items: [{ order_item_id: order.item.id, covered_cents: 3000 }] } : {}),
    });
    expect([request.status, request.body.code]).toEqual([409, "TOTAL_BELOW_PAID"]);
    expect(await prisma.payment_requests.count({ where: { tab_id: order.tab_id } })).toBe(0);
  });

  it("expira solicitações abertas junto com o token sem fechar a comanda", async () => {
    const f = await menuFixture();
    const { tab_id: tabId } = await submitOrder(f);
    const session = await prisma.table_sessions.findFirstOrThrow({ where: { tab_id: tabId } });
    const input = { preferred_method: "PIX", mode: "AMOUNT", amount_cents: 1000 };
    expect((await requestsFrom(f.deviceToken).send(input)).status).toBe(201);
    const duplicate = await requestsFrom(f.deviceToken).send(input);
    expect([201, 409]).toContain(duplicate.status);
    expect(await prisma.payment_requests.count({ where: { tab_id: tabId, status: "OPEN" } })).toBe(1);

    await prisma.table_sessions.update({
      where: { id: session.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect(await container.resolve<ISessionsService>("SessionsService").expireDue()).toBe(1);

    expect(await prisma.payment_requests.count({ where: { tab_id: tabId, status: "OPEN" } })).toBe(0);
    expect(await prisma.payment_requests.count({ where: { tab_id: tabId, status: "EXPIRED" } })).toBe(1);
    expect((await readTab(f.token, tabId)).body.tab.status).toBe("OPEN");
    expect((await api().get("/api/v1/public/tab").set(deviceAuth(f.deviceToken))).status).toBe(401);
  });
});

describe("isolamento e efeitos das transações", () => {
  it("não aplica pagamentos, ajustes ou fechamento à comanda de outro restaurante", async () => {
    const f = await menuFixture();
    const outsider = await ownerOf("dono-externo");
    const { tab_id: tabId } = await submitOrder(f);
    const paid = await postToTab(f.token, tabId, "payments", paymentBody(500));
    expect(paid.status).toBe(201);

    const requests = [
      postToTab(outsider.token, tabId, "payments", paymentBody(300)),
      postToTab(outsider.token, tabId, `payments/${paid.body.payment.id}/refund`, refund),
      postToTab(outsider.token, tabId, "adjustments", discount(100)),
      postToTab(outsider.token, tabId, "service-fee/waive", waive),
      postToTab(outsider.token, tabId, "close", { expected_version: paid.body.tab.version }),
      postToTab(outsider.token, tabId, "cancel", {
        expected_version: paid.body.tab.version,
        reason: "Tentativa externa",
      }),
    ];
    const responses = await Promise.all(requests);
    expect(responses.map(({ status }) => status)).toEqual(Array(requests.length).fill(404));
    expect(await prisma.payments.count({ where: { tab_id: tabId } })).toBe(1);
    expect(await prisma.tab_adjustments.count({ where: { tab_id: tabId } })).toBe(0);
    expect((await readTab(f.token, tabId)).body.tab).toMatchObject({
      status: "OPEN",
      total_cents: 3300,
      paid_cents: 500,
    });
  });

  it("publica o pagamento confirmado e mantém a comanda intacta se a transação falhar", async () => {
    const f = await menuFixture();
    const { tab_id: tabId } = await submitOrder(f);
    const before = (await readTab(f.token, tabId)).body.tab;
    const events = vi.spyOn(container.resolve<INotifier>("Notifier"), "toPos");
    const create = vi
      .spyOn(PaymentsRepository.prototype, "create")
      .mockRejectedValueOnce(new Error("Falha simulada"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const payment = paymentBody(1000);

    expect((await postToTab(f.token, tabId, "payments", payment)).status).toBe(500);
    expect(create).toHaveBeenCalledOnce();
    expect(events).not.toHaveBeenCalled();
    expect(await prisma.payments.count()).toBe(0);
    expect((await readTab(f.token, tabId)).body.tab).toMatchObject({
      version: before.version,
      paid_cents: 0,
    });

    const success = await postToTab(f.token, tabId, "payments", payment);
    expect(success.status).toBe(201);
    expect(events).toHaveBeenCalledWith(
      f.restaurantId,
      "payment:updated",
      expect.objectContaining({
        payment_id: success.body.payment.id,
        tab_id: tabId,
        status: "APPROVED",
        amount_cents: 1000,
      }),
    );
  });
});
