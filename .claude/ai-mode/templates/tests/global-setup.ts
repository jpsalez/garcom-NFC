import { execSync } from "node:child_process";
import { config } from "dotenv";

// Roda uma vez antes de todos os testes: aplica as migrations no banco de teste
export default function setup() {
  config({ path: ".env.test", override: true });

  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("DATABASE_URL de teste precisa conter '_test'. Abortado para proteger o banco real.");
  }

  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
