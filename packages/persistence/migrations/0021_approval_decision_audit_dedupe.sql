-- AUD19-003 — exactly-once guard for approval decision audit events.
--
-- A repeated `approval_decision` for the same (tenant, approvalId, decision)
-- must converge instead of duplicating, so route retries after a crash
-- between execution resume and audit stay consistent. The application layer
-- deduplicates with SELECT-then-INSERT; this partial unique index closes the
-- residual concurrent-append race by turning the loser into a
-- unique_violation that the repository converts into a convergence read.
--
-- Forward-fix / recovery: the index holds no data. Rollback is
-- `DROP INDEX IF EXISTS uq_audit_approval_decision` with zero data loss.
-- Legacy duplicates are not reconciled by this migration: they block the
-- upgrade so an operator can choose and record a deterministic repair.
-- `runPostgresMigrations` owns the transaction and advisory lock. Keeping the
-- migration body transaction-neutral makes the lock cover its schema marker.

DO $$
DECLARE
  duplicate_groups bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'audit_events'
      AND column_name = 'tenant_id'
  ) THEN
    RAISE EXCEPTION
      'AUD20-006: audit_events.tenant_id is required for approval decision dedupe';
  END IF;

  SELECT COUNT(*) INTO duplicate_groups
  FROM (
    SELECT 1
    FROM audit_events
    WHERE type = 'approval_decision'
    GROUP BY COALESCE(tenant_id, ''), payload->>'approvalId', payload->>'decision'
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'AUD20-006: legacy duplicate approval_decision key groups prevent unique index creation (% groups)',
      duplicate_groups
      USING ERRCODE = '23505';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_approval_decision
    ON audit_events (
      COALESCE(tenant_id, ''),
      (payload->>'approvalId'),
      (payload->>'decision')
    )
    WHERE type = 'approval_decision';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS i
    INNER JOIN pg_class AS index_relation ON index_relation.oid = i.indexrelid
    INNER JOIN pg_class AS table_relation ON table_relation.oid = i.indrelid
    INNER JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = current_schema()
      AND index_relation.relname = 'uq_audit_approval_decision'
      AND table_relation.relname = 'audit_events'
      AND table_relation.relnamespace = index_namespace.oid
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indnkeyatts = 3
      AND i.indnatts = 3
      AND pg_get_expr(i.indexprs, i.indrelid) LIKE
        'COALESCE(tenant_id, %), (payload ->> ''approvalId''%), (payload ->> ''decision''%)'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE
        '(type = ''approval_decision''%)'
  ) THEN
    RAISE EXCEPTION
      'AUD20-006: uq_audit_approval_decision has an invalid or incompatible definition';
  END IF;
END $$;
