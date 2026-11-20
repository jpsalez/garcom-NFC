import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const settings = "/api/v1/printing/kitchen";
const printerSetup = `${settings}/printer`;
const cloud = "/api/v1/printing/cloudprnt";
const jobs = "/api/v1/print-jobs";

const provision = (token: string) => api().post(printerSetup).set(auth(token));
const status = (token: string) => api().get(settings).set(auth(token));
const setEnabled = (token: string, enabled: boolean) =>
  api().patch(settings).set(auth(token)).send({ enabled });
const queueTest = (token: string) => api().post(`${settings}/test`).set(auth(token));
const basic = (password: string) => ({ Authorization: `Basic ${Buffer.from(`psiu:${password}`).toString("base64")}` });
const poll = (password: string, statusCode = "200%20OK") => api().post(cloud).set(basic(password)).send({ statusCode });
const download = (password: string, token: string, type = "image/png") =>
  api().get(cloud).set(basic(password)).query({ token, type });
const confirm = (password: string, token: string, code = "200 OK") =>
  api().delete(cloud).set(basic(password)).query({ token, code });
const list = (token: string, query = {}) => api().get(jobs).set(auth(token)).query(query);

async function completeTest(token: string, password: string) {
  expect((await queueTest(token)).body.test_status).toBe("PENDING");
  const offer = await poll(password);
  expect(offer.body).toMatchObject({ jobReady: true, mediaTypes: ["image/png"], deleteMethod: "DELETE" });
  const id = offer.body.jobToken as string;
  expect((await download(password, id)).headers["content-type"]).toBe("image/png");
  expect((await confirm(password, id)).status).toBe(200);
  expect((await status(token)).body.test_status).toBe("SENT");
}

async function enablePrinting(token: string) {
  const issued = await provision(token);
  expect(issued.status).toBe(201);
  const password = issued.body.password as string;
  expect((await poll(password)).status).toBe(200);
  await completeTest(token, password);
  expect((await setEnabled(token, true)).status).toBe(200);
  return password;
}

async function fetchNext(password: string) {
  const offer = await poll(password);
  expect(offer.body.jobReady).toBe(true);
  const id = offer.body.jobToken as string;
  expect((await download(password, id)).status).toBe(200);
  return prisma.print_jobs.findUniqueOrThrow({ where: { id } });
}

it("deixa OWNER e MANAGER gerenciar somente a própria cozinha", async () => {
  const first = await ownerOf("cozinha-1");
  const second = await ownerOf("cozinha-2");
  const manager = await categoryToken(first.restaurantId, "MANAGER");
  const kitchen = await categoryToken(first.restaurantId, "KITCHEN");

  expect((await api().get(settings)).status).toBe(401);
  expect((await status(first.token)).body).toEqual({
    destination: "KITCHEN",
    enabled: false,
    paired: false,
    last_contact_at: null,
    test_status: null,
    mode: "CLOUDPRNT",
    paper_width: 80,
    test_confirmed: false,
    test_id: null,
  });
  expect((await status(kitchen.token)).status).toBe(403);
  expect((await provision(kitchen.token)).status).toBe(403);
  expect((await setEnabled(kitchen.token, true)).status).toBe(403);
  expect((await api().delete(printerSetup).set(auth(kitchen.token))).status).toBe(403);
  expect(
    (
      await api().patch(settings).set(auth(second.token)).send({
        enabled: true,
        restaurant_id: first.restaurantId,
      })
    ).status,
  ).toBe(400);
  expect((await setEnabled(first.token, true)).body.code).toBe("PRINT_TEST_REQUIRED");

  await enablePrinting(manager.token);
  expect((await status(first.token)).body).toMatchObject({ enabled: true, paired: true });
  expect((await status(second.token)).body).toMatchObject({
    enabled: false,
    paired: false,
    last_contact_at: null,
    test_status: null,
  });
  expect((await setEnabled(manager.token, false)).body.enabled).toBe(false);
  expect((await status(first.token)).body.paired).toBe(true);
});

