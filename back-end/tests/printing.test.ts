import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const settings = "/api/v1/printing/kitchen";
const pairing = `${settings}/pairing`;
const exchange = "/api/v1/print-agent/pair";
const contact = "/api/v1/print-agent/contact";

const issueCode = (token: string) => api().post(pairing).set(auth(token));
const pair = (code: string) => api().post(exchange).send({ code });
const status = (token: string) => api().get(settings).set(auth(token));
const setEnabled = (token: string, enabled: boolean) =>
  api().patch(settings).set(auth(token)).send({ enabled });
const checkIn = (credential: string) => api().post(contact).set("Authorization", `Bearer ${credential}`);

async function enablePrinting(token: string) {
  const issued = await issueCode(token);
  expect(issued.status).toBe(201);
  const paired = await pair(issued.body.code);
  expect(paired.status).toBe(201);
  expect((await setEnabled(token, true)).status).toBe(200);
  return paired.body.credential as string;
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
  });
  expect((await status(kitchen.token)).status).toBe(403);
  expect((await issueCode(kitchen.token)).status).toBe(403);
  expect((await setEnabled(kitchen.token, true)).status).toBe(403);
  expect((await api().delete(pairing).set(auth(kitchen.token))).status).toBe(403);
  expect(
    (
      await api().patch(settings).set(auth(second.token)).send({
        enabled: true,
        restaurant_id: first.restaurantId,
      })
    ).status,
  ).toBe(400);
  expect((await setEnabled(first.token, true)).body.code).toBe("PRINT_AGENT_NOT_PAIRED");

  await enablePrinting(manager.token);
  expect((await status(first.token)).body).toMatchObject({ enabled: true, paired: true });
  expect((await status(second.token)).body).toMatchObject({
    enabled: false,
    paired: false,
    last_contact_at: null,
  });
  expect((await setEnabled(manager.token, false)).body.enabled).toBe(false);
  expect((await status(first.token)).body.paired).toBe(true);
});

it("expira, substitui e consome o código uma única vez mesmo em concorrência", async () => {
  const owner = await ownerOf("parear");
  const expired = await issueCode(owner.token);
  expect(expired.status).toBe(201);
  expect(new Date(expired.body.expires_at).getTime()).toBeGreaterThan(Date.now());
  await prisma.print_destinations.updateMany({
    where: { restaurant_id: owner.restaurantId },
    data: { pairing_expires_at: new Date(0) },
  });
  expect((await pair(expired.body.code)).status).toBe(401);

  const replaced = await issueCode(owner.token);
  const fresh = await issueCode(owner.token);
  expect((await pair(replaced.body.code)).status).toBe(401);
  expect(
    (
      await api().post(exchange).send({
        code: fresh.body.code,
        restaurant_id: randomUUID(),
        destination: "KITCHEN",
      })
    ).status,
  ).toBe(400);

  const results = await Promise.all([pair(fresh.body.code), pair(fresh.body.code)]);
  expect(results.map((res) => res.status).sort()).toEqual([201, 401]);
  const success = results.find((res) => res.status === 201);
  expect(success?.headers["cache-control"]).toBe("no-store");
  expect(success?.body).toEqual({ destination: "KITCHEN", credential: expect.any(String) });
  expect((await pair(fresh.body.code)).status).toBe(401);
});

