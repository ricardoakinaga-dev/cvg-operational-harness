-- PROD-0373 — worker liveness and the kernel pause switch (barra 0373,
-- condições 9 e 10).
--
-- worker_heartbeats: each continuous worker upserts its row on a fixed
-- cadence and records when it last made progress, so a monitor outside the
-- worker can tell a stopped worker from an idle one.
-- kernel_pause_switches: the durable "off button" per tenant. While paused
-- the worker claims nothing and the kernel starts no new effect; pending
-- outbox items stay untouched until the switch is turned off.
--
-- Both tables are tenant-scoped under forced RLS like effect_journal.
-- Forward-fix / recovery: rows are operational state. Rollback is
-- `DROP TABLE IF EXISTS worker_heartbeats, kernel_pause_switches` with no
-- business data loss (an absent switch means "not paused").
BEGIN;

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  tenant_id text NOT NULL,
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 1 AND 200),
  started_at timestamptz NOT NULL,
  last_beat_at timestamptz NOT NULL,
  last_progress_at timestamptz,
  processed bigint NOT NULL DEFAULT 0 CHECK (processed >= 0),
  PRIMARY KEY (tenant_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_beat
  ON worker_heartbeats (tenant_id, last_beat_at DESC);

ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_heartbeats FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_heartbeats_tenant_isolation ON worker_heartbeats;
CREATE POLICY worker_heartbeats_tenant_isolation
  ON worker_heartbeats
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON worker_heartbeats FROM PUBLIC;

CREATE TABLE IF NOT EXISTS kernel_pause_switches (
  tenant_id text PRIMARY KEY,
  paused boolean NOT NULL,
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kernel_pause_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE kernel_pause_switches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kernel_pause_switches_tenant_isolation ON kernel_pause_switches;
CREATE POLICY kernel_pause_switches_tenant_isolation
  ON kernel_pause_switches
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON kernel_pause_switches FROM PUBLIC;

COMMIT;
