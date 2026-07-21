ALTER TABLE "platform_events"
ADD COLUMN "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_attempt_at" TIMESTAMP(3),
ADD COLUMN "next_attempt_at" TIMESTAMP(3),
ADD COLUMN "last_error" TEXT;

UPDATE "platform_events"
SET
  "status" = 'processed',
  "attempt_count" = 1,
  "last_attempt_at" = "processed_at"
WHERE "processed_at" IS NOT NULL;

-- App uninstall events are handled atomically during ingestion, so historical
-- records are already complete even though they predate retry-state columns.
UPDATE "platform_events"
SET
  "status" = 'processed',
  "attempt_count" = 1,
  "last_attempt_at" = "created_at",
  "processed_at" = "created_at"
WHERE "event_type" = 'app/uninstalled'
  AND "processed_at" IS NULL;

CREATE INDEX "platform_events_platform_status_next_attempt_at_idx"
ON "platform_events"("platform", "status", "next_attempt_at");
