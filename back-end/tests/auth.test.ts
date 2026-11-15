import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";

const user = { name: "Ana", email: "ana@teste.com", password: "senha-forte-123", restaurantName: "Bar do Teste" };

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("POST /auth/register", () => {
  it("cria o usuário OWNER sem devolver o hash da senha", async () => {
    const res = await api().post("/api/v1/auth/register").send(user);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe("OWNER");
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("recusa e-mail repetido com 409", async () => {
    await api().post("/api/v1/auth/register").send(user);
    const res = await api().post("/api/v1/auth/register").send(user);
    expect(res.status).toBe(409);
  });

  it("recusa corpo inválido com 400 e lista os campos", async () => {
    const res = await api().post("/api/v1/auth/register").send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });
});

describe("POST /auth/login", () => {
  it("devolve token com credenciais corretas", async () => {
    await api().post("/api/v1/auth/register").send(user);
    const res = await api().post("/api/v1/auth/login").send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("dá a mesma resposta para senha errada e e-mail inexistente (não revela e-mails)", async () => {
    await api().post("/api/v1/auth/register").send(user);
    const wrongPassword = await api().post("/api/v1/auth/login").send({ email: user.email, password: "errada" });
    const unknownEmail = await api().post("/api/v1/auth/login").send({ email: "x@teste.com", password: "qualquer" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });
});

async function loginAsOwner() {
  await api().post("/api/v1/auth/register").send(user);
  return (await api().post("/api/v1/auth/login").send({ email: user.email, password: user.password })).body as {
    token: string;
    refreshToken: string;
  };
}

const refresh = (refreshToken: string) => api().post("/api/v1/auth/refresh").send({ refreshToken });

describe("POST /auth/refresh", () => {
  it("troca o refresh token por um par novo e o antigo deixa de valer", async () => {
    const first = await loginAsOwner();

    const res = await refresh(first.refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
    expect(res.body.user.password_hash).toBeUndefined();
    expect((await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${res.body.token}`)).status).toBe(200);
    expect((await refresh(first.refreshToken)).status).toBe(401);
  });

  it("reusar um token já trocado encerra todas as sessões do usuário", async () => {
    const first = await loginAsOwner();
    const second = (await refresh(first.refreshToken)).body;

    expect((await refresh(first.refreshToken)).status).toBe(401);

    expect((await refresh(second.refreshToken)).status).toBe(401);
  });

  it("recusa token desconhecido, expirado e de usuário desativado", async () => {
    const { refreshToken } = await loginAsOwner();
    expect((await refresh("token-que-nao-existe")).status).toBe(401);

    await prisma.refresh_tokens.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });
    expect((await refresh(refreshToken)).status).toBe(401);

    const again = (await api().post("/api/v1/auth/login").send({ email: user.email, password: user.password })).body;
    await prisma.users.updateMany({ data: { active: false } });
    expect((await refresh(again.refreshToken)).status).toBe(401);
  });

  it("recusa corpo sem refreshToken com 400", async () => {
    expect((await api().post("/api/v1/auth/refresh").send({})).status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  it("revoga o refresh token; token desconhecido também dá 204", async () => {
    const { refreshToken } = await loginAsOwner();

    expect((await api().post("/api/v1/auth/logout").send({ refreshToken })).status).toBe(204);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await api().post("/api/v1/auth/logout").send({ refreshToken: "desconhecido" })).status).toBe(204);
  });
});

describe("GET /auth/me", () => {
  it("devolve o usuário logado sem o hash da senha e exige token", async () => {
    const { token } = await loginAsOwner();

    const res = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.password_hash).toBeUndefined();
    expect((await api().get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("PATCH /auth/password", () => {
  const novaSenha = "outra-senha-forte-1";
  const change = (token: string, currentPassword: string, newPassword: string) =>
    api().patch("/api/v1/auth/password").set("Authorization", `Bearer ${token}`).send({ currentPassword, newPassword });

  it("troca a senha, derruba as outras sessões e devolve um par novo para este aparelho", async () => {
    const first = await loginAsOwner();
    const other = (await api().post("/api/v1/auth/login").send({ email: user.email, password: user.password })).body;

    const res = await change(first.token, user.password, novaSenha);

    expect(res.status).toBe(200);
    expect(res.body.user.password_hash).toBeUndefined();
    expect((await api().post("/api/v1/auth/login").send({ email: user.email, password: novaSenha })).status).toBe(200);
    expect((await api().post("/api/v1/auth/login").send({ email: user.email, password: user.password })).status).toBe(401);
    // o par novo primeiro: reusar um token revogado derruba todas as sessões, inclusive o novo
    expect((await refresh(res.body.refreshToken)).status).toBe(200);
    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(other.refreshToken)).status).toBe(401);
  });

  it("recusa a senha atual errada (400, não 401), senha igual, senha curta e pedido sem token", async () => {
    const { token } = await loginAsOwner();

    const wrong = await change(token, "senha-errada-123", novaSenha);
    expect([wrong.status, wrong.body.code]).toEqual([400, "INVALID_CURRENT_PASSWORD"]);
    expect((await change(token, user.password, user.password)).status).toBe(400);
    expect((await change(token, user.password, "curta")).status).toBe(400);
    expect((await api().patch("/api/v1/auth/password").send({ currentPassword: user.password, newPassword: novaSenha })).status).toBe(401);
    expect((await api().post("/api/v1/auth/login").send({ email: user.email, password: user.password })).status).toBe(200);
  });
});
