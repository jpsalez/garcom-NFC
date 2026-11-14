import type { NextFunction, Request, Response } from "express";
import type { role } from "../../../generated/prisma/enums.ts";
import type { IUserRepository } from "../../modules/users/users.repository.interface.ts";
import type { IAuthCache } from "../cache/auth-cache.ts";
import { container } from "../container/container.ts";
import { ForbiddenError, UnauthorizedError } from "../errors/http-errors.ts";
import { verifyToken } from "../utils/jwt.ts";

function readPayload(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError("Token não informado");
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Token mal formatado");
  }

  try {
    return verifyToken(token);
  } catch {
    throw new UnauthorizedError("Token inválido ou expirado");
  }
}

// Valida o JWT e confere se o usuário e o restaurante continuam ativos. Role e restaurantId vêm do banco, não do token.
// O resultado fica em cache (AuthCache); desativar/excluir invalida a entrada, então o corte continua imediato.
export async function ensureAuthenticated(req: Request, _res: Response, next: NextFunction) {
  const payload = readPayload(req);

  const cache = container.resolve<IAuthCache>("AuthCache");
  let entry = cache.get(payload.sub);

  if (!entry) {
    const version = cache.currentVersion();
    const userRepository = container.resolve<IUserRepository>("UserRepository");
    const user = await userRepository.findForAuth(payload.sub);
    if (!user || !user.active || user.restaurant?.active === false) {
      throw new UnauthorizedError("Token inválido ou expirado");
    }
    entry = { id: user.id, restaurantId: user.restaurant_id, role: user.role };
    cache.set(entry, version);
  }

  req.user = entry;
  next();
}

// Usar depois do ensureAuthenticated: libera só os papéis informados
export function ensureRole(...roles: role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenError("Sem permissão para esta ação");
    }
    next();
  };
}

// Id do usuário logado (ex.: closed_by, done_by); usar depois do ensureAuthenticated
export function userOf(req: Request): string {
  if (!req.user) throw new UnauthorizedError("Não autenticado");
  return req.user.id;
}

// Rotas de restaurante: o restaurantId vem do token, nunca do cliente. Devolve-o já validado.
export function tenantOf(req: Request): string {
  const restaurantId = req.user?.restaurantId;
  if (!restaurantId) throw new ForbiddenError("Usuário sem restaurante");
  return restaurantId;
}
