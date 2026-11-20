import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersRepository } from "../src/modules/orders/orders.repository.ts";
import type { ISessionsService } from "../src/modules/sessions/sessions.interfaces.ts";
import { container } from "../src/shared/container/container.ts";
import type { INotifier } from "../src/shared/realtime/notifier.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createTable } from "./helpers/factories.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const tabsPath = "/api/v1/tabs";
const tabPath = (id: string) => `${tabsPath}/${id}`;
const openTable = (token: string, tableId: string) =>
  api().post(tabsPath).set(auth(token)).send({ kind: "TABLE", table_id: tableId });
const openCounter = (token: string, label: string) =>
  api().post(tabsPath).set(auth(token)).send({ kind: "COUNTER", label });
const activeSession = (tableId: string) =>
  prisma.table_sessions.findFirstOrThrow({ where: { table_id: tableId, status: "ACTIVE" } });
const tabForSession = (id: string) => prisma.tabs.findFirstOrThrow({ where: { sessions: { some: { id } } } });
const scan = (code: string) => api().post(`/api/v1/public/tables/${code}/scan`);
const nfcOrder = (
  deviceToken: string,
  submission: ReturnType<Awaited<ReturnType<typeof menuFixture>>["submission"]>,
) => api().post("/api/v1/public/orders").set("X-Table-Token", deviceToken).send(submission);
const posOrder = (token: string, body: object) => api().post("/api/v1/orders").set(auth(token)).send(body);

function posBody(fixture: Awaited<ReturnType<typeof menuFixture>>, quantity = 1) {
  const body = fixture.submission(quantity);
  return { ...body, items: body.items.map(({ selections, ...item }) => ({ ...item, options: selections })) };
}

