import { inject, injectable } from "tsyringe";
import type {
  Prisma,
  payment_provider_type,
  provider_environment,
} from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";

type RefreshCredentialsData = Pick<
  Prisma.payment_provider_accountsUncheckedCreateInput,
  "access_token_encrypted" | "refresh_token_encrypted" | "token_expires_at"
>;
type PutProviderAccountData = RefreshCredentialsData &
  Pick<
    Prisma.payment_provider_accountsUncheckedCreateInput,
    "external_account_id" | "status" | "metadata_json"
  >;

@injectable()
export class PaymentProviderAccountsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  find(restaurantId: string, provider: payment_provider_type, environment: provider_environment) {
    return this.db.payment_provider_accounts.findUnique({
      where: { restaurant_id_provider_environment: { restaurant_id: restaurantId, provider, environment } },
    });
  }

  findById(restaurantId: string, id: string) {
    return this.db.payment_provider_accounts.findUnique({ where: { id, restaurant_id: restaurantId } });
  }

  async put(
    restaurantId: string,
    provider: payment_provider_type,
    environment: provider_environment,
    data: PutProviderAccountData,
  ) {
    const account = await this.find(restaurantId, provider, environment);
    if (account?.external_account_id && data.external_account_id !== account.external_account_id) return null;
    const identity = { restaurant_id: restaurantId, provider, environment };
    return this.db.payment_provider_accounts.upsert({
      where: { restaurant_id_provider_environment: identity },
      create: { ...data, ...identity },
      update: data,
    });
  }

  refreshCredentials(
    restaurantId: string,
    id: string,
    expectedRefreshTokenEncrypted: string,
    data: RefreshCredentialsData,
  ) {
    return this.db.payment_provider_accounts.updateMany({
      where: {
        id,
        restaurant_id: restaurantId,
        status: "ACTIVE",
        refresh_token_encrypted: expectedRefreshTokenEncrypted,
      },
      data,
    });
  }
}