it("gera credenciais revogáveis, separa tenants e só ativa após teste confirmado", async () => {
  const owner = await ownerOf("parear");
  const other = await ownerOf("outro");
  const issued = await provision(owner.token);
  const password = issued.body.password as string;
  expect(issued.headers["cache-control"]).toBe("no-store");
  expect(issued.body).toEqual({
    username: "psiu", password: expect.stringMatching(/^cloud_/),
    url: "https://app.teste.com/api/v1/printing/cloudprnt",
  });
  expect((await status(owner.token)).body.last_contact_at).toBeNull();
  expect((await status(owner.token)).body).not.toHaveProperty("password");
  expect((await poll(owner.token)).headers["www-authenticate"]).toMatch(/^Basic /);
  expect((await setEnabled(owner.token, true)).body.code).toBe("PRINT_TEST_REQUIRED");
  expect((await queueTest(owner.token)).body.code).toBe("PRINT_PRINTER_OFFLINE");

  const discovery = await api().get(cloud).set(basic(password));
  expect(discovery.body).toMatchObject({ serverSupportProtocol: ["HTTP"] });
  expect((await poll(password)).body.jobReady).toBe(false);
  expect((await status(other.token)).body.last_contact_at).toBeNull();
  expect((await queueTest(owner.token)).body.test_status).toBe("PENDING");
  expect((await poll(password, "410%20Paper%20Empty")).body.jobReady).toBe(false);
  const offer = (await poll(password)).body;
  expect((await confirm(password, offer.jobToken)).status).toBe(200);
  expect((await setEnabled(owner.token, true)).body.code).toBe("PRINT_TEST_REQUIRED");

  await completeTest(owner.token, password);
  expect((await setEnabled(owner.token, true)).status).toBe(200);
  const rotated = (await provision(owner.token)).body.password;
  expect((await poll(password)).status).toBe(401);
  expect((await status(owner.token)).body).toMatchObject({ enabled: false, test_status: null });
  expect((await poll(rotated)).status).toBe(200);
  expect((await api().delete(printerSetup).set(auth(owner.token))).status).toBe(204);
  expect((await poll(rotated)).status).toBe(401);
  expect((await api().post("/api/v1/print-agent/pair")).status).toBe(404);
  expect((await api().post("/api/v1/print-jobs/claim")).status).toBe(404);
});

it("cria uma original versionada no retry concorrente e preserva os pedidos feitos durante a pausa", async () => {
  const f = await menuFixture();
  const other = await menuFixture();
  const submit = (data: ReturnType<typeof f.submission>, token = f.deviceToken) =>
    api().post("/api/v1/public/orders").set("X-Table-Token", token).send(data);
  const earlier = f.submission();
  expect((await submit(earlier)).status).toBe(201);
  await enablePrinting(f.token);
  expect((await submit(earlier)).status).toBe(200);
  expect((await submit(other.submission(), other.deviceToken)).status).toBe(201);
  expect(await prisma.print_jobs.count()).toBe(0);

  const body = f.submission(2);
  const payload = { ...body, items: body.items.map((item) => ({ ...item, notes: "Sem cebola" })) };
  const responses = await Promise.all([submit(payload), submit(payload)]);
  expect(responses.map((res) => res.status).sort()).toEqual([200, 201]);
  const order = responses[0]?.body.order;
  expect(responses.map((res) => res.body.order.id)).toEqual([order.id, order.id]);
  const jobs = await prisma.print_jobs.findMany();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    restaurant_id: f.restaurantId,
    order_id: order.id,
    destination: "KITCHEN",
    source_event: "ORDER_CREATED",
    status: "PENDING",
    payload_version: 1,
    payload: {
      order_id: order.id,
      created_at: order.created_at,
      table_label: f.table.label,
      items: [
        {
          item_id: order.items[0].id,
          product_name: "Hambúrguer",
          variant_name: "Grande",
          quantity: 2,
          notes: "Sem cebola",
          selections: [],
        },
      ],
    },
  });
  const job = await prisma.print_jobs.findFirstOrThrow();
  const original = { ...job, id: randomUUID(), payload: {} };
  await expect(prisma.print_jobs.create({ data: original })).rejects.toMatchObject({ code: "P2002" });
  expect((await provision(other.token)).status).toBe(201);
  await expect(
    prisma.print_jobs.create({
      data: { ...original, restaurant_id: other.restaurantId },
    }),
  ).rejects.toMatchObject({ code: "P2003" });

  expect((await setEnabled(f.token, false)).status).toBe(200);
  expect((await submit(f.submission())).status).toBe(201);
  expect(await prisma.print_jobs.count()).toBe(1);
});

