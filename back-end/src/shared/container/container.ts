import { container } from "tsyringe";
import { prisma, type DbClient } from "../providers/prisma.ts";

import type { IAuthService } from "../../modules/auth/auth.interfaces.ts";
import type { IRestaurantRepository } from "../../modules/restaurants/restaurants.repository.interface.ts";
import { RestaurantRepository } from "../../modules/restaurants/restaurants.repository.ts";
import type { IUserRepository } from "../../modules/users/users.repository.interface.ts";
import { UserRepository } from "../../modules/users/users.repository.ts";
import { AuthService } from "../../modules/auth/auth.service.ts";
import type { IAuthCache } from "../cache/auth-cache.ts";
import { AuthCache } from "../cache/auth-cache.ts";
import type { IUsersService } from "../../modules/users/users.interfaces.ts";
import { UsersService } from "../../modules/users/users.service.ts";
import type { IAdministrationService } from "../../modules/administration/administration.interfaces.ts";
import { AdministrationService } from "../../modules/administration/administration.service.ts";
import type { ITablesService } from "../../modules/tables/tables.interfaces.ts";
import { TablesService } from "../../modules/tables/tables.service.ts";
import type { ITableRepository } from "../../modules/tables/tables.repository.interface.ts";
import { TableRepository } from "../../modules/tables/tables.repository.ts";
import type {
  ISessionTokenRepository,
  ITableSessionRepository,
} from "../../modules/sessions/sessions.repository.interface.ts";
import { SessionTokenRepository, TableSessionRepository } from "../../modules/sessions/sessions.repository.ts";
import type { ISessionsService } from "../../modules/sessions/sessions.interfaces.ts";
import { SessionsService } from "../../modules/sessions/sessions.service.ts";
import type { ICallsService } from "../../modules/calls/calls.interfaces.ts";
import { CallsService } from "../../modules/calls/calls.service.ts";
import type { INotifier } from "../realtime/notifier.ts";
import { SocketNotifier } from "../realtime/socket-notifier.ts";
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

  
  container.registerSingleton<IAuthCache>("AuthCache", AuthCache);
  container.registerSingleton<INotifier>("Notifier", SocketNotifier);

  // Services
  container.registerSingleton<IAuthService>("AuthService", AuthService);
  container.registerSingleton<IUsersService>("UsersService", UsersService);
  container.registerSingleton<IAdministrationService>("AdministrationService", AdministrationService);
  container.registerSingleton<ITablesService>("TablesService", TablesService);
  container.registerSingleton<ISessionsService>("SessionsService", SessionsService);
  container.registerSingleton<ICallsService>("CallsService", CallsService);
}

export { container };
