import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client.ts";
import { AppError } from "../errors/AppError.ts";
import { ConflictError, NotFoundError } from "../errors/http-errors.ts";

// Handler global de erros: deve ser registrado DEPOIS das rotas.
// Formato único de resposta: { error, message, details? }

function sendAppError(res: Response, err: AppError) {
  return res.status(err.statusCode).json({
    error: err.name,
    message: err.message,
    ...(err.details !== undefined && { details: err.details }),
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Erros lançados pelos services/middlewares (NotFoundError, ConflictError, ...)
  if (err instanceof AppError) {
    return sendAppError(res, err);
  }

  // Erros conhecidos do Prisma viram erros HTTP equivalentes
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Violação de unique (ex.: dois cadastros simultâneos com o mesmo e-mail)
    if (err.code === "P2002") return sendAppError(res, new ConflictError());
    // Registro ainda referenciado (ex.: mesa que ganhou atendimento durante a exclusão)
    if (err.code === "P2003") return sendAppError(res, new ConflictError());
    // Registro não encontrado em update/delete
    if (err.code === "P2025") return sendAppError(res, new NotFoundError());
  }

  // Qualquer outro erro é inesperado: loga e não vaza detalhes para o cliente
  console.error(err);
  return res.status(500).json({ error: "InternalServerError", message: "Erro interno do servidor" });
}
