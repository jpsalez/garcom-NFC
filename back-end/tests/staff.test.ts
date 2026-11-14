import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { passwordHash } from "../src/shared/utils/password.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf, staffToken } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const newStaff = { name: "Gar", email: "garcom@teste.com", password: "senha-forte-123" };
const login = (email: string, password = "senha-forte-123") => api().post("/api/v1/auth/login").send({ email, password });

async function superAdminToken() {
  await prisma.users.create({
    data: { name: "Super", email: "super@teste.com", password_hash: await passwordHash("senha-forte-123"), role: "SUPER_ADMIN" },
  });
  return (await login("super@teste.com")).body.token as string;
}

describe("/staff (OWNER gerencia a equipe do próprio restaurante)", () => {
  it("cria, lista, atualiza e remove STAFF; senha nunca volta na resposta", async () => {
    const { token } = await ownerOf("a");

    const created = await api().post("/api/v1/staff").set(auth(token)).send({ ...newStaff, category: "WAITER" });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe("STAFF");
    expect(created.body.password_hash).toBeUndefined();

    const list = await api().get("/api/v1/staff").set(auth(token));
    expect(list.body.map((u: { email: string }) => u.email)).toEqual([newStaff.email]);

    const updated = await api().patch(`/api/v1/staff/${created.body.id}`).set(auth(token)).send({ category: "MANAGER" });
    expect(updated.body.category).toBe("MANAGER");

    expect((await api().delete(`/api/v1/staff/${created.body.id}`).set(auth(token))).status).toBe(204);
    expect(await prisma.users.findUnique({ where: { id: created.body.id } })).toBeNull();
  });

  it("e-mail repetido dá 409; campos extras (role) são ignorados; STAFF não acessa (403)", async () => {
    const { token } = await ownerOf("a");
    const first = await api().post("/api/v1/staff").set(auth(token)).send({ ...newStaff, role: "OWNER" });
    expect(first.body.role).toBe("STAFF");
    expect((await api().post("/api/v1/staff").set(auth(token)).send(newStaff)).status).toBe(409);

    const staff = (await login(newStaff.email)).body.token as string;
    expect((await api().get("/api/v1/staff").set(auth(staff))).status).toBe(403);
    expect((await api().post("/api/v1/staff").set(auth(staff)).send({ ...newStaff, email: "x@teste.com" })).status).toBe(403);
  });

  it("OWNER não enxerga nem altera STAFF de outro restaurante (404)", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const staffOfB = await api().post("/api/v1/staff").set(auth(b.token)).send(newStaff);

    expect((await api().get("/api/v1/staff").set(auth(a.token))).body).toEqual([]);
    expect((await api().patch(`/api/v1/staff/${staffOfB.body.id}`).set(auth(a.token)).send({ active: false })).status).toBe(404);
    expect((await api().delete(`/api/v1/staff/${staffOfB.body.id}`).set(auth(a.token))).status).toBe(404);
  });

  it("desativar o STAFF corta o acesso na hora, mesmo com o token em cache", async () => {
    const { token } = await ownerOf("a");
    const created = await api().post("/api/v1/staff").set(auth(token)).send(newStaff);
    const staff = (await login(newStaff.email)).body.token as string;
    expect((await api().get("/api/v1/tables").set(auth(staff))).status).toBe(200);

    await api().patch(`/api/v1/staff/${created.body.id}`).set(auth(token)).send({ active: false });

    expect((await api().get("/api/v1/tables").set(auth(staff))).status).toBe(401);
    expect((await login(newStaff.email)).status).toBe(401);
  });

  it("excluir o STAFF mantém o histórico: closed_by e done_by viram nulos", async () => {
    const { token, user } = await ownerOf("a");
    const staff = await staffToken(token);
    const staffUser = await prisma.users.findUniqueOrThrow({ where: { email: "garcom@teste.com" } });
    const table = await createTable(user.restaurant_id!);
    const session = await createSession(user.restaurant_id!, table.id);
    await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(staff));
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).closed_by).toBe(staffUser.id);

    await api().delete(`/api/v1/staff/${staffUser.id}`).set(auth(token));

    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).closed_by).toBeNull();
  });
});

