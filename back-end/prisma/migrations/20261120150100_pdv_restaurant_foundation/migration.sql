BEGIN;

ALTER TABLE restaurants
  ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN business_day_cutoff_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN service_fee_bps INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN next_tab_number INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT restaurants_pdv_config_valid
    CHECK (business_day_cutoff_minutes BETWEEN 0 AND 719
           AND service_fee_bps BETWEEN 0 AND 3000
           AND next_tab_number > 0
           AND length(btrim(timezone)) > 0);

ALTER TABLE order_events
  DROP CONSTRAINT order_event_valid_actor_snapshot,
  ADD CONSTRAINT order_event_valid_actor_snapshot
    CHECK ((actor_type = 'USER' AND actor_role_snapshot IS NOT NULL AND actor_label_snapshot IS NOT NULL
            AND length(btrim(actor_label_snapshot)) > 0
            AND ((actor_role_snapshot = 'OWNER' AND actor_category_snapshot IS NULL)
              OR (actor_role_snapshot = 'STAFF' AND actor_category_snapshot IS NOT NULL
                  AND actor_category_snapshot IN ('MANAGER','WAITER','KITCHEN','CASHIER'))))
        OR (actor_type = 'TABLE_DEVICE' AND actor_user_id IS NULL AND actor_role_snapshot IS NULL
            AND actor_category_snapshot IS NULL AND actor_label_snapshot IS NULL));

COMMIT;
