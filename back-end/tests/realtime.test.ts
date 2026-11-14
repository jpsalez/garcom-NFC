import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/server.ts";
import { authenticateToken } from "../src/shared/middlewares/auth.middleware.ts";
import type { ISessionsService } from "../src/modules/sessions/sessions.interfaces.ts";
import { container } from "../src/shared/container/container.ts";
import type { SocketNotifier } from "../src/shared/realtime/socket-notifier.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf, staffToken } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createTable } from "./helpers/factories.ts";

let server: Server;
let url: string;
const sockets: Socket[] = [];

// Sobe o servidor HTTP com o Socket.IO ligado, como o main.ts faz
beforeAll(async () => {
  api();
  server = createServer(app);
  container.resolve<SocketNotifier>("Notifier").attach(server, authenticateToken, []);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await container.resolve<SocketNotifier>("Notifier").close();
  await prisma.$disconnect();
});

beforeEach(resetDb);
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

// Conecta e espera a conexão (ou a recusa)
function connectAs(token?: string) {
  const socket = connect(url, { auth: { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise<Socket>((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

const next = (socket: Socket, event: string) =>
  new Promise<any>((resolve, reject) => {
    socket.once(event, resolve);
    setTimeout(() => reject(new Error(`evento ${event} não chegou`)), 2000);
  });

// Garante que nada chega ao socket durante um curto intervalo
function expectSilence(socket: Socket, event: string) {
  let received = false;
  socket.on(event, () => (received = true));
  return async () => {
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toBe(false);
  };
}

async function tableWithDevice(restaurantId: string, label = "Mesa 1") {
  const table = await createTable(restaurantId, label);
  const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
  return { table, deviceToken: scan.body.token as string };
}

describe("conexão", () => {
  it("recusa sem token e com token inválido", async () => {
    await expect(connectAs()).rejects.toThrow();
    await expect(connectAs("token-invalido")).rejects.toThrow();
  });

  it("recusa SUPER_ADMIN (não tem restaurante) e aceita OWNER e STAFF", async () => {
    const { token } = await ownerOf("a");
    const staff = await staffToken(token);
    await prisma.users.create({
      data: { name: "Super", email: "super@teste.com", password_hash: "x", role: "SUPER_ADMIN" },
    });
    const { signToken } = await import("../src/shared/utils/jwt.ts");
    const superUser = await prisma.users.findUniqueOrThrow({ where: { email: "super@teste.com" } });
    const superToken = signToken({ sub: superUser.id, restaurantId: null, role: "SUPER_ADMIN" });

    await expect(connectAs(superToken)).rejects.toThrow();
    await expect(connectAs(token)).resolves.toBeDefined();
    await expect(connectAs(staff)).resolves.toBeDefined();
  });
});

describe("eventos do balcão", () => {
  it("call:created chega ao restaurante certo e não ao outro", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const counterA = await connectAs(a.token);
    const counterB = await connectAs(b.token);
    const silenceB = expectSilence(counterB, "call:created");
    const { deviceToken } = await tableWithDevice(a.user.restaurant_id!, "Mesa 12");
    const received = next(counterA, "call:created");

    await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "BILL" });

    expect(await received).toMatchObject({ type: "BILL", status: "OPEN", table: { label: "Mesa 12" } });
    await silenceB();
  });

  it("chamado repetido não emite de novo", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const { deviceToken } = await tableWithDevice(a.user.restaurant_id!);
    await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "WAITER" });
    const silence = expectSilence(counter, "call:created");

    await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "WAITER" });

    await silence();
  });

  it("call:done ao finalizar", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const { deviceToken } = await tableWithDevice(a.user.restaurant_id!);
    const call = await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "WAITER" });
    const received = next(counter, "call:done");

    await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(a.token));

    expect(await received).toEqual({ id: call.body.id });
  });

  it("session:opened no scan e no balcão, só uma vez por atendimento", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const table = await createTable(a.user.restaurant_id!, "Mesa 3");
    const opened = next(counter, "session:opened");

    await api().post(`/api/v1/public/tables/${table.public_code}/scan`);

    expect(await opened).toMatchObject({ table: { id: table.id, label: "Mesa 3" } });
    const silence = expectSilence(counter, "session:opened");
    await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
    await silence();
  });

  it("session:extended e session:closed (com o motivo)", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const { table } = await tableWithDevice(a.user.restaurant_id!);
    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    const extended = next(counter, "session:extended");
    await api().post(`/api/v1/sessions/${session.id}/extend`).set(auth(a.token));
    const closed = next(counter, "session:closed");

    await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(a.token));

    expect(await extended).toMatchObject({ id: session.id });
    expect(await closed).toEqual({ id: session.id, reason: "STAFF" });
  });

  it("session:closed com TIMEOUT quando o atendimento vence", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const { table } = await tableWithDevice(a.user.restaurant_id!);
    await prisma.table_sessions.updateMany({ where: { table_id: table.id }, data: { expires_at: new Date(Date.now() - 1000) } });
    const closed = next(counter, "session:closed");

    await container.resolve<ISessionsService>("SessionsService").expireDue();

    expect(await closed).toMatchObject({ reason: "TIMEOUT" });
  });
});
