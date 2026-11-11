import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.ts";
import { verifyToken } from "../utils/jwt.ts";

// Valida o JWT do header "Authorization: Bearer <token>" e coloca o id do usuário em req.id
export function ensureAuthenticated(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError("Token não informado", 401);
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new AppError("Token mal formatado", 401);
  }

  try {
    const payload = verifyToken(token);
    req.id = payload.sub;
  } catch {
    // Assinatura inválida, token expirado ou payload estranho: tudo vira 401
    throw new AppError("Token inválido ou expirado", 401);
  }

  next();
}
