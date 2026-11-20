import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TableSessionRepository } from "../src/modules/sessions/sessions.repository.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf, staffToken } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const HOUR = 60 * 60 * 1000;
const scan = (code: string) => api().post(`/api/v1/public/tables/${code}/scan`);
const activeSessionOf = (tableId: string) =>
  prisma.table_sessions.findFirstOrThrow({ where: { table_id: tableId, status: "ACTIVE" } });
const activeOf = (tableId: string) => prisma.table_sessions.findMany({ where: { table_id: tableId, status: "ACTIVE" } });

describe("POST /public/tables/:code/scan", () => {
  it("primeiro scan abre o atendimento por 4 h e devolve o token do aparelho", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    const res = await scan(table.public_code);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.table.label).toBe(table.label);
    const session = await activeSessionOf(table.id);
    expect(session.expires_at.getTime() - Date.now()).toBeGreaterThan(3.9 * HOUR);
    // só o hash fica no banco
    const saved = await prisma.session_tokens.findFirstOrThrow({ where: { session_id: session.id } });
    expect(saved.token_hash).not.toBe(res.body.token);
  });

  it("outro aparelho reaproveita o atendimento ativo com token próprio", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    const first = await scan(table.public_code);
    const second = await scan(table.public_code);

    expect(second.body.token).not.toBe(first.body.token);
    expect(await activeOf(table.id)).toHaveLength(1);
    expect(await prisma.session_tokens.count()).toBe(2);
  });

  it("scans simultâneos continuam com um único atendimento ativo", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    const results = await Promise.all([1, 2, 3, 4].map(() => scan(table.public_code)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 201]);
    expect(await activeOf(table.id)).toHaveLength(1);
  });

  it("depois de encerrado, novo scan abre outro atendimento (DEC-07)", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await createSession(restaurantId, table.id, "CLOSED");

    expect((await scan(table.public_code)).status).toBe(201);
    expect(await activeOf(table.id)).toHaveLength(1);
  });

  it("atendimento vencido é encerrado por TIMEOUT e um novo é aberto", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    const old = await createSession(restaurantId, table.id, "ACTIVE", new Date(Date.now() - 1000));

    expect((await scan(table.public_code)).status).toBe(201);

    const closed = await prisma.table_sessions.findUniqueOrThrow({ where: { id: old.id } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closed_reason).toBe("TIMEOUT");
    expect(await activeOf(table.id)).toHaveLength(1);
  });

  it("código inexistente e mesa inativa dão 404", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await prisma.tables.update({ where: { id: table.id }, data: { active: false } });

    expect((await scan("naoexiste123")).status).toBe(404);
    expect((await scan(table.public_code)).status).toBe(404);
    expect(await prisma.table_sessions.count()).toBe(0);
  });

  it("restaurante desativado dá 404", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await prisma.restaurants.update({ where: { id: restaurantId }, data: { active: false } });

    expect((await scan(table.public_code)).status).toBe(404);
  });
});

describe("POST /tables/:id/session (balcão)", () => {
  it("OWNER e STAFF abrem o atendimento; segundo pedido dá 409", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);

    const staff = await staffToken(token);
    const opened = await api().post(`/api/v1/tables/${table.id}/session`).set(auth(staff));
    const again = await api().post(`/api/v1/tables/${table.id}/session`).set(auth(token));

    expect(opened.status).toBe(201);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SESSION_ALREADY_ACTIVE");
  });

  it("mesa inativa dá 409 TABLE_INACTIVE e não abre atendimento", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await prisma.tables.update({ where: { id: table.id }, data: { active: false } });

    const res = await api().post(`/api/v1/tables/${table.id}/session`).set(auth(token));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TABLE_INACTIVE");
    expect(await prisma.table_sessions.count()).toBe(0);
  });

  it("mesa de outro restaurante dá 404 e sem token dá 401", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaDeB = await createTable(b.restaurantId);

    expect((await api().post(`/api/v1/tables/${mesaDeB.id}/session`).set(auth(a.token))).status).toBe(404);
    expect((await api().post(`/api/v1/tables/${mesaDeB.id}/session`)).status).toBe(401);
  });
});

