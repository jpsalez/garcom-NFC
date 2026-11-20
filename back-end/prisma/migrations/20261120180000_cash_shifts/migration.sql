BEGIN;

-- CreateEnum
CREATE TYPE "cash_shift_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "cash_movement_type" AS ENUM ('SANGRIA', 'SUPRIMENTO');

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "opened_by_user_id" TEXT NOT NULL,
    "closed_by_user_id" TEXT,
    "status" "cash_shift_status" NOT NULL DEFAULT 'OPEN',
    "opening_cents" INTEGER NOT NULL,
    "expected_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "counted_cash_cents" INTEGER,
    "difference_cents" INTEGER,
    "notes" VARCHAR(500),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "cash_shift_id" TEXT NOT NULL,
    "type" "cash_movement_type" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_shifts_restaurant_id_status_opened_at_idx" ON "cash_shifts"("restaurant_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "cash_shifts_restaurant_id_opened_by_user_id_opened_at_idx" ON "cash_shifts"("restaurant_id", "opened_by_user_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_shifts_restaurant_id_closed_by_user_id_idx" ON "cash_shifts"("restaurant_id", "closed_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_shifts_restaurant_id_id_key" ON "cash_shifts"("restaurant_id", "id");

-- CreateIndex
CREATE INDEX "cash_movements_restaurant_id_cash_shift_id_created_at_idx" ON "cash_movements"("restaurant_id", "cash_shift_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_restaurant_id_actor_user_id_idx" ON "cash_movements"("restaurant_id", "actor_user_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_cash_shift_id_fkey" FOREIGN KEY ("restaurant_id", "cash_shift_id") REFERENCES "cash_shifts"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_restaurant_id_closed_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "closed_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("closed_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_restaurant_id_cash_shift_id_fkey" FOREIGN KEY ("restaurant_id", "cash_shift_id") REFERENCES "cash_shifts"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_restaurant_id_actor_user_id_fkey" FOREIGN KEY ("restaurant_id", "actor_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("actor_user_id") ON UPDATE RESTRICT;


CREATE UNIQUE INDEX cash_shifts_one_open_per_operator
  ON cash_shifts (restaurant_id, opened_by_user_id)
  WHERE status = 'OPEN';

ALTER TABLE cash_shifts ADD CONSTRAINT cash_shifts_valid CHECK (
  opening_cents >= 0 AND expected_cash_cents >= 0
  AND (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by_user_id IS NULL
      AND counted_cash_cents IS NULL AND difference_cents IS NULL)
    OR (status = 'CLOSED' AND closed_at IS NOT NULL
      AND counted_cash_cents IS NOT NULL AND counted_cash_cents >= 0
      AND difference_cents IS NOT NULL AND difference_cents = counted_cash_cents - expected_cash_cents)
  )
);

ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_valid CHECK (
  amount_cents > 0 AND length(btrim(reason)) BETWEEN 3 AND 500
);

COMMIT;
