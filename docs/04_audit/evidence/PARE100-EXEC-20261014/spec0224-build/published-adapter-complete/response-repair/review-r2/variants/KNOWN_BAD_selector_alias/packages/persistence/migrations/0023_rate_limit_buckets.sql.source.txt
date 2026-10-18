-- AUD19-006 — distributed rate-limit buckets.
--
-- Fixed-window counters shared across processes and restarts. Rows expire by
-- `reset_at`; writers delete expired rows opportunistically and evict the
-- oldest rows beyond the application-side cardinality cap, so the table stays
-- bounded without a scheduled job.
--
-- This is a non-tenant operational table (keys are arbitrary client,
-- tenant or subject scopes), following the `webhook_replay_events`
-- precedent: no RLS. Deployment must explicitly grant SELECT/INSERT/UPDATE/
-- DELETE to the runtime role after migration; startup preflight rejects a
-- missing grant rather than falling through to request-time 429 responses.
-- Forward-fix / recovery: rows are ephemeral budget state. Rollback is
-- `DROP TABLE IF EXISTS rate_limit_buckets` with zero durable data loss.
BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  reset_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
  ON rate_limit_buckets (reset_at);

REVOKE ALL ON rate_limit_buckets FROM PUBLIC;

COMMIT;
