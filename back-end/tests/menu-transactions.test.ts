import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasCapability } from "../src/shared/authorization/capabilities.ts";
import { container } from "../src/shared/container/container.ts";
import type { IRestaurantUnitOfWork } from "../src/shared/transactions/restaurant-unit-of-work.interface.ts";
import { api } from "./helpers/app.ts";
import { auth } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());
describe("autorização e unidade de trabalho", () => {
  it("matriz de capacidades não concede operação a outros STAFF ou SUPER_ADMIN", () => {
    const base = { id: "user", restaurantId: "restaurant" };
    expect(hasCapability({ ...base, role: "STAFF", category: "MANAGER" }, "menu:publish")).toBe(true);
    for (const category of ["WAITER", "KITCHEN"] as const) {
      expect(hasCapability({ ...base, role: "STAFF", category }, "orders:cancel")).toBe(true);
      expect(hasCapability({ ...base, role: "STAFF", category }, "orders:deliver")).toBe(true);
      expect(hasCapability({ ...base, role: "STAFF", category }, "menu:manage")).toBe(false);
    }
    expect(hasCapability({ ...base, role: "STAFF", category: "OTHER" }, "orders:read")).toBe(false);
    expect(hasCapability({ ...base, role: "SUPER_ADMIN", category: null }, "orders:read")).toBe(false);
  });
  it("unidade de trabalho revalida categoria mesmo com contexto antigo", async () => {
    const f = await menuFixture(),
      manager = await categoryToken(f.restaurantId, "MANAGER");
    const stale = {
      id: manager.user.id,
      restaurantId: f.restaurantId,
      role: "STAFF" as const,
      category: "MANAGER" as const,
    };
    await api().patch(`/api/v1/staff/${manager.user.id}`).set(auth(f.token)).send({ category: "OTHER" });
    const unit = container.resolve<IRestaurantUnitOfWork>("RestaurantUnitOfWork");
    await expect(
      unit.run(f.restaurantId, async () => "não deve executar", { actor: stale, capability: "menu:manage" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("envio simultâneo ao fechamento não cria pedido em atendimento já encerrado", async () => {
    const f = await menuFixture();
    const session = await prisma.table_sessions.findFirstOrThrow({
      where: { table_id: f.table.id, status: "ACTIVE" },
    });
    const [send, close] = await Promise.all([
      api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(f.submission()),
      api().post(`/api/v1/sessions/${session.id}/close`).set(auth(f.token)),
    ]);
    if (send.status === 201) {
      expect(close.status).toBe(409);
      expect(close.body.code).toBe("TAB_HAS_UNPAID_BALANCE");
      expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).status).toBe(
        "ACTIVE",
      );
    } else {
      expect(close.status).toBe(200);
      expect(send.status).toBe(401);
      expect(await prisma.orders.count()).toBe(0);
    }
  });
  it("restaurante diferente não consulta nem atualiza pedido", async () => {
    const a = await menuFixture(),
      b = await menuFixture();
    const response = await api()
      .post("/api/v1/public/orders")
      .set("X-Table-Token", b.deviceToken)
      .send(b.submission());
    expect((await api().get(`/api/v1/orders/${response.body.order.id}`).set(auth(a.token))).status).toBe(404);
    expect((await api().get("/api/v1/orders").set(auth(a.token))).body.items).toEqual([]);
  });
  it("retirada e republicação explícita restauram revisão sem reescrever histórico", async () => {
    const f = await menuFixture();
    expect(
      (
        await api()
          .post("/api/v1/menu/unpublish")
          .set(auth(f.token))
          .send({ expected_publication_id: f.publicationId })
      ).status,
    ).toBe(200);
    expect((await api().get(`/api/v1/public/tables/${f.table.public_code}/menu`)).body.code).toBe(
      "MENU_NOT_PUBLISHED",
    );
    expect(await f.publish()).toBe(f.publicationId);
    expect(await prisma.menu_publications.count()).toBe(1);
  });
});
