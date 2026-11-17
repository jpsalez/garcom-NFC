import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { auth, ownerOf, staffToken } from "./helpers/auth.ts";
import { createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

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
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    const res = await api().get(`/api/v1/tables/${table.id}/qrcode`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.body.toString()).toContain("<svg");
  });

  it("mesa inativa fica ativa ao gerar o QR Code", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await prisma.tables.update({ where: { id: table.id }, data: { active: false } });

    expect((await api().get(`/api/v1/tables/${table.id}/qrcode`).set(auth(token))).status).toBe(200);
    expect((await prisma.tables.findUniqueOrThrow({ where: { id: table.id } })).active).toBe(true);
  });

  it("mesa de outro restaurante dá 404 e não é ativada", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaDeB = await createTable(b.restaurantId);
    await prisma.tables.update({ where: { id: mesaDeB.id }, data: { active: false } });

    expect((await api().get(`/api/v1/tables/${mesaDeB.id}/qrcode`).set(auth(a.token))).status).toBe(404);
    expect((await prisma.tables.findUniqueOrThrow({ where: { id: mesaDeB.id } })).active).toBe(false);
  });

  it("STAFF dá 403", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    const res = await api().get(`/api/v1/tables/${table.id}/qrcode`).set(auth(await staffToken(token)));

    expect(res.status).toBe(403);
  });
});

describe("DELETE /tables/:id", () => {
  it("mesa sem histórico: 204 e some do banco", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    expect((await api().delete(`/api/v1/tables/${table.id}`).set(auth(token))).status).toBe(204);
    expect(await prisma.tables.findUnique({ where: { id: table.id } })).toBeNull();
  });

  it("mesa com sessão: 409 e continua no banco", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await createSession(restaurantId, table.id, "CLOSED");

    const res = await api().delete(`/api/v1/tables/${table.id}`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TABLE_HAS_SESSIONS");
    expect(await prisma.tables.findUnique({ where: { id: table.id } })).not.toBeNull();
  });

  it("mesa de outro restaurante: 404 e continua no banco", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaDeB = await createTable(b.restaurantId);

    expect((await api().delete(`/api/v1/tables/${mesaDeB.id}`).set(auth(a.token))).status).toBe(404);
    expect(await prisma.tables.findUnique({ where: { id: mesaDeB.id } })).not.toBeNull();
  });

  it("STAFF dá 403", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    expect((await api().delete(`/api/v1/tables/${table.id}`).set(auth(await staffToken(token)))).status).toBe(403);
  });
});

describe("desativar a mesa", () => {
  it("encerra o atendimento ativo (STAFF, closed_by do OWNER), revoga tokens e cancela chamados", async () => {
    const { token, user, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
    await api().post("/api/v1/public/calls").set("X-Table-Token", scan.body.token).send({ type: "WAITER" });

    const res = await api().patch(`/api/v1/tables/${table.id}`).set(auth(token)).send({ active: false });

    expect(res.status).toBe(200);
    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    expect([session.status, session.closed_reason, session.closed_by]).toEqual(["CLOSED", "STAFF", user.id]);
    expect((await prisma.session_tokens.findFirstOrThrow()).revoked_at).not.toBeNull();
    expect((await prisma.calls.findFirstOrThrow()).status).toBe("CANCELLED");
    const call = await api().post("/api/v1/public/calls").set("X-Table-Token", scan.body.token).send({ type: "WAITER" });
    expect(call.status).toBe(401);
  });

  it("renomear ou reativar a mesa não encerra o atendimento; mesa sem atendimento desativa normalmente", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await api().post(`/api/v1/public/tables/${table.public_code}/scan`);

    await api().patch(`/api/v1/tables/${table.id}`).set(auth(token)).send({ label: "Mesa nova" });
    await api().patch(`/api/v1/tables/${table.id}`).set(auth(token)).send({ active: true });
    expect(await prisma.table_sessions.count({ where: { status: "ACTIVE" } })).toBe(1);

    const other = await createTable(restaurantId, "Mesa 2");
    expect((await api().patch(`/api/v1/tables/${other.id}`).set(auth(token)).send({ active: false })).status).toBe(200);
  });
});

describe("public_code (RN02)", () => {
  it("tem 12 caracteres do alfabeto sem ambíguos e é diferente a cada mesa", async () => {
    const { token } = await ownerOf("a");
    const create = (label: string) => api().post("/api/v1/tables").set(auth(token)).send({ label });

    const [one, two] = [(await create("Mesa 1")).body.public_code, (await create("Mesa 2")).body.public_code];

    expect(one).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);
    expect(one).not.toBe(two);
  });
});

describe("isolamento entre restaurantes (HTTP)", () => {
  it("GET lista só as mesas do próprio restaurante; PATCH em mesa de outro dá 404 e não altera", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    await createTable(a.restaurantId, "A-1");
    const deB = await createTable(b.restaurantId, "B-1");

    const list = await api().get("/api/v1/tables").set(auth(a.token));
    const patch = await api().patch(`/api/v1/tables/${deB.id}`).set(auth(a.token)).send({ label: "invadida" });

    expect(list.body.map((t: { label: string }) => t.label)).toEqual(["A-1"]);
    expect(patch.status).toBe(404);
    expect((await prisma.tables.findUniqueOrThrow({ where: { id: deB.id } })).label).toBe("B-1");
  });
});
