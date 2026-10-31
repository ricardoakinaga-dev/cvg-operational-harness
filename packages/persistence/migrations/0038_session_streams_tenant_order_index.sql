-- PAR-S05 / SPEC 0295 D1-b. Opt-in, after 0028 and 0034, in the same dedicated schema. Additive: no
-- row and no existing index changes. The session listing pages one tenant's streams newest first
-- by `writer_lock_id`; the table has a unique index on that column alone, which does not know the
-- tenant, so the planner may walk it backwards through every other tenant's streams (measured on
-- 120 000 streams: 60 000 rows removed by the filter for a large tenant with no recent stream).
-- This index is keyed by the tenant and by the SAME expression the listing orders by,
-- `writer_lock_id::bigint`, which the unique index cannot serve, so the only ordered path for the
-- listing is this one: a backward scan of at most the window (1000 entries) in every case.
DO $$
BEGIN
  IF to_regclass('session_streams') IS NULL OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'session_streams' AND column_name = 'writer_lock_id') THEN
    RAISE EXCEPTION 'session listing index requires 0028_session_events and 0034_session_writer_ownership in the same dedicated schema';
  END IF;
END $$;

CREATE INDEX session_streams_tenant_order_idx
  ON session_streams (tenant_id, ((writer_lock_id::bigint)));

COMMENT ON INDEX session_streams_tenant_order_idx IS
  'PAR-S05: serves ORDER BY writer_lock_id::bigint DESC within one tenant; the listing query must use that exact expression.';
