-- CreateEnum
CREATE TYPE "print_destination" AS ENUM ('KITCHEN');

-- CreateEnum
CREATE TYPE "print_job_status" AS ENUM ('PENDING');

-- CreateTable
CREATE TABLE "print_destinations" (
    "restaurant_id" TEXT NOT NULL,
    "destination" "print_destination" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pairing_code_hash" VARCHAR(64),
    "pairing_expires_at" TIMESTAMP(3),
    "credential_hash" VARCHAR(64),
    "last_contact_at" TIMESTAMP(3),

    CONSTRAINT "print_destinations_pkey" PRIMARY KEY ("restaurant_id","destination")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "destination" "print_destination" NOT NULL,
    "source_event" VARCHAR(64) NOT NULL,
    "status" "print_job_status" NOT NULL DEFAULT 'PENDING',
    "payload_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "print_destinations_pairing_code_hash_key" ON "print_destinations"("pairing_code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "print_destinations_credential_hash_key" ON "print_destinations"("credential_hash");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_source_key" ON "print_jobs"("restaurant_id", "order_id", "destination", "source_event");

-- AddForeignKey
ALTER TABLE "print_destinations" ADD CONSTRAINT "print_destinations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurant_id_order_id_fkey" FOREIGN KEY ("restaurant_id", "order_id") REFERENCES "orders"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurant_id_destination_fkey" FOREIGN KEY ("restaurant_id", "destination") REFERENCES "print_destinations"("restaurant_id", "destination") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "print_destinations"
    ADD CONSTRAINT "print_destinations_pairing_expiration_check"
        CHECK (("pairing_code_hash" IS NULL) = ("pairing_expires_at" IS NULL)),
    ADD CONSTRAINT "print_destinations_credential_check"
        CHECK ("credential_hash" IS NOT NULL OR (NOT "enabled" AND "last_contact_at" IS NULL));

ALTER TABLE "print_jobs"
    ADD CONSTRAINT "print_jobs_payload_version_check" CHECK ("payload_version" > 0);
