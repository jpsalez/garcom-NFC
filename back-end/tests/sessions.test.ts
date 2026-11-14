import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { auth, ownerOf, staffToken } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const HOUR = 60 * 60 * 1000;
const scan = (code: string) => api().post(`/api/v1/public/tables/${code}/scan`);
const activeOf = (tableId: string) => prisma.table_sessions.findMany({ where: { table_id: tableId, status: "ACTIVE" } });

describe("POST /public/tables/:code/scan", () => {
  it("primeiro scan abre o atendimento por 4 h e devolve o token do aparelho", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    const res = await scan(table.public_code);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.table.label).toBe(table.label);
    const [session] = await activeOf(table.id);
    expect(session.expires_at.getTime() - Date.now()).toBeGreaterThan(3.9 * HOUR);
    // só o hash fica no banco
    const saved = await prisma.session_tokens.findFirstOrThrow({ where: { session_id: session.id } });
    expect(saved.token_hash).not.toBe(res.body.token);
  });

  it("outro aparelho reaproveita o atendimento ativo com token próprio", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    const first = await scan(table.public_code);
    const second = await scan(table.public_code);

    expect(second.body.token).not.toBe(first.body.token);
    expect(await activeOf(table.id)).toHaveLength(1);
    expect(await prisma.session_tokens.count()).toBe(2);
  });

  it("scans simultâneos continuam com um único atendimento ativo", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    const results = await Promise.all([1, 2, 3, 4].map(() => scan(table.public_code)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 201]);
    expect(await activeOf(table.id)).toHaveLength(1);
  });

  it("depois de encerrado, novo scan abre outro atendimento (DEC-07)", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    await createSession(user.restaurant_id!, table.id, "CLOSED");

    expect((await scan(table.public_code)).status).toBe(201);
    expect(await activeOf(table.id)).toHaveLength(1);
  });

  it("atendimento vencido é encerrado por TIMEOUT e um novo é aberto", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    const old = await createSession(user.restaurant_id!, table.id, "ACTIVE", new Date(Date.now() - 1000));

    expect((await scan(table.public_code)).status).toBe(201);

    const closed = await prisma.table_sessions.findUniqueOrThrow({ where: { id: old.id } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closed_reason).toBe("TIMEOUT");
    expect(await activeOf(table.id)).toHaveLength(1);
  });

  it("código inexistente e mesa inativa dão 404", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    await prisma.tables.update({ where: { id: table.id }, data: { active: false } });

    expect((await scan("naoexiste123")).status).toBe(404);
    expect((await scan(table.public_code)).status).toBe(404);
    expect(await prisma.table_sessions.count()).toBe(0);
  });

  it("restaurante desativado dá 404", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    await prisma.restaurants.update({ where: { id: user.restaurant_id! }, data: { active: false } });

    expect((await scan(table.public_code)).status).toBe(404);
  });
});

describe("POST /tables/:id/session (balcão)", () => {
  it("OWNER e STAFF abrem o atendimento; segundo pedido dá 409", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);

    const staff = await staffToken(token);
    const opened = await api().post(`/api/v1/tables/${table.id}/session`).set(auth(staff));
    const again = await api().post(`/api/v1/tables/${table.id}/session`).set(auth(token));

    expect(opened.status).toBe(201);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SESSION_ALREADY_ACTIVE");
  });

  it("mesa de outro restaurante dá 404 e sem token dá 401", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaDeB = await createTable(b.user.restaurant_id!);

    expect((await api().post(`/api/v1/tables/${mesaDeB.id}/session`).set(auth(a.token))).status).toBe(404);
    expect((await api().post(`/api/v1/tables/${mesaDeB.id}/session`)).status).toBe(401);
  });
});

describe("POST /sessions/:id/close", () => {
  it("encerra, revoga os tokens e cancela os chamados abertos", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    await scan(table.public_code);
    const [session] = await activeOf(table.id);
    const savedToken = await prisma.session_tokens.findFirstOrThrow({ where: { session_id: session.id } });
    const call = await prisma.calls.create({
      data: { restaurant_id: user.restaurant_id!, session_id: session.id, token_id: savedToken.id, type: "WAITER" },
    });

    const res = await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(token));

    expect(res.status).toBe(200);
    const closed = await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } });
    expect([closed.status, closed.closed_reason, closed.closed_by]).toEqual(["CLOSED", "STAFF", user.id]);
    expect((await prisma.session_tokens.findUniqueOrThrow({ where: { id: savedToken.id } })).revoked_at).not.toBeNull();
    expect((await prisma.calls.findUniqueOrThrow({ where: { id: call.id } })).status).toBe("CANCELLED");
  });

  it("dois encerramentos simultâneos: um 200, outro 409, e closed_by não é sobrescrito", async () => {
    const a = await ownerOf("a");
    const table = await createTable(a.user.restaurant_id!);
    const session = await createSession(a.user.restaurant_id!, table.id);
    const staff = await staffToken(a.token);

    const results = await Promise.all([a.token, staff].map((t) => api().post(`/api/v1/sessions/${session.id}/close`).set(auth(t))));

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200);
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).closed_by).toBe(winner?.body.closed_by);
  });

  it("atendimento já encerrado dá 409", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    const session = await createSession(user.restaurant_id!, table.id, "CLOSED");

    expect((await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(token))).status).toBe(409);
  });

  it("atendimento de outro restaurante dá 404 e continua ativo", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const session = await createSession(b.user.restaurant_id!, (await createTable(b.user.restaurant_id!)).id);

    expect((await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(a.token))).status).toBe(404);
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("ACTIVE");
  });
});

describe("POST /sessions/:id/extend", () => {
  it("soma 4 h ao vencimento", async () => {
    const { token, user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    const session = await createSession(user.restaurant_id!, table.id);

    const res = await api().post(`/api/v1/sessions/${session.id}/extend`).set(auth(token));

    expect(res.status).toBe(200);
    expect(new Date(res.body.expires_at).getTime()).toBe(session.expires_at.getTime() + 4 * HOUR);
  });

  it("encerrado dá 409 e de outro restaurante dá 404", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const closed = await createSession(a.user.restaurant_id!, (await createTable(a.user.restaurant_id!)).id, "CLOSED");
    const deB = await createSession(b.user.restaurant_id!, (await createTable(b.user.restaurant_id!)).id);

    expect((await api().post(`/api/v1/sessions/${closed.id}/extend`).set(auth(a.token))).status).toBe(409);
    expect((await api().post(`/api/v1/sessions/${deB.id}/extend`).set(auth(a.token))).status).toBe(404);
  });
});

describe("GET /sessions", () => {
  it("lista só os atendimentos ativos do próprio restaurante", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaA = await createTable(a.user.restaurant_id!, "A-1");
    await createSession(a.user.restaurant_id!, mesaA.id);
    await createSession(a.user.restaurant_id!, (await createTable(a.user.restaurant_id!, "A-2")).id, "CLOSED");
    await createSession(b.user.restaurant_id!, (await createTable(b.user.restaurant_id!)).id);

    const res = await api().get("/api/v1/sessions").set(auth(a.token));

    expect(res.status).toBe(200);
    expect(res.body.map((s: { table: { label: string } }) => s.table.label)).toEqual(["A-1"]);
  });
});