it("registra contato com credencial própria e invalida a credencial e o código ao revogar", async () => {
  const owner = await ownerOf("revogar");
  const other = await ownerOf("outro");
  const issued = await issueCode(owner.token);
  const credential = (await pair(issued.body.code)).body.credential;
  expect((await checkIn(owner.token)).status).toBe(401);
  await prisma.print_destinations.updateMany({
    where: { restaurant_id: owner.restaurantId },
    data: { last_contact_at: new Date(0) },
  });
  expect((await checkIn(credential)).status).toBe(204);
  expect(new Date((await status(owner.token)).body.last_contact_at).getTime()).toBeGreaterThan(0);
  expect((await status(other.token)).body.last_contact_at).toBeNull();
  expect((await status(owner.token)).body).not.toHaveProperty("credential_hash");

  expect((await setEnabled(owner.token, true)).status).toBe(200);
  const rotation = await issueCode(owner.token);
  expect((await checkIn(credential)).status).toBe(204);
  const rotated = await pair(rotation.body.code);
  expect(rotated.status).toBe(201);
  expect((await checkIn(credential)).status).toBe(401);
  expect((await status(owner.token)).body.enabled).toBe(false);

  const pending = await issueCode(owner.token);
  expect((await setEnabled(owner.token, true)).status).toBe(200);
  expect((await api().delete(pairing).set(auth(owner.token))).status).toBe(204);
  expect((await checkIn(rotated.body.credential)).status).toBe(401);
  expect((await pair(pending.body.code)).status).toBe(401);
  expect((await status(owner.token)).body).toEqual({
    destination: "KITCHEN",
    enabled: false,
    paired: false,
    last_contact_at: null,
  });
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
  expect((await issueCode(other.token)).status).toBe(201);
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

const jobs = "/api/v1/print-jobs";
const agent = (credential: string) => ({ Authorization: `Bearer ${credential}` });
const claim = (credential: string) => api().post(`${jobs}/claim`).set(agent(credential));
const result = (credential: string, job: { id: string; reservation_id: string }, outcome: string) =>
  api().post(`${jobs}/${job.id}/result`).set(agent(credential)).send({
    reservation_id: job.reservation_id,
    outcome,
  });
const list = (token: string, query = {}) => api().get(jobs).set(auth(token)).query(query);

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

  expect((await claim(f.token)).status).toBe(401);
  expect((await claim(credential).send({ destination: "BAR" })).status).toBe(400);
  const responses = await Promise.all([claim(credential), claim(credential)]);
  expect(responses.map((res) => res.status).sort()).toEqual([200, 204]);
  const reserved = responses.find((res) => res.status === 200)?.body;
  expect(reserved).toMatchObject({ payload_version: 1, order_version: 1, payload: { order_id: first.id } });
  expect(new Date(reserved.expires_at).getTime()).toBeGreaterThan(Date.now());
  const another = await prisma.print_jobs.findFirstOrThrow({
    where: { restaurant_id: f.restaurantId, status: "PENDING" },
  });
  await expect(
    prisma.print_jobs.update({
      where: { id: another.id },
      data: {
        status: "SENDING",
        attempts: 1,
        order_version: 1,
        reservation_id: randomUUID(),
        reservation_expires_at: new Date(reserved.expires_at),
        reservation_credential_hash: "fixture",
      },
    }),
  ).rejects.toMatchObject({ code: "P2002" });
  expect((await claim(foreign)).body.payload.order_id).toBe(otherOrder.id);
  expect((await result(foreign, reserved, "SENT")).status).toBe(404);
  expect((await result(credential, reserved, "SENT")).status).toBe(204);
  expect((await result(credential, reserved, "SENT")).status).toBe(204);
  expect((await result(credential, reserved, "UNCERTAIN")).status).toBe(409);
  expect((await claim(credential)).status).toBe(200);

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

  const reservation = await claim(credential);
  expect(reservation.status).toBe(200);
  expect(reservation.body).toMatchObject({
    order_version: 2,
    payload: { order_id: partial.id, items: [{ quantity: 2 }] },
  });
  expect((await list(f.token, { status: "SUPPRESSED" })).body.jobs).toMatchObject([
    { order_id: cancelled.id, order_version: 2 },
  ]);
  expect((await cancel(f.token, partial, 2, 2)).status).toBe(200);
  expect((await result(credential, reservation.body, "SENT")).status).toBe(204);
  expect((await list(f.token, { status: "SENT" })).body.jobs).toMatchObject([
    { order_id: partial.id, order_version: 2 },
  ]);
  expect((await copy(f.token, cancelled.id)).status).toBe(409);
  expect((await copy(f.token, partial.id)).status).toBe(409);
});

it("expira a reserva, recusa resultado tardio e retenta somente falhas antes do envio", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const expiredOrder = await queueOrder(f);
  const retryOrder = await queueOrder(f);
  const expired = (await claim(credential)).body;
  const past = new Date(Date.now() - 1000);
  await prisma.print_jobs.update({ where: { id: expired.id }, data: { reservation_expires_at: past } });
  expect((await result(credential, expired, "SENT")).status).toBe(409);
  expect((await list(f.token, { status: "UNCERTAIN" })).body.jobs).toMatchObject([
    { order_id: expiredOrder.id },
  ]);

  let failed = (await claim(credential)).body;
  expect(failed.payload.order_id).toBe(retryOrder.id);
  const delays: number[] = [];
  for (let count = 1; count <= 3; count++) {
    const before = Date.now();
    expect((await result(credential, failed, "FAILED_BEFORE_SEND")).status).toBe(204);
    expect((await result(credential, failed, "FAILED_BEFORE_SEND")).status).toBe(204);
    expect((await claim(credential)).status).toBe(204);
    if (count === 3) break;
    const pending = (await list(f.token, { status: "PENDING" })).body.jobs;
    delays.push(new Date(pending[0].next_attempt_at).getTime() - before);
    await prisma.print_jobs.update({ where: { id: failed.id }, data: { next_attempt_at: past } });
    const previous = failed;
    failed = (await claim(credential)).body;
    expect(failed.id).toBe(previous.id);
    expect(failed.reservation_id).not.toBe(previous.reservation_id);
    expect((await result(credential, previous, "FAILED_BEFORE_SEND")).status).toBe(409);
  }
  expect(delays).toHaveLength(2);
  expect(delays[0]).toBeGreaterThanOrEqual(5000);
  expect(delays[1]).toBeGreaterThanOrEqual(10000);
  expect((await list(f.token, { status: "FAILED" })).body.jobs).toMatchObject([
    { order_id: retryOrder.id, attempts: 3 },
  ]);

  const uncertain = await queueOrder(f);
  const ambiguous = (await claim(credential)).body;
  expect((await result(credential, ambiguous, "UNCERTAIN")).status).toBe(204);
  expect((await result(credential, ambiguous, "UNCERTAIN")).status).toBe(204);
  expect((await list(f.token, { status: "UNCERTAIN", order_id: uncertain.id })).body.jobs).toHaveLength(1);
});

