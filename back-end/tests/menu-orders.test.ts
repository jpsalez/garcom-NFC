import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";
import { container } from "../src/shared/container/container.ts";
import type { INotifier } from "../src/shared/realtime/notifier.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("catálogo e permissões", () => {
  it("gerente edita/publica/configura; garçom e cozinha não editam o catálogo", async () => {
    const fixture = await menuFixture();
    for (const category of ["MANAGER", "WAITER", "KITCHEN", "OTHER"] as const) {
      const staff = await categoryToken(fixture.restaurantId, category);
      const response = await api().get("/api/v1/menu/draft").set(auth(staff.token));
      expect(response.status).toBe(category === "MANAGER" ? 200 : 403);
      if (category === "MANAGER") {
        const edited = await api()
          .patch("/api/v1/menu/draft")
          .set(auth(staff.token))
          .send({ expected_draft_version: response.body.draft_version, display_name: "Novo cardápio" });
        expect(edited.status).toBe(200);
        expect(
          (
            await api()
              .post("/api/v1/menu/publications")
              .set(auth(staff.token))
              .send({ expected_draft_version: edited.body.draft_version })
          ).status,
        ).toBe(201);
        expect(
          (
            await api()
              .patch("/api/v1/ordering-settings")
              .set(auth(staff.token))
              .send({ expected_version: 2, customer_ordering_enabled: false })
          ).status,
        ).toBe(200);
      }
    }
  });
  it("consulta publicada não abre atendimento; rascunho alterado não muda publicação", async () => {
    const f = await menuFixture();
    const before = await prisma.table_sessions.count();
    await api()
      .patch(`/api/v1/menu/products/${f.product.id}`)
      .set(auth(f.token))
      .send({ expected_draft_version: (await f.getDraft()).draft_version, name: "Só no rascunho" });
    const response = await api().get(`/api/v1/public/tables/${f.table.public_code}/menu`);
    expect(response.status).toBe(200);
    expect(response.body.content.categories[0].products[0].name).toBe("Hambúrguer");
    expect(await prisma.table_sessions.count()).toBe(before);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect((await api().get("/api/v1/menu/preview")).status).toBe(401);
  });
  it("não sobrescreve edição concorrente nem aceita campos extras", async () => {
    const f = await menuFixture(),
      version = (await f.getDraft()).draft_version;
    const results = await Promise.all(
      ["A", "B"].map((name) =>
        api()
          .patch("/api/v1/menu/draft")
          .set(auth(f.token))
          .send({ expected_draft_version: version, display_name: name }),
      ),
    );
    expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
    expect(
      (
        await api()
          .patch("/api/v1/menu/draft")
          .set(auth(f.token))
          .send({ expected_draft_version: version + 1, restaurant_id: randomUUID() })
      ).status,
    ).toBe(400);
  });
  it("downgrade do gerente invalida o cache de acesso", async () => {
    const f = await menuFixture(),
      manager = await categoryToken(f.restaurantId, "MANAGER");
    expect((await api().get("/api/v1/menu/draft").set(auth(manager.token))).status).toBe(200);
    await api().patch(`/api/v1/staff/${manager.user.id}`).set(auth(f.token)).send({ category: "OTHER" });
    expect((await api().get("/api/v1/menu/draft").set(auth(manager.token))).status).toBe(403);
  });
});
describe("envio e andamento dos pedidos", () => {
  it("a fila aberta da cozinha mantém pedidos de sessões encerradas no restaurante autenticado", async () => {
    const f = await menuFixture();
    const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
    const other = await ownerOf("outro-restaurante");
    const created = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission());
    expect(created.status).toBe(201);
    const session = await prisma.table_sessions.findFirstOrThrow({
      where: { table_id: f.table.id, status: "ACTIVE" },
    });
    await prisma.table_sessions.update({
      where: { id: session.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect((await api().post(`/api/v1/public/tables/${f.table.public_code}/scan`)).status).toBe(201);
    const closed = await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } });
    expect(closed).toMatchObject({ status: "CLOSED", closed_reason: "TIMEOUT" });

    const queue = await api().get("/api/v1/orders?progress=open").set(auth(kitchen.token));
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((order: { id: string }) => order.id)).toEqual([created.body.order.id]);
    const otherQueue = await api().get("/api/v1/orders?progress=open").set(auth(other.token));
    expect(otherQueue.status).toBe(200);
    expect(otherQueue.body.items).toEqual([]);
  });

  it("envios simultâneos com mesma chave criam um pedido e não expõem dados internos", async () => {
    const f = await menuFixture(),
      body = f.submission(2);
    const responses = await Promise.all(
      [1, 2].map(() => api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(body)),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await prisma.orders.count()).toBe(1);
    expect(responses[0]?.body.order.total_cents).toBe(6000);
    expect(responses[0]?.body.order.request_hash).toBeUndefined();
    expect(responses[0]?.body.order.submitted_by_token_id).toBeUndefined();
    expect(
      (
        await api()
          .post("/api/v1/public/orders")
          .set("X-Table-Token", f.deviceToken)
          .send({ ...body, items: [{ ...body.items[0], quantity: 3 }] })
      ).body.code,
    ).toBe("IDEMPOTENCY_CONFLICT");
  });
  it("desabilitar bloqueia pedidos novos mas permite recuperar envio já confirmado", async () => {
    const f = await menuFixture(),
      body = f.submission();
    expect(
      (await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(body)).status,
    ).toBe(201);
    await api()
      .patch("/api/v1/ordering-settings")
      .set(auth(f.token))
      .send({ expected_version: 2, customer_ordering_enabled: false });
    expect(
      (await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(body)).status,
    ).toBe(200);
    expect(
      (await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(f.submission()))
        .body.code,
    ).toBe("CUSTOMER_ORDERING_DISABLED");
  });
  it("nova publicação e esgotamento exigem rever seleção; preço do pedido anterior permanece", async () => {
    const f = await menuFixture();
    const first = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission());
    expect(first.status).toBe(201);
    await api()
      .patch(`/api/v1/menu/variants/${f.variant.id}`)
      .set(auth(f.token))
      .send({ expected_draft_version: (await f.getDraft()).draft_version, price_cents: 5000 });
    const next = await f.publish();
    expect(
      (await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(f.submission()))
        .body.code,
    ).toBe("MENU_REVISION_CHANGED");
    expect(
      (
        await api()
          .patch("/api/v1/menu/availability")
          .set(auth(f.token))
          .send({ kind: "products", id: f.product.id, expected_version: 1, is_available: false })
      ).status,
    ).toBe(200);
    expect(
      (
        await api()
          .post("/api/v1/public/orders")
          .set("X-Table-Token", f.deviceToken)
          .send({ ...f.submission(), publication_id: next })
      ).body.code,
    ).toBe("ITEM_UNAVAILABLE");
    expect((await prisma.orders.findFirstOrThrow()).total_cents).toBe(3000);
  });
  it("mesma mesa não autoriza ler pedido enviado por outro aparelho", async () => {
    const f = await menuFixture();
    const created = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission());
    const another = await api().post(`/api/v1/public/tables/${f.table.public_code}/scan`);
    expect(
      (
        await api()
          .get(`/api/v1/public/orders/${created.body.order.id}`)
          .set("X-Table-Token", another.body.token)
      ).status,
    ).toBe(404);
    expect(
      (await api().get("/api/v1/public/orders").set("X-Table-Token", another.body.token)).body.items,
    ).toEqual([]);
  });
  it("cozinha entrega e garçom cancela parcialmente com auditoria e bloqueio de fechamento", async () => {
    const f = await menuFixture(),
      kitchen = await categoryToken(f.restaurantId, "KITCHEN"),
      waiter = await categoryToken(f.restaurantId, "WAITER");
    const created = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission(2));
    expect(created.status).toBe(201);
    const order = created.body.order;
    const session = await prisma.table_sessions.findFirstOrThrow({
      where: { table_id: f.table.id, status: "ACTIVE" },
    });
    expect((await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(f.token))).body.code).toBe(
      "SESSION_HAS_PENDING_ORDERS",
    );
    const delivered = await api()
      .post(`/api/v1/orders/${order.id}/transitions`)
      .set(auth(kitchen.token))
      .send({
        expected_version: 1,
        operations: [
          { item_id: order.items[0].id, from_stage: "PENDING", to_stage: "DELIVERED", quantity: 1 },
        ],
      });
    expect(delivered.status).toBe(200);
    const cancelled = await api()
      .post(`/api/v1/orders/${order.id}/transitions`)
      .set(auth(waiter.token))
      .send({
        expected_version: 2,
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
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.active_total_cents).toBe(3000);
    expect(cancelled.body.progress.cancelled).toBe(1);
    expect(cancelled.body.progress.is_completed).toBe(true);
    expect((await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(f.token))).status).toBe(200);
    const events = await prisma.order_events.findMany({
      where: { order_id: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(events.map((event) => event.actor_category_snapshot)).toEqual([null, "KITCHEN", "WAITER"]);
  });
  it("expõe o horário do lote pronto mais antigo ainda não entregue somente para a equipe", async () => {
    const f = await menuFixture();
    const created = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", f.deviceToken)
      .send(f.submission(3));
    expect(created.status).toBe(201);
    const { id, items } = created.body.order;
    const staff = auth(f.token);
    let version = 1;

    async function advance(from_stage: string, to_stage: string, quantity = 1) {
      const response = await api()
        .post(`/api/v1/orders/${id}/transitions`)
        .set(staff)
        .send({
          expected_version: version,
          operations: [{ item_id: items[0].id, from_stage, to_stage, quantity }],
        });
      expect(response.status).toBe(200);
      version = response.body.version;
      return response.body;
    }

    expect((await advance("PENDING", "PREPARING")).ready_since).toBeNull();
    await advance("PREPARING", "READY");
    await advance("PENDING", "PREPARING", 2);
    const allReady = await advance("PREPARING", "READY", 2);
    const audit = await api().get(`/api/v1/orders/${id}/events`).set(staff);
    const [first, second] = audit.body.items.filter(
      (event: { to_stage: string }) => event.to_stage === "READY",
    );
    expect(allReady.ready_since).toBe(first.created_at);
    expect(allReady.ready_sequence).toBe(second.sequence);

    const partial = await advance("READY", "DELIVERED");
    expect(partial.ready_since).toBe(second.created_at);
    const queue = await api().get("/api/v1/orders").set(staff);
    expect(queue.body.items).toMatchObject([
      { id, ready_since: second.created_at, ready_sequence: second.sequence },
    ]);
    const detail = await api().get(`/api/v1/orders/${id}`).set(staff);
    expect(detail.body.ready_since).toBe(second.created_at);
    const device = await api().get(`/api/v1/public/orders/${id}`).set("X-Table-Token", f.deviceToken);
    expect(device.body).not.toHaveProperty("ready_since");
    expect(device.body).not.toHaveProperty("ready_sequence");

    const delivered = await advance("READY", "DELIVERED", 2);
    expect(delivered).toMatchObject({ ready_since: null, ready_sequence: null });
  });

  it("lista encerrados pelo horário do encerramento, com paginação e isolamento por restaurante", async () => {
    const f = await menuFixture();
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const other = await ownerOf("historico-outro-restaurante");
    const submit = () =>
      api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(f.submission());
    const [older, newer, open] = [
      (await submit()).body.order,
      (await submit()).body.order,
      (await submit()).body.order,
    ];

    async function close(order: typeof older, to_stage: "DELIVERED" | "CANCELLED") {
      const response = await api()
        .post(`/api/v1/orders/${order.id}/transitions`)
        .set(auth(waiter.token))
        .send({
          expected_version: 1,
          operations: [
            {
              item_id: order.items[0].id,
              from_stage: "PENDING",
              to_stage,
              quantity: 1,
              ...(to_stage === "CANCELLED" ? { reason: "Cliente desistiu" } : {}),
            },
          ],
        });
      expect(response.status).toBe(200);
    }

    expect(Date.parse(older.created_at)).toBeLessThan(Date.parse(newer.created_at));
    await close(newer, "CANCELLED");
    await close(older, "DELIVERED");

    const list = (token: string, cursor?: string) =>
      api().get("/api/v1/orders").set(auth(token)).query({ progress: "closed", limit: 1, cursor });
    const first = await list(waiter.token);
    expect(first.status).toBe(200);
    expect(first.body.items).toMatchObject([{ id: older.id, progress: { is_completed: true } }]);
    expect(first.body.next_cursor).toEqual(expect.any(String));
    const second = await list(waiter.token, first.body.next_cursor);
    expect(second.status).toBe(200);
    expect(second.body.items).toMatchObject([{ id: newer.id, progress: { is_cancelled: true } }]);
    expect(second.body.next_cursor).toBeNull();
    expect((await list(other.token)).body.items).toEqual([]);
    expect((await api().get("/api/v1/orders").set(auth(waiter.token))).body.items).toMatchObject([
      { id: open.id },
    ]);
    expect(
      (await api().get("/api/v1/public/orders?progress=closed").set("X-Table-Token", f.deviceToken)).status,
    ).toBe(400);
  });

  it("dois garçons não movimentam duas vezes a mesma quantidade", async () => {
    const f = await menuFixture(),
      created = await api()
        .post("/api/v1/public/orders")
        .set("X-Table-Token", f.deviceToken)
        .send(f.submission());
    const order = created.body.order;
    const body = {
      expected_version: 1,
      operations: [{ item_id: order.items[0].id, from_stage: "PENDING", to_stage: "READY", quantity: 1 }],
    };
    const results = await Promise.all(
      [1, 2].map(() => api().post(`/api/v1/orders/${order.id}/transitions`).set(auth(f.token)).send(body)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await prisma.order_items.findFirstOrThrow()).ready_quantity).toBe(1);
  });
  it("falha de notificação não desfaz o pedido", async () => {
    const f = await menuFixture();
    const notifier = container.resolve<INotifier>("Notifier"),
      failure = vi.spyOn(notifier, "toOrders").mockImplementation(() => {
        throw new Error("falha simulada");
      });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        (await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(f.submission()))
          .status,
      ).toBe(201);
      expect(await prisma.orders.count()).toBe(1);
    } finally {
      failure.mockRestore();
      log.mockRestore();
    }
  });
});
