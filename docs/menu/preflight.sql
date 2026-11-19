-- Read-only checks against the CURRENT baseline, before the proposed migration.
-- Does not change schema or rows. Run only after the existing migration chain.

-- Must return zero rows: new compound FK rejects mismatched tenant/table sessions.
SELECT s.id AS session_id, s.restaurant_id AS session_restaurant,
       t.restaurant_id AS table_restaurant
FROM table_sessions s JOIN tables t ON t.id = s.table_id
WHERE s.restaurant_id IS DISTINCT FROM t.restaurant_id;

-- Informational: display_name backfill trims/truncates to 120 characters,
-- with fallback "Cardápio" for empty legacy names; restaurants.name is unchanged.
SELECT id, length(name) AS current_name_length
FROM restaurants
WHERE length(name) > 120 OR length(btrim(name)) = 0;

-- Must return zero rows for a first application of the proposed migration.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'restaurant_order_settings','menus','menu_categories','menu_products',
  'menu_product_variants','menu_option_groups','menu_options','menu_variant_option_groups',
  'media_assets','media_derivatives','menu_product_images','menu_publications',
  'menu_publication_media','orders','order_items','order_item_options','order_events',
  'restaurant_operation_events'
);