describe("último OWNER", () => {
  it("não pode ser desativado nem removido pelo SUPER_ADMIN", async () => {
    const { user } = await ownerOf("a");
    const superToken = await superAdminToken();
    const url = `/api/v1/admin/restaurants/${user.restaurant_id}/users/${user.id}`;

    expect((await api().patch(url).set(auth(superToken)).send({ active: false })).status).toBe(409);
    expect((await api().delete(url).set(auth(superToken))).status).toBe(409);
    expect((await prisma.users.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(true);
  });

  it("com um segundo OWNER ativo, o primeiro pode ser desativado", async () => {
    const { user } = await ownerOf("a");
    const superToken = await superAdminToken();
    await api().post(`/api/v1/admin/restaurants/${user.restaurant_id}/users`).set(auth(superToken)).send({ ...newStaff, role: "OWNER" });

    const res = await api().patch(`/api/v1/admin/restaurants/${user.restaurant_id}/users/${user.id}`).set(auth(superToken)).send({ active: false });

    expect(res.status).toBe(200);
  });
});

describe("/admin/restaurants (SUPER_ADMIN)", () => {
  it("OWNER e STAFF recebem 403; sem token, 401", async () => {
    const { token } = await ownerOf("a");
    expect((await api().get("/api/v1/admin/restaurants").set(auth(token))).status).toBe(403);
    expect((await api().get("/api/v1/admin/restaurants")).status).toBe(401);
    expect((await api().get("/api/v1/admin/restaurants").set(auth(await staffToken(token)))).status).toBe(403);
  });

  it("cria restaurante (slug repetido dá 409), lista, e restaurante inexistente dá 404", async () => {
    const superToken = await superAdminToken();
    const body = { name: "Novo", slug: "novo-bar" };

    expect((await api().post("/api/v1/admin/restaurants").set(auth(superToken)).send(body)).status).toBe(201);
    expect((await api().post("/api/v1/admin/restaurants").set(auth(superToken)).send(body)).status).toBe(409);
    expect((await api().get("/api/v1/admin/restaurants").set(auth(superToken))).body).toHaveLength(1);
    expect((await api().patch("/api/v1/admin/restaurants/00000000-0000-4000-8000-000000000000").set(auth(superToken)).send({ active: false })).status).toBe(404);
  });

  it("desativar o restaurante encerra os atendimentos ativos (closed_by do SUPER_ADMIN) e bloqueia os tokens dos clientes", async () => {
    const { user } = await ownerOf("a");
    const superToken = await superAdminToken();
    const superUser = await prisma.users.findUniqueOrThrow({ where: { email: "super@teste.com" } });
    const table = await createTable(user.restaurant_id!);
    const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);

    await api().patch(`/api/v1/admin/restaurants/${user.restaurant_id}`).set(auth(superToken)).send({ active: false });

    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    expect([session.status, session.closed_reason, session.closed_by]).toEqual(["CLOSED", "STAFF", superUser.id]);
    expect((await api().post("/api/v1/public/calls").set("X-Table-Token", scan.body.token).send({ type: "BILL" })).status).toBe(401);
  });

  it("reativar o restaurante não reabre atendimentos", async () => {
    const { user } = await ownerOf("a");
    const superToken = await superAdminToken();
    const table = await createTable(user.restaurant_id!);
    await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
    const url = `/api/v1/admin/restaurants/${user.restaurant_id}`;
    await api().patch(url).set(auth(superToken)).send({ active: false });

    await api().patch(url).set(auth(superToken)).send({ active: true });

    expect(await prisma.table_sessions.count({ where: { status: "ACTIVE" } })).toBe(0);
  });

  it("desativar o restaurante bloqueia o login e o acesso dos usuários na hora", async () => {
    const { token, user } = await ownerOf("a");
    const superToken = await superAdminToken();
    expect((await api().get("/api/v1/tables").set(auth(token))).status).toBe(200);

    await api().patch(`/api/v1/admin/restaurants/${user.restaurant_id}`).set(auth(superToken)).send({ active: false });

    expect((await api().get("/api/v1/tables").set(auth(token))).status).toBe(401);
    expect((await login("a@teste.com")).status).toBe(401);
  });
});

describe("cadastro (register)", () => {
  it("cria OWNER e restaurante juntos; nome repetido ganha slug com sufixo", async () => {
    const body = { name: "Ana", password: "senha-forte-123", restaurantName: "Bar do Zé" };
    const first = await api().post("/api/v1/auth/register").send({ ...body, email: "a@teste.com" });
    const second = await api().post("/api/v1/auth/register").send({ ...body, email: "b@teste.com" });

    expect(first.body.restaurant.slug).toBe("bar-do-ze");
    expect(second.body.restaurant.slug).not.toBe("bar-do-ze");
    expect(second.body.restaurant.slug).toMatch(/^bar-do-ze-/);
  });
});
