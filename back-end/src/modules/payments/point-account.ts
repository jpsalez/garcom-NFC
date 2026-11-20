import type { payment_provider_accounts } from "../../../generated/prisma/client.ts";
import type { provider_environment } from "../../../generated/prisma/enums.ts";
import { ConflictError } from "../../shared/errors/http-errors.ts";
import { encryptSecret } from "../../shared/utils/crypto.ts";
import type { ProviderCredentials } from "./providers/payment-provider.interface.ts";

export function activePointAccount(account: payment_provider_accounts | null) {
  if (account?.provider !== "MERCADO_PAGO" || account.status !== "ACTIVE" || !account.external_account_id)
    throw new ConflictError("Conta Mercado Pago indisponível", "PAYMENT_PROVIDER_ACCOUNT_UNAVAILABLE");
  return account;
}

export function pointCredentials(credentials: ProviderCredentials, now: Date) {
  return {
    access_token_encrypted: encryptSecret(credentials.accessToken),
    refresh_token_encrypted: credentials.refreshToken ? encryptSecret(credentials.refreshToken) : undefined,
    token_expires_at: new Date(now.getTime() + credentials.expiresIn * 1_000),
  };
}

export function ensurePointEnvironment(live: boolean | undefined, environment: provider_environment) {
  if (live !== undefined && live !== (environment === "PRODUCTION"))
    throw new ConflictError(
      "Credencial do Mercado Pago pertence a outro ambiente",
      "PAYMENT_PROVIDER_ENVIRONMENT_MISMATCH",
    );
}
