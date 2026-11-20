import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { payment_method } from "../generated/prisma/enums.ts";
import { basketPairs, prepTimeStats } from "../src/modules/reports/basket-and-prep.ts";
import { forecastDemand, trendFactor, weightedMean } from "../src/modules/reports/forecast.engine.ts";
import type { IReportsService } from "../src/modules/reports/reports.interfaces.ts";
import { businessDate, businessDayStart, localHour } from "../src/modules/tabs/tab-business-date.ts";
import { container } from "../src/shared/container/container.ts";
import { api } from "./helpers/app.ts";
import { auth, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof menuFixture>>;
type Stage = "PENDING" | "READY" | "DELIVERED" | "CANCELLED";
type Sale = {
  close?: "auto" | "manual" | "none";
  quantity?: number;
  cancel?: number;
  discount?: number;
  method?: payment_method;
  ready?: boolean;
};

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const report = (token: string, path: string, query: object = {}) =>
  api().get(`/api/v1/reports/${path}`).set(auth(token)).query(query);

async function move(f: Fixture, orderId: string, from: Stage, to: Stage, quantity: number) {
  const order = await prisma.orders.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const response = await api()
    .post(`/api/v1/orders/${orderId}/transitions`)
    .set(auth(f.token))
    .send({
      expected_version: order.version,
      operations: [
        {
          item_id: order.items[0]?.id,
          from_stage: from,
          to_stage: to,
          quantity,
          ...(to === "CANCELLED" ? { reason: "Cliente desistiu" } : {}),
        },
      ],
    });
  expect(response.status).toBe(200);
}

async function sellAtCounter(f: Fixture, sale: Sale = {}) {
  const { quantity = 1, cancel = 0, discount = 0, method = "PIX", ready = false, close = "auto" } = sale;
  const opened = await api()
    .post("/api/v1/tabs")
    .set(auth(f.token))
    .send({ kind: "COUNTER", label: "Balcão" });
  expect(opened.status).toBe(201);
  const tabId: string = opened.body.tab.id;
  const body = f.submission(quantity);
  const items = body.items.map(({ selections, ...item }) => ({ ...item, options: selections }));
  const created = await api()
    .post("/api/v1/orders")
    .set(auth(f.token))
    .send({ ...body, items, tab_id: tabId });
  expect(created.status).toBe(201);
  const orderId: string = created.body.order.id;
  if (cancel) await move(f, orderId, "PENDING", "CANCELLED", cancel);
  if (ready) await move(f, orderId, "PENDING", "READY", quantity - cancel);
  await move(f, orderId, ready ? "READY" : "PENDING", "DELIVERED", quantity - cancel);
  if (discount) {
    const adjusted = await api()
      .post(`/api/v1/tabs/${tabId}/adjustments`)
      .set(auth(f.token))
      .send({ type: "DISCOUNT", mode: "FIXED_CENTS", value: discount, reason: "Cortesia da casa" });
    expect(adjusted.status).toBe(201);
  }
  const tab = (await api().get(`/api/v1/tabs/${tabId}`).set(auth(f.token))).body.tab;
  const paid = await api()
    .post(`/api/v1/tabs/${tabId}/payments`)
    .set(auth(f.token))
    .send({
      idempotency_key: randomUUID(),
      provider: "MANUAL",
      method,
      amount_cents: tab.remaining_cents,
      auto_close: close === "auto",
    });
  expect(paid.body).toMatchObject({ auto_closed: close === "auto" });
  if (close === "manual") expect((await closeTab(f, tabId)).status).toBe(200);
  return { tabId, payment: paid.body.payment, total: tab.remaining_cents as number };
}

async function closeTab(f: Fixture, tabId: string) {
  const { version } = await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } });
  return api().post(`/api/v1/tabs/${tabId}/close`).set(auth(f.token)).send({ expected_version: version });
}

const rebuildDay = (f: Fixture, from: string, to = from) =>
  api().post("/api/v1/reports/rebuild").set(auth(f.token)).send({ from, to });
const nextDay = (date: string) => new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);

async function aggregates(restaurantId: string) {
  const daily = await prisma.daily_sales.findMany({
    where: { restaurant_id: restaurantId },
    orderBy: { business_date: "asc" },
    omit: { rebuilt_at: true },
  });
  const products = await prisma.product_sales_daily.findMany({
    where: { restaurant_id: restaurantId },
    orderBy: [{ business_date: "asc" }, { product_id: "asc" }, { hour_bucket: "asc" }],
  });
  return { daily, products };
}

