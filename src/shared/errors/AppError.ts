// Erro de regra de negócio com status HTTP; o controller usa o statusCode na resposta
export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
