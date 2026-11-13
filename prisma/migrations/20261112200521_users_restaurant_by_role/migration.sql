-- Fluxo B: OWNER e STAFF sempre pertencem a um restaurante; só o SUPER_ADMIN fica sem.
ALTER TABLE "users" ADD CONSTRAINT "users_restaurant_by_role" CHECK (
  ("role" = 'SUPER_ADMIN' AND "restaurant_id" IS NULL)
  OR ("role" IN ('OWNER', 'STAFF') AND "restaurant_id" IS NOT NULL)
);
