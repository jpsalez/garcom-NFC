CREATE TYPE "print_delivery_mode" AS ENUM ('CLOUDPRNT', 'BROWSER');

ALTER TABLE "print_destinations"
  ADD COLUMN "mode" "print_delivery_mode" NOT NULL DEFAULT 'CLOUDPRNT',
  ADD COLUMN "paper_width" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "browser_test_confirmed" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT "print_destinations_paper_width_check" CHECK (
    "paper_width" IN (58, 80) AND ("mode" = 'BROWSER' OR "paper_width" = 80)
  );

ALTER TABLE "print_jobs" ADD COLUMN "delivery_mode" "print_delivery_mode";
