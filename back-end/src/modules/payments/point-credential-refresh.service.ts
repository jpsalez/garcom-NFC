import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { decryptSecret } from "../../shared/utils/crypto.ts";
import { logOperation } from "../../shared/utils/request-context.ts";
import { PaymentProviderAccountsRepository } from "./payment-provider-accounts.repository.ts";
import { findProviderAccountsToRefresh } from "./payment-sync.queries.ts";
import { activePointAccount, ensurePointEnvironment, pointCredentials } from "./point-account.ts";
import { PointProviderError } from "./providers/mercado-pago-http.ts";
import type { PaymentProviderRegistry } from "./providers/payment-provider.registry.ts";

@injectable()
export class PointCredentialRefreshService {
  constructor(
    @inject("DbClient") private db: DbClient,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("PaymentProviderRegistry") private providers: PaymentProviderRegistry,
  ) {}

  async run() {
    const expiresBefore = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    const candidates = await findProviderAccountsToRefresh(this.db, "MERCADO_PAGO", expiresBefore, 20);
    for (const { id, restaurant_id } of candidates) {
      try {
        await this.refresh(restaurant_id, id);
      } catch {
        logOperation({ event: "point.credentials_refresh_failed", account_id: id });
      }
    }
  }

  private async refresh(restaurantId: string, accountId: string) {
    const accounts = new PaymentProviderAccountsRepository(this.db);
    const account = activePointAccount(await accounts.findById(restaurantId, accountId));
    const previous = account.refresh_token_encrypted;
    if (!previous) return;
    const credentials = await this.providers.get("MERCADO_PAGO").refreshCredentials(decryptSecret(previous));
    if (credentials.merchantId !== account.external_account_id) throw new PointProviderError();
    ensurePointEnvironment(credentials.live, account.environment);
    const saved = await this.unit.run(restaurantId, ({ db, now }) =>
      new PaymentProviderAccountsRepository(db).refreshCredentials(
        restaurantId,
        account.id,
        previous,
        pointCredentials(credentials, now),
      ),
    );
    // Outra renovação ou reconexão gravou antes; as credenciais desta rodada são descartadas.
    if (saved.count === 0)
      logOperation({ event: "point.credentials_refresh_superseded", account_id: account.id });
  }
}
