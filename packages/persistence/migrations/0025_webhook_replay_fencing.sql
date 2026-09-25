-- AUD20-008: fence replay reservations across expiry and takeover.
--
-- Existing rows from 0002 are upgraded additively. A reserved legacy row gets
-- a synthetic opaque token; committed rows retain no active lease token.

ALTER TABLE webhook_replay_events
  ADD COLUMN IF NOT EXISTS lease_generation bigint NOT NULL DEFAULT 0;

ALTER TABLE webhook_replay_events
  ADD COLUMN IF NOT EXISTS lease_token text;

UPDATE webhook_replay_events
SET lease_generation = 1,
    lease_token = md5(event_key || ':' || clock_timestamp()::text || ':' || random()::text)
WHERE status = 'reserved';

ALTER TABLE webhook_replay_events
  ADD CONSTRAINT webhook_replay_events_lease_generation_check
  CHECK (lease_generation >= 0);

ALTER TABLE webhook_replay_events
  ADD CONSTRAINT webhook_replay_events_fencing_check
  CHECK (
    (status = 'reserved' AND lease_generation > 0 AND lease_token IS NOT NULL AND btrim(lease_token) <> '')
    OR
    (status = 'committed' AND lease_token IS NULL)
  );

COMMENT ON COLUMN webhook_replay_events.lease_generation IS
  'Monotonic fencing generation for a replay reservation takeover.';
COMMENT ON COLUMN webhook_replay_events.lease_token IS
  'Opaque fencing token; populated only while the row is reserved.';
