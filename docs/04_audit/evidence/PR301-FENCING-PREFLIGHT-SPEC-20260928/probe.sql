-- PostgreSQL 16, synthetic data only. This transaction leaves no objects.
-- Table and CHECK expressions mirror migrations 0002 and 0025.
BEGIN;
CREATE SCHEMA cvg_fencing_spec_probe;
SET LOCAL search_path TO cvg_fencing_spec_probe;
CREATE TABLE webhook_replay_events (
  event_key text PRIMARY KEY CHECK (btrim(event_key) <> ''),
  status text NOT NULL CHECK (status IN ('reserved', 'committed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lease_generation bigint NOT NULL DEFAULT 0,
  lease_token text,
  CONSTRAINT webhook_replay_events_lease_generation_check
    CHECK (lease_generation >= 0),
  CONSTRAINT webhook_replay_events_fencing_check
    CHECK (
      (status = 'reserved' AND lease_generation > 0
        AND lease_token IS NOT NULL AND btrim(lease_token) <> '')
      OR (status = 'committed' AND lease_token IS NULL)
    )
);
CREATE INDEX idx_webhook_replay_events_expires
  ON webhook_replay_events (expires_at);

\echo BASELINE_CONSTRAINTS
SELECT conname, conrelid::regclass, contype, convalidated,
       pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid = 'webhook_replay_events'::regclass
ORDER BY conname;

ALTER TABLE webhook_replay_events
  DROP CONSTRAINT webhook_replay_events_fencing_check;
CREATE TABLE decoy_fencing (
  x integer CONSTRAINT webhook_replay_events_fencing_check CHECK (true)
);
\echo DECOY_MATCHES_CURRENT_NAME_QUERY
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid, true)
FROM pg_constraint
WHERE connamespace = current_schema()::regnamespace
  AND conname = 'webhook_replay_events_fencing_check';
SELECT 'decoy_all_required_constraint_names=' ||
  (count(DISTINCT conname) = 5)::text
FROM pg_constraint
WHERE connamespace = current_schema()::regnamespace
  AND conname = ANY(ARRAY[
    'webhook_replay_events_pkey',
    'webhook_replay_events_event_key_check',
    'webhook_replay_events_status_check',
    'webhook_replay_events_lease_generation_check',
    'webhook_replay_events_fencing_check'
  ]);

DROP TABLE decoy_fencing;
ALTER TABLE webhook_replay_events
  ADD CONSTRAINT webhook_replay_events_fencing_check CHECK (true);
\echo PERMISSIVE_MATCHES_CURRENT_NAME_QUERY
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid, true)
FROM pg_constraint
WHERE connamespace = current_schema()::regnamespace
  AND conname = 'webhook_replay_events_fencing_check';
SELECT 'permissive_all_required_constraint_names=' ||
  (count(DISTINCT conname) = 5)::text
FROM pg_constraint
WHERE connamespace = current_schema()::regnamespace
  AND conname = ANY(ARRAY[
    'webhook_replay_events_pkey',
    'webhook_replay_events_event_key_check',
    'webhook_replay_events_status_check',
    'webhook_replay_events_lease_generation_check',
    'webhook_replay_events_fencing_check'
  ]);
ROLLBACK;
\echo CLEANUP_CHECK
SELECT count(*) AS residual_schema_count
FROM pg_namespace WHERE nspname = 'cvg_fencing_spec_probe';
