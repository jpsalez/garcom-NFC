import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISessionsService } from "../src/modules/sessions/sessions.interfaces.ts";
import { SessionTokenRepository } from "../src/modules/sessions/sessions.repository.ts";
import { container } from "../src/shared/container/container.ts";
import { startSessionExpiryJob } from "../src/shared/jobs/session-expiry.job.ts";
import { api } from "./helpers/app.ts";
import { ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

const expireDue = () => {
  api();
  return container.resolve<ISessionsService>("SessionsService").expireDue();
};
const past = () => new Date(Date.now() - 1000);

describe("expireDue", () => {
  it("encerra o vencido por TIMEOUT, sem closed_by, revogando tokens e cancelando chamados", async () => {
    const { user } = await ownerOf("a");
    const table = await createTable(user.restaurant_id!);
    const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
    await api().post("/api/v1/public/calls").set("X-Table-Token", scan.body.token).send({ type: "WAITER" });
    await prisma.table_sessions.updateMany({ where: { table_id: table.id }, data: { expires_at: past() } });

    expect(await expireDue()).toBe(1);

    const session = await prisma.table_sessions.findFirstOrThrow({ where: { table_id: table.id } });
    expect([session.status, session.closed_reason, session.closed_by]).toEqual(["CLOSED", "TIMEOUT", null]);
    expect((await prisma.session_tokens.findFirstOrThrow()).revoked_at).not.toBeNull();
    expect((await prisma.calls.findFirstOrThrow()).status).toBe("CANCELLED");
  });

  it("não mexe em atendimento no prazo, com keep_open ou já encerrado", async () => {
    const { user } = await ownerOf("a");
    const restaurantId = user.restaurant_id!;
    const inTime = await createSession(restaurantId, (await createTable(restaurantId, "A")).id);
    const kept = await createSession(restaurantId, (await createTable(restaurantId, "B")).id, "ACTIVE", past());
    await prisma.table_sessions.update({ where: { id: kept.id }, data: { keep_open: true } });
    const closed = await createSession(restaurantId, (await createTable(restaurantId, "C")).id, "CLOSED", past());

    expect(await expireDue()).toBe(0);

    const statuses = await prisma.table_sessions.findMany({ where: { id: { in: [inTime.id, kept.id, closed.id] } }, orderBy: { id: "asc" } });
    expect(statuses.filter((s) => s.status === "ACTIVE").map((s) => s.id).sort()).toEqual([inTime.id, kept.id].sort());
    expect(closed.closed_reason).toBeNull();
  });

  it("falha em um atendimento não impede o encerramento dos outros", async () => {
    const { user } = await ownerOf("a");
    const restaurantId = user.restaurant_id!;
    await createSession(restaurantId, (await createTable(restaurantId, "A")).id, "ACTIVE", past());
    await createSession(restaurantId, (await createTable(restaurantId, "B")).id, "ACTIVE", past());
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // A primeira transação falha (e desfaz); a segunda segue normalmente
    const fail = vi.spyOn(SessionTokenRepository.prototype, "revokeAllBySession").mockRejectedValueOnce(new Error("banco fora"));

    const closed = await expireDue();

    fail.mockRestore();
    log.mockRestore();
    expect(closed).toBe(1);
    expect(await prisma.table_sessions.count({ where: { status: "CLOSED" } })).toBe(1);
    expect(await prisma.table_sessions.count({ where: { status: "ACTIVE" } })).toBe(1);
  });

  it("encerra vários restaurantes de uma vez", async () => {
    const a = await ownerOf("a");
    const b = await ownerOf("b");
    await createSession(a.user.restaurant_id!, (await createTable(a.user.restaurant_id!)).id, "ACTIVE", past());
    await createSession(b.user.restaurant_id!, (await createTable(b.user.restaurant_id!)).id, "ACTIVE", past());

    expect(await expireDue()).toBe(2);
    expect(await prisma.table_sessions.count({ where: { status: "ACTIVE" } })).toBe(0);
  });
});

describe("startSessionExpiryJob", () => {
  it("chama expireDue a cada 60 s e para quando cancelado", () => {
    vi.useFakeTimers();
    const service = { expireDue: vi.fn().mockResolvedValue(0) };

    const timer = startSessionExpiryJob(service);
    vi.advanceTimersByTime(59_000);
    expect(service.expireDue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(service.expireDue).toHaveBeenCalledTimes(1);

    clearInterval(timer);
    vi.advanceTimersByTime(120_000);
    expect(service.expireDue).toHaveBeenCalledTimes(1);
  });

  it("um erro na varredura não derruba o job", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = { expireDue: vi.fn().mockRejectedValueOnce(new Error("banco fora")).mockResolvedValue(0) };

    const timer = startSessionExpiryJob(service);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(service.expireDue).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledOnce();
    clearInterval(timer);
    log.mockRestore();
  });
});
