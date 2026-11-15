import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { ValidationError } from "../errors/http-errors.ts";

export function validateSchema(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Devolve quais campos falharam e por quê
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      throw new ValidationError(details);
    }

    // Só os campos do schema seguem adiante (evita campos extras como role ou active)
    req.body = result.data;
    next();
  };
}

// Query string: só valida (no Express 5 req.query é somente leitura); o default do schema o controller aplica com parse
export function validateQuery(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    next();
  };
}

// Parâmetros de URL que precisam ser UUID: evita erro do banco por id malformado
export function validateUuidParams(...names: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const invalid = names.filter((name) => !z.uuid().safeParse(req.params[name]).success);
    if (invalid.length > 0) {
      throw new ValidationError(invalid.map((field) => ({ field, message: "UUID inválido" })));
    }
    next();
  };
}