it("reverte pedido, itens e auditoria quando o PostgreSQL rejeita a gravação da comanda", async () => {
  const f = await menuFixture();
  await enablePrinting(f.token);
  const body = f.submission();
  const submit = () => api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(body);

  await prisma.$executeRaw`ALTER TABLE print_jobs ADD CONSTRAINT test_reject_print_job CHECK (false)`;
  try {
    expect((await submit()).status).toBe(500);
    expect(await prisma.orders.count()).toBe(0);
    expect(await prisma.order_items.count()).toBe(0);
    expect(await prisma.order_events.count()).toBe(0);
    expect(await prisma.print_jobs.count()).toBe(0);
  } finally {
    await prisma.$executeRaw`ALTER TABLE print_jobs DROP CONSTRAINT test_reject_print_job`;
  }
  expect((await submit()).status).toBe(201);
  expect(await prisma.orders.count()).toBe(1);
  expect(await prisma.print_jobs.count()).toBe(1);
});

async function queueOrder(f: Awaited<ReturnType<typeof menuFixture>>, quantity = 1) {
  const response = await api()
    .post("/api/v1/public/orders")
    .set("X-Table-Token", f.deviceToken)
    .send(f.submission(quantity));
  expect(response.status).toBe(201);
  return response.body.order;
}

function cancel(
  token: string,
  order: { id: string; items: { id: string }[] },
  quantity: number,
  version = 1,
) {
  return api()
    .post(`/api/v1/orders/${order.id}/transitions`)
    .set(auth(token))
    .send({
      expected_version: version,
      operations: [
        {
          item_id: order.items[0]?.id,
          from_stage: "PENDING",
          to_stage: "CANCELLED",
          quantity,
          reason: "Cliente desistiu",
        },
      ],
    });
}

function copy(token: string, id: string, key = randomUUID(), reason = "Conferida na cozinha") {
  return api().post(`/api/v1/orders/${id}/reprints`).set(auth(token)).send({ idempotency_key: key, reason });
}

it("reserva uma única comanda por vez e isola credencial, destino e restaurante", async () => {
  const f = await menuFixture();
  const other = await menuFixture();
  const credential = await enablePrinting(f.token);
  const foreign = await enablePrinting(other.token);
  const first = await queueOrder(f);
  await queueOrder(f);
  const otherOrder = await queueOrder(other);

  expect((await poll(f.token)).status).toBe(401);
  const offer = (await poll(credential)).body;
  const another = await prisma.print_jobs.findFirstOrThrow({
    where: { restaurant_id: f.restaurantId, id: { not: offer.jobToken } },
  });
  expect((await download(foreign, offer.jobToken)).status).toBe(404);
  expect((await download(credential, offer.jobToken, "text/plain")).status).toBe(415);
  const responses = await Promise.all([download(credential, offer.jobToken), download(credential, offer.jobToken)]);
  expect(responses.map((res) => res.status)).toEqual([200, 200]);
  expect(responses[0]?.body).toEqual(responses[1]?.body);
  expect(responses[0]?.body.subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
  expect(responses[0]?.headers["x-star-cut"]).toBe("partial; feed=true");
  expect((await poll(credential)).body.jobReady).toBe(false);
  expect((await download(credential, another.id)).status).toBe(404);
  const reserved = await prisma.print_jobs.findUniqueOrThrow({ where: { id: offer.jobToken } });
  expect(reserved).toMatchObject({ attempts: 1, order_version: 1, order_id: first.id, status: "SENDING" });
  expect((await confirm(foreign, reserved.id)).status).toBe(200);
  expect((await list(f.token, { status: "SENDING" })).body.jobs).toHaveLength(1);
  expect((await confirm(credential, reserved.id)).status).toBe(200);
  expect((await confirm(credential, reserved.id, "520 Error")).status).toBe(200);
  expect((await fetchNext(credential)).id).toBe(another.id);

  const manager = await categoryToken(f.restaurantId, "MANAGER");
  const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
  const waiter = await categoryToken(f.restaurantId, "WAITER");
  expect((await list(manager.token, { status: "SENT" })).body.jobs).toMatchObject([{ order_id: first.id }]);
  expect((await list(kitchen.token, { order_id: otherOrder.id })).body.jobs).toEqual([]);
  expect((await list(waiter.token)).status).toBe(403);
  const page = await list(f.token, { destination: "KITCHEN", limit: 1 });
  expect(page.body.jobs).toHaveLength(1);
  expect(page.body.jobs[0]).not.toHaveProperty("reservation_credential_hash");
  expect(page.body.next_cursor).toEqual(expect.any(String));
  const tail = await list(f.token, { cursor: page.body.next_cursor, limit: 1 });
  expect(tail.body.jobs).toMatchObject([{ order_id: first.id }]);
  expect(tail.body.next_cursor).toBeNull();
});

it("suprime a original cancelada e fixa versão e quantidades da original parcial", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const cancelled = await queueOrder(f);
  const partial = await queueOrder(f, 3);
  expect((await cancel(f.token, cancelled, 1)).status).toBe(200);
  expect((await cancel(f.token, partial, 1)).status).toBe(200);

  const reservation = await fetchNext(credential);
  expect(reservation).toMatchObject({
    order_version: 2,
    payload: { order_id: partial.id, items: [{ quantity: 2 }] },
  });
  expect((await list(f.token, { status: "SUPPRESSED" })).body.jobs).toMatchObject([
    { order_id: cancelled.id, order_version: 2 },
  ]);
  expect((await cancel(f.token, partial, 2, 2)).status).toBe(200);
  expect((await confirm(credential, reservation.id)).status).toBe(200);
  expect((await list(f.token, { status: "SENT" })).body.jobs).toMatchObject([
    { order_id: partial.id, order_version: 2 },
  ]);
  expect((await copy(f.token, cancelled.id)).status).toBe(409);
  expect((await copy(f.token, partial.id)).status).toBe(409);
});

