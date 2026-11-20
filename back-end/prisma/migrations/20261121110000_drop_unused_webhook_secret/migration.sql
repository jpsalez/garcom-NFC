-- DEC-18: o segredo do webhook do Mercado Pago é da aplicação (MERCADO_PAGO_WEBHOOK_SECRET),
-- não do restaurante. A coluna nunca foi gravada nem lida.
ALTER TABLE "payment_provider_accounts" DROP COLUMN "webhook_secret_encrypted";
