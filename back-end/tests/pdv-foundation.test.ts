import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasCapability } from "../src/shared/authorization/capabilities.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createTable } from "./helpers/factories.ts";
import { categoryToken } from "./helpers/menu.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const waiterCapabilities = [
  "orders:create",
  "tabs:read",
  "tabs:manage",
  "payments:create",
  "tabs:close",
  "fiscal:emit",
] as const;
const cashierCapabilities = [...waiterCapabilities, "tabs:service_fee_waive", "cash_shift:operate"] as const;
const pdvCapabilities = [
  ...cashierCapabilities,
  "tabs:discount",
  "payments:refund",
  "tabs:cancel",
  "terminals:configure",
  "fiscal:configure",
  "reports:read",
] as const;

describe("capabilities do PDV", () => {
  it("OWNER cadastra funcionário com a categoria CASHIER", async () => {
    const { token, restaurantId } = await ownerOf("cadastro");
    const email = "caixa@teste.com";

    const created = await api()
      .post("/api/v1/staff")
      .set(auth(token))
      .send({ name: "Caixa", email, password: "senha-forte-123", category: "CASHIER" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ role: "STAFF", category: "CASHIER", restaurant_id: restaurantId });
  });

  const matrix = [
    { category: null, allowed: pdvCapabilities },
    { category: "MANAGER", allowed: pdvCapabilities },
    { category: "CASHIER", allowed: cashierCapabilities },
    { category: "WAITER", allowed: waiterCapabilities },
    { category: "KITCHEN", allowed: [] },
    { category: "CLEANING", allowed: [] },
    { category: "OTHER", allowed: [] },
  ] as const;

  it.each(matrix)("aplica a matriz do PDV para $category", async ({ category, allowed }) => {
    const { user, restaurantId } = await ownerOf("matriz");
    const actor = category ? (await categoryToken(restaurantId, category)).user : user;
    const context = {
      id: actor.id,
      restaurantId: actor.restaurant_id,
      role: actor.role,
      category: actor.category,
    };

    expect(pdvCapabilities.filter((capability) => hasCapability(context, capability))).toEqual(allowed);
  });
});

const settingsPath = "/api/v1/restaurant/settings";
const defaults = {
  timezone: "America/Sao_Paulo",
  business_day_cutoff_minutes: 0,
  service_fee_bps: 1000,
};

describe("configuração do restaurante", () => {
  it("OWNER lê os defaults e grava o limite superior de cada campo numérico", async () => {
    const { token } = await ownerOf("config");
    const settings = { timezone: "America/Bahia", business_day_cutoff_minutes: 719, service_fee_bps: 3000 };

    const initial = await api().get(settingsPath).set(auth(token));
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual(defaults);

    const updated = await api().patch(settingsPath).set(auth(token)).send(settings);
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(settings);
    expect((await api().get(settingsPath).set(auth(token))).body).toEqual(settings);
  });

  it("MANAGER atualiza parcialmente no limite inferior sem alterar o fuso", async () => {
    const owner = await ownerOf("gerencia");
    const { token } = await categoryToken(owner.restaurantId, "MANAGER");
    const initial = await api().get(settingsPath).set(auth(token));
    expect(initial.status).toBe(200);

    const res = await api()
      .patch(settingsPath)
      .set(auth(token))
      .send({ business_day_cutoff_minutes: 0, service_fee_bps: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...defaults, service_fee_bps: 0 });
  });

  it("rejeita fusos inválidos e números fora da faixa sem persistir alterações", async () => {
    const { token } = await ownerOf("limites");
    const invalidBodies = [
      { timezone: "Inexistente/Teste" },
      { business_day_cutoff_minutes: -1 },
      { business_day_cutoff_minutes: 720 },
      { business_day_cutoff_minutes: 0.5 },
      { service_fee_bps: -1 },
      { service_fee_bps: 3001 },
      { service_fee_bps: 1.5 },
      { next_tab_number: 2, timezone: "America/Bahia" },
    ];

    for (const body of invalidBodies) {
      expect((await api().patch(settingsPath).set(auth(token)).send(body)).status).toBe(400);
    }
    expect((await api().get(settingsPath).set(auth(token))).body).toEqual(defaults);
  });

  it.each(["CASHIER", "WAITER", "KITCHEN", "CLEANING", "OTHER"] as const)(
    "nega leitura e alteração a %s",
    async (category) => {
      const { restaurantId } = await ownerOf("acesso");
      const { token } = await categoryToken(restaurantId, category);

      expect((await api().get(settingsPath).set(auth(token))).status).toBe(403);
      expect((await api().patch(settingsPath).set(auth(token)).send({ service_fee_bps: 0 })).status).toBe(
        403,
      );
    },
  );

  it("usa o restaurante autenticado e rejeita um restaurante enviado no corpo", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const own = await api().patch(settingsPath).set(auth(a.token)).send({ service_fee_bps: 0 });
    expect(own.status).toBe(200);

    const other = await api().get(settingsPath).set(auth(b.token));
    expect(other.status).toBe(200);
    expect(other.body).toEqual(defaults);

    for (const field of ["restaurant_id", "restaurantId"]) {
      const crossTenant = await api()
        .patch(settingsPath)
        .set(auth(a.token))
        .send({ [field]: b.restaurantId, service_fee_bps: 3000 });
      expect(crossTenant.status).toBe(400);
    }
    expect((await api().get(settingsPath).set(auth(b.token))).body).toEqual(defaults);
    expect((await api().get(settingsPath).set(auth(a.token))).body).toEqual({
      ...defaults,
      service_fee_bps: 0,
    });
  });
});

describe("permissões de sessão e chamados", () => {
  it.each(["CLEANING", "OTHER"] as const)("impede %s de finalizar chamada e sessão", async (category) => {
    const { restaurantId } = await ownerOf("balcao");
    const { token } = await categoryToken(restaurantId, category);
    const table = await createTable(restaurantId);
    const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
    expect(scan.status).toBe(201);
    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    const call = await api()
      .post("/api/v1/public/calls")
      .set("X-Table-Token", scan.body.token)
      .send({ type: "WAITER" });
    expect(call.status).toBe(201);

    const done = await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(token));
    const closed = await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(token));
    expect([done.status, closed.status]).toEqual([403, 403]);
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).status).toBe(
      "ACTIVE",
    );
    expect((await prisma.calls.findUniqueOrThrow({ where: { id: call.body.id } })).status).toBe("OPEN");
  });
});
