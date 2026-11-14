import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { passwordHash } from "../src/shared/utils/password.ts";
import { api } from "./helpers/app.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { createRestaurant } from "./helpers/factories.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function superAdminToken() {
  const email = "super@teste.com";
  const password = "senha-forte-123";
  await prisma.users.create({
    data: { name: "Super", email, password_hash: await passwordHash(password), role: "SUPER_ADMIN" },
  });
  return (await api().post("/auth/login").send({ email, password })).body.token as string;
}

const newUser = { name: "Dono", email: "dono@teste.com", password: "senha-forte-123", role: "OWNER" };

// DEC-13: restaurante desativado não ganha usuários novos
describe("POST /admin/restaurants/:id/users", () => {
  it("restaurante ativo: 201", async () => {
    const token = await superAdminToken();
    const restaurant = await createRestaurant();

    const res = await api().post(`/admin/restaurants/${restaurant.id}/users`).set("Authorization", `Bearer ${token}`).send(newUser);

    expect(res.status).toBe(201);
  });

  it("restaurante desativado: 409 e o usuário não é criado", async () => {
    const token = await superAdminToken();
    const restaurant = await createRestaurant();
    await prisma.restaurants.update({ where: { id: restaurant.id }, data: { active: false } });

    const res = await api().post(`/admin/restaurants/${restaurant.id}/users`).set("Authorization", `Bearer ${token}`).send(newUser);

    expect(res.status).toBe(409);
    expect(await prisma.users.findUnique({ where: { email: newUser.email } })).toBeNull();
  });
});
