// Erro base da aplicação: carrega status HTTP, nome e (opcionalmente) detalhes extras.
// Não use diretamente nos services: prefira as subclasses de http-errors.ts.
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;
  // Identificador estável para o front tratar o erro sem depender da mensagem (DEC-12)
  readonly code: string;

  constructor(message: string, statusCode = 400, details?: unknown, code = "ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }
}
