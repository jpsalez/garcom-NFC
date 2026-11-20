BEGIN;

-- CreateTable
CREATE TABLE "daily_sales" (
    "restaurant_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "tabs_closed_count" INTEGER NOT NULL DEFAULT 0,
    "table_tabs_count" INTEGER NOT NULL DEFAULT 0,
    "counter_tabs_count" INTEGER NOT NULL DEFAULT 0,
    "guests_total" INTEGER NOT NULL DEFAULT 0,
    "gross_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "cancelled_items_cents" INTEGER NOT NULL DEFAULT 0,
    "discounts_cents" INTEGER NOT NULL DEFAULT 0,
    "service_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "couvert_cents" INTEGER NOT NULL DEFAULT 0,
    "tips_cents" INTEGER NOT NULL DEFAULT 0,
    "net_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "cash_cents" INTEGER NOT NULL DEFAULT 0,
    "credit_cents" INTEGER NOT NULL DEFAULT 0,
    "debit_cents" INTEGER NOT NULL DEFAULT 0,
    "pix_cents" INTEGER NOT NULL DEFAULT 0,
    "voucher_cents" INTEGER NOT NULL DEFAULT 0,
    "other_cents" INTEGER NOT NULL DEFAULT 0,
    "provider_fees_cents" INTEGER NOT NULL DEFAULT 0,
    "total_stay_seconds" BIGINT NOT NULL DEFAULT 0,
    "rebuilt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_sales_pkey" PRIMARY KEY ("restaurant_id","business_date")
);

-- CreateTable
CREATE TABLE "product_sales_daily" (
    "restaurant_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "hour_bucket" INTEGER NOT NULL,
    "product_name_snapshot" VARCHAR(120) NOT NULL,
    "variant_name_snapshot" VARCHAR(120) NOT NULL,
    "category_name_snapshot" VARCHAR(120) NOT NULL,
    "quantity_sold" INTEGER NOT NULL DEFAULT 0,
    "quantity_cancelled" INTEGER NOT NULL DEFAULT 0,
    "revenue_cents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_sales_daily_pkey" PRIMARY KEY ("restaurant_id","business_date","product_id","variant_id","hour_bucket"),
    CONSTRAINT "product_sales_daily_hour_bucket" CHECK ("hour_bucket" BETWEEN 0 AND 23),
    CONSTRAINT "product_sales_daily_non_negative" CHECK (
      LEAST("quantity_sold", "quantity_cancelled", "revenue_cents") >= 0
    )
);

-- CreateIndex
CREATE INDEX "product_sales_daily_restaurant_id_product_id_business_date_idx" ON "product_sales_daily"("restaurant_id", "product_id", "business_date");

-- AddForeignKey
ALTER TABLE "daily_sales" ADD CONSTRAINT "daily_sales_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sales_daily" ADD CONSTRAINT "product_sales_daily_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
