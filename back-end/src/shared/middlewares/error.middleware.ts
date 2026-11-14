import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client.ts";
import { AppError } from "../errors/AppError.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../errors/http-errors.ts";

// Handler global de erros: deve ser registrado DEPOIS das rotas.
// Formato único de resposta: { error, code, message, details? }

function sendAppError(res: Response, err: AppError) {
  return res.status(err.statusCode).json({
    error: err.name,
    code: err.code,
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

  // Erros do body-parser: JSON malformado e corpo grande demais não são falha do servidor
  const bodyError = (err as { type?: string } | null)?.type;
  if (bodyError === "entity.parse.failed") return sendAppError(res, new BadRequestError("JSON inválido"));
  if (bodyError === "entity.too.large") {
    return sendAppError(res, new AppError("Corpo da requisição grande demais", 413, undefined, "PAYLOAD_TOO_LARGE"));
  }

  // Qualquer outro erro é inesperado: loga e não vaza detalhes para o cliente.
  // Erros do Prisma levam os argumentos da query (e-mail, hash) na mensagem: registra só o tipo e o código.
  const isPrisma = err instanceof Error && err.name.startsWith("PrismaClient");
  console.error(isPrisma ? `${err.name} ${(err as { code?: string }).code ?? ""}` : err);
  return res.status(500).json({ error: "InternalServerError", code: "INTERNAL_ERROR", message: "Erro interno do servidor" });
}
