import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { auth, ownerOf, staffToken } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// Mesa com atendimento aberto pelo scan: devolve o token do aparelho
async function tableWithDevice(restaurantId: string, label = "Mesa 1") {
  const table = await createTable(restaurantId, label);
  const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
  return { table, deviceToken: scan.body.token as string };
}

const callAs = (deviceToken: string, type = "WAITER") =>
  api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type });

describe("POST /public/calls", () => {
  it("primeiro chamado: 201 com tipo, status OPEN e rótulo da mesa", async () => {
    const { user } = await ownerOf("a");
    const { deviceToken } = await tableWithDevice(user.restaurant_id!, "Mesa 12");

    const res = await callAs(deviceToken);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "WAITER", status: "OPEN", table: { label: "Mesa 12" } });
  });

  it("repetir o mesmo tipo devolve o mesmo chamado (200) sem reiniciar o created_at", async () => {
    const { user } = await ownerOf("a");
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);

    const first = await callAs(deviceToken);
    const again = await callAs(deviceToken);

    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body.created_at).toBe(first.body.created_at);
    expect(await prisma.calls.count()).toBe(1);
  });

  it("garçom e conta coexistem; outro aparelho da mesma mesa também repete o chamado aberto", async () => {
    const { user } = await ownerOf("a");
    const { table, deviceToken } = await tableWithDevice(user.restaurant_id!);
    const other = (await api().post(`/api/v1/public/tables/${table.public_code}/scan`)).body.token;

    const waiter = await callAs(deviceToken, "WAITER");
    const bill = await callAs(deviceToken, "BILL");
    const fromOther = await callAs(other, "WAITER");

    expect(bill.status).toBe(201);
    expect(fromOther.body.id).toBe(waiter.body.id);
    expect(await prisma.calls.count()).toBe(2);
  });

  it("toques simultâneos geram um chamado só", async () => {
    const { user } = await ownerOf("a");
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);

    const results = await Promise.all([1, 2, 3, 4].map(() => callAs(deviceToken)));

    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.calls.count()).toBe(1);
  });

  it("depois de finalizado, um novo toque cria outro chamado", async () => {
    const { token, user } = await ownerOf("a");
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);
    const first = await callAs(deviceToken);
    await api().patch(`/api/v1/calls/${first.body.id}/done`).set(auth(token));

    const second = await callAs(deviceToken);

    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("corpo inválido dá 400", async () => {
    const { user } = await ownerOf("a");
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);

    expect((await callAs(deviceToken, "OUTRO")).status).toBe(400);
  });

  it("sem token, token desconhecido, revogado ou de atendimento vencido: 401", async () => {
    const { token, user } = await ownerOf("a");
    const { table, deviceToken } = await tableWithDevice(user.restaurant_id!);

    expect((await api().post("/api/v1/public/calls").send({ type: "WAITER" })).status).toBe(401);
    expect((await callAs("token-que-nao-existe")).status).toBe(401);

    await prisma.table_sessions.updateMany({ where: { table_id: table.id }, data: { expires_at: new Date(Date.now() - 1000) } });
    expect((await callAs(deviceToken)).status).toBe(401);

    await prisma.table_sessions.updateMany({ where: { table_id: table.id }, data: { expires_at: new Date(Date.now() + 1000 * 60) } });
    expect((await callAs(deviceToken)).status).toBe(201);

    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(token));
    expect((await callAs(deviceToken)).status).toBe(401);
  });

  it("limita a 10 chamados por 5 min por token", async () => {
    // Só aqui o limite fica ligado (em testes ele é desligado)
    process.env.RATE_LIMIT_TEST = "on";
    try {
      const { user } = await ownerOf("a");
      const { deviceToken } = await tableWithDevice(user.restaurant_id!);

      const statuses = [];
      for (let i = 0; i < 11; i++) statuses.push((await callAs(deviceToken)).status);

      expect(statuses.slice(0, 10)).not.toContain(429);
      expect(statuses[10]).toBe(429);
    } finally {
      delete process.env.RATE_LIMIT_TEST;
    }
  });
});

describe("GET /calls", () => {
  it("lista os abertos do próprio restaurante, em ordem de chegada, com serverTime", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const one = await tableWithDevice(a.user.restaurant_id!, "A-1");
    const two = await tableWithDevice(a.user.restaurant_id!, "A-2");
    const deB = await tableWithDevice(b.user.restaurant_id!, "B-1");
    await callAs(one.deviceToken, "BILL");
    await callAs(two.deviceToken);
    await callAs(deB.deviceToken);

    const res = await api().get("/api/v1/calls").set(auth(a.token));

    expect(res.status).toBe(200);
    expect(Math.abs(new Date(res.body.serverTime).getTime() - Date.now())).toBeLessThan(5000);
    expect(res.body.calls.map((c: { table: { label: string } }) => c.table.label)).toEqual(["A-1", "A-2"]);
  });

  it("?status=DONE lista os finalizados; status inválido dá 400; sem token dá 401", async () => {
    const { token, user } = await ownerOf("a");
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);
    const call = await callAs(deviceToken);
    await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(token));

    const done = await api().get("/api/v1/calls?status=DONE").set(auth(token));
    const open = await api().get("/api/v1/calls").set(auth(token));

    expect(done.body.calls).toHaveLength(1);
    expect(open.body.calls).toHaveLength(0);
    expect((await api().get("/api/v1/calls?status=QUALQUER").set(auth(token))).status).toBe(400);
    expect((await api().get("/api/v1/calls")).status).toBe(401);
  });
});

describe("PATCH /calls/:id/done", () => {
  it("STAFF finaliza e done_by recebe o id dele (DEC-06)", async () => {
    const { token, user } = await ownerOf("a");
    const staff = await staffToken(token);
    const staffUser = await prisma.users.findUniqueOrThrow({ where: { email: "garcom@teste.com" } });
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);
    const call = await callAs(deviceToken);

    const res = await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(staff));

    expect(res.status).toBe(200);
    const saved = await prisma.calls.findUniqueOrThrow({ where: { id: call.body.id } });
    expect([saved.status, saved.done_by]).toEqual(["DONE", staffUser.id]);
    expect(saved.done_at).not.toBeNull();
  });

  it("duas finalizações simultâneas: uma 200 e outra 409 CALL_NOT_OPEN", async () => {
    const { token, user } = await ownerOf("a");
    const staff = await staffToken(token);
    const { deviceToken } = await tableWithDevice(user.restaurant_id!);
    const call = await callAs(deviceToken);

    const results = await Promise.all([token, staff].map((t) => api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(t))));

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe("CALL_NOT_OPEN");
  });

  it("chamado cancelado pelo encerramento da mesa dá 409; de outro restaurante dá 404", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const { table, deviceToken } = await tableWithDevice(a.user.restaurant_id!);
    const call = await callAs(deviceToken);
    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(a.token));

    expect((await prisma.calls.findUniqueOrThrow({ where: { id: call.body.id } })).status).toBe("CANCELLED");
    expect((await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(a.token))).status).toBe(409);
    expect((await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(b.token))).status).toBe(404);
  });
});
