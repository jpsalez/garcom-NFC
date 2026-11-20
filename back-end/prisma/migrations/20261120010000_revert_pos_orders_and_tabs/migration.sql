-- Desfaz 20261120000000_pos_order_source e 20261120000100_pos_orders_and_tabs (PDV revertido no código em 61adb5f).
-- Os arquivos voltaram para o histórico porque já estavam aplicados; esta migration leva o banco ao estado anterior a eles.

-- Pedidos não podem ser apagados (trigger de imutabilidade): se já houver pedido de PDV, a reversão exige decisão manual.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "orders" WHERE "source"::text = 'POS') THEN
    RAISE EXCEPTION 'Existem pedidos com source = POS; trate-os antes de reverter o PDV';
  END IF;
END $$;

ALTER TABLE "orders" DROP CONSTRAINT "order_valid_current_source";
ALTER TABLE "order_events" DROP CONSTRAINT "order_event_valid_transition";

-- Versão original (20261119100000_menu_and_orders_foundation), sem submitted_by_user_id
CREATE OR REPLACE FUNCTION menu_guard_order_record() RETURNS trigger LANGUAGE plpgsql AS $$
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

-- DROP COLUMN leva junto o índice, a FK e as constraints de cada coluna
ALTER TABLE "orders" DROP COLUMN "submitted_by_user_id", DROP COLUMN "tab_number_snapshot";
ALTER TABLE "table_sessions" DROP COLUMN "tab_number";
ALTER TABLE "restaurants" DROP COLUMN "next_tab_number";

-- PostgreSQL não remove valor de enum: recria o tipo só com LOCAL_MENU
ALTER TYPE "order_source" RENAME TO "order_source_old";
CREATE TYPE "order_source" AS ENUM ('LOCAL_MENU');
ALTER TABLE "orders" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "source" TYPE "order_source" USING "source"::text::"order_source";
ALTER TABLE "orders" ALTER COLUMN "source" SET DEFAULT 'LOCAL_MENU';
DROP TYPE "order_source_old";

ALTER TABLE orders ADD CONSTRAINT order_valid_current_source
  CHECK (source = 'LOCAL_MENU' AND fulfillment_type = 'DINE_IN'
         AND session_id IS NOT NULL AND publication_id IS NOT NULL
         AND length(btrim(table_label_snapshot)) > 0);
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
