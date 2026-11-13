import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb } from "./helpers/db.ts";
import { createRestaurant, createSession, createTable } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// Garante que o índice parcial table_sessions_one_active existe no banco
describe("uma sessão ACTIVE por mesa", () => {
  it("recusa a segunda sessão ACTIVE na mesma mesa", async () => {
    const r = await createRestaurant();
    const mesa = await createTable(r.id);
    await createSession(r.id, mesa.id, "ACTIVE");

    await expect(createSession(r.id, mesa.id, "ACTIVE")).rejects.toThrow();
  });

  it("aceita nova sessão ACTIVE depois que a anterior foi encerrada", async () => {
    const r = await createRestaurant();
    const mesa = await createTable(r.id);
    await createSession(r.id, mesa.id, "CLOSED");

    await expect(createSession(r.id, mesa.id, "ACTIVE")).resolves.toBeDefined();
  });
});
