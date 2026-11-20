import { container } from "tsyringe";
import { prisma, type DbClient } from "../providers/prisma.ts";

import type { IAuthService, ITokenCleanupService } from "../../modules/auth/auth.interfaces.ts";
import {
  RestaurantSettingsService,
  type IRestaurantSettingsService,
} from "../../modules/restaurants/restaurant-settings.service.ts";
import type { IRestaurantRepository } from "../../modules/restaurants/restaurants.repository.interface.ts";
import { RestaurantRepository } from "../../modules/restaurants/restaurants.repository.ts";
import type { IUserRepository } from "../../modules/users/users.repository.interface.ts";
import { UserRepository } from "../../modules/users/users.repository.ts";
import { AuthService } from "../../modules/auth/auth.service.ts";
import type { IRefreshTokenRepository } from "../../modules/auth/refresh-tokens.repository.interface.ts";
import { RefreshTokenRepository } from "../../modules/auth/refresh-tokens.repository.ts";
import type { IPasswordResetRepository } from "../../modules/auth/password-reset.repository.interface.ts";
import { PasswordResetRepository } from "../../modules/auth/password-reset.repository.ts";
import type { IPasswordResetService } from "../../modules/auth/password-reset.interfaces.ts";
import { PasswordResetService } from "../../modules/auth/password-reset.service.ts";
import { TokenCleanupService } from "../../modules/auth/token-cleanup.service.ts";
import { createMailer, type IMailer } from "../mail/mailer.ts";
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
import {
  SessionTokenRepository,
  TableSessionRepository,
} from "../../modules/sessions/sessions.repository.ts";
import type { ISessionsService } from "../../modules/sessions/sessions.interfaces.ts";
import { SessionsService } from "../../modules/sessions/sessions.service.ts";
import type { ICallsService } from "../../modules/calls/calls.interfaces.ts";
import { CallsService } from "../../modules/calls/calls.service.ts";
import type { INotifier } from "../realtime/notifier.ts";
import { SocketNotifier } from "../realtime/socket-notifier.ts";
import type { ICallRepository } from "../../modules/calls/calls.repository.interface.ts";
import { CallRepository } from "../../modules/calls/calls.repository.ts";
import type { IRestaurantUnitOfWork } from "../transactions/restaurant-unit-of-work.interface.ts";
import { RestaurantUnitOfWork } from "../transactions/restaurant-unit-of-work.ts";
import { MenuRepository } from "../../modules/menu/menu.repository.ts";
import type { IMenuRepository } from "../../modules/menu/menu.repository.interface.ts";
import { MenuService } from "../../modules/menu/menu.service.ts";
import type { IMenuService } from "../../modules/menu/menu.interfaces.ts";
import { OrdersRepository } from "../../modules/orders/orders.repository.ts";
import type { IOrdersRepository } from "../../modules/orders/orders.repository.interface.ts";
import { OrdersService } from "../../modules/orders/orders.service.ts";
import type { IOrdersService } from "../../modules/orders/orders.interfaces.ts";
import { OrderSettingsRepository } from "../../modules/orders/order-settings.repository.ts";
import type { IOrderSettingsRepository } from "../../modules/orders/order-settings.repository.interface.ts";
import {
  OrderSettingsService,
  type IOrderSettingsService,
} from "../../modules/orders/order-settings.service.ts";
import type { IPrintingRepository } from "../../modules/printing/printing.repository.interface.ts";
import { PrintingRepository } from "../../modules/printing/printing.repository.ts";
import type { IPrintingService } from "../../modules/printing/printing.interfaces.ts";
import { PrintingService } from "../../modules/printing/printing.service.ts";
import { MediaRepository } from "../../modules/media/media.repository.ts";
import { MediaService } from "../../modules/media/media.service.ts";
import type { IMediaService } from "../../modules/media/media.interfaces.ts";
import type { IStorageProvider } from "../storage/storage.interface.ts";
import { LocalStorageProvider } from "../storage/local-storage.ts";
import type { ITabsRepository } from "../../modules/tabs/tabs.repository.interface.ts";
import { TabsRepository } from "../../modules/tabs/tabs.repository.ts";
import { TabsService } from "../../modules/tabs/tabs.service.ts";
import type { ITabsService } from "../../modules/tabs/tabs.interfaces.ts";

