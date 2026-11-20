CREATE TYPE "print_job_outcome" AS ENUM ('SENT', 'FAILED_BEFORE_SEND', 'UNCERTAIN');

ALTER TABLE "print_destinations" ADD COLUMN "interrupted_at" TIMESTAMP(3);

ALTER TABLE "print_jobs"
    ADD COLUMN "order_version" INTEGER,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "next_attempt_at" TIMESTAMP(3),
    ADD COLUMN "reservation_id" TEXT,
    ADD COLUMN "reservation_expires_at" TIMESTAMP(3),
    ADD COLUMN "reservation_credential_hash" VARCHAR(64),
    ADD COLUMN "reported_outcome" "print_job_outcome",
    ADD COLUMN "original_job_id" TEXT,
    ADD COLUMN "requested_by" TEXT,
    ADD COLUMN "reason" VARCHAR(500);

CREATE UNIQUE INDEX "print_jobs_reservation_id_key" ON "print_jobs"("reservation_id");
CREATE UNIQUE INDEX "print_jobs_original_reference_key"
    ON "print_jobs"("restaurant_id", "order_id", "destination", "id");
CREATE UNIQUE INDEX "print_jobs_one_sending_per_destination"
    ON "print_jobs"("restaurant_id", "destination") WHERE "status" = 'SENDING';
CREATE INDEX "print_jobs_restaurant_id_created_at_id_idx" ON "print_jobs"("restaurant_id", "created_at", "id");
CREATE INDEX "print_jobs_claim_idx" ON "print_jobs"("restaurant_id", "destination", "status", "created_at", "id");

ALTER TABLE "print_jobs"
    ADD CONSTRAINT "print_jobs_original_job_fkey"
        FOREIGN KEY ("restaurant_id", "order_id", "destination", "original_job_id")
        REFERENCES "print_jobs"("restaurant_id", "order_id", "destination", "id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "print_jobs_reservation_check" CHECK (
        ("reservation_id" IS NOT NULL) = ("attempts" > 0)
        AND "attempts" >= 0
        AND ("reservation_id" IS NULL) = ("reservation_expires_at" IS NULL)
        AND ("reservation_id" IS NULL) = ("reservation_credential_hash" IS NULL)
        AND ("reservation_id" IS NOT NULL OR "reported_outcome" IS NULL)
        AND ("status" <> 'SENDING' OR
            ("reservation_id" IS NOT NULL AND "reported_outcome" IS NULL AND "order_version" IS NOT NULL))
    ),
    ADD CONSTRAINT "print_jobs_reprint_check" CHECK (
        ("source_event" = 'ORDER_CREATED' AND "original_job_id" IS NULL AND "requested_by" IS NULL AND "reason" IS NULL)
        OR ("source_event" LIKE 'REPRINT:%' AND "original_job_id" IS NOT NULL
            AND "original_job_id" <> "id" AND "requested_by" IS NOT NULL AND "reason" IS NOT NULL)
    );

-- Comandas acumuladas antes do protocolo de reserva entram na revisão da equipe.
UPDATE "print_jobs" SET "status" = 'REVIEW_REQUIRED' WHERE "status" = 'PENDING';
