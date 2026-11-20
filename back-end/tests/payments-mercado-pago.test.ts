import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcilePayments } from "../src/shared/jobs/payment-reconciliation.job.ts";
import { decryptSecret, encryptSecret } from "../src/shared/utils/crypto.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

const baseUrl = "https://api.mercadopago.com";
const ordersUrl = `${baseUrl}/v1/orders`;
const oauthPath = "/api/v1/payment-providers/mercado-pago/oauth";
const webhookPath = "/api/v1/webhooks/payments/mercado-pago";
const encryptionKey = "42".repeat(32);
const webhookSecret = "mp-webhook-fixture";
const accessToken = "mp-access-fixture";
const refreshToken = "mp-refresh-fixture";
const merchantId = "5238400195";
const terminalSerial = "NEWLAND_N950__N950NCB801293324";
const providerOrderId = "ORD00001111222233334444555566";
const providerPaymentId = "PAY01J67CQQH5904WDBVZEM4JMEP3";
const price = 3300;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", encryptionKey);
  vi.stubEnv("MERCADO_PAGO_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("MERCADO_PAGO_API_URL", baseUrl);
  vi.stubEnv("MERCADO_PAGO_CLIENT_ID", "mp-client-fixture");
  vi.stubEnv("MERCADO_PAGO_CLIENT_SECRET", "mp-client-secret-fixture");
  vi.stubEnv("MERCADO_PAGO_REDIRECT_URI", `https://app.teste.com${oauthPath}/callback`);
  fetchMock.mockReset().mockRejectedValue(new Error("Requisição externa sem resposta simulada"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => prisma.$disconnect());

async function terminalFixture() {
  const f = await menuFixture();
  const placed = await api()
    .post("/api/v1/public/orders")
    .set("X-Table-Token", f.deviceToken)
    .send(f.submission());
  expect(placed.status).toBe(201);
  const { tab_id: tabId } = await prisma.orders.findUniqueOrThrow({ where: { id: placed.body.order.id } });
  const item = await prisma.order_items.findFirstOrThrow({ where: { order_id: placed.body.order.id } });
  const account = await prisma.payment_provider_accounts.create({
    data: {
      restaurant_id: f.restaurantId,
      provider: "MERCADO_PAGO",
      environment: "PRODUCTION",
      external_account_id: merchantId,
      access_token_encrypted: encryptSecret(accessToken),
      refresh_token_encrypted: encryptSecret(refreshToken),
      token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
  const terminal = await prisma.payment_terminals.create({
    data: {
      restaurant_id: f.restaurantId,
      provider: "MERCADO_PAGO",
      provider_account_id: account.id,
      external_device_id: terminalSerial,
      serial_number: "N950NCB801293324",
      label: "Caixa 1",
    },
  });
  return { ...f, tabId, item, account, terminal };
}

type TerminalFixture = Awaited<ReturnType<typeof terminalFixture>>;
const tabPath = (id: string) => `/api/v1/tabs/${id}`;
const readTab = (f: TerminalFixture) => api().get(tabPath(f.tabId)).set(auth(f.token));
const pay = (f: TerminalFixture, body: object) =>
  api()
    .post(`${tabPath(f.tabId)}/payments`)
    .set(auth(f.token))
    .send(body);
const chargeInput = (f: TerminalFixture) => ({
  idempotency_key: randomUUID(),
  provider: "MERCADO_PAGO",
  terminal_id: f.terminal.id,
  method: "CREDIT",
  installments: 2,
  amount_cents: price,
  allocations: [{ order_item_id: f.item.id, covered_cents: 3000 }],
});
const savedPayment = (f: TerminalFixture, key: string) =>
  prisma.payments.findUniqueOrThrow({
    where: { restaurant_id_idempotency_key: { restaurant_id: f.restaurantId, idempotency_key: key } },
  });

function rawOrder(reference: string, status = "created", amount = "33.00") {
  return {
    id: providerOrderId,
    type: "point",
    user_id: merchantId,
    external_reference: reference,
    status,
    expiration_time: "PT5M",
    total_amount: amount,
    ...(status === "processed" ? { total_paid_amount: amount } : {}),
    config: { point: { terminal_id: terminalSerial } },
    transactions: {
      payments: [
        {
          id: providerPaymentId,
          amount,
          status,
          ...(status === "processed"
            ? {
                paid_amount: amount,
                status_detail: "accredited",
                payment_method: { id: "visa", type: "credit_card", installments: 2 },
                reference: { id: "123456789980" },
              }
            : {}),
        },
      ],
    },
  };
}

const respond = (value: object, status = 200) => Response.json(value, { status });

function webhook(secret = webhookSecret, ts = Date.now()) {
  const requestId = randomUUID();
  const manifest = `id:${providerOrderId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  return api()
    .post(webhookPath)
    .query({ "data.id": providerOrderId, type: "order" })
    .set({ "x-request-id": requestId, "x-signature": `ts=${ts},v1=${signature}` })
    .send({
      action: "order.processed",
      type: "order",
      user_id: merchantId,
      data: { id: providerOrderId, status: "processed" },
    });
}

async function seedProcessing(f: TerminalFixture) {
  const stale = new Date(Date.now() - 6 * 60 * 1000);
  return prisma.payments.create({
    data: {
      restaurant_id: f.restaurantId,
      tab_id: f.tabId,
      provider: "MERCADO_PAGO",
      provider_account_id: f.account.id,
      terminal_id: f.terminal.id,
      external_payment_id: providerOrderId,
      status: "PROCESSING",
      method: "CREDIT",
      amount_cents: price,
      idempotency_key: randomUUID(),
      request_hash: "a".repeat(64),
      created_at: stale,
      updated_at: stale,
    },
  });
}

describe("credenciais Mercado Pago", () => {
  it("cifra e recupera um token, usa IV aleatório e rejeita authTag modificado", async () => {
    const encrypted = encryptSecret(accessToken);
    expect(encrypted).not.toContain(accessToken);
    expect(encryptSecret(accessToken)).not.toBe(encrypted);
    expect(decryptSecret(encrypted)).toBe(accessToken);

    const [version, iv, tag, ciphertext] = encrypted.split(":");
    if (!tag) throw new Error("AuthTag ausente");
    const changedTag = Buffer.from(Buffer.from(tag, "base64").map((byte) => byte ^ 1)).toString("base64");
    expect(() => decryptSecret([version, iv, changedTag, ciphertext].join(":"))).toThrow();
  });

  it("protege a configuração, valida state e sincroniza apenas terminais PDV sem expor segredos", async () => {
    const owner = await ownerOf("mp-oauth");
    const other = await ownerOf("mp-outro");
    const waiter = await categoryToken(owner.restaurantId, "WAITER");
    const oauthUrl = (token: string) => api().get(`${oauthPath}/url`).set(auth(token));
    expect((await oauthUrl(waiter.token)).status).toBe(403);

    const authorized = await oauthUrl(owner.token);
    expect(authorized.status).toBe(200);
    const url = new URL(authorized.body.url);
    expect(url.origin).toBe("https://auth.mercadopago.com.br");
    expect(url.searchParams.get("client_id")).toBe("mp-client-fixture");
    const state = url.searchParams.get("state");
    if (!state) throw new Error("State ausente");
    const callback = (token: string, state: string) =>
      api().get(`${oauthPath}/callback`).set(auth(token)).query({ code: "mp-code-fixture", state });
    expect([400, 401, 403]).toContain((await callback(owner.token, `invalido-${state}`)).status);
    expect([400, 401, 403, 404]).toContain((await callback(other.token, state)).status);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      respond({
        access_token: accessToken,
        refresh_token: refreshToken,
        user_id: Number(merchantId),
        expires_in: 3600,
      }),
    );
    const connected = await callback(owner.token, state);
    expect([200, 302, 303]).toContain(connected.status);
    expect(fetchMock.mock.calls.at(0)?.[0]?.toString()).toBe(`${baseUrl}/oauth/token`);
    expect(connected.text).not.toContain(accessToken);
    const account = await prisma.payment_provider_accounts.findFirstOrThrow({
      where: { restaurant_id: owner.restaurantId },
    });
    expect(account.external_account_id).toBe(merchantId);
    expect(account.access_token_encrypted).not.toContain(accessToken);
    expect(account.refresh_token_encrypted).not.toContain(refreshToken);
    expect(decryptSecret(account.access_token_encrypted)).toBe(accessToken);

    fetchMock.mockResolvedValueOnce(
      respond({
        data: {
          terminals: [
            { id: terminalSerial, operating_mode: "PDV" },
            { id: "NEWLAND_N950__OUTRO", operating_mode: "STANDALONE" },
          ],
        },
        paging: { total: 2, limit: 50, offset: 0 },
      }),
    );
    const synced = await api().post("/api/v1/payment-terminals/sync").set(auth(owner.token));
    expect(synced.status).toBe(200);
    const syncUrl = new URL(String(fetchMock.mock.calls.at(1)?.[0]));
    expect(`${syncUrl.origin}${syncUrl.pathname}`).toBe(`${baseUrl}/terminals/v1/list`);
    expect(synced.body.terminals).toHaveLength(1);
    expect(JSON.stringify(synced.body)).not.toContain(accessToken);
    expect(await prisma.payment_terminals.findMany()).toMatchObject([
      { restaurant_id: owner.restaurantId, external_device_id: terminalSerial, active: true },
    ]);
  });
});

describe("cobrança Point", () => {
  it("faz HTTP após gravar PENDING e só aprova após consulta autenticada do webhook", async () => {
    const f = await terminalFixture();
    const input = chargeInput(f);
    fetchMock.mockImplementationOnce(async (url, init) => {
      expect(String(url)).toBe(ordersUrl);
      expect(init?.method).toBe("POST");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${accessToken}`);
      expect(headers.get("X-Idempotency-Key")).toBe(input.idempotency_key);

      const pending = await savedPayment(f, input.idempotency_key);
      expect(pending).toMatchObject({ status: "PENDING", amount_cents: price, external_payment_id: null });
      expect(await prisma.payment_allocations.count({ where: { payment_id: pending.id } })).toBe(1);
      // Uma nova consulta falharia se a transação da cobrança ainda bloqueasse este restaurante.
      expect(
        await prisma.$queryRaw`SELECT id FROM restaurants WHERE id = ${f.restaurantId} FOR UPDATE NOWAIT`,
      ).toEqual([{ id: f.restaurantId }]);
      expect(JSON.parse(String(init?.body))).toMatchObject({
        type: "point",
        external_reference: pending.id,
        expiration_time: "PT5M",
        transactions: { payments: [{ amount: "33.00" }] },
        config: {
          point: { terminal_id: terminalSerial },
          payment_method: { default_type: "credit_card", default_installments: 2 },
        },
      });
      return respond(rawOrder(pending.id), 201);
    });

    const charge = await pay(f, input);
    expect(charge.status).toBe(202);
    expect(charge.body).toMatchObject({
      payment: { status: "PROCESSING" },
      tab: { paid_cents: 0, pending_cents: price },
    });
    const pending = await savedPayment(f, input.idempotency_key);
    expect(pending.external_payment_id).toBe(providerOrderId);
    const replay = await pay(f, input);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ replayed: true, payment: { id: pending.id } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const invalid = await webhook("outro-segredo");
    const stale = await webhook(webhookSecret, Date.now() - 11 * 60 * 1000);
    expect([invalid.status, stale.status]).toEqual([401, 401]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await savedPayment(f, input.idempotency_key)).status).toBe("PROCESSING");

    fetchMock.mockResolvedValueOnce(respond(rawOrder(pending.id, "processed")));
    expect((await webhook()).status).toBe(200);
    expect(fetchMock.mock.calls.at(1)?.[0]?.toString()).toBe(`${ordersUrl}/${providerOrderId}`);
    expect(fetchMock.mock.calls.at(1)?.[1]?.method ?? "GET").toBe("GET");

    const approved = await savedPayment(f, input.idempotency_key);
    expect(approved).toMatchObject({ status: "APPROVED", nsu: "123456789980", installments: 2 });
    expect(approved.card_brand).toMatch(/^visa$/i);
    expect(approved.confirmed_at).toBeInstanceOf(Date);

    fetchMock.mockResolvedValueOnce(respond(rawOrder(pending.id, "processed")));
    expect((await webhook()).status).toBe(200);
    const approvals = await prisma.restaurant_operation_events.findMany({
      where: {
        restaurant_id: f.restaurantId,
        entity_type: "PAYMENT",
        entity_id: pending.id,
        action: "POINT_PAYMENT_STATUS_CHANGED",
        new_value: { path: ["status"], equals: "APPROVED" },
      },
      select: { actor_type: true, actor_user_id: true },
    });
    expect(approvals).toEqual([{ actor_type: "SYSTEM", actor_user_id: null }]);
    expect((await readTab(f)).body.tab).toMatchObject({
      paid_cents: price,
      pending_cents: 0,
      remaining_cents: 0,
    });
  });

  it.each(["id", "external_reference", "user_id", "amount"] as const)(
    "preserva a reserva se a consulta assinada retorna %s divergente",
    async (field) => {
      const f = await terminalFixture();
      const pending = await seedProcessing(f);
      const order = rawOrder(pending.id, "processed", field === "amount" ? "32.99" : "33.00");
      switch (field) {
        case "id":
          order.id = `${providerOrderId}9`;
          break;
        case "external_reference":
          order.external_reference = randomUUID();
          break;
        case "user_id":
          order.user_id = "456789";
          break;
      }
      fetchMock.mockResolvedValueOnce(respond(order));

      await webhook();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await savedPayment(f, pending.idempotency_key)).status).toBe("PROCESSING");
      expect((await readTab(f)).body.tab).toMatchObject({ paid_cents: 0, pending_cents: price });
    },
  );

  it.each([
    { status: 400, code: "invalid_terminal" },
    { status: 409, code: "already_queued_order_for_terminal" },
  ])("libera a alocação após rejeição definitiva $status ($code)", async ({ status, code }) => {
    const f = await terminalFixture();
    const input = chargeInput(f);
    fetchMock.mockResolvedValueOnce(respond({ errors: [{ code }] }, status));

    const rejected = await pay(f, input);
    expect([rejected.status, rejected.body.code]).toEqual([502, "PROVIDER_UNAVAILABLE"]);
    expect((await savedPayment(f, input.idempotency_key)).status).toBe("CANCELLED");
    expect((await readTab(f)).body.tab).toMatchObject({ pending_cents: 0, paid_cents: 0 });
    const replacement = await pay(f, {
      provider: "MANUAL",
      method: "PIX",
      idempotency_key: randomUUID(),
      amount_cents: price,
      allocations: input.allocations,
    });
    expect(replacement.status).toBe(201);
  });

  it("devolve a solicitação do cliente ao balcão quando a cobrança não é aprovada", async () => {
    const f = await terminalFixture();
    const created = await api()
      .post("/api/v1/public/tab/payment-requests")
      .set("X-Table-Token", f.deviceToken)
      .send({ mode: "MY_ORDERS", preferred_method: "CREDIT", include_service_fee: true });
    expect(created.status).toBe(201);
    const request = created.body.payment_request;
    expect(request.requested_amount_cents).toBe(price);
    fetchMock.mockResolvedValueOnce(
      respond({ errors: [{ code: "already_queued_order_for_terminal" }] }, 409),
    );

    const { idempotency_key, provider, terminal_id, method } = chargeInput(f);
    const rejected = await pay(f, {
      idempotency_key,
      provider,
      terminal_id,
      method,
      payment_request_id: request.id,
    });
    expect(rejected.status).toBe(502);
    expect(await prisma.payment_requests.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
      status: "ACCEPTED",
      payment_id: null,
    });
    const retried = await pay(f, {
      provider: "MANUAL",
      method: "CREDIT",
      idempotency_key: randomUUID(),
      payment_request_id: request.id,
    });
    expect(retried.status).toBe(201);
  });

  it.each([
    { failure: "HTTP 503", status: 503, code: "service_unavailable" },
    { failure: "conflito de idempotência", status: 409, code: "idempotency_key_already_used" },
    { failure: "timeout" },
  ])("mantém a reserva após $failure e impede cobrar de novo", async ({ status, code }) => {
    const f = await terminalFixture();
    const input = chargeInput(f);
    if (status) {
      fetchMock.mockResolvedValueOnce(respond({ errors: [{ code }] }, status));
    } else {
      fetchMock.mockRejectedValueOnce(new DOMException("Tempo da simulação excedido", "TimeoutError"));
    }

    const charged = await pay(f, input);
    expect(charged.status).toBe(202);
    expect(charged.body.payment.status).toBe("PENDING");
    expect(await savedPayment(f, input.idempotency_key)).toMatchObject({
      status: "PENDING",
      external_payment_id: null,
    });
    expect((await readTab(f)).body.tab).toMatchObject({ pending_cents: price, paid_cents: 0 });
    const duplicate = await pay(f, {
      provider: "MANUAL",
      method: "PIX",
      amount_cents: price,
      idempotency_key: randomUUID(),
    });
    expect(duplicate.status).toBe(409);
    expect(await prisma.payments.count({ where: { restaurant_id: f.restaurantId } })).toBe(1);
  });

  it("cancela na conciliação quando a nova tentativa recebe rejeição definitiva", async () => {
    const f = await terminalFixture();
    const input = chargeInput(f);
    fetchMock.mockResolvedValueOnce(respond({ errors: [{ code: "service_unavailable" }] }, 503));
    expect((await pay(f, input)).status).toBe(202);

    await prisma.payments.updateMany({
      where: { restaurant_id: f.restaurantId },
      data: { updated_at: new Date(Date.now() - 60 * 1000) },
    });
    fetchMock.mockResolvedValueOnce(respond({ errors: [{ code: "bad_request" }] }, 400));
    await reconcilePayments();

    expect((await savedPayment(f, input.idempotency_key)).status).toBe("CANCELLED");
    expect((await readTab(f)).body.tab).toMatchObject({ pending_cents: 0, remaining_cents: price });
  });

  it("mantém a reserva quando a nova tentativa encontra o terminal ocupado", async () => {
    const f = await terminalFixture();
    const input = chargeInput(f);
    fetchMock.mockResolvedValueOnce(respond({ errors: [{ code: "service_unavailable" }] }, 503));
    expect((await pay(f, input)).status).toBe(202);

    await prisma.payments.updateMany({
      where: { restaurant_id: f.restaurantId },
      data: { updated_at: new Date(Date.now() - 60 * 1000) },
    });
    // A order ocupando o terminal pode ser a da primeira tentativa.
    fetchMock.mockResolvedValueOnce(
      respond({ errors: [{ code: "already_queued_order_for_terminal" }] }, 409),
    );
    await reconcilePayments();

    expect((await savedPayment(f, input.idempotency_key)).status).toBe("PENDING");
    expect((await readTab(f)).body.tab).toMatchObject({ pending_cents: price });
  });
});