it("preserva resultado incerto em caso de expiração ou erro informado pela impressora", async () => {
  const f = await menuFixture();
  const password = await enablePrinting(f.token);
  const expiredOrder = await queueOrder(f);
  const failedOrder = await queueOrder(f);
  const expired = await fetchNext(password);
  await prisma.print_jobs.update({ where: { id: expired.id }, data: { reservation_expires_at: new Date(0) } });
  expect((await confirm(password, expired.id)).status).toBe(200);
  expect((await download(password, expired.id)).status).toBe(404);

  const stalePoll = await api().post(cloud).set(basic(password)).send({ statusCode: "200 OK", jobToken: expired.id });
  const failedId = stalePoll.body.jobToken;
  expect(stalePoll.body.jobReady).toBe(true);
  expect((await download(password, failedId)).status).toBe(200);
  const failed = await prisma.print_jobs.findUniqueOrThrow({ where: { id: failedId } });
  expect((await confirm(password, failed.id, "520 Print Error")).status).toBe(200);
  expect((await confirm(password, failed.id)).status).toBe(200);
  expect((await poll(password)).body.jobReady).toBe(false);
  const pending = (await list(f.token, { status: "UNCERTAIN" })).body.jobs;
  expect(pending.map((job: { order_id: string }) => job.order_id).sort()).toEqual(
    [expiredOrder.id, failedOrder.id].sort(),
  );
});

it("registra segunda via idempotente com autoria, vínculo e marca na comanda", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const order = await queueOrder(f, 2);
  const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
  const waiter = await categoryToken(f.restaurantId, "WAITER");
  expect((await copy(kitchen.token, order.id)).status).toBe(409);
  expect((await copy(waiter.token, order.id)).status).toBe(403);
  const original = await fetchNext(credential);
  expect((await copy(kitchen.token, order.id)).status).toBe(409);
  expect((await confirm(credential, original.id)).status).toBe(200);
  expect((await cancel(f.token, order, 1)).status).toBe(200);

  const key = randomUUID();
  const requests = await Promise.all([
    copy(kitchen.token, order.id, key),
    copy(kitchen.token, order.id, key),
  ]);
  expect(requests.map((res) => res.status).sort()).toEqual([200, 201]);
  expect(requests[0]?.body.id).toBe(requests[1]?.body.id);
  expect(requests[0]?.body).toMatchObject({
    original_job_id: original.id,
    requested_by: kitchen.user.id,
    reason: "Conferida na cozinha",
  });
  expect((await copy(kitchen.token, order.id, key, "Outro motivo")).status).toBe(409);
  expect((await copy(f.token, order.id, key)).status).toBe(409);
  const foreign = await ownerOf("segunda-via-outro-restaurante");
  expect((await copy(foreign.token, order.id)).status).toBe(404);
  const reprint = await fetchNext(credential);
  expect(reprint).toMatchObject({
    id: requests[0]?.body.id,
    order_version: 2,
    payload: { order_id: order.id, reprint: { label: "SEGUNDA VIA" }, items: [{ quantity: 1 }] },
  });
  expect((await cancel(f.token, order, 1, 2)).status).toBe(200);
  expect((await copy(kitchen.token, order.id, key)).status).toBe(200);
  expect((await copy(kitchen.token, order.id)).status).toBe(409);
});

