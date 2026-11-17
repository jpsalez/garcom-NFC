import type { CookieOptions, Response } from "express";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
// O refresh token só viaja para as rotas de auth (prefixo /api/v1 definido no main.ts)
const REFRESH_PATH = "/api/v1/auth";

export function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

// httpOnly: o JavaScript da página não lê o token. Secure só em produção (o dev roda em http).
const base = (): CookieOptions => ({ httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });

export function setAuthCookies(res: Response, tokens: { token: string; refreshToken: string }) {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;
  // O de acesso é cookie de sessão: quem manda no prazo é o JWT (JWT_EXPIRES_IN)
  res.cookie(ACCESS_COOKIE, tokens.token, { ...base(), path: "/" });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base(), path: REFRESH_PATH, maxAge: days * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}
