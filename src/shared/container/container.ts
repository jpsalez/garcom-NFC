import { container } from "tsyringe";
import { prisma, type DbClient } from "../providers/prisma.ts";

import type { IAuthService, IRestaurantRepository, IUserRepository } from "../../modules/auth/auth.interfaces.ts";
import { RestaurantRepository, UserRepository } from "../../modules/auth/auth.repository.ts";
import { AuthService } from "../../modules/auth/auth.service.ts";
import type { ITableRepository } from "../../modules/tables/tables.repository.interface.ts";
import { TableRepository } from "../../modules/tables/tables.repository.ts";
import type {
  ISessionTokenRepository,
  ITableSessionRepository,
} from "../../modules/seassions/sessions.repository.interface.ts";
import { SessionTokenRepository, TableSessionRepository } from "../../modules/seassions/sessions.repository.ts";
import type { ICallRepository } from "../../modules/calls/calls.repository.interface.ts";
import { CallRepository } from "../../modules/calls/calls.repository.ts";

export function registerDependencies() {

  // Infra
  container.register<DbClient>("DbClient", { useValue: prisma });

  // Repositories: nome -> implementação (quem injeta recebe a interface)
  container.registerSingleton<IRestaurantRepository>("RestaurantRepository", RestaurantRepository);
  container.registerSingleton<IUserRepository>("UserRepository", UserRepository);
  container.registerSingleton<ITableRepository>("TableRepository", TableRepository);
  container.registerSingleton<ITableSessionRepository>("TableSessionRepository", TableSessionRepository);
  container.registerSingleton<ISessionTokenRepository>("SessionTokenRepository", SessionTokenRepository);
  container.registerSingleton<ICallRepository>("CallRepository", CallRepository);

  
  // Services
  container.registerSingleton<IAuthService>("AuthService", AuthService);
}

export { container };
