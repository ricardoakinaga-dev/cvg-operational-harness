-- SPEC 0225 (renumbered 0030 -> 0033 by note 0225b): additive expansion only.
-- Storage version 1 is closed to everyone: this migration activates nothing,
-- backfills nothing and creates no principal or grant. The migration runner
-- owns the transaction, the advisory lock and the checksum.
ALTER TABLE operational_effect_journal
  ADD COLUMN result_storage_version smallint NOT NULL DEFAULT 0,
  ADD COLUMN result_storage_payload jsonb;

ALTER TABLE operational_effect_journal
  ADD CONSTRAINT journal_result_storage_version
    CHECK (result_storage_version IN (0, 1)),
  ADD CONSTRAINT journal_result_storage_shape
    CHECK (
      CASE result_storage_version
        WHEN 0 THEN result_storage_payload IS NULL
        WHEN 1 THEN result IS NULL AND
          CASE WHEN state = 'CONFIRMED'
            THEN result_storage_payload IS NOT NULL AND error IS NULL
            ELSE result_storage_payload IS NULL
          END
        ELSE false
      END
    ),
  ADD CONSTRAINT journal_result_storage_envelope
    CHECK (
      result_storage_payload IS NULL OR
      CASE WHEN jsonb_typeof(result_storage_payload) = 'object' THEN
        COALESCE(
          octet_length(result_storage_payload::text) <= 1398616
          AND result_storage_payload ?& ARRAY['encoding','decodedBytes','decodedSha256','data']
          AND result_storage_payload - ARRAY['encoding','decodedBytes','decodedSha256','data'] = '{}'::jsonb
          AND result_storage_payload->'encoding' = '"base64"'::jsonb
          AND jsonb_typeof(result_storage_payload->'decodedBytes') = 'number'
          AND jsonb_typeof(result_storage_payload->'decodedSha256') = 'string'
          AND result_storage_payload->>'decodedSha256' ~ '^[0-9a-f]{64}$'
          AND jsonb_typeof(result_storage_payload->'data') = 'string'
          AND length(result_storage_payload->>'data') <= 1398104
          AND result_storage_payload->>'data' ~ '^[A-Za-z0-9+/]*={0,2}$'
          AND CASE WHEN result_storage_payload->>'decodedBytes' ~ '^[1-9][0-9]{0,6}$' THEN
            (result_storage_payload->>'decodedBytes')::integer BETWEEN 1 AND 1048576
            AND length(result_storage_payload->>'data') =
              4 * (((result_storage_payload->>'decodedBytes')::integer + 2) / 3)
          ELSE false END,
          false
        )
      ELSE false END
    );

-- Reads no table; pg_temp is last on principle so no temporary object can
-- shadow what the function resolves (the 0034 lesson).
CREATE FUNCTION cvg_journal_result_storage_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp
AS $cvg0033$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.result_storage_version <> 0 THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.result_storage_version IS DISTINCT FROM OLD.result_storage_version THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.result_storage_version <> 0 THEN
    RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$cvg0033$;
REVOKE ALL ON FUNCTION cvg_journal_result_storage_guard() FROM PUBLIC;
CREATE TRIGGER journal_result_storage_guard
  BEFORE INSERT OR UPDATE OR DELETE ON operational_effect_journal
  FOR EACH ROW EXECUTE FUNCTION cvg_journal_result_storage_guard();
