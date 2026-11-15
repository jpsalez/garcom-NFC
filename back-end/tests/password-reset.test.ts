import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, outbox } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";

const owner = { name: "Ana", email: "ana@teste.com", password: "senha-forte-123", restaurantName: "Bar do Teste" };
const novaSenha = "outra-senha-forte-1";

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});
afterAll(() => prisma.$disconnect());

const forgot = (email: string) => api().post("/api/v1/auth/forgot-password").send({ email });
const reset = (token: string, password = novaSenha) => api().post("/api/v1/auth/reset-password").send({ token, password });
const login = (password: string) => api().post("/api/v1/auth/login").send({ email: owner.email, password });

// O service não espera o envio: aguarda o e-mail chegar na caixa de testes e devolve o token do link
async function tokenFromMail() {
  await vi.waitFor(() => expect(outbox).toHaveLength(1));
  return /token=([\w-]+)/.exec(outbox[0]?.text ?? "")?.[1] ?? "";
}

describe("POST /auth/forgot-password", () => {
  it("responde 202 igual para e-mail cadastrado e desconhecido, e só o cadastrado recebe o link", async () => {
    await api().post("/api/v1/auth/register").send(owner);

    const known = await forgot(owner.email);
    const unknown = await forgot("ninguem@teste.com");

    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(known.body).toEqual(unknown.body);
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    expect(outbox[0]?.to).toBe(owner.email);
    expect(await prisma.password_resets.count()).toBe(1);
  });

  it("não envia e-mail para usuário desativado", async () => {
    await api().post("/api/v1/auth/register").send(owner);
    await prisma.users.updateMany({ data: { active: false } });

    expect((await forgot(owner.email)).status).toBe(202);

    expect(outbox).toHaveLength(0);
    expect(await prisma.password_resets.count()).toBe(0);
  });

  it("e-mail inválido dá 400", async () => {
    expect((await forgot("nao-e-email")).status).toBe(400);
  });
});

describe("POST /auth/reset-password", () => {
  it("troca a senha, o link vale uma vez e as sessões antigas caem", async () => {
    await api().post("/api/v1/auth/register").send(owner);
    const { refreshToken } = (await login(owner.password)).body;
    await forgot(owner.email);
    const token = await tokenFromMail();

    expect((await reset(token)).status).toBe(204);

    expect((await login(novaSenha)).status).toBe(200);
    expect((await login(owner.password)).status).toBe(401);
    expect((await api().post("/api/v1/auth/refresh").send({ refreshToken })).status).toBe(401);
    const again = await reset(token, "mais-uma-senha-forte");
    expect([again.status, again.body.code]).toEqual([400, "RESET_TOKEN_INVALID"]);
  });

  it("recusa token desconhecido, expirado e senha curta", async () => {
    await api().post("/api/v1/auth/register").send(owner);
    await forgot(owner.email);
    const token = await tokenFromMail();

    expect((await reset("token-que-nao-existe")).status).toBe(400);
    expect((await reset(token, "curta")).status).toBe(400);
    await prisma.password_resets.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });
    expect((await reset(token)).status).toBe(400);
    expect((await login(owner.password)).status).toBe(200);
  });
});
