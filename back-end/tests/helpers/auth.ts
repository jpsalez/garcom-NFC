import { api } from "./app.ts";
import { prisma } from "./db.ts";

const password = "senha-forte-123";

// Registra um restaurante com OWNER e devolve o token dele
export async function ownerOf(name: string) {
  const email = `${name}@teste.com`;
  await api().post("/api/v1/auth/register").send({ name, email, password, restaurantName: name });
  const login = await api().post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.token as string, user: await prisma.users.findUniqueOrThrow({ where: { email } }) };
}

export async function staffToken(ownerToken: string) {
  const email = "garcom@teste.com";
  await api().post("/api/v1/staff").set("Authorization", `Bearer ${ownerToken}`).send({ name: "Gar", email, password });
  return (await api().post("/api/v1/auth/login").send({ email, password })).body.token as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