async function seedDay(f: Fixture, date: string, quantity: number, netCents = quantity * 3000) {
  await prisma.daily_sales.create({
    data: {
      restaurant_id: f.restaurantId,
      business_date: day(date),
      tabs_closed_count: 1,
      counter_tabs_count: 1,
      gross_sales_cents: netCents,
      net_sales_cents: netCents,
      pix_cents: netCents,
    },
  });
  await prisma.product_sales_daily.create({
    data: {
      restaurant_id: f.restaurantId,
      business_date: day(date),
      product_id: f.product.id,
      variant_id: f.variant.id,
      hour_bucket: 20,
      product_name_snapshot: "Hambúrguer",
      variant_name_snapshot: "Grande",
      category_name_snapshot: "Lanches",
      quantity_sold: quantity,
      revenue_cents: quantity * 3000,
    },
  });
}

describe("dia operacional", () => {
  it("lança a venda de 01:40 de sábado na sexta e na hora local 1", async () => {
    const instant = new Date("2026-11-21T04:40:00.000Z");
    const clock = { timezone: "America/Sao_Paulo", business_day_cutoff_minutes: 300 };
    expect(businessDate(instant, clock)).toEqual(day("2026-11-20"));
    expect(localHour(instant, clock.timezone)).toBe(1);

    const f = await menuFixture();
    await prisma.restaurants.update({
      where: { id: f.restaurantId },
      data: { business_day_cutoff_minutes: 300 },
    });
    const { tabId } = await sellAtCounter(f);
    // Simula o mesmo fechamento na madrugada e reconstrói a partir da comanda.
    await prisma.tabs.update({
      where: { id: tabId },
      data: {
        closed_at: instant,
        business_date: day("2026-11-20"),
        opened_at: new Date(instant.getTime() - 60_000),
      },
    });
    await prisma.$executeRaw`ALTER TABLE orders DISABLE TRIGGER USER`;
    await prisma.orders.updateMany({ where: { tab_id: tabId }, data: { created_at: instant } });
    await prisma.$executeRaw`ALTER TABLE orders ENABLE TRIGGER USER`;
    const rebuilt = await api()
      .post("/api/v1/reports/rebuild")
      .set(auth(f.token))
      .send({ from: "2026-11-19", to: "2026-11-21" });
    expect(rebuilt.status).toBe(200);

    expect(await prisma.daily_sales.findMany({ where: { restaurant_id: f.restaurantId } })).toMatchObject([
      { business_date: day("2026-11-20"), tabs_closed_count: 1, total_stay_seconds: 60n },
    ]);
    expect(
      await prisma.product_sales_daily.findMany({ where: { restaurant_id: f.restaurantId } }),
    ).toMatchObject([{ business_date: day("2026-11-20"), hour_bucket: 1, quantity_sold: 1 }]);
  });
});

