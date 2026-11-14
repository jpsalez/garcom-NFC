import { prisma } from "../../src/shared/providers/prisma.ts";

export { prisma };

// Limpa tudo entre testes. Recusa rodar fora de um banco de teste.
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("resetDb só roda em banco de teste (nome terminando em _test)");
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "calls","session_tokens","table_sessions","tables","users","restaurants" RESTART IDENTITY CASCADE',
  );
}
