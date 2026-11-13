import "reflect-metadata";
import "dotenv/config";
import { prisma } from "../src/shared/providers/prisma.ts";
import { passwordHash } from "../src/shared/utils/password.ts";
import { role } from "../generated/prisma/enums.ts";

// Cria o SUPER_ADMIN da plataforma. Pode rodar em produção, por isso não tem senha padrão:
// e-mail e senha vêm do ambiente e o script recusa senha curta. Não faz nada se o e-mail já existe.
// Uso: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npm run db:seed:super-admin
const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email || !password) throw new Error("Defina SUPER_ADMIN_EMAIL e SUPER_ADMIN_PASSWORD");
if (password.length < 12) throw new Error("SUPER_ADMIN_PASSWORD precisa ter ao menos 12 caracteres");

const existing = await prisma.users.findUnique({ where: { email } });
if (existing) {
  console.log("Já existe um usuário com esse e-mail: nada foi alterado");
} else {
  await prisma.users.create({
    data: { name: "Super Admin", email, password_hash: await passwordHash(password), role: role.SUPER_ADMIN },
  });
  console.log(`SUPER_ADMIN criado: ${email}`);
}
await prisma.$disconnect();