it("retém pendências após pausa ou ausência da impressora até a revisão explícita", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const paused = await queueOrder(f);
  expect((await setEnabled(f.token, false)).status).toBe(200);
  expect((await poll(credential)).body.jobReady).toBe(false);
  expect((await setEnabled(f.token, true)).status).toBe(200);
  expect((await poll(credential)).body.jobReady).toBe(false);
  await queueOrder(f);
  const current = await fetchNext(credential);
  expect(current.order_id).not.toBe(paused.id);
  expect((await confirm(credential, current.id)).status).toBe(200);
  const offline = await queueOrder(f);
  await prisma.print_destinations.updateMany({
    where: { restaurant_id: f.restaurantId },
    data: { last_contact_at: new Date(0) },
  });
  expect((await poll(credential)).body.jobReady).toBe(false);
  expect((await poll(credential)).status).toBe(200);
  const review = (await list(f.token, { status: "REVIEW_REQUIRED" })).body.jobs;
  expect(review.map((job: { order_id: string }) => job.order_id).sort()).toEqual(
    [paused.id, offline.id].sort(),
  );
  const reviewJob = (orderId: string, decision: string, token = f.token) =>
    api()
      .patch(settings)
      .set(auth(token))
      .send({
        review: {
          job_ids: [review.find((job: { order_id: string }) => job.order_id === orderId).id],
          decision,
        },
      });
  const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
  expect((await reviewJob(paused.id, "RELEASE", kitchen.token)).status).toBe(403);
  expect((await reviewJob(paused.id, "RELEASE")).status).toBe(200);
  expect((await reviewJob(offline.id, "DISCARD")).status).toBe(200);
  expect((await fetchNext(credential)).order_id).toBe(paused.id);
  expect((await list(f.token, { status: "SUPPRESSED" })).body.jobs).toMatchObject([{ order_id: offline.id }]);
});

it("retém pedidos pendentes e interrompe a reserva ao trocar a impressora", async () => {
  const f = await menuFixture();
  const password = await enablePrinting(f.token);
  await queueOrder(f);
  await queueOrder(f);
  const sending = await fetchNext(password);
  const rotated = (await provision(f.token)).body.password;
  expect((await confirm(password, sending.id)).status).toBe(401);
  expect((await poll(rotated)).body.jobReady).toBe(false);
  expect((await list(f.token, { status: "UNCERTAIN" })).body.jobs).toMatchObject([{ id: sending.id }]);
  expect((await list(f.token, { status: "REVIEW_REQUIRED" })).body.jobs).toHaveLength(1);
});


const station = "/api/v1/printing/station";
const connectStation = (token: string, paper_width = 58) =>
  api().post(`${station}/connect`).set(auth(token)).send({ paper_width });
const nextStationJob = (cookie: string) => api().post(`${station}/next`).set("Cookie", cookie);
const stationResult = (cookie: string, token: string, submitted: boolean) =>
  api().post(`${station}/result`).set("Cookie", cookie).send({ token, submitted });
const verifyStationTest = (owner: string, token: string) =>
  api().post(`${station}/verify-test`).set(auth(owner)).send({ token });

function stationCookie(response: { headers: Record<string, unknown> }) {
  const cookies = response.headers["set-cookie"] as string[];
  expect(cookies[0]).toMatch(/^kitchen_print_station=station_/);
  expect(cookies[0]).toContain("HttpOnly");
  expect(cookies[0]).toContain("SameSite=Strict");
  expect(cookies[0]).toContain("Path=/api/v1/printing/station");
  return cookies[0]?.split(";")[0] as string;
}