describe("abertura e consulta de comandas", () => {
  it("só abre uma comanda por mesa mesmo se dois operadores pedirem ao mesmo tempo", async () => {
    const owner = await ownerOf("comandas-mesa");
    const table = await createTable(owner.restaurantId);
    const results = await Promise.all([openTable(owner.token, table.id), openTable(owner.token, table.id)]);

    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(results.find(({ status }) => status === 201)?.body.tab).toMatchObject({
      kind: "TABLE",
      table_id: table.id,
      number: 1,
      status: "OPEN",
    });
    expect(results.find(({ status }) => status === 409)?.body.code).toBe("TAB_ALREADY_OPEN");
    expect(await prisma.tabs.count({ where: { restaurant_id: owner.restaurantId } })).toBe(1);
  });

  it("numera comandas simultâneas de balcão e permite editar e consultar uma delas", async () => {
    const { token } = await ownerOf("comandas-balcao");
    const results = await Promise.all([openCounter(token, "Maria"), openCounter(token, "João")]);
    expect(results.map(({ status }) => status)).toEqual([201, 201]);
    expect(results.map(({ body }) => body.tab.number).sort()).toEqual([1, 2]);

    const tab = results[0]?.body.tab;
    const updated = await api()
      .patch(tabPath(tab.id))
      .set(auth(token))
      .send({ expected_version: tab.version, label: "Maria e João", guests_count: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body.tab).toMatchObject({
      id: tab.id,
      kind: "COUNTER",
      label: "Maria e João",
      guests_count: 2,
    });
    expect((await api().get(tabPath(tab.id)).set(auth(token))).body.tab.id).toBe(tab.id);
    const listed = await api().get(tabsPath).set(auth(token)).query({ kind: "COUNTER", status: "OPEN" });
    expect(listed.status).toBe(200);
    expect(listed.body.tabs).toHaveLength(2);
  });
});

describe("pedidos e total da comanda", () => {
  it("exige exatamente uma comanda ou mesa e impede a cozinha de lançar pedido", async () => {
    const fixture = await menuFixture();
    const kitchen = await categoryToken(fixture.restaurantId, "KITCHEN");
    const body = posBody(fixture);

    expect((await posOrder(fixture.token, body)).status).toBe(400);
    expect(
      (await posOrder(fixture.token, { ...body, table_id: fixture.table.id, tab_id: randomUUID() })).status,
    ).toBe(400);
    expect((await posOrder(kitchen.token, { ...body, table_id: fixture.table.id })).status).toBe(403);
    expect(await prisma.orders.count()).toBe(0);
    expect(await prisma.tabs.count()).toBe(0);
  });

  it("o scan sozinho não abre comanda e o primeiro pedido NFC vincula a sessão", async () => {
    const fixture = await menuFixture();
    const session = await activeSession(fixture.table.id);
    expect(session.tab_id).toBeNull();
    expect(await prisma.tabs.count()).toBe(0);

    const created = await nfcOrder(fixture.deviceToken, fixture.submission());
    expect(created.status).toBe(201);
    const order = await prisma.orders.findUniqueOrThrow({ where: { id: created.body.order.id } });
    expect(await activeSession(fixture.table.id)).toMatchObject({ id: session.id, tab_id: order.tab_id });
    expect(await prisma.tabs.findUniqueOrThrow({ where: { id: order.tab_id } })).toMatchObject({
      kind: "TABLE",
      table_id: fixture.table.id,
      subtotal_cents: 3000,
      service_fee_cents: 300,
      total_cents: 3300,
    });
  });

  it("CASHIER vende no balcão com NFC desativado, imprime uma vez e recupera retry concorrente", async () => {
    const fixture = await menuFixture();
    const cashier = await categoryToken(fixture.restaurantId, "CASHIER");
    const disabled = await api()
      .patch("/api/v1/ordering-settings")
      .set(auth(fixture.token))
      .send({ expected_version: 2, customer_ordering_enabled: false });
    expect(disabled.status).toBe(200);
    await prisma.print_destinations.create({
      data: {
        restaurant_id: fixture.restaurantId,
        destination: "KITCHEN",
        enabled: true,
        credential_hash: randomUUID(),
      },
    });
    const opened = await openCounter(cashier.token, "Balcão 1");
    expect(opened.status).toBe(201);
    const submission = { ...posBody(fixture, 2), tab_id: opened.body.tab.id };
    const results = await Promise.all([
      posOrder(cashier.token, submission),
      posOrder(cashier.token, submission),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 201]);

    const created = results.find(({ status }) => status === 201)?.body;
    expect(results.find(({ status }) => status === 200)?.body).toMatchObject({
      order: { id: created.order.id },
      replayed: true,
    });
    expect(created.tab).toMatchObject({ subtotal_cents: 6000, service_fee_cents: 600, total_cents: 6600 });
    expect(await prisma.orders.findUniqueOrThrow({ where: { id: created.order.id } })).toMatchObject({
      source: "POS",
      fulfillment_type: "COUNTER",
      tab_id: opened.body.tab.id,
      submitted_by_user_id: cashier.user.id,
    });
    expect(await prisma.order_items.findFirstOrThrow()).toMatchObject({
      category_id_snapshot: fixture.category.id,
      category_name_snapshot: "Lanches",
    });
    expect(await prisma.order_events.findFirstOrThrow()).toMatchObject({
      action: "CREATED",
      actor_type: "USER",
      actor_category_snapshot: "CASHIER",
    });
    expect(
      await prisma.print_jobs.count({ where: { order_id: created.order.id, source_event: "ORDER_CREATED" } }),
    ).toBe(1);

    const conflict = await posOrder(cashier.token, {
      ...submission,
      items: submission.items.map((item) => ({ ...item, quantity: 3 })),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await prisma.orders.count()).toBe(1);
  });

  it("recalcula cancelamento parcial e bloqueia a alteração de uma comanda fechada", async () => {
    const fixture = await menuFixture();
    const created = await posOrder(fixture.token, { ...posBody(fixture, 2), table_id: fixture.table.id });
    expect(created.status).toBe(201);
    const { order, tab } = created.body;

    const cancelOne = (version: number) =>
      api()
        .post(`/api/v1/orders/${order.id}/transitions`)
        .set(auth(fixture.token))
        .send({
          expected_version: version,
          operations: [
            {
              item_id: order.items[0].id,
              from_stage: "PENDING",
              to_stage: "CANCELLED",
              quantity: 1,
              reason: "Cliente desistiu",
            },
          ],
        });
    expect((await cancelOne(1)).status).toBe(200);
    expect(await prisma.tabs.findUniqueOrThrow({ where: { id: tab.id } })).toMatchObject({
      subtotal_cents: 3000,
      service_fee_cents: 300,
      total_cents: 3300,
    });
    await prisma.tabs.update({
      where: { id: tab.id },
      data: { status: "CLOSED", closed_at: new Date(), business_date: new Date(), paid_cents: 3300 },
    });
    const blocked = await cancelOne(2);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("TAB_NOT_OPEN");
    expect(await prisma.order_items.findFirstOrThrow()).toMatchObject({
      cancelled_quantity: 1,
      pending_quantity: 1,
    });
  });
});

describe("sessões, transferência e junção", () => {
  it("expira a sessão com consumo e vincula o novo scan à mesma comanda", async () => {
    const fixture = await menuFixture();
    expect((await nfcOrder(fixture.deviceToken, fixture.submission())).status).toBe(201);
    const session = await activeSession(fixture.table.id);
    expect(session.tab_id).toEqual(expect.any(String));
    const close = await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(fixture.token));
    expect(close.status).toBe(409);
    expect(close.body.code).toBe("TAB_HAS_UNPAID_BALANCE");

    const deactivate = await api()
      .patch(`/api/v1/tables/${fixture.table.id}`)
      .set(auth(fixture.token))
      .send({ active: false });
    expect(deactivate.status).toBe(409);
    expect(deactivate.body.code).toBe("TABLE_HAS_OPEN_TAB");

    await prisma.table_sessions.update({
      where: { id: session.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect(await container.resolve<ISessionsService>("SessionsService").expireDue()).toBe(1);
    expect(await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      status: "CLOSED",
      closed_reason: "TIMEOUT",
    });
    expect(await tabForSession(session.id)).toMatchObject({
      status: "OPEN",
    });
    expect((await scan(fixture.table.public_code)).status).toBe(201);
    const reopened = await activeSession(fixture.table.id);
    expect(reopened.id).not.toBe(session.id);
    expect(reopened.tab_id).toBe(session.tab_id);
    expect(await prisma.tabs.count()).toBe(1);
  });

  it("junta os pedidos e transfere apenas a sessão da mesa principal", async () => {
    const fixture = await menuFixture();
    const secondary = await createTable(fixture.restaurantId, "Secundária");
    const nextTable = await createTable(fixture.restaurantId, "Destino");
    const secondaryScan = await scan(secondary.public_code);
    expect(secondaryScan.status).toBe(201);

    const primaryOrder = await nfcOrder(fixture.deviceToken, fixture.submission());
    const secondaryOrder = await nfcOrder(secondaryScan.body.token, fixture.submission());
    expect([primaryOrder.status, secondaryOrder.status]).toEqual([201, 201]);
    const primarySession = await activeSession(fixture.table.id);
    const secondarySession = await activeSession(secondary.id);
    const [target, source] = await Promise.all([
      tabForSession(primarySession.id),
      tabForSession(secondarySession.id),
    ]);

    const joined = await api()
      .post(`${tabPath(target.id)}/merge`)
      .set(auth(fixture.token))
      .send({ source_tab_id: source.id, expected_version: target.version });
    expect(joined.status).toBe(200);
    expect(joined.body.tab).toMatchObject({ id: target.id, total_cents: 6600 });
    expect(await prisma.tabs.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({
      status: "CANCELLED",
    });
    expect(await prisma.orders.count({ where: { tab_id: target.id } })).toBe(2);
    expect((await activeSession(secondary.id)).tab_id).toBe(target.id);

    const transferPath = `${tabPath(target.id)}/transfer-table`;
    const stale = await api()
      .post(transferPath)
      .set(auth(fixture.token))
      .send({ target_table_id: nextTable.id, expected_version: target.version });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    const transfer = await api()
      .post(transferPath)
      .set(auth(fixture.token))
      .send({ target_table_id: nextTable.id, expected_version: joined.body.tab.version });
    expect(transfer.status).toBe(200);
    expect(transfer.body.tab).toMatchObject({ id: target.id, table_id: nextTable.id });
    expect(await activeSession(nextTable.id)).toMatchObject({ id: primarySession.id, tab_id: target.id });
    expect(await activeSession(secondary.id)).toMatchObject({ id: secondarySession.id, tab_id: target.id });

    const another = await nfcOrder(secondaryScan.body.token, fixture.submission());
    expect(another.status).toBe(201);
    expect(await prisma.orders.count({ where: { tab_id: target.id } })).toBe(3);
    expect(await prisma.tabs.count()).toBe(2);
  });
});

describe("isolamento e notificações", () => {
  it("oculta comandas e mesas de outro restaurante em todos os pontos de entrada", async () => {
    const a = await menuFixture();
    const b = await ownerOf("outra-comanda");
    const foreignTable = await createTable(b.restaurantId);
    const [own, foreign] = await Promise.all([
      openCounter(a.token, "A"),
      openTable(b.token, foreignTable.id),
    ]);
    expect([own.status, foreign.status]).toEqual([201, 201]);
    const ownTab = own.body.tab;
    const foreignTab = foreign.body.tab;
    const responses = [
      await openTable(a.token, foreignTable.id),
      await api().get(tabPath(foreignTab.id)).set(auth(a.token)),
      await api()
        .patch(tabPath(foreignTab.id))
        .set(auth(a.token))
        .send({ label: "Invasão", expected_version: foreignTab.version }),
      await api()
        .post(`${tabPath(foreignTab.id)}/transfer-table`)
        .set(auth(a.token))
        .send({ target_table_id: a.table.id, expected_version: foreignTab.version }),
      await api()
        .post(`${tabPath(ownTab.id)}/merge`)
        .set(auth(a.token))
        .send({ source_tab_id: foreignTab.id, expected_version: ownTab.version }),
      await posOrder(a.token, { ...posBody(a), table_id: foreignTable.id }),
      await posOrder(a.token, { ...posBody(a), tab_id: foreignTab.id }),
    ];
    expect(responses.map(({ status }) => status)).toEqual(Array(7).fill(404));

    const list = await api().get(tabsPath).set(auth(a.token));
    expect(list.status).toBe(200);
    expect(list.body.tabs).toMatchObject([{ id: ownTab.id }]);
    expect(await prisma.orders.count()).toBe(0);
  });

  it("publica a comanda confirmada e não emite eventos de uma transação revertida", async () => {
    const fixture = await menuFixture();
    const bootstrap = await openCounter(fixture.token, "Balcão");
    expect(bootstrap.status).toBe(201);
    const calls = vi.spyOn(container.resolve<INotifier>("Notifier"), "toPos");
    const write = vi
      .spyOn(OrdersRepository.prototype, "create")
      .mockRejectedValueOnce(new Error("Falha simulada"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const submission = { ...posBody(fixture), table_id: fixture.table.id };

    expect((await posOrder(fixture.token, submission)).status).toBe(500);
    expect(write).toHaveBeenCalledOnce();
    expect(await prisma.tabs.count()).toBe(1);
    expect(await prisma.orders.count()).toBe(0);
    expect(calls).not.toHaveBeenCalled();

    const created = await posOrder(fixture.token, submission);
    expect(created.status).toBe(201);
    expect(calls).toHaveBeenCalledWith(
      fixture.restaurantId,
      "tab:opened",
      expect.objectContaining({
        tab_id: created.body.tab.id,
        table_id: fixture.table.id,
      }),
    );
  });
});
