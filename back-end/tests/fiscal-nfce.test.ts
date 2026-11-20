import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { payment_method } from "../generated/prisma/enums.ts";
import { allocate, discountsFor, notePayments } from "../src/modules/fiscal/fiscal.mapper.ts";
import type { FiscalEmissionService } from "../src/modules/fiscal/fiscal-emission.service.ts";
import { container } from "../src/shared/container/container.ts";
import type { INotifier } from "../src/shared/realtime/notifier.ts";
import { api } from "./helpers/app.ts";
import { auth } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

type Fixture = Awaited<ReturnType<typeof menuFixture>>;
const fetchMock = vi.fn<typeof fetch>();
const cnpj = "11222333000181";
const profile = { name: "Lanches", ncm: "21069090", cfop: "5102", csosn: "102" };
const respond = (value: object, status = 200) => Response.json(value, { status });
const reconcile = () => container.resolve<FiscalEmissionService>("FiscalEmissionService").reconcile();

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "42".repeat(32));
  vi.stubEnv("NOTAAS_API_URL", "https://notaas.test/api/v1");
  vi.stubEnv("FOCUS_NFE_HOMOLOG_URL", "https://focus.test/v2");
  fetchMock.mockReset().mockRejectedValue(new Error("Requisição externa sem resposta simulada"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => prisma.$disconnect());

async function configure(f: Fixture, settings: object = {}, withProfile = true) {
  let defaultProfile: string | null = null;
  if (withProfile) {
    const created = await api().post("/api/v1/fiscal/tax-profiles").set(auth(f.token)).send(profile);
    expect(created.status).toBe(201);
    defaultProfile = created.body.profile.id;
  }
  const saved = await api()
    .put("/api/v1/fiscal/settings")
    .set(auth(f.token))
    .send({
      enabled: true,
      provider: "MOCK",
      environment: "HOMOLOGACAO",
      cnpj,
      default_tax_profile_id: defaultProfile,
      ...settings,
    });
  expect(saved.status).toBe(200);
  return saved.body.settings;
}

// Comanda de balcão paga e entregue; fecha por /tabs/:id/close para receber a NFC-e na resposta.
async function closedSale(f: Fixture, { quantity = 1, method = "PIX" as payment_method, discount = 0 } = {}) {
  const opened = await api()
    .post("/api/v1/tabs")
    .set(auth(f.token))
    .send({ kind: "COUNTER", label: "Balcão" });
  const tabId: string = opened.body.tab.id;
  const body = f.submission(quantity);
  const items = body.items.map(({ selections, ...item }) => ({ ...item, options: selections }));
  const created = await api()
    .post("/api/v1/orders")
    .set(auth(f.token))
    .send({ ...body, items, tab_id: tabId });
  const order = await prisma.orders.findUniqueOrThrow({
    where: { id: created.body.order.id },
    include: { items: true },
  });
  await api()
    .post(`/api/v1/orders/${order.id}/transitions`)
    .set(auth(f.token))
    .send({
      expected_version: order.version,
      operations: [{ item_id: order.items[0]?.id, from_stage: "PENDING", to_stage: "DELIVERED", quantity }],
    });
  if (discount)
    await api()
      .post(`/api/v1/tabs/${tabId}/adjustments`)
      .set(auth(f.token))
      .send({ type: "DISCOUNT", mode: "FIXED_CENTS", value: discount, reason: "Cortesia da casa" });
  const tab = (await api().get(`/api/v1/tabs/${tabId}`).set(auth(f.token))).body.tab;
  const paid = await api()
    .post(`/api/v1/tabs/${tabId}/payments`)
    .set(auth(f.token))
    .send({ idempotency_key: randomUUID(), provider: "MANUAL", method, amount_cents: tab.remaining_cents });
  expect(paid.status).toBe(201);
  const version = (await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } })).version;
  const closed = await api()
    .post(`/api/v1/tabs/${tabId}/close`)
    .set(auth(f.token))
    .send({ expected_version: version, customer_document: "12345678909" });
  expect(closed.status).toBe(200);
  return { tabId, closed: closed.body, paidCents: tab.remaining_cents as number };
}

const document = (tabId: string) => prisma.fiscal_documents.findFirstOrThrow({ where: { tab_id: tabId } });

