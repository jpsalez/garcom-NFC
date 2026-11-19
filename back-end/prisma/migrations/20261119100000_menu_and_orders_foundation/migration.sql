-- PROPOSED MIGRATION: review artifact, not applied to application databases.
-- Target: PostgreSQL 16; Prisma 6.19.3.
BEGIN;

-- CreateEnum
CREATE TYPE "media_storage_provider" AS ENUM ('LOCAL');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETING');

-- CreateEnum
CREATE TYPE "media_derivative_kind" AS ENUM ('MAIN', 'THUMB');

-- CreateEnum
CREATE TYPE "order_source" AS ENUM ('LOCAL_MENU');

-- CreateEnum
CREATE TYPE "order_fulfillment" AS ENUM ('DINE_IN');

-- CreateEnum
CREATE TYPE "order_item_stage" AS ENUM ('PENDING', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "order_event_action" AS ENUM ('CREATED', 'TRANSITIONED');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'TABLE_DEVICE', 'SYSTEM');

-- CreateTable
CREATE TABLE "restaurant_order_settings" (
    "restaurant_id" TEXT NOT NULL,
    "customer_ordering_enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_order_settings_pkey" PRIMARY KEY ("restaurant_id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "restaurant_id" TEXT NOT NULL,
    "published_revision_id" TEXT,
    "draft_version" INTEGER NOT NULL DEFAULT 1,
    "display_name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(3000),
    "logo_media_id" TEXT,
    "cover_media_id" TEXT,
    "presentation_schema_version" INTEGER NOT NULL DEFAULT 1,
    "presentation_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(3000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_products" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(3000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "availability_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_product_variants" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "availability_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_option_groups" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "min_selections" INTEGER NOT NULL DEFAULT 0,
    "max_selections" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_options" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "max_quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "availability_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_variant_option_groups" (
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "menu_variant_option_groups_pkey" PRIMARY KEY ("variant_id","group_id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "storage_provider" "media_storage_provider" NOT NULL DEFAULT 'LOCAL',
    "storage_prefix" TEXT NOT NULL,
    "status" "media_status" NOT NULL DEFAULT 'PENDING',
    "original_mime_type" VARCHAR(100),
    "original_byte_size" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "reserved_bytes" BIGINT NOT NULL DEFAULT 0,
    "stored_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "failure_code" VARCHAR(80),
    "delete_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_delete_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_derivatives" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "kind" "media_derivative_kind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'image/webp',
    "byte_size" BIGINT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_product_images" (
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "alt_text" VARCHAR(250),

    CONSTRAINT "menu_product_images_pkey" PRIMARY KEY ("product_id","media_id")
);

-- CreateTable
CREATE TABLE "menu_publications" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "draft_version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "published_by" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_transaction" BIGINT NOT NULL DEFAULT txid_current(),

    CONSTRAINT "menu_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_publication_media" (
    "restaurant_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,

    CONSTRAINT "menu_publication_media_pkey" PRIMARY KEY ("publication_id","media_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "source" "order_source" NOT NULL DEFAULT 'LOCAL_MENU',
    "fulfillment_type" "order_fulfillment" NOT NULL DEFAULT 'DINE_IN',
    "session_id" TEXT,
    "publication_id" TEXT,
    "submitted_by_token_id" TEXT,
    "table_label_snapshot" VARCHAR(120) NOT NULL,
    "submission_key" VARCHAR(64) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "total_cents" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_event_sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_name_snapshot" VARCHAR(120) NOT NULL,
    "variant_name_snapshot" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "base_price_cents" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "pending_quantity" INTEGER NOT NULL,
    "preparing_quantity" INTEGER NOT NULL DEFAULT 0,
    "ready_quantity" INTEGER NOT NULL DEFAULT 0,
    "delivered_quantity" INTEGER NOT NULL DEFAULT 0,
    "cancelled_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_options" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "group_name_snapshot" VARCHAR(120) NOT NULL,
    "option_name_snapshot" VARCHAR(120) NOT NULL,
    "selected_quantity" INTEGER NOT NULL,
    "price_delta_cents" INTEGER NOT NULL,

    CONSTRAINT "order_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "sequence" INTEGER NOT NULL,
    "action" "order_event_action" NOT NULL,
    "quantity" INTEGER,
    "from_stage" "order_item_stage",
    "to_stage" "order_item_stage",
    "actor_user_id" TEXT,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_role_snapshot" "role",
    "actor_category_snapshot" "staff_category",
    "actor_label_snapshot" VARCHAR(120),
    "reason" VARCHAR(500),
    "resulting_order_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_operation_events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "actor_user_id" TEXT,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_role_snapshot" "role",
    "actor_category_snapshot" "staff_category",
    "actor_label_snapshot" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restaurant_order_settings_updated_by_idx" ON "restaurant_order_settings"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "menus_restaurant_id_key" ON "menus"("restaurant_id");

-- CreateIndex
CREATE INDEX "menus_restaurant_id_logo_media_id_idx" ON "menus"("restaurant_id", "logo_media_id");

-- CreateIndex
CREATE INDEX "menus_restaurant_id_cover_media_id_idx" ON "menus"("restaurant_id", "cover_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "menus_restaurant_id_id_key" ON "menus"("restaurant_id", "id");

-- CreateIndex
CREATE INDEX "menu_categories_menu_id_position_id_idx" ON "menu_categories"("menu_id", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_restaurant_id_menu_id_id_key" ON "menu_categories"("restaurant_id", "menu_id", "id");

-- CreateIndex
CREATE INDEX "menu_products_category_id_position_id_idx" ON "menu_products"("category_id", "position", "id");

-- CreateIndex
CREATE INDEX "menu_products_restaurant_id_menu_id_category_id_idx" ON "menu_products"("restaurant_id", "menu_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_products_restaurant_id_id_key" ON "menu_products"("restaurant_id", "id");

-- CreateIndex
CREATE INDEX "menu_product_variants_product_id_position_id_idx" ON "menu_product_variants"("product_id", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_product_variants_restaurant_id_product_id_id_key" ON "menu_product_variants"("restaurant_id", "product_id", "id");

-- CreateIndex
CREATE INDEX "menu_option_groups_product_id_position_id_idx" ON "menu_option_groups"("product_id", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_option_groups_restaurant_id_product_id_id_key" ON "menu_option_groups"("restaurant_id", "product_id", "id");

-- CreateIndex
CREATE INDEX "menu_options_group_id_position_id_idx" ON "menu_options"("group_id", "position", "id");

-- CreateIndex
CREATE INDEX "menu_options_restaurant_id_product_id_group_id_idx" ON "menu_options"("restaurant_id", "product_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_options_restaurant_id_product_id_id_key" ON "menu_options"("restaurant_id", "product_id", "id");

-- CreateIndex
CREATE INDEX "menu_variant_option_groups_restaurant_id_product_id_group_i_idx" ON "menu_variant_option_groups"("restaurant_id", "product_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_prefix_key" ON "media_assets"("storage_prefix");

-- CreateIndex
CREATE INDEX "media_assets_restaurant_id_status_created_at_idx" ON "media_assets"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_status_updated_at_idx" ON "media_assets"("status", "updated_at");

-- CreateIndex
CREATE INDEX "media_assets_created_by_idx" ON "media_assets"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_restaurant_id_id_key" ON "media_assets"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_derivatives_storage_key_key" ON "media_derivatives"("storage_key");

-- CreateIndex
CREATE INDEX "media_derivatives_restaurant_id_media_id_idx" ON "media_derivatives"("restaurant_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_derivatives_media_id_kind_key" ON "media_derivatives"("media_id", "kind");

-- CreateIndex
CREATE INDEX "menu_product_images_product_id_position_idx" ON "menu_product_images"("product_id", "position");

-- CreateIndex
CREATE INDEX "menu_product_images_restaurant_id_media_id_idx" ON "menu_product_images"("restaurant_id", "media_id");

-- CreateIndex
CREATE INDEX "menu_publications_published_by_idx" ON "menu_publications"("published_by");

-- CreateIndex
CREATE UNIQUE INDEX "menu_publications_restaurant_id_id_key" ON "menu_publications"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_publications_restaurant_id_menu_id_id_key" ON "menu_publications"("restaurant_id", "menu_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_publications_menu_id_revision_number_key" ON "menu_publications"("menu_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "menu_publications_menu_id_draft_version_key" ON "menu_publications"("menu_id", "draft_version");

-- CreateIndex
CREATE INDEX "menu_publication_media_restaurant_id_media_id_idx" ON "menu_publication_media"("restaurant_id", "media_id");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_created_at_id_idx" ON "orders"("restaurant_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_session_id_created_at_idx" ON "orders"("restaurant_id", "session_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_publication_id_idx" ON "orders"("restaurant_id", "publication_id");

-- CreateIndex
CREATE INDEX "orders_submitted_by_token_id_session_id_idx" ON "orders"("submitted_by_token_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurant_id_id_key" ON "orders"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurant_id_submission_key_key" ON "orders"("restaurant_id", "submission_key");

-- CreateIndex
CREATE INDEX "order_items_restaurant_id_order_id_idx" ON "order_items"("restaurant_id", "order_id");

-- CreateIndex
CREATE INDEX "order_items_restaurant_id_product_id_variant_id_idx" ON "order_items"("restaurant_id", "product_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_restaurant_id_order_id_id_key" ON "order_items"("restaurant_id", "order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_restaurant_id_product_id_id_key" ON "order_items"("restaurant_id", "product_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_position_key" ON "order_items"("order_id", "position");

-- CreateIndex
CREATE INDEX "order_item_options_restaurant_id_product_id_option_id_idx" ON "order_item_options"("restaurant_id", "product_id", "option_id");

-- CreateIndex
CREATE INDEX "order_item_options_restaurant_id_product_id_order_item_id_idx" ON "order_item_options"("restaurant_id", "product_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_options_order_item_id_option_id_key" ON "order_item_options"("order_item_id", "option_id");

-- CreateIndex
CREATE INDEX "order_events_restaurant_id_order_id_created_at_id_idx" ON "order_events"("restaurant_id", "order_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "order_events_restaurant_id_order_id_order_item_id_idx" ON "order_events"("restaurant_id", "order_id", "order_item_id");

-- CreateIndex
CREATE INDEX "order_events_actor_user_id_idx" ON "order_events"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_events_order_id_sequence_key" ON "order_events"("order_id", "sequence");

-- CreateIndex
CREATE INDEX "restaurant_operation_events_restaurant_id_created_at_id_idx" ON "restaurant_operation_events"("restaurant_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "restaurant_operation_events_restaurant_id_entity_type_entit_idx" ON "restaurant_operation_events"("restaurant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "restaurant_operation_events_actor_user_id_idx" ON "restaurant_operation_events"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tables_restaurant_id_id_key" ON "tables"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_restaurant_id_id_key" ON "table_sessions"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_tokens_id_session_id_key" ON "session_tokens"("id", "session_id");

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_table_id_fkey" FOREIGN KEY ("restaurant_id", "table_id") REFERENCES "tables"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "restaurant_order_settings" ADD CONSTRAINT "restaurant_order_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "restaurant_order_settings" ADD CONSTRAINT "restaurant_order_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurant_id_logo_media_id_fkey" FOREIGN KEY ("restaurant_id", "logo_media_id") REFERENCES "media_assets"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurant_id_cover_media_id_fkey" FOREIGN KEY ("restaurant_id", "cover_media_id") REFERENCES "media_assets"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurant_id_id_published_revision_id_fkey" FOREIGN KEY ("restaurant_id", "id", "published_revision_id") REFERENCES "menu_publications"("restaurant_id", "menu_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_menu_id_fkey" FOREIGN KEY ("restaurant_id", "menu_id") REFERENCES "menus"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_products" ADD CONSTRAINT "menu_products_restaurant_id_menu_id_category_id_fkey" FOREIGN KEY ("restaurant_id", "menu_id", "category_id") REFERENCES "menu_categories"("restaurant_id", "menu_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_product_variants" ADD CONSTRAINT "menu_product_variants_restaurant_id_product_id_fkey" FOREIGN KEY ("restaurant_id", "product_id") REFERENCES "menu_products"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_option_groups" ADD CONSTRAINT "menu_option_groups_restaurant_id_product_id_fkey" FOREIGN KEY ("restaurant_id", "product_id") REFERENCES "menu_products"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_restaurant_id_product_id_group_id_fkey" FOREIGN KEY ("restaurant_id", "product_id", "group_id") REFERENCES "menu_option_groups"("restaurant_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_variant_option_groups" ADD CONSTRAINT "menu_variant_option_groups_restaurant_id_product_id_varian_fkey" FOREIGN KEY ("restaurant_id", "product_id", "variant_id") REFERENCES "menu_product_variants"("restaurant_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_variant_option_groups" ADD CONSTRAINT "menu_variant_option_groups_restaurant_id_product_id_group__fkey" FOREIGN KEY ("restaurant_id", "product_id", "group_id") REFERENCES "menu_option_groups"("restaurant_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_restaurant_id_media_id_fkey" FOREIGN KEY ("restaurant_id", "media_id") REFERENCES "media_assets"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_product_images" ADD CONSTRAINT "menu_product_images_restaurant_id_product_id_fkey" FOREIGN KEY ("restaurant_id", "product_id") REFERENCES "menu_products"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_product_images" ADD CONSTRAINT "menu_product_images_restaurant_id_media_id_fkey" FOREIGN KEY ("restaurant_id", "media_id") REFERENCES "media_assets"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_publications" ADD CONSTRAINT "menu_publications_restaurant_id_menu_id_fkey" FOREIGN KEY ("restaurant_id", "menu_id") REFERENCES "menus"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_publications" ADD CONSTRAINT "menu_publications_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_publication_media" ADD CONSTRAINT "menu_publication_media_restaurant_id_publication_id_fkey" FOREIGN KEY ("restaurant_id", "publication_id") REFERENCES "menu_publications"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_publication_media" ADD CONSTRAINT "menu_publication_media_restaurant_id_media_id_fkey" FOREIGN KEY ("restaurant_id", "media_id") REFERENCES "media_assets"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_session_id_fkey" FOREIGN KEY ("restaurant_id", "session_id") REFERENCES "table_sessions"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_publication_id_fkey" FOREIGN KEY ("restaurant_id", "publication_id") REFERENCES "menu_publications"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_submitted_by_token_id_session_id_fkey" FOREIGN KEY ("submitted_by_token_id", "session_id") REFERENCES "session_tokens"("id", "session_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_order_id_fkey" FOREIGN KEY ("restaurant_id", "order_id") REFERENCES "orders"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_product_id_variant_id_fkey" FOREIGN KEY ("restaurant_id", "product_id", "variant_id") REFERENCES "menu_product_variants"("restaurant_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_restaurant_id_product_id_order_item_id_fkey" FOREIGN KEY ("restaurant_id", "product_id", "order_item_id") REFERENCES "order_items"("restaurant_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_restaurant_id_product_id_option_id_fkey" FOREIGN KEY ("restaurant_id", "product_id", "option_id") REFERENCES "menu_options"("restaurant_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_restaurant_id_order_id_fkey" FOREIGN KEY ("restaurant_id", "order_id") REFERENCES "orders"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_restaurant_id_order_id_order_item_id_fkey" FOREIGN KEY ("restaurant_id", "order_id", "order_item_id") REFERENCES "order_items"("restaurant_id", "order_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "restaurant_operation_events" ADD CONSTRAINT "restaurant_operation_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "restaurant_operation_events" ADD CONSTRAINT "restaurant_operation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- Review supplement. PostgreSQL 16 target. Does not provision files or AWS.
-- Apply ONLY together with generated-ddl.sql in the proposed transaction.

ALTER TABLE restaurant_order_settings ADD CONSTRAINT ordering_settings_version_positive
  CHECK (version > 0);
ALTER TABLE menus ADD CONSTRAINT menu_valid_versions_and_presentation
  CHECK (draft_version > 0 AND presentation_schema_version = 1
         AND length(btrim(display_name)) > 0
         AND jsonb_typeof(presentation_config) = 'object');

ALTER TABLE menu_categories ADD CONSTRAINT menu_category_valid_fields
  CHECK (length(btrim(name)) > 0 AND position >= 0);
ALTER TABLE menu_products ADD CONSTRAINT menu_product_valid_fields
  CHECK (length(btrim(name)) > 0 AND position >= 0 AND availability_version > 0);
ALTER TABLE menu_product_variants ADD CONSTRAINT menu_variant_valid_fields
  CHECK (length(btrim(name)) > 0 AND position >= 0 AND availability_version > 0
         AND price_cents BETWEEN 0 AND 1000000);
ALTER TABLE menu_option_groups ADD CONSTRAINT menu_option_group_valid_limits
  CHECK (length(btrim(name)) > 0 AND position >= 0
         AND min_selections BETWEEN 0 AND 50
         AND max_selections BETWEEN 1 AND 50 AND min_selections <= max_selections);
ALTER TABLE menu_options ADD CONSTRAINT menu_option_valid_fields
  CHECK (length(btrim(name)) > 0 AND position >= 0 AND availability_version > 0
         AND price_delta_cents BETWEEN 0 AND 1000000 AND max_quantity BETWEEN 1 AND 50);
ALTER TABLE menu_product_images ADD CONSTRAINT menu_product_image_valid_position
  CHECK (position >= 0);
ALTER TABLE menu_publications ADD CONSTRAINT menu_publication_valid_content
  CHECK (revision_number > 0 AND draft_version > 0 AND schema_version = 1
         AND jsonb_typeof(content) = 'object'
         AND octet_length(content::text) <= 2097152);

ALTER TABLE media_assets ADD CONSTRAINT media_asset_valid_metadata
  CHECK (reserved_bytes >= 0 AND stored_bytes >= 0 AND delete_attempts >= 0
         AND (original_byte_size IS NULL OR original_byte_size BETWEEN 1 AND 8388608)
         AND (original_mime_type IS NULL OR original_mime_type IN ('image/jpeg','image/png','image/webp'))
         AND (width IS NULL OR width BETWEEN 1 AND 10000)
         AND (height IS NULL OR height BETWEEN 1 AND 10000)
         AND (width IS NULL OR height IS NULL OR width::bigint * height <= 25000000)
         AND (status <> 'READY' OR (width IS NOT NULL AND height IS NOT NULL
              AND stored_bytes > 0 AND reserved_bytes = 0))
         AND (status = 'PENDING' OR reserved_bytes = 0)
         AND storage_prefix !~ '(^/|(^|/)\.\.(/|$)|\\)');
ALTER TABLE media_derivatives ADD CONSTRAINT media_derivative_valid_metadata
  CHECK (mime_type = 'image/webp' AND byte_size > 0
         AND width > 0 AND height > 0
         AND ((kind = 'MAIN' AND greatest(width,height) <= 1600)
              OR (kind = 'THUMB' AND greatest(width,height) <= 480))
         AND sha256 ~ '^[0-9a-f]{64}$'
         AND storage_key !~ '(^/|(^|/)\.\.(/|$)|\\)');

ALTER TABLE orders ADD CONSTRAINT order_valid_current_source
  CHECK (source = 'LOCAL_MENU' AND fulfillment_type = 'DINE_IN'
         AND session_id IS NOT NULL AND publication_id IS NOT NULL
         AND length(btrim(table_label_snapshot)) > 0);
ALTER TABLE orders ADD CONSTRAINT order_valid_amount_and_submission
  CHECK (currency = 'BRL' AND total_cents BETWEEN 0 AND 100000000
         AND version > 0 AND last_event_sequence > 0
         AND submission_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         AND request_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE order_items ADD CONSTRAINT order_item_valid_quantities
  CHECK (quantity BETWEEN 1 AND 20 AND position >= 0
         AND pending_quantity >= 0 AND preparing_quantity >= 0 AND ready_quantity >= 0
         AND delivered_quantity >= 0 AND cancelled_quantity >= 0
         AND pending_quantity::bigint + preparing_quantity + ready_quantity
             + delivered_quantity + cancelled_quantity = quantity);
ALTER TABLE order_items ADD CONSTRAINT order_item_valid_prices
  CHECK (base_price_cents BETWEEN 0 AND 1000000
         AND unit_price_cents BETWEEN 0 AND 10000000
         AND unit_price_cents >= base_price_cents
         AND line_total_cents BETWEEN 0 AND 100000000
         AND line_total_cents::bigint = unit_price_cents::bigint * quantity
         AND length(btrim(product_name_snapshot)) > 0
         AND length(btrim(variant_name_snapshot)) > 0);
ALTER TABLE order_item_options ADD CONSTRAINT order_item_option_valid_fields
  CHECK (selected_quantity BETWEEN 1 AND 50 AND price_delta_cents BETWEEN 0 AND 1000000
         AND length(btrim(group_name_snapshot)) > 0 AND length(btrim(option_name_snapshot)) > 0);
ALTER TABLE order_events ADD CONSTRAINT order_event_valid_transition
  CHECK (sequence > 0 AND resulting_order_version > 0
         AND ((action = 'CREATED' AND sequence = 1 AND resulting_order_version = 1
               AND order_item_id IS NULL AND quantity IS NULL
               AND from_stage IS NULL AND to_stage IS NULL AND reason IS NULL
               AND actor_type = 'TABLE_DEVICE')
          OR (action = 'TRANSITIONED' AND order_item_id IS NOT NULL
               AND quantity IS NOT NULL AND quantity BETWEEN 1 AND 20 AND actor_type = 'USER'
               AND from_stage IS NOT NULL AND to_stage IS NOT NULL
               AND ((from_stage = 'PENDING' AND to_stage IN ('PREPARING','READY','DELIVERED','CANCELLED'))
                 OR (from_stage = 'PREPARING' AND to_stage IN ('READY','DELIVERED','CANCELLED'))
                 OR (from_stage = 'READY' AND to_stage IN ('DELIVERED','CANCELLED')))
               AND ((to_stage = 'CANCELLED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 3 AND 500)
                    OR (to_stage <> 'CANCELLED' AND reason IS NULL)))));
ALTER TABLE order_events ADD CONSTRAINT order_event_valid_actor_snapshot
  CHECK ((actor_type = 'USER' AND actor_role_snapshot IS NOT NULL AND actor_label_snapshot IS NOT NULL
          AND length(btrim(actor_label_snapshot)) > 0
          AND ((actor_role_snapshot = 'OWNER' AND actor_category_snapshot IS NULL)
            OR (actor_role_snapshot = 'STAFF' AND actor_category_snapshot IS NOT NULL
                AND actor_category_snapshot IN ('MANAGER','WAITER','KITCHEN'))))
      OR (actor_type = 'TABLE_DEVICE' AND actor_user_id IS NULL AND actor_role_snapshot IS NULL
          AND actor_category_snapshot IS NULL AND actor_label_snapshot IS NULL));
ALTER TABLE restaurant_operation_events ADD CONSTRAINT operation_event_valid_actor
  CHECK ((actor_type = 'USER' AND actor_role_snapshot IS NOT NULL AND actor_label_snapshot IS NOT NULL
          AND length(btrim(actor_label_snapshot)) > 0)
      OR (actor_type = 'SYSTEM' AND actor_user_id IS NULL AND actor_role_snapshot IS NULL
          AND actor_category_snapshot IS NULL AND actor_label_snapshot IS NULL));

-- PUBLICATION MEDIA LINKS: can only be added in the transaction that creates
-- their revision. Prevent later edits that change which assets the public route allows.
CREATE FUNCTION menu_guard_publication_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE publication_transaction bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Publication media references are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT created_transaction INTO publication_transaction
    FROM menu_publications WHERE id = NEW.publication_id AND restaurant_id = NEW.restaurant_id;
  IF publication_transaction IS DISTINCT FROM txid_current() THEN
    RAISE EXCEPTION 'Publication media must be linked during publication' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publication_links_immutable BEFORE INSERT OR UPDATE OR DELETE
  ON menu_publication_media FOR EACH ROW EXECUTE FUNCTION menu_guard_publication_links();

-- Immutable rows allow only the FK's housekeeping when a user is actually
-- removed. Nullable author references do not remove tenant or historical labels.
CREATE FUNCTION menu_guard_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author_column text := TG_ARGV[0]; old_author text;
BEGIN
  IF TG_OP = 'UPDATE' AND author_column <> '' THEN
    old_author := to_jsonb(OLD)->>author_column;
    IF old_author IS NOT NULL AND to_jsonb(NEW)->>author_column IS NULL
       AND (to_jsonb(NEW) - author_column) = (to_jsonb(OLD) - author_column)
       AND NOT EXISTS (SELECT 1 FROM users WHERE id = old_author) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Historical record is immutable: %', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;
CREATE TRIGGER menu_publications_immutable BEFORE UPDATE OR DELETE ON menu_publications
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('published_by');
CREATE TRIGGER order_events_immutable BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('actor_user_id');
CREATE TRIGGER operation_events_immutable BEFORE UPDATE OR DELETE ON restaurant_operation_events
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('actor_user_id');

-- Author IDs use single-column SET NULL FKs, with this extra tenant check.
-- This avoids Prisma SET NULL attempting to clear restaurant_id in composite FKs.
CREATE FUNCTION menu_check_author_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author_id text := to_jsonb(NEW)->>TG_ARGV[0]; author_row users%ROWTYPE;
BEGIN
  IF author_id IS NOT NULL THEN
    SELECT * INTO author_row FROM users WHERE id = author_id AND restaurant_id = NEW.restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Author does not belong to resource restaurant' USING ERRCODE = '23503';
    END IF;
    IF TG_ARGV[1] = 'snapshot' AND
       ((to_jsonb(NEW)->>'actor_role_snapshot') IS DISTINCT FROM author_row.role::text
        OR (to_jsonb(NEW)->>'actor_category_snapshot') IS DISTINCT FROM author_row.category::text) THEN
      RAISE EXCEPTION 'Author snapshot does not match author' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'INSERT' AND to_jsonb(NEW)->>'actor_type' = 'USER' THEN
    RAISE EXCEPTION 'User event requires an existing author at creation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER author_tenant_settings BEFORE INSERT OR UPDATE OF updated_by, restaurant_id
  ON restaurant_order_settings FOR EACH ROW EXECUTE FUNCTION menu_check_author_tenant('updated_by','plain');
CREATE TRIGGER author_tenant_media BEFORE INSERT OR UPDATE OF created_by, restaurant_id
  ON media_assets FOR EACH ROW EXECUTE FUNCTION menu_check_author_tenant('created_by','plain');
CREATE TRIGGER author_tenant_publication BEFORE INSERT OR UPDATE OF published_by, restaurant_id
  ON menu_publications FOR EACH ROW EXECUTE FUNCTION menu_check_author_tenant('published_by','plain');
CREATE TRIGGER author_tenant_order_event BEFORE INSERT ON order_events
  FOR EACH ROW EXECUTE FUNCTION menu_check_author_tenant('actor_user_id','snapshot');
CREATE TRIGGER author_tenant_operation_event BEFORE INSERT ON restaurant_operation_events
  FOR EACH ROW EXECUTE FUNCTION menu_check_author_tenant('actor_user_id','snapshot');

-- Stable identity parents cannot be repurposed. Products can move category
-- inside their one menu; variants/groups/options cannot move to another parent.
CREATE FUNCTION menu_guard_identity_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE column_name text;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW)->column_name) IS DISTINCT FROM (to_jsonb(OLD)->column_name) THEN
      RAISE EXCEPTION 'Stable identity parent cannot change: %', column_name USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER category_stable_parent BEFORE UPDATE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION menu_guard_identity_parent('id','restaurant_id','menu_id');
CREATE TRIGGER product_stable_parent BEFORE UPDATE ON menu_products
  FOR EACH ROW EXECUTE FUNCTION menu_guard_identity_parent('id','restaurant_id','menu_id');
CREATE TRIGGER variant_stable_parent BEFORE UPDATE ON menu_product_variants
  FOR EACH ROW EXECUTE FUNCTION menu_guard_identity_parent('id','restaurant_id','product_id');
CREATE TRIGGER group_stable_parent BEFORE UPDATE ON menu_option_groups
  FOR EACH ROW EXECUTE FUNCTION menu_guard_identity_parent('id','restaurant_id','product_id');
CREATE TRIGGER option_stable_parent BEFORE UPDATE ON menu_options
  FOR EACH ROW EXECUTE FUNCTION menu_guard_identity_parent('id','restaurant_id','product_id','group_id');

-- Publications carry stable identities inside JSON; they cannot supply SQL FKs
-- to every referenced identity. Archive instead of physically deleting catalog rows.
CREATE TRIGGER category_archive_only BEFORE DELETE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('');
CREATE TRIGGER product_archive_only BEFORE DELETE ON menu_products
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('');
CREATE TRIGGER variant_archive_only BEFORE DELETE ON menu_product_variants
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('');
CREATE TRIGGER option_group_archive_only BEFORE DELETE ON menu_option_groups
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('');
CREATE TRIGGER option_archive_only BEFORE DELETE ON menu_options
  FOR EACH ROW EXECUTE FUNCTION menu_guard_immutable_record('');

CREATE FUNCTION menu_guard_derivative_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_state media_status;
BEGIN
  SELECT status INTO asset_state FROM media_assets
    WHERE id = OLD.media_id AND restaurant_id = OLD.restaurant_id FOR SHARE;
  IF asset_state = 'READY' THEN
    RAISE EXCEPTION 'READY image derivatives are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.media_id <> OLD.media_id OR NEW.restaurant_id <> OLD.restaurant_id) THEN
    RAISE EXCEPTION 'Derivative ownership cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_derivative_guard BEFORE UPDATE OR DELETE ON media_derivatives
  FOR EACH ROW EXECUTE FUNCTION menu_guard_derivative_mutation();

CREATE FUNCTION menu_guard_order_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Orders and item snapshots cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'orders' THEN
    IF (to_jsonb(NEW) - ARRAY['version','last_event_sequence','updated_at','submitted_by_token_id'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['version','last_event_sequence','updated_at','submitted_by_token_id'])
       OR NEW.version < OLD.version OR NEW.last_event_sequence < OLD.last_event_sequence
       OR (NEW.submitted_by_token_id IS DISTINCT FROM OLD.submitted_by_token_id
           AND NEW.submitted_by_token_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Order financial/context snapshot is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'order_items' THEN
    IF (to_jsonb(NEW) - ARRAY['pending_quantity','preparing_quantity','ready_quantity','delivered_quantity','cancelled_quantity'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['pending_quantity','preparing_quantity','ready_quantity','delivered_quantity','cancelled_quantity']) THEN
      RAISE EXCEPTION 'Order item financial snapshot is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Order selection snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_snapshot_guard BEFORE UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION menu_guard_order_record();
CREATE TRIGGER order_item_snapshot_guard BEFORE UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION menu_guard_order_record();
CREATE TRIGGER order_selection_snapshot_guard BEFORE UPDATE OR DELETE ON order_item_options
  FOR EACH ROW EXECUTE FUNCTION menu_guard_order_record();

-- Only READY assets can gain references. Existing references survive normal
-- edits; cleanup must transition an unreferenced asset to DELETING under lock.
CREATE FUNCTION menu_check_ready_asset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE column_name text; asset_id text; asset_state media_status;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    asset_id := to_jsonb(NEW)->>column_name;
    IF asset_id IS NOT NULL AND
       (TG_OP = 'INSERT' OR (to_jsonb(OLD)->>column_name) IS DISTINCT FROM asset_id) THEN
      SELECT status INTO asset_state FROM media_assets
        WHERE id = asset_id AND restaurant_id = NEW.restaurant_id FOR SHARE;
      IF asset_state IS DISTINCT FROM 'READY'::media_status THEN
        RAISE EXCEPTION 'Referenced asset is not READY for this restaurant' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER menu_ready_identity_media BEFORE INSERT OR UPDATE OF logo_media_id, cover_media_id ON menus
  FOR EACH ROW EXECUTE FUNCTION menu_check_ready_asset('logo_media_id','cover_media_id');
CREATE TRIGGER menu_ready_product_media BEFORE INSERT OR UPDATE ON menu_product_images
  FOR EACH ROW EXECUTE FUNCTION menu_check_ready_asset('media_id');
CREATE TRIGGER menu_ready_publication_media BEFORE INSERT OR UPDATE ON menu_publication_media
  FOR EACH ROW EXECUTE FUNCTION menu_check_ready_asset('media_id');

CREATE FUNCTION menu_guard_asset_deletion_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'READY' AND NEW.status <> 'READY' AND (
       EXISTS (SELECT 1 FROM menus WHERE restaurant_id = OLD.restaurant_id
               AND (logo_media_id = OLD.id OR cover_media_id = OLD.id))
    OR EXISTS (SELECT 1 FROM menu_product_images WHERE restaurant_id = OLD.restaurant_id AND media_id = OLD.id)
    OR EXISTS (SELECT 1 FROM menu_publication_media WHERE restaurant_id = OLD.restaurant_id AND media_id = OLD.id)) THEN
    RAISE EXCEPTION 'Referenced READY asset cannot be removed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_references_protect_state BEFORE UPDATE OF status ON media_assets
  FOR EACH ROW EXECUTE FUNCTION menu_guard_asset_deletion_state();

CREATE INDEX order_items_ready_queue_idx ON order_items(restaurant_id, order_id) WHERE ready_quantity > 0;
CREATE UNIQUE INDEX order_one_created_event_idx ON order_events(order_id) WHERE action = 'CREATED';

-- Existing restaurants receive only empty editable menus, no categories,
-- no publication and no permission to order. gen_random_uuid is built-in in PG16.
INSERT INTO restaurant_order_settings(restaurant_id)
  SELECT id FROM restaurants ON CONFLICT (restaurant_id) DO NOTHING;
INSERT INTO menus(id,restaurant_id,display_name)
  SELECT gen_random_uuid()::text,id,coalesce(nullif(btrim(left(name,120)),''),'Cardápio') FROM restaurants
  ON CONFLICT (restaurant_id) DO NOTHING;
INSERT INTO restaurant_operation_events(
  id,restaurant_id,entity_type,entity_id,action,new_value,actor_type)
  SELECT gen_random_uuid()::text,restaurant_id,'ORDERING_SETTINGS',restaurant_id,
    'INITIALIZED',jsonb_build_object('customer_ordering_enabled',false),'SYSTEM'
  FROM restaurant_order_settings;

COMMIT;
