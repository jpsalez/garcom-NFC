BEGIN;

-- Mantém as escritas do PDV e do cardápio fora do backfill.
LOCK TABLE restaurants IN EXCLUSIVE MODE;

-- CreateEnum
CREATE TYPE "tab_kind" AS ENUM ('TABLE', 'COUNTER');

-- CreateEnum
CREATE TYPE "tab_status" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN     "tab_id" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "submitted_by_user_id" TEXT,
ADD COLUMN     "tab_id" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "category_id_snapshot" TEXT,
ADD COLUMN     "category_name_snapshot" VARCHAR(120) NOT NULL DEFAULT 'Sem categoria';

-- CreateTable
CREATE TABLE "tabs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "tab_kind" NOT NULL,
    "table_id" TEXT,
    "table_label_snapshot" VARCHAR(120),
    "label" VARCHAR(80),
    "guests_count" INTEGER,
    "status" "tab_status" NOT NULL DEFAULT 'OPEN',
    "service_fee_bps" INTEGER NOT NULL DEFAULT 1000,
    "service_fee_waived" BOOLEAN NOT NULL DEFAULT false,
    "service_fee_waive_reason" VARCHAR(500),
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "service_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "adjustments_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "paid_cents" INTEGER NOT NULL DEFAULT 0,
    "business_date" DATE,
    "legacy_closed" BOOLEAN NOT NULL DEFAULT false,
    "opened_by_user_id" TEXT,
    "closed_by_user_id" TEXT,
    "cancel_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tabs_restaurant_id_status_opened_at_idx" ON "tabs"("restaurant_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "tabs_restaurant_id_business_date_status_idx" ON "tabs"("restaurant_id", "business_date", "status");

-- CreateIndex
CREATE INDEX "tabs_restaurant_id_table_id_status_idx" ON "tabs"("restaurant_id", "table_id", "status");

-- CreateIndex
CREATE INDEX "tabs_restaurant_id_opened_by_user_id_idx" ON "tabs"("restaurant_id", "opened_by_user_id");

-- CreateIndex
CREATE INDEX "tabs_restaurant_id_closed_by_user_id_idx" ON "tabs"("restaurant_id", "closed_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tabs_restaurant_id_id_key" ON "tabs"("restaurant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tabs_restaurant_id_number_key" ON "tabs"("restaurant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "users_restaurant_id_id_key" ON "users"("restaurant_id", "id");

-- CreateIndex
CREATE INDEX "table_sessions_restaurant_tab_idx" ON "table_sessions"("restaurant_id", "tab_id");

-- CreateIndex
CREATE INDEX "orders_restaurant_tab_created_idx" ON "orders"("restaurant_id", "tab_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_submitted_by_user_id_idx" ON "orders"("restaurant_id", "submitted_by_user_id");

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_tab_fkey" FOREIGN KEY ("restaurant_id", "tab_id") REFERENCES "tabs"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_submitted_by_user_fkey" FOREIGN KEY ("restaurant_id", "submitted_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("submitted_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tab_fkey" FOREIGN KEY ("restaurant_id", "tab_id") REFERENCES "tabs"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_restaurant_id_table_id_fkey" FOREIGN KEY ("restaurant_id", "table_id") REFERENCES "tables"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_restaurant_id_opened_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "opened_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("opened_by_user_id") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_restaurant_id_closed_by_user_id_fkey" FOREIGN KEY ("restaurant_id", "closed_by_user_id") REFERENCES "users"("restaurant_id", "id") ON DELETE SET NULL ("closed_by_user_id") ON UPDATE RESTRICT;


CREATE UNIQUE INDEX tabs_one_open_per_table
  ON tabs (restaurant_id, table_id)
  WHERE kind = 'TABLE' AND status IN ('OPEN', 'CLOSING');

ALTER TABLE tabs ADD CONSTRAINT tabs_valid_invariants CHECK (
  number > 0
  AND version > 0
  AND service_fee_bps BETWEEN 0 AND 3000
  AND subtotal_cents >= 0 AND service_fee_cents >= 0
  AND total_cents >= 0 AND paid_cents >= 0
  AND (guests_count IS NULL OR guests_count > 0)
  AND ((kind = 'TABLE' AND table_id IS NOT NULL) OR (kind = 'COUNTER' AND table_id IS NULL))
  AND (NOT service_fee_waived OR (
    service_fee_waive_reason IS NOT NULL AND length(btrim(service_fee_waive_reason)) BETWEEN 3 AND 500
  ))
  AND (status <> 'CANCELLED' OR (
    cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) BETWEEN 3 AND 500
  ))
  AND (NOT legacy_closed OR (status = 'CLOSED' AND paid_cents = 0))
  AND (status <> 'CLOSED' OR (
    closed_at IS NOT NULL AND business_date IS NOT NULL AND (legacy_closed OR paid_cents = total_cents)
  ))
);

-- Sessões sem pedidos continuam sem comanda. As antigas sessões fechadas não
-- registravam pagamentos. Seus totais preservam o consumo sem atestar receita:
-- relatórios de receita por encerramento devem filtrar legacy_closed = false.
CREATE TEMPORARY TABLE pdv_tab_backfill ON COMMIT DROP AS
WITH sessions_with_orders AS (
  SELECT o.restaurant_id, o.session_id, max(o.created_at) AS last_order_at,
         (array_agg(o.table_label_snapshot ORDER BY o.created_at, o.id))[1] AS original_table_label,
         coalesce(sum((i.quantity - i.cancelled_quantity)::bigint * i.unit_price_cents), 0) AS subtotal_cents
  FROM orders o
  LEFT JOIN order_items i ON (i.restaurant_id, i.order_id) = (o.restaurant_id, o.id)
  GROUP BY o.restaurant_id, o.session_id
)
SELECT gen_random_uuid()::text AS tab_id, s.restaurant_id, s.id AS session_id, s.table_id,
       CASE WHEN s.status = 'ACTIVE' THEN left(t.label, 120) ELSE o.original_table_label END AS table_label,
       r.next_tab_number + row_number() OVER (
         PARTITION BY s.restaurant_id ORDER BY s.created_at, s.id
       ) - 1 AS number,
       CASE WHEN s.status = 'ACTIVE' THEN 'OPEN'::tab_status ELSE 'CLOSED'::tab_status END AS status,
       s.created_at, CASE WHEN s.status = 'CLOSED' THEN coalesce(s.closed_at, o.last_order_at) END AS closed_at,
       o.subtotal_cents,
       CASE WHEN s.status = 'ACTIVE' THEN r.service_fee_bps ELSE 0 END AS service_fee_bps,
       r.business_day_cutoff_minutes, coalesce(tz.name, 'America/Sao_Paulo') AS timezone
FROM sessions_with_orders o
JOIN table_sessions s ON (s.restaurant_id, s.id) = (o.restaurant_id, o.session_id)
JOIN tables t ON (t.restaurant_id, t.id) = (s.restaurant_id, s.table_id)
JOIN restaurants r ON r.id = s.restaurant_id
LEFT JOIN LATERAL (
  SELECT name FROM pg_timezone_names WHERE lower(name) = lower(r.timezone) LIMIT 1
) tz ON true;

INSERT INTO tabs (
  id, restaurant_id, number, kind, table_id, table_label_snapshot, status,
  service_fee_bps, subtotal_cents, service_fee_cents, total_cents,
  business_date, legacy_closed, opened_at, closed_at
)
SELECT tab_id, restaurant_id, number, 'TABLE', table_id, table_label, status,
       service_fee_bps, subtotal_cents, round(subtotal_cents * service_fee_bps / 10000::numeric),
       subtotal_cents + round(subtotal_cents * service_fee_bps / 10000::numeric),
       ((closed_at AT TIME ZONE 'UTC' AT TIME ZONE timezone)
         - make_interval(mins => business_day_cutoff_minutes))::date,
       status = 'CLOSED', created_at, closed_at
FROM pdv_tab_backfill;

UPDATE table_sessions s
SET tab_id = b.tab_id
FROM pdv_tab_backfill b
WHERE (s.restaurant_id, s.id) = (b.restaurant_id, b.session_id);

ALTER TABLE orders DISABLE TRIGGER order_snapshot_guard;
UPDATE orders o
SET tab_id = b.tab_id
FROM pdv_tab_backfill b
WHERE (o.restaurant_id, o.session_id) = (b.restaurant_id, b.session_id);
ALTER TABLE orders ENABLE TRIGGER order_snapshot_guard;

ALTER TABLE order_items DISABLE TRIGGER order_item_snapshot_guard;
UPDATE order_items i
SET category_id_snapshot = category ->> 'id',
    category_name_snapshot = left(category ->> 'name', 120)
FROM orders o
JOIN menu_publications p ON (p.restaurant_id, p.id) = (o.restaurant_id, o.publication_id)
CROSS JOIN LATERAL jsonb_path_query(p.content, '$.categories[*]') category
WHERE (i.restaurant_id, i.order_id) = (o.restaurant_id, o.id)
  AND length(btrim(category ->> 'name')) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_path_query(category, '$.products[*]') product
    WHERE product ->> 'id' = i.product_id
  );
ALTER TABLE order_items ENABLE TRIGGER order_item_snapshot_guard;

UPDATE restaurants r
SET next_tab_number = last_tab.number + 1
FROM (SELECT restaurant_id, max(number) AS number FROM pdv_tab_backfill GROUP BY restaurant_id) last_tab
WHERE r.id = last_tab.restaurant_id;

ALTER TABLE orders ALTER COLUMN tab_id SET NOT NULL;

ALTER TABLE orders
  DROP CONSTRAINT order_valid_current_source,
  ADD CONSTRAINT order_valid_current_source CHECK (
    publication_id IS NOT NULL AND length(btrim(table_label_snapshot)) > 0
    AND (
      (source = 'LOCAL_MENU' AND fulfillment_type = 'DINE_IN' AND session_id IS NOT NULL
        AND submitted_by_user_id IS NULL)
      OR (source = 'POS' AND fulfillment_type IN ('DINE_IN', 'COUNTER') AND submitted_by_token_id IS NULL)
    )
  );

ALTER TABLE order_events
  DROP CONSTRAINT order_event_valid_transition,
  ADD CONSTRAINT order_event_valid_transition CHECK (
    sequence > 0 AND resulting_order_version > 0
    AND (
      (action = 'CREATED' AND sequence = 1 AND resulting_order_version = 1
        AND order_item_id IS NULL AND quantity IS NULL
        AND from_stage IS NULL AND to_stage IS NULL AND reason IS NULL
        AND actor_type IN ('TABLE_DEVICE', 'USER'))
      OR (action = 'TRANSITIONED' AND order_item_id IS NOT NULL
        AND quantity IS NOT NULL AND quantity BETWEEN 1 AND 20 AND actor_type = 'USER'
        AND from_stage IS NOT NULL AND to_stage IS NOT NULL
        AND ((from_stage = 'PENDING' AND to_stage IN ('PREPARING','READY','DELIVERED','CANCELLED'))
          OR (from_stage = 'PREPARING' AND to_stage IN ('READY','DELIVERED','CANCELLED'))
          OR (from_stage = 'READY' AND to_stage IN ('DELIVERED','CANCELLED')))
        AND ((to_stage = 'CANCELLED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 3 AND 500)
          OR (to_stage <> 'CANCELLED' AND reason IS NULL)))
    )
  );

CREATE OR REPLACE FUNCTION menu_guard_order_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Orders and item snapshots cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'orders' THEN
    IF (to_jsonb(NEW) - ARRAY['version','last_event_sequence','updated_at','submitted_by_token_id',
                              'submitted_by_user_id','tab_id','table_label_snapshot'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['version','last_event_sequence','updated_at','submitted_by_token_id',
                              'submitted_by_user_id','tab_id','table_label_snapshot'])
       OR NEW.version < OLD.version OR NEW.last_event_sequence < OLD.last_event_sequence
       OR (NEW.submitted_by_token_id IS DISTINCT FROM OLD.submitted_by_token_id
           AND NEW.submitted_by_token_id IS NOT NULL)
       OR (NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
           AND NEW.submitted_by_user_id IS NOT NULL) THEN
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

COMMIT;
