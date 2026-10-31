-- SPEC 0291 (PAR-S04 finding 3, receipt human-decisions-25): where an approval was asked.
--
-- Additive and nullable: records older than this migration keep a NULL origin and keep
-- executing, visibly (runtime.origin_unbound), until the tolerance is removed. The origin is
-- metadata of the binding, never authority and never part of the proposal hash. It is written
-- once, with the request, and no UPDATE may change it: not the store, not the runtime role,
-- not a person with a direct connection.

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS origin_conversation_id text;

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS origin_session_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'runtime_approvals_origin_check'
       AND conrelid = 'runtime_approvals'::regclass
  ) THEN
    ALTER TABLE runtime_approvals
      ADD CONSTRAINT runtime_approvals_origin_check CHECK (
        (origin_conversation_id IS NULL AND origin_session_id IS NULL)
        OR (
          origin_conversation_id IS NOT NULL
          AND char_length(origin_conversation_id) BETWEEN 1 AND 200
          AND (
            origin_session_id IS NULL
            OR char_length(origin_session_id) BETWEEN 1 AND 200
          )
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cvg_runtime_approvals_origin_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.origin_conversation_id IS DISTINCT FROM OLD.origin_conversation_id
     OR NEW.origin_session_id IS DISTINCT FROM OLD.origin_session_id THEN
    RAISE EXCEPTION 'runtime_approvals origin is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS runtime_approvals_origin_immutable ON runtime_approvals;
CREATE TRIGGER runtime_approvals_origin_immutable
  BEFORE UPDATE ON runtime_approvals
  FOR EACH ROW EXECUTE FUNCTION cvg_runtime_approvals_origin_immutable();

COMMENT ON COLUMN runtime_approvals.origin_conversation_id IS
  'SPEC 0291: conversation the approval was requested in; NULL for records older than the SPEC. Immutable.';
COMMENT ON COLUMN runtime_approvals.origin_session_id IS
  'SPEC 0291: session the approval was requested in, when the request carried one. Immutable.';