describe("mapper fiscal", () => {
  it("fecha Σ(vProd − vDesc) = Σ vPag no centavo em 20 casos de dízima", () => {
    for (let n = 1; n <= 20; n++) {
      const gross = [1000 + n * 7, 333 * n + 1, 1999, 10 * n + 3].slice(0, 1 + (n % 4));
      const subtotal = gross.reduce((sum, value) => sum + value, 0);
      const discount = Math.round((subtotal * (n * 137)) / 10_000); // de 1,37% a 27,4%
      const note = subtotal - discount;
      const fee = Math.round((subtotal * 1000) / 10_000);
      const paidTotal = note + fee; // taxa de serviço paga, mas fora da nota (DEC-19)
      const cash = Math.floor(paidTotal / 3);
      const payments = [
        { method: "CASH", amountCents: cash },
        { method: "CREDIT", amountCents: Math.floor(paidTotal / 7) },
        { method: "PIX", amountCents: paidTotal - cash - Math.floor(paidTotal / 7) },
      ];
      const discounts = discountsFor(gross, discount);
      const notePaid = notePayments(payments, note);
      const items = gross.reduce((sum, value, index) => sum + value - (discounts[index] ?? 0), 0);
      expect(items).toBe(note);
      expect(notePaid.reduce((sum, { amountCents }) => sum + amountCents, 0)).toBe(note);
      discounts.forEach((value, index) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(gross[index] ?? 0);
      });
    }
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    // O resto que passaria do bruto do maior item transborda para os itens com folga.
    expect(discountsFor([5, 5, 5], 14)).toEqual([5, 5, 4]);
  });
});

describe("emissão automática", () => {
  it("autoriza no fechamento com o provedor simulado e avisa o balcão", async () => {
    const f = await menuFixture();
    await configure(f);
    const events = vi.spyOn(container.resolve<INotifier>("Notifier"), "toPos");
    const { tabId, closed } = await closedSale(f, { quantity: 2, discount: 500 });

    expect(closed.tab.status).toBe("CLOSED");
    expect(closed.fiscal_document).toMatchObject({
      status: "AUTHORIZED",
      provider: "MOCK",
      total_cents: 5500, // 2 × 3000 − 500; a taxa de serviço fica fora
      needs_review: false,
    });
    expect(closed.fiscal_document.access_key).toMatch(/^[0-9]{44}$/);
    expect(closed.fiscal_document.qrcode_url).toContain("qrcode");
    expect(await document(tabId)).toMatchObject({ customer_document: "12345678909" });
    expect(events).toHaveBeenCalledWith(
      f.restaurantId,
      "fiscal:updated",
      expect.objectContaining({ tab_id: tabId, status: "AUTHORIZED" }),
    );
    const detail = await api().get(`/api/v1/tabs/${tabId}`).set(auth(f.token));
    expect(detail.body.tab.fiscal_documents).toMatchObject([{ status: "AUTHORIZED" }]);
  });

  it("não emite quando o módulo fiscal está desligado", async () => {
    const f = await menuFixture();
    const { tabId, closed } = await closedSale(f);
    expect(closed.fiscal_document).toBeNull();
    expect(await prisma.fiscal_documents.count({ where: { tab_id: tabId } })).toBe(0);
  });

  it("rejeição mantém a comanda fechada e o reenvio funciona depois de corrigir o perfil", async () => {
    const f = await menuFixture();
    await configure(f, {}, false);
    const { tabId, closed } = await closedSale(f);
    expect(closed.tab.status).toBe("CLOSED");
    expect(closed.fiscal_document).toMatchObject({ status: "REJECTED", sefaz_status: "LOCAL" });
    expect(closed.fiscal_document.sefaz_message).toContain("Sem perfil tributário");

    const created = await api().post("/api/v1/fiscal/tax-profiles").set(auth(f.token)).send(profile);
    const assigned = await api()
      .put(`/api/v1/fiscal/products/${f.product.id}/tax-profile`)
      .set(auth(f.token))
      .send({ tax_profile_id: created.body.profile.id });
    expect(assigned.status).toBe(200);
    const retried = await api().post(`/api/v1/tabs/${tabId}/nfce/retry`).set(auth(f.token)).send({});
    expect(retried.status).toBe(200);
    expect(retried.body.fiscal_document).toMatchObject({ status: "AUTHORIZED", attempt: 2 });
    expect((await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } })).status).toBe("CLOSED");
  });
});