describe("POST /sessions/:id/close", () => {
  it("encerra, revoga os tokens e cancela os chamados abertos", async () => {
    const { token, user, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    await scan(table.public_code);
    const session = await activeSessionOf(table.id);
    const savedToken = await prisma.session_tokens.findFirstOrThrow({ where: { session_id: session.id } });
    const call = await prisma.calls.create({
      data: { restaurant_id: restaurantId, session_id: session.id, token_id: savedToken.id, type: "WAITER" },
    });

    const res = await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(token));

    expect(res.status).toBe(200);
    const closed = await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } });
    expect([closed.status, closed.closed_reason, closed.closed_by]).toEqual(["CLOSED", "STAFF", user.id]);
    expect(closed.closed_at).not.toBeNull();
    expect((await prisma.session_tokens.findUniqueOrThrow({ where: { id: savedToken.id } })).revoked_at).not.toBeNull();
    expect((await prisma.calls.findUniqueOrThrow({ where: { id: call.id } })).status).toBe("CANCELLED");
  });

  it("dois encerramentos simultâneos: um 200, outro 409, e closed_by não é sobrescrito", async () => {
    const a = await ownerOf("a");
    const table = await createTable(a.restaurantId);
    const session = await createSession(a.restaurantId, table.id);
    const staff = await staffToken(a.token);

    const results = await Promise.all([a.token, staff].map((t) => api().post(`/api/v1/sessions/${session.id}/close`).set(auth(t))));

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200);
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).closed_by).toBe(winner?.body.closed_by);
  });

  it("atendimento já encerrado dá 409", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    const session = await createSession(restaurantId, table.id, "CLOSED");

    expect((await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(token))).status).toBe(409);
  });

  it("atendimento de outro restaurante dá 404 e continua ativo", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const session = await createSession(b.restaurantId, (await createTable(b.restaurantId)).id);

    expect((await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(a.token))).status).toBe(404);
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("ACTIVE");
  });
});

describe("POST /sessions/:id/extend", () => {
  it("soma 4 h ao vencimento", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    const session = await createSession(restaurantId, table.id);

    const res = await api().post(`/api/v1/sessions/${session.id}/extend`).set(auth(token));

    expect(res.status).toBe(200);
    expect(new Date(res.body.expires_at).getTime()).toBe(session.expires_at.getTime() + 4 * HOUR);
  });

  it("encerrado dá 409 e de outro restaurante dá 404", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const closed = await createSession(a.restaurantId, (await createTable(a.restaurantId)).id, "CLOSED");
    const deB = await createSession(b.restaurantId, (await createTable(b.restaurantId)).id);

    expect((await api().post(`/api/v1/sessions/${closed.id}/extend`).set(auth(a.token))).status).toBe(409);
    expect((await api().post(`/api/v1/sessions/${deB.id}/extend`).set(auth(a.token))).status).toBe(404);
  });
});