describe("agregados de vendas", () => {
  it("mantém o incremental igual ao rebuild após 10 fechamentos e 1 estorno", async () => {
    const f = await menuFixture();
    const sales: Sale[] = [
      { quantity: 2 },
      { quantity: 3, cancel: 1 },
      { discount: 300 },
      { method: "CASH" },
      { method: "CREDIT", quantity: 2 },
      { method: "DEBIT", ready: true },
      { quantity: 4, discount: 500 },
      { method: "VOUCHER" },
      { quantity: 2, cancel: 1, method: "CASH" },
      {},
    ];
    const closed = [];
    for (const sale of sales) closed.push(await sellAtCounter(f, sale));

    const refunded = closed[4];
    if (!refunded) throw new Error("Venda ausente");
    const refund = await api()
      .post(`/api/v1/tabs/${refunded.tabId}/payments/${refunded.payment.id}/refund`)
      .set(auth(f.token))
      .send({ reason: "Pagamento em duplicidade" });
    expect(refund.status).toBe(200);

    const incremental = await aggregates(f.restaurantId);
    const [today] = incremental.daily;
    const received = closed.reduce((sum, { total }) => sum + total, 0) - refunded.total;
    expect(today).toMatchObject({
      tabs_closed_count: 10,
      counter_tabs_count: 10,
      gross_sales_cents: 3000 * 16,
      cancelled_items_cents: 3000 * 2,
      discounts_cents: 800,
      net_sales_cents: received,
      credit_cents: 0,
    });
    const sold = (field: "quantity_sold" | "quantity_cancelled" | "revenue_cents") =>
      incremental.products.reduce((sum, row) => sum + row[field], 0);
    expect([sold("quantity_sold"), sold("quantity_cancelled"), sold("revenue_cents")]).toEqual([
      16, 2, 48000,
    ]);

    const date = today?.business_date.toISOString().slice(0, 10);
    const rebuilt = await api()
      .post("/api/v1/reports/rebuild")
      .set(auth(f.token))
      .send({ from: date, to: date });
    expect(rebuilt.body).toMatchObject({ days_with_sales: 1 });
    expect(await aggregates(f.restaurantId)).toEqual(incremental);
    await prisma.daily_sales.updateMany({
      where: { restaurant_id: f.restaurantId },
      data: { net_sales_cents: 1 },
    });
    await container.resolve<IReportsService>("ReportsService").reconcile();
    expect(await aggregates(f.restaurantId)).toEqual(incremental);

    const summary = await report(f.token, "sales/summary", {
      from: date,
      to: date,
      compare: "previous_period",
    });
    expect(summary.status).toBe(200);
    expect(summary.body.kpis).toMatchObject({
      net_sales_cents: received,
      tabs_closed_count: 10,
      avg_ticket_cents: Math.round(received / 10),
    });
    expect(summary.body.payment_mix[0]).toMatchObject({ method: "PIX" });
    expect(summary.body.comparison).toMatchObject({ net_sales_delta_pct: null });

    const prep = await report(f.token, "kitchen/prep-time", { from: date, to: date });
    expect(prep.body).toMatchObject({ samples: 1 });
    const history = await report(f.token, "sales/history", { from: date, to: date, granularity: "month" });
    expect(history.body.items).toHaveLength(1);
  });

  it("mantém o agregado igual ao rebuild no fechamento manual, pela sessão e concorrente", async () => {
    const f = await menuFixture();
    const manual = await sellAtCounter(f, { close: "manual" });
    // Comanda vazia da mesa: encerrar o atendimento a fecha por close-tab.
    const table = await api()
      .post("/api/v1/tabs")
      .set(auth(f.token))
      .send({ kind: "TABLE", table_id: f.table.id });
    expect(table.status).toBe(201);
    const session = await prisma.table_sessions.findFirstOrThrow({
      where: { table_id: f.table.id, status: "ACTIVE" },
    });
    const ended = await api().post(`/api/v1/sessions/${session.id}/close`).set(auth(f.token));
    expect(ended.status).toBeLessThan(300);
    expect(await prisma.tabs.count({ where: { table_id: f.table.id, status: "CLOSED" } })).toBe(1);

    const pending = await sellAtCounter(f, { close: "none" });
    const { business_date } = await prisma.tabs.findUniqueOrThrow({ where: { id: manual.tabId } });
    const date = business_date?.toISOString().slice(0, 10) ?? "";
    // date e date+1: os fechamentos podem cruzar a virada do dia operacional durante o teste.
    const [closed, rebuilt] = await Promise.all([
      closeTab(f, pending.tabId),
      rebuildDay(f, date, nextDay(date)),
    ]);
    expect([closed.status, rebuilt.status]).toEqual([200, 200]);

    const incremental = await aggregates(f.restaurantId);
    const total = (
      field: "tabs_closed_count" | "table_tabs_count" | "counter_tabs_count" | "net_sales_cents",
    ) => incremental.daily.reduce((sum, row) => sum + row[field], 0);
    expect(
      ["tabs_closed_count", "table_tabs_count", "counter_tabs_count", "net_sales_cents"].map((field) =>
        total(field as Parameters<typeof total>[0]),
      ),
    ).toEqual([3, 1, 2, 6600]);
    expect((await rebuildDay(f, date, nextDay(date))).status).toBe(200);
    expect(await aggregates(f.restaurantId)).toEqual(incremental);
  });

  it("não mistura restaurantes e ignora comandas legadas", async () => {
    const f = await menuFixture();
    const other = await ownerOf("relatorio-outro");
    const { tabId } = await sellAtCounter(f);
    await prisma.tabs.update({
      where: { id: tabId },
      data: { legacy_closed: true, paid_cents: 0 },
    });
    const date = (await prisma.tabs.findUniqueOrThrow({ where: { id: tabId } })).business_date
      ?.toISOString()
      .slice(0, 10);

    const foreign = await report(other.token, "sales/summary", { from: date, to: date });
    expect(foreign.body.kpis).toMatchObject({ tabs_closed_count: 0, net_sales_cents: 0 });
    await api().post("/api/v1/reports/rebuild").set(auth(f.token)).send({ from: date, to: date });
    expect(await prisma.daily_sales.count({ where: { restaurant_id: f.restaurantId } })).toBe(0);
  });
});

