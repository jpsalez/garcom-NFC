import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RestaurantRepository } from "../src/modules/restaurants/restaurants.repository.ts";
import { passwordHash } from "../src/shared/utils/password.ts";
import { api } from "./helpers/app.ts";
import { auth, cookieOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function expectEmptyMenu(restaurantId: string, displayName: string) {
  const menu = await prisma.menus.findUniqueOrThrow({ where: { restaurant_id: restaurantId } });
  expect(menu.display_name).toBe(displayName);
  expect(menu.published_revision_id).toBeNull();
  expect(menu.draft_version).toBe(1);
  expect(await prisma.menu_categories.count({ where: { restaurant_id: restaurantId } })).toBe(0);
  const settings = await prisma.restaurant_order_settings.findUniqueOrThrow({
    where: { restaurant_id: restaurantId },
  });
  expect(settings.customer_ordering_enabled).toBe(false);
  const events = await prisma.restaurant_operation_events.findMany({
    where: { restaurant_id: restaurantId },
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ action: "INITIALIZED", actor_type: "SYSTEM", entity_id: restaurantId });
}

describe("base do cardápio no cadastro de restaurante", () => {
  it("auto-cadastro inicializa rascunho e configuração sem expor estruturas internas", async () => {
    const response = await api().post("/api/v1/auth/register").send({
      name: "Ana",
      email: "ana-menu@teste.com",
      password: "senha-forte-123",
      restaurantName: "Bistrô da Ana",
    });
    expect(response.status).toBe(201);
    const restaurant = await prisma.restaurants.findUniqueOrThrow({
      where: { id: response.body.restaurant.id },
    });
    await expectEmptyMenu(restaurant.id, "Bistrô da Ana");
    expect(response.body.restaurant.menus).toBeUndefined();
    expect(response.body.restaurant.operation_events).toBeUndefined();
  });

  it("cadastro pela plataforma cria a mesma base", async () => {
    await prisma.users.create({
      data: {
        name: "Super",
        email: "super-menu@teste.com",
        password_hash: await passwordHash("senha-forte-123"),
        role: "SUPER_ADMIN",
      },
    });
    const login = await api().post("/api/v1/auth/login").send({
      email: "super-menu@teste.com",
      password: "senha-forte-123",
    });
    const token = cookieOf(login, "access_token");
    if (!token) throw new Error("Login de teste não retornou cookie");
    const response = await api().post("/api/v1/admin/restaurants").set(auth(token)).send({
      name: "Restaurante Plataforma",
      slug: "restaurante-plataforma",
    });
    expect(response.status).toBe(201);
    await expectEmptyMenu(response.body.id, "Restaurante Plataforma");
  });

  it("rollback do cadastro não deixa cardápio, configuração ou auditoria órfãos", async () => {
    const failure = new Error("Falha simulada após criar restaurante");
    let restaurantId = "";
    await expect(
      prisma.$transaction(async (tx) => {
        const restaurant = await new RestaurantRepository(tx).create({
          name: "Rollback",
          slug: "rollback-menu",
        });
        restaurantId = restaurant.id;
        throw failure;
      }),
    ).rejects.toThrow(failure);
    expect(restaurantId).not.toBe("");
    expect(await prisma.restaurants.findUnique({ where: { id: restaurantId } })).toBeNull();
    expect(await prisma.menus.count({ where: { restaurant_id: restaurantId } })).toBe(0);
    expect(await prisma.restaurant_order_settings.count({ where: { restaurant_id: restaurantId } })).toBe(0);
    expect(await prisma.restaurant_operation_events.count({ where: { restaurant_id: restaurantId } })).toBe(
      0,
    );
  });

  it("recusa um segundo cardápio para o mesmo restaurante", async () => {
    const restaurant = await new RestaurantRepository(prisma).create({ name: "Único", slug: "menu-unico" });
    await expect(
      prisma.menus.create({
        data: {
          restaurant_id: restaurant.id,
          display_name: "Duplicado",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("categoria e produto de restaurantes diferentes não podem ser associados", async () => {
    const repository = new RestaurantRepository(prisma);
    const a = await repository.create({ name: "A", slug: "menu-a" });
    const b = await repository.create({ name: "B", slug: "menu-b" });
    const menuA = await prisma.menus.findUniqueOrThrow({ where: { restaurant_id: a.id } });
    const menuB = await prisma.menus.findUniqueOrThrow({ where: { restaurant_id: b.id } });
    const category = await prisma.menu_categories.create({
      data: {
        restaurant_id: b.id,
        menu_id: menuB.id,
        name: "Categoria de B",
      },
    });
    await expect(
      prisma.menu_products.create({
        data: {
          restaurant_id: a.id,
          menu_id: menuA.id,
          category_id: category.id,
          name: "Produto inválido",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
