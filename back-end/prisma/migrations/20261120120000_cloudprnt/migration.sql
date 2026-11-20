UPDATE "print_jobs" SET "status" = 'REVIEW_REQUIRED' WHERE "status" = 'PENDING';
UPDATE "print_jobs" SET "status" = 'UNCERTAIN' WHERE "status" = 'SENDING';
UPDATE "print_destinations"
SET "enabled" = false, "credential_hash" = NULL, "last_contact_at" = NULL, "interrupted_at" = CURRENT_TIMESTAMP;

ALTER TABLE "print_destinations"
  DROP COLUMN "pairing_code_hash",
  DROP COLUMN "pairing_expires_at",
  ADD COLUMN "test_token" TEXT,
  ADD COLUMN "test_status" "print_job_status",
  ADD COLUMN "test_expires_at" TIMESTAMP(3);
