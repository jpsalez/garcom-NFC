import { AppError } from "./AppError.ts";

// Erros HTTP prontos: já carregam status e nome.
// Uso: if (!user) throw new NotFoundError("Usuário não encontrado");
// O `throw` interrompe a função; o errorHandler global monta a resposta.

export class BadRequestError extends AppError {
  constructor(message = "Requisição inválida", details?: unknown) {
    super(message, 400, details, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown, message = "Dados inválidos") {
    super(message, 400, details, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autenticado") {
    super(message, 401, undefined, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(message, 403, undefined, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super(message, 404, undefined, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  // code específico quando o front precisa distinguir o motivo do conflito
  constructor(message = "Registro já existe", code = "CONFLICT") {
    super(message, 409, undefined, code);
    this.name = "ConflictError";
  }
}
