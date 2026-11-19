import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./helpers/app.ts";
import { auth } from "./helpers/auth.ts";
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
