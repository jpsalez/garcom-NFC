import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const password = "senha-forte-123";

// Registra um restaurante com OWNER e devolve o token dele
async function ownerOf(name: string) {
  const email = `${name}@teste.com`;
  await api().post("/api/v1/auth/register").send({ name, email, password, restaurantName: name });
  const login = await api().post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.token as string, user: await prisma.users.findUniqueOrThrow({ where: { email } }) };
}

async function staffToken(ownerToken: string) {
  const email = "garcom@teste.com";
  await api().post("/api/v1/staff").set("Authorization", `Bearer ${ownerToken}`).send({ name: "Gar", email, password });
  return (await api().post("/api/v1/auth/login").send({ email, password })).body.token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("public_url", () => {
  it("create, list e update usam o domínio do .env", async () => {
    const { token } = await ownerOf("a");
    const created = await api().post("/api/v1/tables").set(auth(token)).send({ label: "Mesa 1" });
    const expected = `${process.env.PUBLIC_APP_URL}/m/${created.body.public_code}`;

    const list = await api().get("/api/v1/tables").set(auth(token));
    const updated = await api().patch(`/api/v1/tables/${created.body.id}`).set(auth(token)).send({ label: "Mesa 2" });

    expect(process.env.PUBLIC_APP_URL).toBeTruthy();
    expect(created.body.public_url).toBe(expected);
    expect(list.body[0].public_url).toBe(expected);
    expect(updated.body.public_url).toBe(expected);
  });
});

describe("GET /tables/:id/qrcode", () => {
  it("devolve image/svg+xml", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    const res = await api().get(`/api/v1/tables/${table.id}/qrcode`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.body.toString()).toContain("<svg");
  });

  it("mesa inativa fica ativa ao gerar o QR Code", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    await prisma.tables.update({ where: { id: table.id }, data: { active: false } });

    expect((await api().get(`/api/v1/tables/${table.id}/qrcode`).set(auth(token))).status).toBe(200);
    expect((await prisma.tables.findUniqueOrThrow({ where: { id: table.id } })).active).toBe(true);
  });

  it("mesa de outro restaurante dá 404 e não é ativada", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaDeB = await createTable(b.user.restaurant_id!);
    await prisma.tables.update({ where: { id: mesaDeB.id }, data: { active: false } });

    expect((await api().get(`/api/v1/tables/${mesaDeB.id}/qrcode`).set(auth(a.token))).status).toBe(404);
    expect((await prisma.tables.findUniqueOrThrow({ where: { id: mesaDeB.id } })).active).toBe(false);
  });

  it("STAFF dá 403", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    const res = await api().get(`/api/v1/tables/${table.id}/qrcode`).set(auth(await staffToken(token)));

    expect(res.status).toBe(403);
  });
});

describe("DELETE /tables/:id", () => {
  it("mesa sem histórico: 204 e some do banco", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    expect((await api().delete(`/api/v1/tables/${table.id}`).set(auth(token))).status).toBe(204);
    expect(await prisma.tables.findUnique({ where: { id: table.id } })).toBeNull();
  });

  it("mesa com sessão: 409 e continua no banco", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    await createSession(user.restaurant_id!, table.id, "CLOSED");

    const res = await api().delete(`/api/v1/tables/${table.id}`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TABLE_HAS_SESSIONS");
    expect(await prisma.tables.findUnique({ where: { id: table.id } })).not.toBeNull();
  });

  it("mesa de outro restaurante: 404 e continua no banco", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaDeB = await createTable(b.user.restaurant_id!);

    expect((await api().delete(`/api/v1/tables/${mesaDeB.id}`).set(auth(a.token))).status).toBe(404);
    expect(await prisma.tables.findUnique({ where: { id: mesaDeB.id } })).not.toBeNull();
  });

  it("STAFF dá 403", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    expect((await api().delete(`/api/v1/tables/${table.id}`).set(auth(await staffToken(token)))).status).toBe(403);
  });
});