describe("reconciliação Point", () => {
  it("mantém a reserva enquanto o cancelamento é assíncrono e libera depois de consultar expiração", async () => {
    const f = await terminalFixture();
    const payment = await seedProcessing(f);
    fetchMock.mockResolvedValueOnce(respond(rawOrder(payment.id, "at_terminal"))).mockResolvedValueOnce(
      respond(
        {
          id: providerOrderId,
          status: "at_terminal",
          status_detail: "at_terminal",
          transactions: {
            payments: [
              { id: providerPaymentId, status: "at_terminal", status_detail: "cancellation_requested" },
            ],
          },
        },
        202,
      ),
    );

    await reconcilePayments();
    expect(fetchMock.mock.calls.at(0)?.[0]?.toString()).toBe(`${ordersUrl}/${providerOrderId}`);
    const cancel = fetchMock.mock.calls.at(1);
    expect(cancel?.[0]?.toString()).toBe(`${ordersUrl}/${providerOrderId}/cancel`);
    expect(cancel?.[1]?.method).toBe("POST");
    expect(new Headers(cancel?.[1]?.headers).get("x-allow-cancelable-status")).toBe("at_terminal");
    expect((await savedPayment(f, payment.idempotency_key)).status).toBe("PROCESSING");
    expect((await readTab(f)).body.tab.pending_cents).toBe(price);

    await prisma.payments.update({
      where: { id: payment.id },
      data: { updated_at: new Date(Date.now() - 60 * 1000) },
    });
    fetchMock.mockResolvedValueOnce(respond(rawOrder(payment.id, "expired")));
    await reconcilePayments();
    expect((await savedPayment(f, payment.idempotency_key)).status).toBe("EXPIRED");
    expect((await readTab(f)).body.tab).toMatchObject({
      pending_cents: 0,
      paid_cents: 0,
      remaining_cents: price,
    });
  });
});