it("vincula só o navegador autorizado e exige conferência física da via de teste antes de ativar", async () => {
  const f = await menuFixture();
  const originalPrinter = await enablePrinting(f.token);
  const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
  expect((await connectStation(kitchen.token)).status).toBe(403);
  expect((await connectStation(f.token, 60)).status).toBe(400);
  const connected = await connectStation(f.token);
  expect(connected.status).toBe(204);
  expect(connected.headers["cache-control"]).toBe("no-store");
  expect(connected.body).toEqual({});
  const cookie = stationCookie(connected);
  expect((await poll(originalPrinter)).status).toBe(401);
  expect((await api().post(`${station}/next`).set(auth(f.token))).status).toBe(401);
  expect((await nextStationJob(cookie)).status).toBe(204);
  expect((await status(f.token)).body).toMatchObject({ mode: "BROWSER", paper_width: 58, enabled: false });
  const test = await queueTest(f.token);
  expect(test.body.test_status).toBe("PENDING");
  expect((await verifyStationTest(f.token, test.body.test_id)).status).toBe(409);
  const arrivals = await Promise.all([nextStationJob(cookie), nextStationJob(cookie)]);
  expect(arrivals.map((response) => response.status).sort()).toEqual([200, 204]);
  const job = arrivals.find((response) => response.status === 200)?.body;
  expect(job).toMatchObject({ token: test.body.test_id, document: "TEST", paper_width: 58, valid_for_ms: 120_000 });
  expect((await stationResult(cookie, job.token, true)).status).toBe(204);
  expect((await status(f.token)).body).toMatchObject({ test_status: "SENT", test_confirmed: false });
  expect((await setEnabled(f.token, true)).status).toBe(409);
  expect((await verifyStationTest(kitchen.token, job.token)).status).toBe(403);
  expect((await verifyStationTest(f.token, randomUUID())).status).toBe(409);
  expect((await verifyStationTest(f.token, job.token)).body.test_confirmed).toBe(true);
  expect((await setEnabled(f.token, true)).body.enabled).toBe(true);

  const order = await queueOrder(f);
  const attempts = await Promise.all([nextStationJob(cookie), nextStationJob(cookie)]);
  expect(attempts.map((response) => response.status).sort()).toEqual([200, 204]);
  const claimed = attempts.find((response) => response.status === 200)?.body;
  expect(claimed.document).toMatchObject({ order_id: order.id, table_label: f.table.label });
  expect((await stationResult(cookie, claimed.token, true)).status).toBe(204);
  expect((await stationResult(cookie, claimed.token, false)).status).toBe(204);
  expect((await list(f.token, { order_id: order.id })).body.jobs).toMatchObject([
    { status: "SENT", delivery_mode: "BROWSER", attempts: 1 },
  ]);
  expect((await nextStationJob(cookie)).status).toBe(204);
});

it("preserva resultado incerto após perda da estação, isola tenants e revoga no retorno ao CloudPRNT", async () => {
  const f = await menuFixture();
  const other = await menuFixture();
  const cookie = stationCookie(await connectStation(f.token, 80));
  const foreignCookie = stationCookie(await connectStation(other.token, 80));
  await nextStationJob(cookie);
  const test = await queueTest(f.token);
  await nextStationJob(cookie);
  await stationResult(cookie, test.body.test_id, true);
  await verifyStationTest(f.token, test.body.test_id);
  expect((await setEnabled(f.token, true)).status).toBe(200);

  const order = await queueOrder(f);
  const claim = await nextStationJob(cookie);
  expect(claim.body.document.order_id).toBe(order.id);
  expect((await nextStationJob(foreignCookie)).status).toBe(204);
  expect((await stationResult(foreignCookie, claim.body.token, true)).status).toBe(204);
  expect((await list(f.token, { order_id: order.id })).body.jobs[0].status).toBe("SENDING");
  await prisma.print_jobs.update({
    where: { id: claim.body.token }, data: { reservation_expires_at: new Date(0) },
  });
  expect((await nextStationJob(cookie)).status).toBe(204);
  expect((await stationResult(cookie, claim.body.token, true)).status).toBe(204);
  expect((await list(f.token, { order_id: order.id })).body.jobs[0].status).toBe("UNCERTAIN");

  const cloudPassword = (await provision(f.token)).body.password;
  expect((await nextStationJob(cookie)).status).toBe(401);
  expect((await poll(cloudPassword)).body.jobReady).toBe(false);
  expect((await status(f.token)).body).toMatchObject({
    mode: "CLOUDPRNT", paper_width: 80, enabled: false, test_confirmed: false,
  });
});

it("atualiza presença da estação no máximo uma vez por janela de trinta segundos", async () => {
  const owner = await ownerOf("presenca-estacao");
  const cookie = stationCookie(await connectStation(owner.token));
  expect((await nextStationJob(cookie)).status).toBe(204);
  const initial = (await status(owner.token)).body.last_contact_at;
  expect(initial).toEqual(expect.any(String));
  expect((await nextStationJob(cookie)).status).toBe(204);
  expect((await status(owner.token)).body.last_contact_at).toBe(initial);
  const older = new Date(Date.now() - 45_000);
  await prisma.print_destinations.updateMany({
    where: { restaurant_id: owner.restaurantId }, data: { last_contact_at: older },
  });
  expect((await nextStationJob(cookie)).status).toBe(204);
  expect(new Date((await status(owner.token)).body.last_contact_at).getTime()).toBeGreaterThan(older.getTime());
});