describe("Focus NFe", () => {
  it("consulta a ref após timeout e só reenvia com a mesma ref quando ela não existe", async () => {
    const f = await menuFixture();
    await configure(f, { provider: "FOCUS_NFE", credential: "focus-token-fixture" });
    fetchMock.mockRejectedValueOnce(new DOMException("Tempo da simulação excedido", "TimeoutError"));
    const { tabId, closed, paidCents } = await closedSale(f, { method: "CREDIT" });
    expect(closed.fiscal_document).toMatchObject({ status: "PENDING" });
    const pending = await document(tabId);
    const reference = `${pending.id}-1`;
    expect(pending.external_id).toBe(reference);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://focus.test/v2/nfce?ref=${reference}`);
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("focus-token-fixture:").toString("base64")}`,
    );
    const sent = JSON.parse(String(init?.body));
    expect(sent).toMatchObject({
      cnpj_emitente: cnpj,
      cpf_destinatario: "12345678909",
      items: [{ codigo_ncm: "21069090", cfop: "5102", icms_situacao_tributaria: "102", valor_bruto: 30 }],
      formas_pagamento: [{ forma_pagamento: "03", valor_pagamento: 30, tipo_integracao: 2 }],
    });
    expect(paidCents).toBe(3300); // pago com taxa; a nota tem só os 30,00 dos itens

    await prisma.fiscal_documents.update({ where: { id: pending.id }, data: { updated_at: new Date(0) } });
    fetchMock
      .mockResolvedValueOnce(
        respond({ codigo: "nfce_nao_encontrada", mensagem: "NFC-e não encontrada." }, 404),
      )
      .mockResolvedValueOnce(
        respond(
          {
            ref: reference,
            status: "autorizado",
            status_sefaz: "100",
            mensagem_sefaz: "Autorizado o uso da NF-e",
            chave_nfe: `NFe${"3".repeat(44)}`,
            numero: "12",
            serie: "1",
            caminho_danfe: "/notas_fiscais_consumidor/NFe333.html",
            qrcode_url: "https://sefaz.test/qrcode",
          },
          201,
        ),
      );
    await reconcile();
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(`https://focus.test/v2/nfce/${reference}`);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(`https://focus.test/v2/nfce?ref=${reference}`);
    expect(await document(tabId)).toMatchObject({
      status: "AUTHORIZED",
      access_key: "3".repeat(44),
      number: 12,
      danfe_url: "https://focus.test/notas_fiscais_consumidor/NFe333.html",
    });
  });
});

