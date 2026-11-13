import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";

const user = { name: "Ana", email: "ana@teste.com", password: "senha-forte-123" };

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("POST /auth/register", () => {
  it("cria o usuário ADMIN sem devolver o hash da senha", async () => {
    const res = await api().post("/auth/register").send(user);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe("ADMIN");
    expect(res.body.password_hash).toBeUndefined();
  });

  it("recusa e-mail repetido com 409", async () => {
    await api().post("/auth/register").send(user);
    const res = await api().post("/auth/register").send(user);
    expect(res.status).toBe(409);
  });

  it("recusa corpo inválido com 400 e lista os campos", async () => {
    const res = await api().post("/auth/register").send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });
});

describe("POST /auth/login", () => {
  it("devolve token com credenciais corretas", async () => {
    await api().post("/auth/register").send(user);
    const res = await api().post("/auth/login").send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("dá a mesma resposta para senha errada e e-mail inexistente (não revela e-mails)", async () => {
    await api().post("/auth/register").send(user);
    const wrongPassword = await api().post("/auth/login").send({ email: user.email, password: "errada" });
    const unknownEmail = await api().post("/auth/login").send({ email: "x@teste.com", password: "qualquer" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });
});
