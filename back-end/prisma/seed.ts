import "reflect-metadata";
import "dotenv/config";
import { prisma } from "../src/shared/providers/prisma.ts";
import { passwordHash } from "../src/shared/utils/password.ts";
import { role } from "../generated/prisma/enums.ts";

// Dados de desenvolvimento: um restaurante, um OWNER e 5 mesas. Seguro rodar mais de uma vez.
// Uso: npm run db:seed
if (process.env.NODE_ENV === "production") throw new Error("Seed não roda em produção");

const restaurant = await prisma.restaurants.upsert({
  where: { slug: "demo" },
  update: {},
  create: { name: "Restaurante Demo", slug: "demo" },
});

await prisma.users.upsert({
  where: { email: "admin@demo.com" },
  update: {},
  create: {
    name: "Admin Demo",
    email: "admin@demo.com",
    password_hash: await passwordHash("admin123"),
    role: role.OWNER,
    restaurant_id: restaurant.id,
  },
});

for (let i = 1; i <= 5; i++) {
  await prisma.tables.upsert({
    where: { public_code: `demo-mesa-${i}` },
    update: {},
    create: { restaurant_id: restaurant.id, label: `Mesa ${i}`, public_code: `demo-mesa-${i}` },
  });
}

console.log("Seed ok: OWNER admin@demo.com / admin123, 5 mesas (public_code demo-mesa-1..5)");
await prisma.$disconnect();