describe("Focus NFe: respostas que não provam recusa", () => {
  const unknown422 = respond({ codigo: "erro_validacao", mensagem: "Erro de validação" }, 422);
  const byMethod =
    (lookup: (reference: string) => Response) => async (url: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST" ? unknown422.clone() : lookup(String(url).split("/").pop() ?? "");

  it("trata 2xx sem corpo como ambíguo", async () => {
    const f = await menuFixture();
    await configure(f, { provider: "FOCUS_NFE", credential: "focus-token-fixture" });
    fetchMock.mockResolvedValueOnce(new Response("", { status: 201 }));
    const { closed } = await closedSale(f);
    expect(closed.fiscal_document).toMatchObject({ status: "PENDING" });
  });

  it("adota a nota existente após um 422 desconhecido e só rejeita quando a ref não existe", async () => {
    const f = await menuFixture();
    await configure(f, { provider: "FOCUS_NFE", credential: "focus-token-fixture" });
    fetchMock.mockImplementation(
      byMethod((reference) => respond({ ref: reference, status: "autorizado", chave_nfe: "6".repeat(44) })),
    );
    const found = await closedSale(f);
    expect(found.closed.fiscal_document).toMatchObject({ status: "AUTHORIZED", access_key: "6".repeat(44) });

    fetchMock.mockImplementation(byMethod(() => respond({ codigo: "nfce_nao_encontrada" }, 404)));
    const missing = await closedSale(f);
    expect(missing.closed.fiscal_document).toMatchObject({
      status: "REJECTED",
      sefaz_status: "erro_validacao",
    });
  });
});

describe("Notaas", () => {
  it("acompanha o 202 pelo job até a autorização", async () => {
    const f = await menuFixture();
    await configure(f, { provider: "NOTAAS", credential: "ntaas_fixture_key" });
    fetchMock.mockResolvedValueOnce(respond({ invoiceId: "inv-1" }, 202));
    const { tabId, closed } = await closedSale(f);
    expect(closed.fiscal_document).toMatchObject({ status: "PROCESSING" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://notaas.test/api/v1/nfe/emitir");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("ntaas_fixture_key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      modelo: 65,
      pagamentos: [{ tipoPagamento: "17", valor: 30 }],
    });

    await prisma.fiscal_documents.updateMany({ where: { tab_id: tabId }, data: { updated_at: new Date(0) } });
    fetchMock.mockResolvedValueOnce(
      respond({
        invoiceId: "inv-1",
        status: "issued",
        chaveAcesso: "4".repeat(44),
        protocolo: "135000000000001",
        qrCode: "https://sefaz.test/qr",
      }),
    );
    await reconcile();
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://notaas.test/api/v1/nfe/invoices/inv-1/status");
    expect(await document(tabId)).toMatchObject({ status: "AUTHORIZED", access_key: "4".repeat(44) });
  });

  it("nunca reenvia uma emissão ambígua e exige conferência humana", async () => {
    const f = await menuFixture();
    await configure(f, { provider: "NOTAAS", credential: "ntaas_fixture_key" });
    fetchMock.mockResolvedValueOnce(respond({ error: { code: "INTERNAL" } }, 503));
    const { tabId } = await closedSale(f);
    const pending = await document(tabId);
    expect(pending).toMatchObject({ status: "PENDING", external_id: null });

    await prisma.fiscal_documents.update({
      where: { id: pending.id },
      data: { updated_at: new Date(0), dispatched_at: new Date(Date.now() - 6 * 60 * 1000) },
    });
    await reconcile();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const view = await api().get(`/api/v1/tabs/${tabId}/nfce`).set(auth(f.token));
    expect(view.body.fiscal_document).toMatchObject({ status: "PENDING", needs_review: true });

    const blind = await api().post(`/api/v1/tabs/${tabId}/nfce/retry`).set(auth(f.token)).send({});
    expect([blind.status, blind.body.code]).toEqual([409, "FISCAL_RETRY_NOT_ALLOWED"]);
    fetchMock.mockResolvedValueOnce(
      respond({ invoiceId: "inv-9", status: "issued", chaveAcesso: "5".repeat(44) }),
    );
    const linked = await api()
      .post(`/api/v1/tabs/${tabId}/nfce/retry`)
      .set(auth(f.token))
      .send({ invoice_id: "inv-9" });
    expect(linked.body.fiscal_document).toMatchObject({ status: "AUTHORIZED", access_key: "5".repeat(44) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("configuração, cancelamento e permissões", () => {
  it("protege credenciais e recusa simulação em produção", async () => {
    const f = await menuFixture();
    const base = { enabled: true, environment: "HOMOLOGACAO", cnpj };
    const put = (body: object) => api().put("/api/v1/fiscal/settings").set(auth(f.token)).send(body);
    expect((await put({ ...base, provider: "MOCK", environment: "PRODUCAO" })).body.code).toBe(
      "FISCAL_MOCK_PRODUCTION",
    );
    expect((await put({ ...base, provider: "NOTAAS" })).body.code).toBe("FISCAL_CREDENTIAL_REQUIRED");
    const saved = await put({ ...base, provider: "NOTAAS", credential: "ntaas_secret_key" });
    expect(saved.body.settings).toEqual(expect.objectContaining({ has_credential: true }));
    expect(JSON.stringify(saved.body)).not.toContain("ntaas_secret_key");
    const stored = await prisma.fiscal_settings.findUniqueOrThrow({
      where: { restaurant_id: f.restaurantId },
    });
    expect(stored.provider_credential_encrypted).toMatch(/^v1:/);
    // Trocar de provedor não reaproveita o token do anterior.
    expect((await put({ ...base, provider: "FOCUS_NFE" })).body.code).toBe("FISCAL_CREDENTIAL_REQUIRED");
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    expect((await api().get("/api/v1/fiscal/settings").set(auth(waiter.token))).status).toBe(403);
  });

  it("cancela só com justificativa de 15 a 255 caracteres e por OWNER ou MANAGER", async () => {
    const f = await menuFixture();
    await configure(f);
    const { tabId } = await closedSale(f);
    const cancel = (token: string, reason: string) =>
      api().post(`/api/v1/tabs/${tabId}/nfce/cancel`).set(auth(token)).send({ reason });
    const waiter = await categoryToken(f.restaurantId, "WAITER");
    const manager = await categoryToken(f.restaurantId, "MANAGER");
    expect((await cancel(waiter.token, "Cliente desistiu da compra inteira")).status).toBe(403);
    expect((await cancel(manager.token, "curto")).status).toBe(400);
    const cancelled = await cancel(manager.token, "Cliente desistiu da compra inteira");
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.fiscal_document).toMatchObject({ status: "CANCELLED" });
    expect((await cancel(manager.token, "Cliente desistiu da compra inteira")).body.code).toBe(
      "FISCAL_CANCEL_NOT_ALLOWED",
    );
    expect((await api().get(`/api/v1/tabs/${tabId}/nfce`).set(auth(waiter.token))).status).toBe(200);
  });
});
