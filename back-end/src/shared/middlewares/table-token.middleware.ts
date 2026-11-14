import type { NextFunction, Request, Response } from "express";
import type { Device } from "../../modules/calls/calls.interfaces.ts";
import type { ISessionTokenRepository } from "../../modules/sessions/sessions.repository.interface.ts";
import { container } from "../container/container.ts";
import { UnauthorizedError } from "../errors/http-errors.ts";
import { hashToken } from "../utils/token.ts";

// Rotas do cliente: o token do aparelho vem no cabeçalho X-Table-Token e só vale com o atendimento ativo e dentro do prazo
export async function ensureTableToken(req: Request, _res: Response, next: NextFunction) {
  const token = req.get("x-table-token");
  if (!token) throw new UnauthorizedError("Token da mesa não informado");

  const saved = await container.resolve<ISessionTokenRepository>("SessionTokenRepository").findByHash(hashToken(token));
  const session = saved?.table_session;
  const expired = session && !session.keep_open && session.expires_at <= new Date();
  if (!saved || !session || saved.revoked_at || session.status !== "ACTIVE" || expired) {
    throw new UnauthorizedError("Token da mesa inválido ou expirado");
  }

  req.tableToken = { tokenId: saved.id, sessionId: session.id, restaurantId: session.restaurant_id, tableLabel: session.table.label };
  next();
}

// Aparelho já validado; usar depois do ensureTableToken
export function deviceOf(req: Request): Device {
  if (!req.tableToken) throw new UnauthorizedError("Token da mesa não informado");
  return req.tableToken;
}