it("registra segunda via idempotente com autoria, vínculo e marca na comanda", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const order = await queueOrder(f, 2);
  const kitchen = await categoryToken(f.restaurantId, "KITCHEN");
  const waiter = await categoryToken(f.restaurantId, "WAITER");
  expect((await copy(kitchen.token, order.id)).status).toBe(409);
  expect((await copy(waiter.token, order.id)).status).toBe(403);
  const original = (await claim(credential)).body;
  expect((await copy(kitchen.token, order.id)).status).toBe(409);
  expect((await result(credential, original, "SENT")).status).toBe(204);
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
  const reprint = await claim(credential);
  expect(reprint.body).toMatchObject({
    id: requests[0]?.body.id,
    order_version: 2,
    payload: { order_id: order.id, reprint: { label: "SEGUNDA VIA" }, items: [{ quantity: 1 }] },
  });
  expect((await cancel(f.token, order, 1, 2)).status).toBe(200);
  expect((await copy(kitchen.token, order.id, key)).status).toBe(200);
  expect((await copy(kitchen.token, order.id)).status).toBe(409);
});

it("retém pendências após pausa ou ausência do agente até a revisão explícita", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const paused = await queueOrder(f);
  expect((await setEnabled(f.token, false)).status).toBe(200);
  expect((await claim(credential)).status).toBe(204);
  expect((await setEnabled(f.token, true)).status).toBe(200);
  expect((await claim(credential)).status).toBe(204);
  await queueOrder(f);
  const current = (await claim(credential)).body;
  expect(current.payload.order_id).not.toBe(paused.id);
  expect((await result(credential, current, "SENT")).status).toBe(204);
  const offline = await queueOrder(f);
  await prisma.print_destinations.updateMany({
    where: { restaurant_id: f.restaurantId },
    data: { last_contact_at: new Date(0) },
  });
  expect((await claim(credential)).status).toBe(204);
  expect((await checkIn(credential)).status).toBe(204);
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
  expect((await claim(credential)).body.payload.order_id).toBe(paused.id);
  expect((await list(f.token, { status: "SUPPRESSED" })).body.jobs).toMatchObject([{ order_id: offline.id }]);
});

it("reavalia reserva vencida na próxima busca e retém retry de uma reserva interrompida", async () => {
  const f = await menuFixture();
  const credential = await enablePrinting(f.token);
  const earlier = await queueOrder(f);
  const later = await queueOrder(f);
  const first = (await claim(credential)).body;
  expect(first.payload.order_id).toBe(earlier.id);
  await prisma.print_jobs.update({ where: { id: first.id }, data: { reservation_expires_at: new Date(0) } });
  const second = (await claim(credential)).body;
  expect(second.payload.order_id).toBe(later.id);
  expect((await result(credential, first, "UNCERTAIN")).status).toBe(409);
  expect((await list(f.token, { status: "UNCERTAIN" })).body.jobs).toMatchObject([{ id: first.id }]);
  expect((await copy(f.token, earlier.id)).status).toBe(201);

  expect((await setEnabled(f.token, false)).status).toBe(200);
  expect((await setEnabled(f.token, true)).status).toBe(200);
  expect((await result(credential, second, "FAILED_BEFORE_SEND")).status).toBe(204);
  expect((await claim(credential)).status).toBe(204);
  const held = await list(f.token, { status: "REVIEW_REQUIRED", order_id: later.id });
  expect(held.body.jobs).toMatchObject([{ id: second.id, attempts: 1 }]);
});
