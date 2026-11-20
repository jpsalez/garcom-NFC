BEGIN;

-- CreateEnum
CREATE TYPE "tab_adjustment_type" AS ENUM ('DISCOUNT', 'COUVERT', 'TIP');

-- CreateEnum
CREATE TYPE "tab_adjustment_mode" AS ENUM ('FIXED_CENTS', 'PERCENT_BPS');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CREDIT', 'DEBIT', 'PIX', 'VOUCHER', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "payment_provider_type" AS ENUM ('MANUAL', 'MERCADO_PAGO', 'STONE', 'PAGBANK', 'CIELO', 'PAYGO', 'SITEF');

-- CreateEnum
CREATE TYPE "payment_request_status" AS ENUM ('OPEN', 'ACCEPTED', 'CONVERTED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "session_tokens" ADD COLUMN     "guest_label" VARCHAR(60);

-- AlterTable
ALTER TABLE "tabs" ADD COLUMN     "closed_refunded_cents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tab_adjustments" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "tab_id" TEXT NOT NULL,
    "type" "tab_adjustment_type" NOT NULL,
    "mode" "tab_adjustment_mode" NOT NULL,
    "value" INTEGER NOT NULL,
    "computed_cents" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" TEXT,
    "remove_reason" VARCHAR(500),

    CONSTRAINT "tab_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "tab_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "session_token_id" TEXT NOT NULL,
    "payer_label" VARCHAR(60) NOT NULL,
    "preferred_method" "payment_method" NOT NULL,
    "requested_amount_cents" INTEGER NOT NULL,
    "selection_json" JSONB NOT NULL,
    "status" "payment_request_status" NOT NULL DEFAULT 'OPEN',
    "payment_id" TEXT,
    "handled_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "tab_id" TEXT NOT NULL,
    "cash_shift_id" TEXT,
    "provider" "payment_provider_type" NOT NULL DEFAULT 'MANUAL',
    "terminal_id" TEXT,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "received_cents" INTEGER,
    "change_cents" INTEGER NOT NULL DEFAULT 0,
    "tip_cents" INTEGER NOT NULL DEFAULT 0,
    "provider_fee_cents" INTEGER,
    "payer_label" VARCHAR(60),
    "idempotency_key" VARCHAR(64) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "external_payment_id" VARCHAR(128),
    "nsu" VARCHAR(64),
    "authorization_code" VARCHAR(64),
    "card_brand" VARCHAR(32),
    "acquirer_cnpj" VARCHAR(14),
    "installments" INTEGER NOT NULL DEFAULT 1,
    "raw_provider_payload" JSONB,
    "actor_user_id" TEXT,
    "refund_reason" VARCHAR(500),
    "refunded_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "covered_cents" INTEGER NOT NULL,
    "covered_units_bps" INTEGER,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tab_adjustments_restaurant_id_tab_id_removed_at_idx" ON "tab_adjustments"("restaurant_id", "tab_id", "removed_at");

-- CreateIndex
CREATE INDEX "tab_adjustments_restaurant_id_created_by_user_id_idx" ON "tab_adjustments"("restaurant_id", "created_by_user_id");

-- CreateIndex
CREATE INDEX "tab_adjustments_restaurant_id_removed_by_user_id_idx" ON "tab_adjustments"("restaurant_id", "removed_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tab_adjustments_restaurant_id_id_key" ON "tab_adjustments"("restaurant_id", "id");

-- CreateIndex
CREATE INDEX "payment_requests_restaurant_id_tab_id_status_idx" ON "payment_requests"("restaurant_id", "tab_id", "status");

-- CreateIndex
CREATE INDEX "payment_requests_restaurant_id_session_id_status_idx" ON "payment_requests"("restaurant_id", "session_id", "status");

-- CreateIndex
CREATE INDEX "payment_requests_session_token_id_session_id_idx" ON "payment_requests"("session_token_id", "session_id");

-- CreateIndex
CREATE INDEX "payment_requests_restaurant_id_handled_by_user_id_idx" ON "payment_requests"("restaurant_id", "handled_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_restaurant_id_id_key" ON "payment_requests"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_restaurant_id_payment_id_key" ON "payment_requests"("restaurant_id", "payment_id");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_tab_id_status_idx" ON "payments"("restaurant_id", "tab_id", "status");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_cash_shift_id_status_idx" ON "payments"("restaurant_id", "cash_shift_id", "status");

-- CreateIndex
CREATE INDEX "payments_provider_external_payment_id_idx" ON "payments"("provider", "external_payment_id");

-- CreateIndex
CREATE INDEX "payments_status_updated_at_idx" ON "payments"("status", "updated_at");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_actor_user_id_idx" ON "payments"("restaurant_id", "actor_user_id");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_refunded_by_user_id_idx" ON "payments"("restaurant_id", "refunded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_restaurant_id_id_key" ON "payments"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_restaurant_id_idempotency_key_key" ON "payments"("restaurant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_allocations_restaurant_id_order_item_id_idx" ON "payment_allocations"("restaurant_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_restaurant_id_payment_id_order_item_id_key" ON "payment_allocations"("restaurant_id", "payment_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_restaurant_id_id_key" ON "order_items"("restaurant_id", "id");

-- AddForeignKey
ALTER TABLE "tab_adjustments" ADD CONSTRAINT "tab_adjustments_restaurant_id_tab_id_fkey" FOREIGN KEY ("restaurant_id", "tab_id") REFERENCES "tabs"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tab_adjustments" ADD CONSTRAINT "tab_adjustments_restaurant_id_created_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "created_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("created_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tab_adjustments" ADD CONSTRAINT "tab_adjustments_restaurant_id_removed_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "removed_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("removed_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_restaurant_id_tab_id_fkey" FOREIGN KEY ("restaurant_id", "tab_id") REFERENCES "tabs"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_restaurant_id_session_id_fkey" FOREIGN KEY ("restaurant_id", "session_id") REFERENCES "table_sessions"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_session_token_id_session_id_fkey" FOREIGN KEY ("session_token_id", "session_id") REFERENCES "session_tokens"("id", "session_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_restaurant_id_payment_id_fkey" FOREIGN KEY ("restaurant_id", "payment_id") REFERENCES "payments"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_restaurant_id_handled_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "handled_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("handled_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_tab_id_fkey" FOREIGN KEY ("restaurant_id", "tab_id") REFERENCES "tabs"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_actor_user_id_fkey" FOREIGN KEY ("restaurant_id", "actor_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("actor_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_refunded_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "refunded_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("refunded_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_restaurant_id_payment_id_fkey" FOREIGN KEY ("restaurant_id", "payment_id") REFERENCES "payments"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_restaurant_id_order_item_id_fkey" FOREIGN KEY ("restaurant_id", "order_item_id") REFERENCES "order_items"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


CREATE UNIQUE INDEX payment_requests_one_open_per_token
  ON payment_requests (restaurant_id, tab_id, session_token_id)
  WHERE status = 'OPEN';

ALTER TABLE tabs
  DROP CONSTRAINT tabs_valid_invariants,
  ADD CONSTRAINT tabs_valid_invariants CHECK (
    number > 0
    AND version > 0
    AND service_fee_bps BETWEEN 0 AND 3000
    AND subtotal_cents >= 0 AND service_fee_cents >= 0
    AND total_cents >= 0 AND paid_cents >= 0 AND closed_refunded_cents >= 0
    AND (guests_count IS NULL OR guests_count > 0)
    AND ((kind = 'TABLE' AND table_id IS NOT NULL) OR (kind = 'COUNTER' AND table_id IS NULL))
    AND (NOT service_fee_waived OR (
      service_fee_waive_reason IS NOT NULL AND length(btrim(service_fee_waive_reason)) BETWEEN 3 AND 500
    ))
    AND (status <> 'CANCELLED' OR (
      cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) BETWEEN 3 AND 500
    ))
    AND (status = 'CLOSED' OR closed_refunded_cents = 0)
    AND (NOT legacy_closed OR (status = 'CLOSED' AND paid_cents = 0 AND closed_refunded_cents = 0))
    AND (status <> 'CLOSED' OR (
      closed_at IS NOT NULL AND business_date IS NOT NULL
      AND (legacy_closed OR paid_cents::bigint + closed_refunded_cents = total_cents)
    ))
  );

ALTER TABLE tab_adjustments ADD CONSTRAINT tab_adjustments_valid CHECK (
  value > 0
  AND length(btrim(reason)) BETWEEN 3 AND 500
  AND ((type = 'DISCOUNT' AND computed_cents <= 0) OR (type <> 'DISCOUNT' AND computed_cents >= 0))
  AND (mode <> 'PERCENT_BPS' OR value BETWEEN 1 AND 10000)
  AND ((removed_at IS NULL AND removed_by_user_id IS NULL AND remove_reason IS NULL)
    OR (removed_at IS NOT NULL AND remove_reason IS NOT NULL AND length(btrim(remove_reason)) BETWEEN 3 AND 500))
);

ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_valid CHECK (
  requested_amount_cents > 0
  AND length(btrim(payer_label)) BETWEEN 1 AND 60
  AND jsonb_typeof(selection_json) = 'object'
  AND ((status = 'CONVERTED') = (payment_id IS NOT NULL))
);

ALTER TABLE payments ADD CONSTRAINT payments_valid CHECK (
  amount_cents > 0 AND change_cents >= 0 AND tip_cents >= 0 AND installments >= 1
  AND idempotency_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND request_hash ~ '^[0-9a-f]{64}$'
  AND ((received_cents IS NULL AND change_cents = 0)
    OR (method = 'CASH' AND received_cents IS NOT NULL AND received_cents >= amount_cents
      AND change_cents = received_cents - amount_cents))
  AND (status <> 'REFUNDED' OR (
    refund_reason IS NOT NULL AND length(btrim(refund_reason)) BETWEEN 3 AND 500 AND refunded_at IS NOT NULL
  ))
);

ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_valid CHECK (
  covered_cents > 0 AND (covered_units_bps IS NULL OR covered_units_bps > 0)
);

COMMIT;
