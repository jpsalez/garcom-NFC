import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedOrigins } from "../src/server.ts";
import { clearAuthCookies, readCookie, setAuthCookies } from "../src/shared/utils/cookies.ts";
import { api } from "./helpers/app.ts";
import { auth, cookieOf, ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const credentials = { email: "a@teste.com", password: "senha-forte-123" };
const setCookies = (res: { headers: Record<string, unknown> }) => ([] as string[]).concat(res.headers["set-cookie"] as string[]);

describe("cookies de sessão", () => {
  it("login grava access_token e refresh_token httpOnly e não devolve token no corpo", async () => {
    await ownerOf("a");

    const res = await api().post("/api/v1/auth/login").send(credentials);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.user.email).toBe(credentials.email);
    const [access, refresh] = [setCookies(res).find((c) => c.startsWith("access_token="))!, setCookies(res).find((c) => c.startsWith("refresh_token="))!];
    for (const cookie of [access, refresh]) expect(cookie).toMatch(/HttpOnly/i);
    for (const cookie of [access, refresh]) expect(cookie).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\/;/);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
  });

  it("em produção os cookies ganham Secure", () => {
    const cookie = vi.fn();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      setAuthCookies({ cookie } as never, { token: "a", refreshToken: "r" });
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(cookie.mock.calls.map((c) => c[2].secure)).toEqual([true, true]);
  });

  it("clearAuthCookies apaga os dois nos mesmos caminhos", () => {
    const clearCookie = vi.fn();
    clearAuthCookies({ clearCookie } as never);
    expect(clearCookie.mock.calls.map((c) => [c[0], c[1].path])).toEqual([["access_token", "/"], ["refresh_token", "/api/v1/auth"]]);
  });

  it("readCookie acha o cookie pelo nome e devolve undefined se não houver", () => {
    expect(readCookie("a=1; access_token=abc.def; b=2", "access_token")).toBe("abc.def");
    expect(readCookie(undefined, "access_token")).toBeUndefined();
    expect(readCookie("outro=1", "access_token")).toBeUndefined();
  });

  it("a API não aceita mais Authorization: Bearer", async () => {
    const { token } = await ownerOf("a");

    expect((await api().get("/api/v1/auth/me").set(auth(token))).status).toBe(200);
    expect((await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
  });

  it("refresh lê o cookie, troca o par e o antigo deixa de valer", async () => {
    await ownerOf("a");
    const login = await api().post("/api/v1/auth/login").send(credentials);
    const old = cookieOf(login, "refresh_token") as string;

    const res = await api().post("/api/v1/auth/refresh").set("Cookie", `refresh_token=${old}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(cookieOf(res, "access_token")).toBeTruthy();
    expect(cookieOf(res, "refresh_token")).not.toBe(old);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", `refresh_token=${old}`)).status).toBe(401);
    expect((await api().post("/api/v1/auth/refresh")).status).toBe(401);
  });

  it("logout revoga o refresh token e limpa os dois cookies", async () => {
    await ownerOf("a");
    const refresh = cookieOf(await api().post("/api/v1/auth/login").send(credentials), "refresh_token") as string;

    const res = await api().post("/api/v1/auth/logout").set("Cookie", `refresh_token=${refresh}`);

    expect(res.status).toBe(204);
    expect(setCookies(res).filter((c) => /^(access|refresh)_token=;/.test(c))).toHaveLength(2);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", `refresh_token=${refresh}`)).status).toBe(401);
    expect((await api().post("/api/v1/auth/logout")).status).toBe(204);
  });
});

describe("CSRF e CORS com cookie", () => {
  const front = "http://front.teste";
  beforeEach(() => {
    if (!allowedOrigins.includes(front)) allowedOrigins.push(front);
  });

  it("método que altera dados vindo de origem não permitida dá 403, mesmo com cookie válido", async () => {
    const { token } = await ownerOf("a");
    const create = (origin?: string) => {
      const req = api().post("/api/v1/tables").set(auth(token)).send({ label: "Mesa 1" });
      return origin ? req.set("Origin", origin) : req;
    };

    expect((await create("http://evil.teste")).status).toBe(403);
    expect(await prisma.tables.count()).toBe(0);
    expect((await create(front)).status).toBe(201);
    expect((await create()).status).toBe(201);
  });

  it("leitura de origem estranha não é barrada pelo filtro de CSRF; a mesma origem (Host) também passa", async () => {
    const { token } = await ownerOf("a");

    expect((await api().get("/api/v1/tables").set(auth(token)).set("Origin", "http://evil.teste")).status).toBe(200);
    expect((await api().post("/api/v1/tables").set(auth(token)).set("Host", "api.teste").set("Origin", "http://api.teste").send({ label: "M" })).status).toBe(201);
  });

  it("a origem permitida recebe Access-Control-Allow-Credentials", async () => {
    const res = await api().get("/api/v1/health").set("Origin", front);

    expect(res.headers["access-control-allow-origin"]).toBe(front);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});
