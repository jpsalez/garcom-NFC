import type { NextFunction, Request, Response } from "express";
import { ForbiddenError } from "../errors/http-errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF: o navegador manda o cookie sozinho, então pedido que altera dados e vem de outra origem é recusado.
// Sem Origin (curl, testes, servidor) passa; a mesma origem da API (Host) também, para o Swagger em /docs.
export function blockForeignOrigin(allowedOrigins: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const sameHost = origin && URL.canParse(origin) && new URL(origin).host === req.headers.host;
    if (!SAFE_METHODS.has(req.method) && origin && !sameHost && !allowedOrigins.includes(origin)) {
      throw new ForbiddenError("Origem não permitida");
    }
    next();
  };
}