describe("rankings e mapas", () => {
  it("classifica a curva ABC e monta o mapa de calor por dia da semana e hora", async () => {
    const f = await menuFixture();
    await seedDay(f, "2026-11-13", 10);
    await seedDay(f, "2026-11-14", 2);
    const abc = await report(f.token, "products/abc", { from: "2026-11-01", to: "2026-11-20" });
    expect(abc.body.items).toEqual([
      expect.objectContaining({
        product_id: f.product.id,
        quantity_sold: 12,
        revenue_cents: 36000,
        revenue_share_pct: 100,
        abc_class: "A",
      }),
    ]);
    const heatmap = await report(f.token, "heatmap", { from: "2026-11-01", to: "2026-11-20" });
    expect(heatmap.body.items).toEqual([
      { weekday: 5, hour_bucket: 20, items_sold: 10, revenue_cents: 30000 },
      { weekday: 6, hour_bucket: 20, items_sold: 2, revenue_cents: 6000 },
    ]);
  });

  it("encontra pares vendidos juntos e calcula o percentil de preparo", () => {
    const tab = (...ids: string[]) => ({
      orders: [
        {
          items: ids.map((id) => ({
            product_id: id,
            product_name_snapshot: id.toUpperCase(),
            quantity: 1,
            cancelled_quantity: id === "c" ? 1 : 0,
          })),
        },
      ],
    });
    const tabs = [tab("a", "b"), tab("b", "a", "c"), tab("a", "b"), tab("a", "c"), tab("c", "b")];
    expect(basketPairs(tabs)).toEqual([
      { product_a_id: "a", product_a_name: "A", product_b_id: "b", product_b_name: "B", co_occurrences: 3 },
    ]);

    const start = new Date("2026-11-20T20:00:00Z");
    const samples = [60, 120, 180, 240, 600].map((seconds) => ({
      created_at: start,
      events: [{ created_at: new Date(start.getTime() + seconds * 1000) }],
    }));
    expect(prepTimeStats([...samples, { created_at: start, events: [] }])).toEqual({
      samples: 5,
      avg_prep_seconds: 240,
      p90_prep_seconds: 456,
    });
  });
});

describe("previsões", () => {
  it("segue o exemplo numérico do WMA sazonal", () => {
    expect(weightedMean([48, 42, 44, 36])).toBeCloseTo(43.68, 2);
    expect(trendFactor(105, 100)).toBe(1.05);
    expect(trendFactor(300, 100)).toBe(1.25);
    const product = {
      product_id: "p",
      product_name: "Picanha",
      category_name: "Pratos",
      abc_class: "A" as const,
      quantities: [48, 42, 44, 36],
      quantity_by_hour: new Map([
        [19, 5],
        [20, 60],
        [21, 80],
        [22, 40],
      ]),
    };
    expect(forecastDemand([product], 4, 1.05, 20)).toMatchObject({
      confidence: "LOW",
      items: [{ expected_qty: 46, range_min: 41, range_max: 51, peak_hours: [20, 21, 22] }],
    });
  });

  it("prevê a sexta com 4 semanas e recusa com menos de 3", async () => {
    const f = await menuFixture();
    await seedDay(f, "2026-10-30", 36);
    await seedDay(f, "2026-11-06", 44);
    const insufficient = await report(f.token, "forecasts/demand", { target_date: "2026-11-27" });
    expect(insufficient.body).toMatchObject({ confidence: "INSUFFICIENT_DATA", items: [] });

    await seedDay(f, "2026-11-13", 42);
    await seedDay(f, "2026-11-20", 48);
    const forecast = await report(f.token, "forecasts/demand", { target_date: "2026-11-27" });
    expect(forecast.status).toBe(200);
    expect(forecast.body).toMatchObject({
      target_date: "2026-11-27",
      weekday: 5,
      occurrences: 4,
      confidence: "LOW",
      items: [{ product_id: f.product.id, abc_class: "A", peak_hours: [20] }],
    });
    expect(forecast.body.items[0].expected_qty).toBe(Math.round(43.68 * forecast.body.trend_factor));
  });

  it("aponta queda de faturamento e quebra de caixa recorrente", async () => {
    const f = await menuFixture();
    for (const date of ["2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"]) await seedDay(f, date, 10);
    await seedDay(f, "2026-11-20", 5);
    await prisma.cash_shifts.createMany({
      data: [-1500, -2000, 500].map((difference) => ({
        restaurant_id: f.restaurantId,
        opened_by_user_id: f.user.id,
        status: "CLOSED" as const,
        opening_cents: 0,
        expected_cash_cents: Math.max(0, -difference),
        counted_cash_cents: Math.max(0, difference),
        difference_cents: difference,
        closed_at: new Date("2026-11-20T15:00:00Z"),
      })),
    });
    const alerts = await report(f.token, "forecasts/alerts", { date: "2026-11-20" });
    expect(alerts.status).toBe(200);
    const old = await report(f.token, "forecasts/alerts", { date: "2026-10-01" });
    expect(old.body.alerts.map(({ code }: { code: string }) => code)).not.toContain("CASH_DIFF_RECURRENT");
    expect(alerts.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REVENUE_DROP", severity: "CRITICAL" }),
        expect.objectContaining({ code: "CASH_DIFF_RECURRENT", severity: "CRITICAL" }),
      ]),
    );
  });
});

