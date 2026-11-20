BEGIN;

-- CreateEnum
CREATE TYPE "provider_environment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "provider_account_status" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "provider_account_id" TEXT;

-- CreateTable
CREATE TABLE "payment_provider_accounts" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "provider" "payment_provider_type" NOT NULL,
    "environment" "provider_environment" NOT NULL DEFAULT 'SANDBOX',
    "status" "provider_account_status" NOT NULL DEFAULT 'ACTIVE',
    "external_account_id" VARCHAR(128),
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "webhook_secret_encrypted" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terminals" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "provider" "payment_provider_type" NOT NULL,
    "external_device_id" VARCHAR(128),
    "serial_number" VARCHAR(128),
    "label" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_provider_accounts_provider_status_token_expires_at_idx" ON "payment_provider_accounts"("provider", "status", "token_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_accounts_restaurant_id_id_key" ON "payment_provider_accounts"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_accounts_restaurant_id_provider_id_key" ON "payment_provider_accounts"("restaurant_id", "provider", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_accounts_identity_key" ON "payment_provider_accounts"("restaurant_id", "provider", "environment");

-- CreateIndex
CREATE INDEX "payment_terminals_restaurant_id_active_idx" ON "payment_terminals"("restaurant_id", "active");

-- CreateIndex
CREATE INDEX "payment_terminals_restaurant_id_provider_provider_account_i_idx" ON "payment_terminals"("restaurant_id", "provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terminals_restaurant_id_id_key" ON "payment_terminals"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terminals_account_identity_key" ON "payment_terminals"("restaurant_id", "id", "provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_terminal_id_idx" ON "payments"("restaurant_id", "terminal_id");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_provider_provider_account_id_idx" ON "payments"("restaurant_id", "provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_account_external_key" ON "payments"("restaurant_id", "provider_account_id", "external_payment_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_account_fkey" FOREIGN KEY ("restaurant_id", "provider", "provider_account_id") REFERENCES "payment_provider_accounts"("restaurant_id", "provider", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_terminal_fkey" FOREIGN KEY ("restaurant_id", "terminal_id", "provider", "provider_account_id") REFERENCES "payment_terminals"("restaurant_id", "id", "provider", "provider_account_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_provider_accounts" ADD CONSTRAINT "payment_provider_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_account_fkey" FOREIGN KEY ("restaurant_id", "provider", "provider_account_id") REFERENCES "payment_provider_accounts"("restaurant_id", "provider", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


CREATE UNIQUE INDEX payment_terminals_unique_device
  ON payment_terminals (restaurant_id, provider, external_device_id)
  WHERE external_device_id IS NOT NULL;

ALTER TABLE payment_provider_accounts ADD CONSTRAINT payment_provider_accounts_valid CHECK (
  (external_account_id IS NULL OR length(btrim(external_account_id)) > 0)
  AND length(btrim(access_token_encrypted)) > 0
);

CREATE FUNCTION payment_guard_external_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A identidade externa da conta não pode ser alterada' USING ERRCODE = '23514';
END $$;

CREATE TRIGGER payment_provider_accounts_external_id_guard
BEFORE UPDATE OF external_account_id ON payment_provider_accounts
FOR EACH ROW
WHEN (OLD.external_account_id IS NOT NULL AND OLD.external_account_id IS DISTINCT FROM NEW.external_account_id)
EXECUTE FUNCTION payment_guard_external_account();

ALTER TABLE payment_terminals ADD CONSTRAINT payment_terminals_valid CHECK (
  length(btrim(label)) BETWEEN 1 AND 80
  AND (external_device_id IS NULL OR length(btrim(external_device_id)) > 0)
  AND (provider <> 'MERCADO_PAGO' OR (provider_account_id IS NOT NULL AND external_device_id IS NOT NULL))
);

ALTER TABLE payments ADD CONSTRAINT payments_provider_binding_valid CHECK (
  (provider <> 'MANUAL' OR (terminal_id IS NULL AND provider_account_id IS NULL))
  AND (terminal_id IS NULL OR provider_account_id IS NOT NULL)
  AND (provider <> 'MERCADO_PAGO' OR (terminal_id IS NOT NULL AND provider_account_id IS NOT NULL))
);

COMMIT;
