import "reflect-metadata";
import "dotenv/config";
import { prisma } from "../src/shared/providers/prisma.ts";
import { passwordHash } from "../src/shared/utils/password.ts";
import { generatePublicCode, isPublicCode } from "../src/shared/utils/token.ts";
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

// O public_code é gerado pelo sistema (mesmo formato do POST /tables); rodar de novo não duplica as mesas
for (let i = 1; i <= 5; i++) {
  const label = `Mesa ${i}`;
  const exists = await prisma.tables.findFirst({ where: { restaurant_id: restaurant.id, label } });
  if (!exists) await prisma.tables.create({ data: { restaurant_id: restaurant.id, label, public_code: generatePublicCode() } });
  // Bancos semeados antes tinham códigos como "demo-mesa-1", que o scan recusa pelo formato
  else if (!isPublicCode(exists.public_code)) await prisma.tables.update({ where: { id: exists.id }, data: { public_code: generatePublicCode() } });
}

const tables = await prisma.tables.findMany({ where: { restaurant_id: restaurant.id }, orderBy: { label: "asc" } });
console.log("Seed ok: OWNER admin@demo.com / admin123");
for (const t of tables) console.log(`  ${t.label}: /m/${t.public_code}`);
await prisma.$disconnect();
