import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createTable } from "./helpers/factories.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function enableKitchenPrinting(token: string) {
  const settings = "/api/v1/printing/kitchen";
  const cloud = "/api/v1/printing/cloudprnt";
  const owner = auth(token);
  const issued = await api().post(`${settings}/printer`).set(owner);
  expect(issued.status).toBe(201);
  const printer = {
    Authorization: `Basic ${Buffer.from(`${issued.body.username}:${issued.body.password}`).toString("base64")}`,
  };
  const poll = () => api().post(cloud).set(printer).send({ statusCode: "200 OK" });
  expect((await poll()).status).toBe(200);
  expect((await api().post(`${settings}/test`).set(owner)).status).toBe(200);

  const offer = await poll();
  expect(offer.body.jobReady).toBe(true);
  const jobToken = offer.body.jobToken;
  expect((await api().get(cloud).set(printer).query({ token: jobToken, type: "image/png" })).status).toBe(200);
  expect((await api().delete(cloud).set(printer).query({ token: jobToken, code: "200 OK" })).status).toBe(200);
  expect((await api().patch(settings).set(owner).send({ enabled: true })).status).toBe(200);
}

describe("PDV interno e comanda sequencial (POST /orders e GET /menu/published)", () => {
  it("OWNER, MANAGER e WAITER lançam pedido pelo PDV, abrindo sessão com tab_number sequencial, KDS e print_job", async () => {
    const f = await menuFixture();
    await enableKitchenPrinting(f.token);
    const manager = await categoryToken(f.restaurantId, "MANAGER");
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const kitchen = await categoryToken(f.restaurantId, "KITCHEN");

    const mesa2 = await createTable(f.restaurantId, "Mesa 2");
    const mesa3 = await createTable(f.restaurantId, "Mesa 3");

    const menuRes = await api().get("/api/v1/menu/published").set(auth(waiter.token));
    expect(menuRes.status).toBe(200);
    expect(menuRes.body.publication_id).toBe(f.publicationId);
    expect(menuRes.body.content.categories[0].products[0].id).toBe(f.product.id);

    // f.table já teve tab_number = 1 no scan do menuFixture
    const first = await api()
      .post("/api/v1/orders")
      .set(auth(f.token))
      .send({ ...f.submission(1), table_id: mesa2.id });
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(false);
    expect(first.body.order).toMatchObject({
      source: "POS",
      tab_number: 2,
      table_label: "Mesa 2",
      total_cents: 3000,
    });
    expect(first.body.order.session_id).toBeTruthy();

    const second = await api()
      .post("/api/v1/orders")
      .set(auth(manager.token))
      .send({ ...f.submission(2), table_id: mesa3.id });
    expect(second.status).toBe(201);
    expect(second.body.order.tab_number).toBe(3);

    const third = await api()
      .post("/api/v1/orders")
      .set(auth(waiter.token))
      .send({ ...f.submission(1), table_id: mesa3.id });
    expect(third.status).toBe(201);
    expect(third.body.order.session_id).toBe(second.body.order.session_id);
    expect(third.body.order.tab_number).toBe(3);

    // Entra na fila do KDS
    const queue = await api().get("/api/v1/orders?progress=open").set(auth(kitchen.token));
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((o: { id: string }) => o.id)).toEqual(
      expect.arrayContaining([first.body.order.id, second.body.order.id, third.body.order.id]),
    );

    // Enfileira print_job com tab_number no payload
    const job = await prisma.print_jobs.findFirstOrThrow({ where: { order_id: first.body.order.id } });
    expect(job.payload).toMatchObject({
      order_id: first.body.order.id,
      table_label: "Mesa 2",
      tab_number: 2,
    });

    // Evento CREATED com ator USER
    const createdEvent = await prisma.order_events.findFirstOrThrow({
      where: { order_id: third.body.order.id, action: "CREATED" },
    });
    expect(createdEvent).toMatchObject({
      actor_type: "USER",
      actor_user_id: waiter.user.id,
      actor_role_snapshot: "STAFF",
      actor_category_snapshot: "WAITER",
    });
  });

  it("QR/NFC e PDV na mesma mesa compartilham session_id e tab_number; ao fechar e reabrir, incrementa tab_number", async () => {
    const f = await menuFixture();
    const waiter = await categoryToken(f.restaurantId, "WAITER");

    const ctxBefore = await api().get("/api/v1/public/table-context").set("X-Table-Token", f.deviceToken);
    expect(ctxBefore.status).toBe(200);
    expect(ctxBefore.body.tab_number).toBe(1);

    const qrOrder = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission(1));
    expect(qrOrder.status).toBe(201);
    expect(qrOrder.body.order.tab_number).toBe(1);

    const posOrder = await api()
      .post("/api/v1/orders")
      .set(auth(waiter.token))
      .send({ ...f.submission(1), table_id: f.table.id });
    expect(posOrder.status).toBe(201);
    expect(posOrder.body.order.tab_number).toBe(1);

    const activeSessions = await api().get("/api/v1/sessions?status=ACTIVE").set(auth(f.token));
    expect(activeSessions.status).toBe(200);
    expect(activeSessions.body[0].tab_number).toBe(1);

    // Conclui os dois pedidos para fechar a mesa
    for (const order of [qrOrder.body.order, posOrder.body.order]) {
      const done = await api()
        .post(`/api/v1/orders/${order.id}/transitions`)
        .set(auth(f.token))
        .send({
          expected_version: 1,
          operations: [
            { item_id: order.items[0].id, from_stage: "PENDING", to_stage: "DELIVERED", quantity: 1 },
          ],
        });
      expect(done.status).toBe(200);
    }

    expect((await api().post(`/api/v1/sessions/${posOrder.body.order.session_id}/close`).set(auth(f.token))).status).toBe(200);

    const reopened = await api().post(`/api/v1/tables/${f.table.id}/session`).set(auth(f.token));
    expect(reopened.status).toBe(201);
    expect(reopened.body.tab_number).toBe(2);

    const nextPos = await api()
      .post("/api/v1/orders")
      .set(auth(waiter.token))
      .send({ ...f.submission(1), table_id: f.table.id });
    expect(nextPos.status).toBe(201);
    expect(nextPos.body.order.tab_number).toBe(2);
    expect(nextPos.body.order.session_id).toBe(reopened.body.id);
  });

  it("idempotência: replay 200 sem duplicar pedido nem print_job; conflito 409 ao variar mesa, itens ou ator", async () => {
    const f = await menuFixture();
    await enableKitchenPrinting(f.token);
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const mesa2 = await createTable(f.restaurantId, "Mesa 2");

    const body = { ...f.submission(1), table_id: f.table.id };
    const first = await api().post("/api/v1/orders").set(auth(f.token)).send(body);
    expect(first.status).toBe(201);

    const replay = await api().post("/api/v1/orders").set(auth(f.token)).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect(await prisma.orders.count()).toBe(1);
    expect(await prisma.print_jobs.count()).toBe(1);

    // Chave repetida com mesa diferente
    const diffTable = await api()
      .post("/api/v1/orders")
      .set(auth(f.token))
      .send({ ...body, table_id: mesa2.id });
    expect(diffTable.status).toBe(409);
    expect(diffTable.body.code).toBe("IDEMPOTENCY_CONFLICT");

    // Chave repetida com itens diferentes
    const diffItems = await api()
      .post("/api/v1/orders")
      .set(auth(f.token))
      .send({ ...body, items: [{ ...body.items[0], quantity: 2 }] });
    expect(diffItems.status).toBe(409);
    expect(diffItems.body.code).toBe("IDEMPOTENCY_CONFLICT");

    // Chave repetida com ator diferente
    const diffActor = await api().post("/api/v1/orders").set(auth(waiter.token)).send(body);
    expect(diffActor.status).toBe(409);
    expect(diffActor.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("permissão, isolamento por tenant, mesa inativa e cardápio não publicado", async () => {
    const f = await menuFixture();
    const other = await ownerOf("outro-rest");
    const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
    const staffOther = await categoryToken(f.restaurantId, "OTHER");

    expect((await api().get("/api/v1/menu/published").set(auth(kitchen.token))).status).toBe(403);
    expect((await api().get("/api/v1/menu/published").set(auth(staffOther.token))).status).toBe(403);
    expect(
      (await api().post("/api/v1/orders").set(auth(kitchen.token)).send({ ...f.submission(), table_id: f.table.id }))
        .status,
    ).toBe(403);
    expect(
      (
        await api()
          .post("/api/v1/orders")
          .set(auth(staffOther.token))
          .send({ ...f.submission(), table_id: f.table.id })
      ).status,
    ).toBe(403);

    // Outro restaurante recebe 404 para a mesa de f
    const crossTenant = await api()
      .post("/api/v1/orders")
      .set(auth(other.token))
      .send({ ...f.submission(), table_id: f.table.id });
    expect(crossTenant.status).toBe(404);

    // Outro restaurante sem cardápio publicado recebe 404 MENU_NOT_PUBLISHED
    const unpublished = await api().get("/api/v1/menu/published").set(auth(other.token));
    expect(unpublished.status).toBe(404);
    expect(unpublished.body.code).toBe("MENU_NOT_PUBLISHED");

    // Mesa inativa recebe 409 TABLE_INACTIVE
    const inactiveTable = await createTable(f.restaurantId, "Mesa Inativa");
    await prisma.tables.update({ where: { id: inactiveTable.id }, data: { active: false } });
    const inactiveRes = await api()
      .post("/api/v1/orders")
      .set(auth(f.token))
      .send({ ...f.submission(), table_id: inactiveTable.id });
    expect(inactiveRes.status).toBe(409);
    expect(inactiveRes.body.code).toBe("TABLE_INACTIVE");
  });

  it("PDV funciona mesmo quando customer_ordering_enabled = false", async () => {
    const f = await menuFixture();
    const waiter = await categoryToken(f.restaurantId, "WAITER");

    const disabled = await api()
      .patch("/api/v1/ordering-settings")
      .set(auth(f.token))
      .send({ expected_version: 2, customer_ordering_enabled: false });
    expect(disabled.status).toBe(200);

    // Cliente QR falha
    const qrRes = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission());
    expect(qrRes.status).toBe(409);
    expect(qrRes.body.code).toBe("CUSTOMER_ORDERING_DISABLED");

    // PDV funciona
    const posRes = await api()
      .post("/api/v1/orders")
      .set(auth(waiter.token))
      .send({ ...f.submission(), table_id: f.table.id });
    expect(posRes.status).toBe(201);
    expect(posRes.body.order.source).toBe("POS");
    expect(posRes.body.order.tab_number).toBe(1);
  });

  it("scan também retorna tab_number e mesa sem sessão vencida ganha novo tab_number ao lançar no PDV", async () => {
    const f = await menuFixture();
    const mesa2 = await createTable(f.restaurantId, "Mesa 2");
    const scanRes = await api().post(`/api/v1/public/tables/${mesa2.public_code}/scan`);
    expect(scanRes.status).toBe(201);
    expect(scanRes.body.tab_number).toBe(2);

    // Expira a sessão da mesa 2
    await prisma.table_sessions.updateMany({
      where: { table_id: mesa2.id, status: "ACTIVE" },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const posRes = await api()
      .post("/api/v1/orders")
      .set(auth(f.token))
      .send({ ...f.submission(), table_id: mesa2.id });
    expect(posRes.status).toBe(201);
    expect(posRes.body.order.tab_number).toBe(3);

    const sessions = await prisma.table_sessions.findMany({
      where: { table_id: mesa2.id },
      orderBy: { tab_number: "asc" },
    });
    expect(sessions.map((s) => ({ tab: s.tab_number, status: s.status, reason: s.closed_reason }))).toEqual([
      { tab: 2, status: "CLOSED", reason: "TIMEOUT" },
      { tab: 3, status: "ACTIVE", reason: null },
    ]);
  });
});
