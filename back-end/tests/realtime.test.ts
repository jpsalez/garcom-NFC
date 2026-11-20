import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/server.ts";
import { authenticateToken } from "../src/shared/middlewares/auth.middleware.ts";
import type { IPrintingService } from "../src/modules/printing/printing.interfaces.ts";
import type { ISessionsService } from "../src/modules/sessions/sessions.interfaces.ts";
import { container } from "../src/shared/container/container.ts";
import type { SocketNotifier } from "../src/shared/realtime/socket-notifier.ts";
import { api } from "./helpers/app.ts";
import { auth, cookieOf, ownerOf, staffToken } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { passwordHash } from "../src/shared/utils/password.ts";
import { createTable } from "./helpers/factories.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

let server: Server;
let url: string;
const sockets: Socket[] = [];

// Sobe o servidor HTTP com o Socket.IO ligado, como o main.ts faz
beforeAll(async () => {
  api();
  server = createServer(app);
  const printing = container.resolve<IPrintingService>("PrintingService");
  container.resolve<SocketNotifier>("Notifier").attach(
    server, authenticateToken, [], (ticket) => printing.authenticateStationSocket(ticket),
  );
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
  // O navegador manda o cookie de sessão no handshake; aqui ele é montado à mão
  const extraHeaders = token ? { cookie: `access_token=${token}` } : undefined;
  const socket = connect(url, { extraHeaders, reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise<Socket>((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

const next = (socket: Socket, event: string) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    socket.once(event, resolve);
    setTimeout(() => reject(new Error(`evento ${event} não chegou`)), 2000);
  });

describe("sala autorizada de pedidos", () => {
  it("reconcilia pedidos do QR na cozinha e no atendimento após preparo concorrente e reconexão", async () => {
    const f = await menuFixture();
    const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const other = await categoryToken(f.restaurantId, "OTHER");
    const foreign = await ownerOf("fila-externa");
    const kitchenSocket = await connectAs(kitchen.token);
    const waiterSocket = await connectAs(waiter.token);
    const kitchenCreated = next(kitchenSocket, "order:created");
    const waiterCreated = next(waiterSocket, "order:created");

    const submit = (quantity: number) =>
      api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(f.submission(quantity));
    const list = (token: string) => api().get("/api/v1/orders?progress=open").set(auth(token));
    const created = await submit(3);
    expect(created.status).toBe(201);
    const { id, items, version } = created.body.order;
    expect(await kitchenCreated).toEqual({ order_id: id, version });
    expect(await waiterCreated).toEqual({ order_id: id, version });
    const [kitchenView, waiterView, denied, foreignView] = await Promise.all([
      list(kitchen.token),
      list(waiter.token),
      list(other.token),
      list(foreign.token),
    ]);
    expect(kitchenView.body.items).toMatchObject([{ id, version }]);
    expect(waiterView.body.items).toMatchObject([{ id, version }]);
    expect(denied.status).toBe(403);
    expect(foreignView.body.items).toEqual([]);

    const move = (
      token: string,
      expected_version: number,
      from_stage: string,
      to_stage: string,
      quantity: number,
    ) =>
      api()
        .post(`/api/v1/orders/${id}/transitions`)
        .set(auth(token))
        .send({
          expected_version,
          operations: [{ item_id: items[0].id, from_stage, to_stage, quantity }],
        });
    const updated = next(waiterSocket, "order:updated");
    const attempts = await Promise.all([
      move(kitchen.token, version, "PENDING", "PREPARING", 2),
      move(waiter.token, version, "PENDING", "PREPARING", 2),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(attempts.find(({ status }) => status === 409)?.body.code).toBe("ORDER_VERSION_CONFLICT");
    expect(await updated).toEqual({ order_id: id, version: version + 1 });
    const fresh = await list(kitchen.token);
    expect(fresh.body.items[0]).toMatchObject({
      version: version + 1,
      progress: { pending: 1, preparing: 2 },
    });

    kitchenSocket.disconnect();
    const missed = await submit(1);
    expect(missed.status).toBe(201);
    const readyEvent = next(waiterSocket, "order:updated");
    const ready = await move(kitchen.token, fresh.body.items[0].version, "PREPARING", "READY", 1);
    expect(ready.status).toBe(200);
    expect(await readyEvent).toEqual({ order_id: id, version: ready.body.version });
    const waiterFresh = await list(waiter.token);
    const toDeliver = waiterFresh.body.items.find((order: { id: string }) => order.id === id);
    expect(toDeliver.progress).toMatchObject({ pending: 1, preparing: 1, ready: 1 });
    const delivered = await move(waiter.token, toDeliver.version, "READY", "DELIVERED", 1);
    expect(delivered.body.progress).toMatchObject({ pending: 1, preparing: 1, ready: 0, delivered: 1 });

    await connectAs(kitchen.token);
    const recovered = await list(kitchen.token);
    expect(recovered.body.items).toHaveLength(2);
    expect(recovered.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: missed.body.order.id }),
        expect.objectContaining({ id, version: delivered.body.version }),
      ]),
    );
  });
  it("avisa equipe operacional sem vazar para outros STAFF ou restaurante", async () => {
    const a = await ownerOf("orders-a"),
      b = await ownerOf("orders-b");
    const waiter = await categoryToken(a.restaurantId, "WAITER"),
      other = await categoryToken(a.restaurantId, "OTHER");
    const ownSocket = await connectAs(a.token),
      waiterSocket = await connectAs(waiter.token),
      otherSocket = await connectAs(other.token),
      foreignSocket = await connectAs(b.token);
    const ownEvent = next(ownSocket, "order:created"),
      waiterEvent = next(waiterSocket, "order:created");
    const otherSilent = expectSilence(otherSocket, "order:created"),
      foreignSilent = expectSilence(foreignSocket, "order:created");
    container
      .resolve<SocketNotifier>("Notifier")
      .toOrders(a.restaurantId, "order:created", { order_id: "test-order", version: 1 });
    expect(await ownEvent).toEqual({ order_id: "test-order", version: 1 });
    expect(await waiterEvent).toEqual({ order_id: "test-order", version: 1 });
    await otherSilent();
    await foreignSilent();
  });
  it("trocar categoria derruba socket antes de permitir nova conexão sem capacidade", async () => {
    const owner = await ownerOf("downgrade-socket"),
      manager = await categoryToken(owner.restaurantId, "MANAGER");
    const socket = await connectAs(manager.token);
    const disconnected = new Promise<void>((resolve) => socket.once("disconnect", () => resolve()));
    expect(
      (
        await api()
          .patch(`/api/v1/staff/${manager.user.id}`)
          .set(auth(owner.token))
          .send({ category: "OTHER" })
      ).status,
    ).toBe(200);
    await disconnected;
    const reconnected = await connectAs(manager.token),
      silent = expectSilence(reconnected, "order:updated");
    container
      .resolve<SocketNotifier>("Notifier")
      .toOrders(owner.restaurantId, "order:updated", { order_id: "test-order", version: 2 });
    await silent();
  });
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

  it("não aceita mais o JWT em handshake.auth (só no cookie)", async () => {
    const { token } = await ownerOf("a");
    const socket = connect(url, { auth: { token }, reconnection: false, forceNew: true });
    sockets.push(socket);

    await expect(
      new Promise<void>((resolve, reject) => {
        socket.on("connect", () => resolve());
        socket.on("connect_error", reject);
      }),
    ).rejects.toThrow();
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
    const { deviceToken } = await tableWithDevice(a.restaurantId, "Mesa 12");
    const received = next(counterA, "call:created");

    await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "BILL" });

    expect(await received).toMatchObject({ type: "BILL", status: "OPEN", table: { label: "Mesa 12" } });
    await silenceB();
  });

  it("chamado repetido não emite de novo", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const { deviceToken } = await tableWithDevice(a.restaurantId);
    await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "WAITER" });
    const silence = expectSilence(counter, "call:created");

    await api().post("/api/v1/public/calls").set("X-Table-Token", deviceToken).send({ type: "WAITER" });

    await silence();
  });

  it("call:done ao finalizar", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const { deviceToken } = await tableWithDevice(a.restaurantId);
    const call = await api()
      .post("/api/v1/public/calls")
      .set("X-Table-Token", deviceToken)
      .send({ type: "WAITER" });
    const received = next(counter, "call:done");

    await api().patch(`/api/v1/calls/${call.body.id}/done`).set(auth(a.token));

    expect(await received).toEqual({ id: call.body.id });
  });

  it("session:opened no scan e no balcão, só uma vez por atendimento", async () => {
    const a = await ownerOf("a");
    const counter = await connectAs(a.token);
    const table = await createTable(a.restaurantId, "Mesa 3");
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
    const { table } = await tableWithDevice(a.restaurantId);
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
    const { table } = await tableWithDevice(a.restaurantId);
    await prisma.table_sessions.updateMany({
      where: { table_id: table.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    const closed = next(counter, "session:closed");

    await container.resolve<ISessionsService>("SessionsService").expireDue();

    expect(await closed).toMatchObject({ reason: "TIMEOUT" });
  });
});

describe("desconexão ao perder o acesso", () => {
  const disconnected = (socket: Socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once("disconnect", () => resolve());
      setTimeout(() => reject(new Error("o socket não foi desconectado")), 2000);
    });

  it("desativar ou excluir o STAFF derruba o socket dele, mas não o do OWNER", async () => {
    const a = await ownerOf("a");
    const staffA = await api()
      .post("/api/v1/staff")
      .set(auth(a.token))
      .send({ name: "G1", email: "g1@teste.com", password: "senha-forte-123" });
    const staffB = await api()
      .post("/api/v1/staff")
      .set(auth(a.token))
      .send({ name: "G2", email: "g2@teste.com", password: "senha-forte-123" });
    const tokenOf = async (email: string) =>
      cookieOf(
        await api().post("/api/v1/auth/login").send({ email, password: "senha-forte-123" }),
        "access_token",
      );
    const owner = await connectAs(a.token);
    const first = await connectAs(await tokenOf("g1@teste.com"));
    const second = await connectAs(await tokenOf("g2@teste.com"));

    const firstGone = disconnected(first);
    await api().patch(`/api/v1/staff/${staffA.body.id}`).set(auth(a.token)).send({ active: false });
    await firstGone;
    const secondGone = disconnected(second);
    await api().delete(`/api/v1/staff/${staffB.body.id}`).set(auth(a.token));
    await secondGone;

    expect(owner.connected).toBe(true);
  });

  it("desativar o restaurante derruba todos os sockets dele e só dele", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    const counterA = await connectAs(a.token);
    const counterB = await connectAs(b.token);
    await prisma.users.create({
      data: {
        name: "Super",
        email: "super@teste.com",
        password_hash: await passwordHash("senha-forte-123"),
        role: "SUPER_ADMIN",
      },
    });
    const superToken = cookieOf(
      await api().post("/api/v1/auth/login").send({ email: "super@teste.com", password: "senha-forte-123" }),
      "access_token",
    ) as string;
    const gone = disconnected(counterA);

    await api()
      .patch(`/api/v1/admin/restaurants/${a.user.restaurant_id}`)
      .set(auth(superToken))
      .send({ active: false });

    await gone;
    expect(counterB.connected).toBe(true);
  });
});