import {
  PaymentRequestsService,
  type IPaymentRequestsService,
} from "../../modules/tabs/payment-requests.service.ts";
import {
  TabAdjustmentsService,
  type ITabAdjustmentsService,
} from "../../modules/tabs/tab-adjustments.service.ts";
import type { IPaymentsService } from "../../modules/payments/payments.interfaces.ts";
import { PaymentsService } from "../../modules/payments/payments.service.ts";
import { ManualPaymentProvider } from "../../modules/payments/providers/manual.provider.ts";
import { PaymentProviderRegistry } from "../../modules/payments/providers/payment-provider.registry.ts";

export function registerDependencies() {
  // Infra
  container.register<DbClient>("DbClient", { useValue: prisma });
  container.registerSingleton<IRestaurantUnitOfWork>("RestaurantUnitOfWork", RestaurantUnitOfWork);
  container.registerSingleton<IMenuRepository>("MenuRepository", MenuRepository);
  container.registerSingleton<IMenuService>("MenuService", MenuService);
  container.registerSingleton<ITabsRepository>("TabsRepository", TabsRepository);
  container.registerSingleton<ITabsService>("TabsService", TabsService);
  container.registerSingleton<ITabAdjustmentsService>("TabAdjustmentsService", TabAdjustmentsService);
  container.registerSingleton<IPaymentRequestsService>("PaymentRequestsService", PaymentRequestsService);
  container.registerSingleton<IPaymentsService>("PaymentsService", PaymentsService);
  container.registerSingleton("ManualPaymentProvider", ManualPaymentProvider);
  container.registerSingleton("PaymentProviderRegistry", PaymentProviderRegistry);
  container.registerSingleton<IOrdersRepository>("OrdersRepository", OrdersRepository);
  container.registerSingleton<IOrdersService>("OrdersService", OrdersService);
  container.registerSingleton<IOrderSettingsRepository>("OrderSettingsRepository", OrderSettingsRepository);
  container.registerSingleton<IOrderSettingsService>("OrderSettingsService", OrderSettingsService);
  container.registerSingleton<IPrintingRepository>("PrintingRepository", PrintingRepository);
  container.registerSingleton<IPrintingService>("PrintingService", PrintingService);
  container.registerSingleton("MediaRepository", MediaRepository);
  container.registerSingleton<IMediaService>("MediaService", MediaService);
  container.registerSingleton<IStorageProvider>("StorageProvider", LocalStorageProvider);

  // Repositories: nome -> implementação (quem injeta recebe a interface)
  container.registerSingleton<IRestaurantRepository>("RestaurantRepository", RestaurantRepository);
  container.registerSingleton<IUserRepository>("UserRepository", UserRepository);
  container.registerSingleton<ITableRepository>("TableRepository", TableRepository);
  container.registerSingleton<ITableSessionRepository>("TableSessionRepository", TableSessionRepository);
  container.registerSingleton<ISessionTokenRepository>("SessionTokenRepository", SessionTokenRepository);
  container.registerSingleton<ICallRepository>("CallRepository", CallRepository);
  container.registerSingleton<IRefreshTokenRepository>("RefreshTokenRepository", RefreshTokenRepository);
  container.registerSingleton<IPasswordResetRepository>("PasswordResetRepository", PasswordResetRepository);

  container.registerSingleton<IAuthCache>("AuthCache", AuthCache);
  container.registerSingleton<INotifier>("Notifier", SocketNotifier);
  container.register<IMailer>("Mailer", { useValue: createMailer() });

  // Services
  container.registerSingleton<IAuthService>("AuthService", AuthService);
  container.registerSingleton<IPasswordResetService>("PasswordResetService", PasswordResetService);
  container.registerSingleton<ITokenCleanupService>("TokenCleanupService", TokenCleanupService);
  container.registerSingleton<IUsersService>("UsersService", UsersService);
  container.registerSingleton<IAdministrationService>("AdministrationService", AdministrationService);
  container.registerSingleton<ITablesService>("TablesService", TablesService);
  container.registerSingleton<ISessionsService>("SessionsService", SessionsService);
  container.registerSingleton<ICallsService>("CallsService", CallsService);
  container.registerSingleton<IRestaurantSettingsService>(
    "RestaurantSettingsService",
    RestaurantSettingsService,
  );
}

export { container };
