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
  expect((await pair(issued.body.code)).status).toBe(201);
  expect((await setEnabled(token, true)).status).toBe(200);
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