describe("avisos de impressão da estação", () => {
  const settings = "/api/v1/printing/kitchen";
  const station = "/api/v1/printing/station";

  async function bindStation(ownerToken: string) {
    const response = await api().post(`${station}/connect`).set(auth(ownerToken)).send({ paper_width: 80 });
    expect(response.status).toBe(204);
    const cookie = `kitchen_print_station=${cookieOf(response, "kitchen_print_station")}`;
    const ticket = await api().post(`${station}/socket-ticket`).set("Cookie", cookie);
    expect(ticket.status).toBe(200);
    return { cookie, ticket: ticket.body.ticket as string };
  }

  function connectStation(ticket?: string) {
    const socket = connect(`${url}/print-station`, {
      auth: { ticket }, reconnection: false, forceNew: true,
    });
    sockets.push(socket);
    return new Promise<Socket>((resolve, reject) => {
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  }

  it("avisa no próprio restaurante após commit e desconecta ao revogar a credencial", async () => {
    const f = await menuFixture();
    const other = await ownerOf("estacao-externa");
    const localStation = await bindStation(f.token);
    const foreignStation = await bindStation(other.token);
    await expect(connectStation(f.token)).rejects.toThrow("Estação não autorizada");
    expect((await api().post(`${station}/socket-ticket`).set(auth(f.token))).status).toBe(401);

    const local = await connectStation(localStation.ticket);
    const foreign = await connectStation(foreignStation.ticket);
    const staff = await connectAs(f.token);
    const foreignSilence = expectSilence(foreign, "print:available");
    const staffSilence = expectSilence(staff, "print:available");
    const claim = () => api().post(`${station}/next`).set("Cookie", localStation.cookie);
    const report = (token: string) => api().post(`${station}/result`).set("Cookie", localStation.cookie)
      .send({ token, submitted: true });

    expect((await claim()).status).toBe(204);
    const testSignal = next(local, "print:available");
    expect((await api().post(`${settings}/test`).set(auth(f.token))).status).toBe(200);
    expect(await testSignal).toBeUndefined();
    const test = (await claim()).body;
    expect(test.document).toBe("TEST");
    expect((await report(test.token)).status).toBe(204);

    expect((await api().post(`${station}/verify-test`).set(auth(f.token)).send({ token: test.token })).status).toBe(200);
    const enabledSignal = next(local, "print:available");
    expect((await api().patch(settings).set(auth(f.token)).send({ enabled: true })).status).toBe(200);
    await enabledSignal;
    const submit = (data: ReturnType<typeof f.submission>) =>
      api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(data);
    const original = f.submission();
    const orderSignal = next(local, "print:available");
    const created = await submit(original);
    expect(created.status).toBe(201);
    expect(await orderSignal).toBeUndefined();
    const job = (await claim()).body;
    expect(job.document.order_id).toBe(created.body.order.id);
    expect((await report(job.token)).status).toBe(204);
    const replaySilence = expectSilence(local, "print:available");
    expect((await submit(original)).status).toBe(200);
    await Promise.all([replaySilence(), foreignSilence(), staffSilence()]);

    const disconnected = next(local, "disconnect");
    expect((await api().delete(`${settings}/printer`).set(auth(f.token))).status).toBe(204);
    await disconnected;
    await expect(connectStation(localStation.ticket)).rejects.toThrow("Estação não autorizada");
  });
});
