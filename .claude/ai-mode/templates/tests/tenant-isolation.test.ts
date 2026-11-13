import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TableRepository } from "../src/modules/tables/tables.repository.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createRestaurant, createTable } from "./helpers/factories.ts";

const tables = new TableRepository(prisma);

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// Regra central do sistema: um restaurante nunca enxerga dados de outro
describe("isolamento entre restaurantes (TableRepository)", () => {
  it("findById não devolve mesa de outro restaurante", async () => {
    const a = await createRestaurant("A");
    const b = await createRestaurant("B");
    const mesaDeB = await createTable(b.id);

    expect(await tables.findById(a.id, mesaDeB.id)).toBeNull();
    expect(await tables.findById(b.id, mesaDeB.id)).not.toBeNull();
  });

  it("findMany lista só as mesas do próprio restaurante", async () => {
    const a = await createRestaurant("A");
    const b = await createRestaurant("B");
    await createTable(a.id, "A-1");
    await createTable(b.id, "B-1");

    const lista = await tables.findMany(a.id);
    expect(lista.map((t) => t.label)).toEqual(["A-1"]);
  });

  it("update não altera mesa de outro restaurante", async () => {
    const a = await createRestaurant("A");
    const b = await createRestaurant("B");
    const mesaDeB = await createTable(b.id, "B-1");

    await expect(tables.update(a.id, mesaDeB.id, { label: "invadida" })).rejects.toThrow();
    expect((await prisma.tables.findUnique({ where: { id: mesaDeB.id } }))?.label).toBe("B-1");
  });
});
