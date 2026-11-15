import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// DEC-11: tudo sob /api/v1 (a documentação em /docs fica fora)
describe("prefixo /api/v1", () => {
  it("as rotas respondem sob /api/v1", async () => {
    expect((await api().get("/api/v1/health")).status).toBe(200);
  });

  it("sem o prefixo a rota não existe", async () => {
    expect((await api().get("/health")).status).toBe(404);
  });
});

// DEC-12: todo erro traz um code estável
describe("campo code nos erros", () => {
  it("401 de login: UNAUTHORIZED", async () => {
    const res = await api().post("/api/v1/auth/login").send({ email: "x@teste.com", password: "qualquer" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("400 de validação: VALIDATION_ERROR", async () => {
    const res = await api().post("/api/v1/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rota sem token: UNAUTHORIZED", async () => {
    const res = await api().get("/api/v1/tables");
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});
