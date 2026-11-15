import type { Response } from "supertest";
import { api } from "./app.ts";
import { prisma } from "./db.ts";

const password = "senha-forte-123";

// Valor de um cookie definido na resposta (Set-Cookie)
export function cookieOf(res: Response, name: string) {
  const list = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const line = list.find((c) => c.startsWith(`${name}=`));
  return line?.split(";")[0]?.slice(name.length + 1);
}

// Registra um restaurante com OWNER e devolve o JWT de acesso dele (o valor do cookie access_token)
export async function ownerOf(name: string) {
  const email = `${name}@teste.com`;
  await api().post("/api/v1/auth/register").send({ name, email, password, restaurantName: name });
  const login = await api().post("/api/v1/auth/login").send({ email, password });
  const user = await prisma.users.findUniqueOrThrow({ where: { email } });
  if (!user.restaurant_id) throw new Error("OWNER cadastrado sem restaurante");
  return { token: cookieOf(login, "access_token") as string, user, restaurantId: user.restaurant_id };
}

export async function staffToken(ownerToken: string) {
  const email = "garcom@teste.com";
  await api().post("/api/v1/staff").set(auth(ownerToken)).send({ name: "Gar", email, password });
  return cookieOf(await api().post("/api/v1/auth/login").send({ email, password }), "access_token") as string;
}

// Cabeçalho que o navegador mandaria: o JWT de acesso no cookie
export const auth = (token: string) => ({ Cookie: `access_token=${token}` });
