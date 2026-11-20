BEGIN;


-- CreateEnum
CREATE TYPE "fiscal_provider_type" AS ENUM ('MOCK', 'NOTAAS', 'FOCUS_NFE');

-- CreateEnum
CREATE TYPE "fiscal_environment" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "fiscal_document_status" AS ENUM ('PENDING', 'PROCESSING', 'AUTHORIZED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "menu_products" ADD COLUMN     "fiscal_tax_profile_id" TEXT;

-- CreateTable
CREATE TABLE "fiscal_settings" (
    "restaurant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" "fiscal_provider_type" NOT NULL DEFAULT 'MOCK',
    "environment" "fiscal_environment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "cnpj" VARCHAR(14) NOT NULL,
    "provider_credential_encrypted" TEXT,
    "default_tax_profile_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_settings_pkey" PRIMARY KEY ("restaurant_id")
);

-- CreateTable
CREATE TABLE "fiscal_tax_profiles" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "ncm" VARCHAR(8) NOT NULL,
    "cfop" VARCHAR(4) NOT NULL,
    "csosn" VARCHAR(4) NOT NULL,
    "origin" INTEGER NOT NULL DEFAULT 0,
    "unit" VARCHAR(6) NOT NULL DEFAULT 'UN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "tab_id" TEXT NOT NULL,
    "provider" "fiscal_provider_type" NOT NULL,
    "environment" "fiscal_environment" NOT NULL,
    "status" "fiscal_document_status" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "external_id" VARCHAR(128),
    "total_cents" INTEGER NOT NULL,
    "customer_document" VARCHAR(14),
    "number" INTEGER,
    "series" INTEGER,
    "access_key" VARCHAR(44),
    "protocol" VARCHAR(64),
    "sefaz_status" VARCHAR(16),
    "sefaz_message" VARCHAR(500),
    "xml_url" VARCHAR(1000),
    "danfe_url" VARCHAR(1000),
    "qrcode_url" VARCHAR(2000),
    "dispatched_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(255),
    "cancel_requested_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_tax_profiles_restaurant_id_id_key" ON "fiscal_tax_profiles"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_tax_profiles_restaurant_id_name_key" ON "fiscal_tax_profiles"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "fiscal_documents_status_updated_at_idx" ON "fiscal_documents"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_restaurant_id_id_key" ON "fiscal_documents"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_restaurant_id_tab_id_key" ON "fiscal_documents"("restaurant_id", "tab_id");

-- AddForeignKey
ALTER TABLE "menu_products" ADD CONSTRAINT "menu_products_restaurant_id_fiscal_tax_profile_id_fkey" FOREIGN KEY ("restaurant_id", "fiscal_tax_profile_id") REFERENCES "fiscal_tax_profiles"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_restaurant_id_default_tax_profile_id_fkey" FOREIGN KEY ("restaurant_id", "default_tax_profile_id") REFERENCES "fiscal_tax_profiles"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fiscal_tax_profiles" ADD CONSTRAINT "fiscal_tax_profiles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_restaurant_id_tab_id_fkey" FOREIGN KEY ("restaurant_id", "tab_id") REFERENCES "tabs"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Checks escritos à mão (o Prisma não os gerencia).
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_valid" CHECK (
  "cnpj" ~ '^[0-9]{14}$'
  -- Provedor real habilitado precisa de credencial; o MOCK não usa.
  AND (NOT "enabled" OR "provider" = 'MOCK' OR "provider_credential_encrypted" IS NOT NULL)
  -- Simulação nunca vale como documento fiscal.
  AND ("provider" <> 'MOCK' OR "environment" = 'HOMOLOGACAO')
);

ALTER TABLE "fiscal_tax_profiles" ADD CONSTRAINT "fiscal_tax_profiles_valid" CHECK (
  length(btrim("name")) BETWEEN 1 AND 80
  AND "ncm" ~ '^[0-9]{8}$'
  AND "cfop" ~ '^[0-9]{4}$'
  AND "csosn" ~ '^[0-9]{2,4}$'
  AND "origin" BETWEEN 0 AND 8
  AND length(btrim("unit")) BETWEEN 1 AND 6
);

ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_valid" CHECK (
  "total_cents" > 0
  AND "attempt" > 0
  AND ("customer_document" IS NULL OR "customer_document" ~ '^([0-9]{11}|[0-9]{14})$')
  AND ("access_key" IS NULL OR "access_key" ~ '^[0-9]{44}$')
  AND ("cancel_reason" IS NULL OR length(btrim("cancel_reason")) BETWEEN 15 AND 255)
  AND (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
);

-- Índice parcial (criado à mão): o mesmo ID externo não pode ser vinculado a duas comandas.
CREATE UNIQUE INDEX "fiscal_documents_external_unique"
  ON "fiscal_documents" ("restaurant_id", "provider", "external_id")
  WHERE "external_id" IS NOT NULL;

COMMIT;
