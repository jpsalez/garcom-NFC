import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const register = { name: "Ana", email: "ana@teste.com", password: "senha-forte-123", restaurantName: "Bar" };

describe("entrada malformada", () => {
  it("JSON inválido dá 400 (e não 500)", async () => {
    const res = await api().post("/api/v1/auth/login").set("Content-Type", "application/json").send("{ nao e json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("corpo grande demais dá 413", async () => {
    const res = await api().post("/api/v1/auth/login").send({ email: "a@teste.com", password: "x".repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("senha, nome e nome do restaurante têm teto de tamanho (400)", async () => {
    for (const field of ["password", "name", "restaurantName"] as const) {
      const res = await api().post("/api/v1/auth/register").send({ ...register, [field]: "a".repeat(field === "password" ? 129 : 101) });
      expect(res.status, field).toBe(400);
    }
    expect((await api().post("/api/v1/auth/register").send(register)).status).toBe(201);
  });
});

describe("rota pública do scan", () => {
  it("código fora do formato dá 404 sem consultar a mesa", async () => {
    expect((await api().post("/api/v1/public/tables/CÓDIGO-INVÁLIDO/scan")).status).toBe(404);
    expect((await api().post(`/api/v1/public/tables/${"a".repeat(200)}/scan`)).status).toBe(404);
  });
});

describe("cabeçalhos", () => {
  it("não anuncia o Express", async () => {
    expect((await api().get("/api/v1/health")).headers["x-powered-by"]).toBeUndefined();
  });
});

describe("limite de login por IP", () => {
  it("variar o e-mail não escapa do limite: 30 tentativas por IP, a 31ª dá 429", async () => {
    process.env.RATE_LIMIT_TEST = "on";
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) {
        statuses.push((await api().post("/api/v1/auth/login").send({ email: `u${i}@teste.com`, password: "qualquer-senha" })).status);
      }
      expect(statuses.slice(0, 30)).not.toContain(429);
      expect(statuses[30]).toBe(429);
    } finally {
      delete process.env.RATE_LIMIT_TEST;
    }
  });
});
