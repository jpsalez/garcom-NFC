import { AppError } from "./AppError.ts";

// Erros HTTP prontos: já carregam status e nome.
// Uso: if (!user) throw new NotFoundError("Usuário não encontrado");
// O `throw` interrompe a função; o errorHandler global monta a resposta.

export class BadRequestError extends AppError {
  constructor(message = "Requisição inválida", details?: unknown) {
    super(message, 400, details);
    this.name = "BadRequestError";
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown, message = "Dados inválidos") {
    super(message, 400, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autenticado") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Registro já existe") {
    super(message, 409);
    this.name = "ConflictError";
  }
}
