import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client.ts";
import { AppError } from "../errors/AppError.ts";

// Handler global de erros: deve ser registrado DEPOIS das rotas.
// No Express 5, erros lançados em handlers async chegam aqui sozinhos, sem try/catch.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Erros de regra de negócio lançados pelos services
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Violação de unique no banco (ex.: dois cadastros simultâneos com o mesmo e-mail)
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({ message: "Registro já existe" });
  }

  // Qualquer outro erro é inesperado: loga e não vaza detalhes para o cliente
  console.error(err);
  return res.status(500).json({ message: "Erro interno do servidor" });
}
