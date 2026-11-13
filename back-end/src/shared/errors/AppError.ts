// Erro base da aplicação: carrega status HTTP, nome e (opcionalmente) detalhes extras.
// Não use diretamente nos services: prefira as subclasses de http-errors.ts.
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