describe("janela do caixa nos alertas", () => {
  const clock = { timezone: "America/Sao_Paulo", business_day_cutoff_minutes: 300 };
  const shortage = (f: Fixture, closedAt: string, difference: number) =>
    prisma.cash_shifts.create({
      data: {
        restaurant_id: f.restaurantId,
        opened_by_user_id: f.user.id,
        status: "CLOSED",
        opening_cents: 0,
        expected_cash_cents: -difference,
        counted_cash_cents: 0,
        difference_cents: difference,
        closed_at: new Date(closedAt),
      },
    });
  const cashAlert = async (f: Fixture) =>
    (await report(f.token, "forecasts/alerts", { date: "2026-11-20" })).body.alerts.some(
      ({ code }: { code: string }) => code === "CASH_DIFF_RECURRENT",
    );

  it("calcula o início do dia operacional no fuso e no corte do restaurante", () => {
    const start = businessDayStart(day("2026-11-20"), clock);
    expect(start).toEqual(new Date("2026-11-20T08:00:00Z"));
    expect(businessDate(start, clock)).toEqual(day("2026-11-20"));
    expect(businessDate(new Date(start.getTime() - 1), clock)).toEqual(day("2026-11-19"));
    expect(businessDayStart(day("2026-11-20"), { ...clock, business_day_cutoff_minutes: 0 })).toEqual(
      new Date("2026-11-20T03:00:00Z"),
    );
  });

  it("inclui o turno das 22:00 locais do dia e exclui o de sete dias antes", async () => {
    const f = await menuFixture();
    await prisma.restaurants.update({
      where: { id: f.restaurantId },
      data: { business_day_cutoff_minutes: 300 },
    });
    // 22:00 locais de D−7 (01:00Z de D−6) fica fora; sozinho com o de D não forma recorrência.
    await shortage(f, "2026-11-14T01:00:00Z", -2000);
    await shortage(f, "2026-11-21T01:00:00Z", -1500);
    expect(await cashAlert(f)).toBe(false);
    // Um segundo turno dentro da janela confirma que o de D (01:00Z de D+1) foi contado.
    await shortage(f, "2026-11-20T01:00:00Z", -1200);
    expect(await cashAlert(f)).toBe(true);
  });
});

describe("permissões", () => {
  it("libera relatórios só para dono e gerente e o rebuild só para o dono", async () => {
    const f = await menuFixture();
    const range = { from: "2026-11-01", to: "2026-11-20" };
    for (const category of ["WAITER", "CASHIER"] as const) {
      const staff = await categoryToken(f.restaurantId, category);
      expect((await report(staff.token, "sales/summary", range)).status).toBe(403);
      expect((await report(staff.token, "forecasts/demand", { target_date: "2026-11-27" })).status).toBe(403);
    }
    const manager = await categoryToken(f.restaurantId, "MANAGER");
    expect((await report(manager.token, "sales/summary", range)).status).toBe(200);
    expect((await report(manager.token, "forecasts/demand", { target_date: "2026-11-27" })).status).toBe(200);
    const rebuild = await api().post("/api/v1/reports/rebuild").set(auth(manager.token)).send(range);
    expect([rebuild.status, rebuild.body.code]).toEqual([403, "REBUILD_OWNER_ONLY"]);
    expect((await report(f.token, "sales/summary", { from: "2026-11-20", to: "2026-11-01" })).status).toBe(
      400,
    );
  });
});
