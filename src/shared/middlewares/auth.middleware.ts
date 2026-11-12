import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../errors/http-errors.ts";
import { verifyToken } from "../utils/jwt.ts";

// Valida o JWT do header "Authorization: Bearer <token>" e coloca o id do usuário em req.id
export function ensureAuthenticated(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError("Token não informado");
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Token mal formatado");
  }

  try {
    const payload = verifyToken(token);
    req.id = payload.sub;
  } catch {
    throw new UnauthorizedError("Token inválido ou expirado");
  }

  next();
}
