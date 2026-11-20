-- Contador de comanda sequencial por restaurante
ALTER TABLE "restaurants" ADD COLUMN "next_tab_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_next_tab_number_positive" CHECK ("next_tab_number" > 0);

-- Número da comanda sequencial por restaurante em table_sessions
ALTER TABLE "table_sessions" ADD COLUMN "tab_number" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY created_at ASC, id ASC) AS seq
  FROM "table_sessions"
)
UPDATE "table_sessions" ts
SET "tab_number" = numbered.seq
FROM numbered
WHERE ts.id = numbered.id;

UPDATE "restaurants" r
SET "next_tab_number" = COALESCE(
  (SELECT MAX(ts."tab_number") FROM "table_sessions" ts WHERE ts."restaurant_id" = r."id"),
  0
) + 1;

ALTER TABLE "table_sessions" ALTER COLUMN "tab_number" SET NOT NULL;
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_tab_number_positive" CHECK ("tab_number" > 0);
CREATE UNIQUE INDEX "table_sessions_restaurant_id_tab_number_key" ON "table_sessions"("restaurant_id", "tab_number");

-- Snapshot da comanda e autor interno nos pedidos
ALTER TABLE "orders"
  ADD COLUMN "tab_number_snapshot" INTEGER,
  ADD COLUMN "submitted_by_user_id" TEXT;

UPDATE "orders" o
SET "tab_number_snapshot" = ts."tab_number"
FROM "table_sessions" ts
WHERE o."session_id" = ts."id" AND o."restaurant_id" = ts."restaurant_id";

ALTER TABLE "orders" ALTER COLUMN "tab_number_snapshot" SET NOT NULL;
ALTER TABLE "orders" ADD CONSTRAINT "orders_tab_number_snapshot_positive" CHECK ("tab_number_snapshot" > 0);

ALTER TABLE "orders" ADD CONSTRAINT "orders_submitted_by_user_id_fkey"
  FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

CREATE INDEX "orders_submitted_by_user_id_idx" ON "orders"("submitted_by_user_id");

ALTER TABLE "orders" DROP CONSTRAINT "order_valid_current_source";
ALTER TABLE "orders" ADD CONSTRAINT "order_valid_current_source"
  CHECK (
    "fulfillment_type" = 'DINE_IN'
    AND "session_id" IS NOT NULL
    AND "publication_id" IS NOT NULL
    AND "tab_number_snapshot" > 0
    AND length(btrim("table_label_snapshot")) > 0
    AND (
      ("source" = 'LOCAL_MENU' AND "submitted_by_user_id" IS NULL)
      OR ("source" = 'POS' AND "submitted_by_token_id" IS NULL)
    )
  );

-- Permite criação de pedido (CREATED) por usuário da equipe (PDV) além do aparelho da mesa
ALTER TABLE "order_events" DROP CONSTRAINT "order_event_valid_transition";
ALTER TABLE "order_events" ADD CONSTRAINT "order_event_valid_transition"
  CHECK (
    "sequence" > 0
    AND "resulting_order_version" > 0
    AND (
      ("action" = 'CREATED' AND "sequence" = 1 AND "resulting_order_version" = 1
       AND "order_item_id" IS NULL AND "quantity" IS NULL
       AND "from_stage" IS NULL AND "to_stage" IS NULL AND "reason" IS NULL
       AND "actor_type" IN ('TABLE_DEVICE', 'USER'))
      OR ("action" = 'TRANSITIONED' AND "order_item_id" IS NOT NULL
          AND "quantity" IS NOT NULL AND "quantity" BETWEEN 1 AND 20 AND "actor_type" = 'USER'
          AND "from_stage" IS NOT NULL AND "to_stage" IS NOT NULL
          AND (("from_stage" = 'PENDING' AND "to_stage" IN ('PREPARING', 'READY', 'DELIVERED', 'CANCELLED'))
            OR ("from_stage" = 'PREPARING' AND "to_stage" IN ('READY', 'DELIVERED', 'CANCELLED'))
            OR ("from_stage" = 'READY' AND "to_stage" IN ('DELIVERED', 'CANCELLED')))
          AND (("to_stage" = 'CANCELLED' AND "reason" IS NOT NULL AND length(btrim("reason")) BETWEEN 3 AND 500)
               OR ("to_stage" <> 'CANCELLED' AND "reason" IS NULL)))
    )
  );