describe("GET /sessions", () => {
  it("?status=CLOSED lista os encerrados; status inválido dá 400", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    await createSession(a.restaurantId, (await createTable(a.restaurantId, "A-1")).id);
    await createSession(a.restaurantId, (await createTable(a.restaurantId, "A-2")).id, "CLOSED");
    await createSession(b.restaurantId, (await createTable(b.restaurantId)).id, "CLOSED");

    const res = await api().get("/api/v1/sessions?status=CLOSED").set(auth(a.token));

    expect(res.body.map((s: { table: { label: string } }) => s.table.label)).toEqual(["A-2"]);
    expect((await api().get("/api/v1/sessions?status=QUALQUER").set(auth(a.token))).status).toBe(400);
  });

  it("pagina com limit e offset, dos mais recentes aos mais antigos, e recusa limit acima de 200", async () => {
    const a = await ownerOf("a");
    for (const [i, label] of ["M1", "M2", "M3"].entries()) {
      const table = await createTable(a.restaurantId, label);
      await prisma.table_sessions.create({
        data: { restaurant_id: a.restaurantId, table_id: table.id, status: "CLOSED", expires_at: new Date(), created_at: new Date(2026, 0, 1 + i) },
      });
    }
    const labels = async (query: string) =>
      (await api().get(`/api/v1/sessions?status=CLOSED${query}`).set(auth(a.token))).body.map((s: { table: { label: string } }) => s.table.label);

    expect(await labels("&limit=2")).toEqual(["M3", "M2"]);
    expect(await labels("&limit=2&offset=2")).toEqual(["M1"]);
    expect((await api().get("/api/v1/sessions?limit=201").set(auth(a.token))).status).toBe(400);
  });

  it("sem filtro, lista só os ativos do próprio restaurante", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const mesaA = await createTable(a.restaurantId, "A-1");
    await createSession(a.restaurantId, mesaA.id);
    await createSession(a.restaurantId, (await createTable(a.restaurantId, "A-2")).id, "CLOSED");
    await createSession(b.restaurantId, (await createTable(b.restaurantId)).id);

    const res = await api().get("/api/v1/sessions").set(auth(a.token));

    expect(res.status).toBe(200);
    expect(res.body.map((s: { table: { label: string } }) => s.table.label)).toEqual(["A-1"]);
  });
});

describe("bordas dos atendimentos", () => {
  it("atendimento com keep_open não vence por TIMEOUT no scan", async () => {
    const { restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    const session = await createSession(restaurantId, table.id, "ACTIVE", new Date(Date.now() - 1000));
    await prisma.table_sessions.update({ where: { id: session.id }, data: { keep_open: true } });

    expect((await scan(table.public_code)).status).toBe(201);
    expect((await activeOf(table.id)).map((s) => s.id)).toEqual([session.id]);
  });

  it("estender um atendimento já vencido conta a partir de agora", async () => {
    const { token, restaurantId } = await ownerOf("a");
    const table = await createTable(restaurantId);
    const session = await createSession(restaurantId, table.id, "ACTIVE", new Date(Date.now() - HOUR));

    const res = await api().post(`/api/v1/sessions/${session.id}/extend`).set(auth(token));

    expect(new Date(res.body.expires_at).getTime() - Date.now()).toBeGreaterThan(3.9 * HOUR);
  });

  it("id inválido dá 400 e sem token dá 401 nas rotas do balcão", async () => {
    const { token } = await ownerOf("a");

    expect((await api().post("/api/v1/sessions/nao-e-uuid/close").set(auth(token))).status).toBe(400);
    expect((await api().get("/api/v1/sessions")).status).toBe(401);
    expect((await api().post("/api/v1/sessions/00000000-0000-4000-8000-000000000000/extend")).status).toBe(401);
  });
});

describe("extendIfActive", () => {
  it("estende o ativo e não mexe no encerrado", async () => {
    const { restaurantId } = await ownerOf("a");
    const repository = new TableSessionRepository(prisma);
    const active = await createSession(restaurantId, (await createTable(restaurantId, "A")).id);
    const closed = await createSession(restaurantId, (await createTable(restaurantId, "B")).id, "CLOSED");
    const later = new Date(Date.now() + 8 * 60 * 60 * 1000);

    expect((await repository.extendIfActive(restaurantId, active.id, later)).count).toBe(1);
    expect((await repository.extendIfActive(restaurantId, closed.id, later)).count).toBe(0);

    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: active.id } })).expires_at).toEqual(later);
    expect((await prisma.table_sessions.findUniqueOrThrow({ where: { id: closed.id } })).expires_at).not.toEqual(later);
  });
});
