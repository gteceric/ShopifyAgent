DROP INDEX "platform_events_platform_platform_event_id_key";

CREATE UNIQUE INDEX "platform_events_platform_platform_account_id_platform_event_id_key"
  ON "platform_events"("platform", "platform_account_id", "platform_event_id");
