-- REM-0539 R6: remove raw legacy outbox payloads and effect results.
--
-- 0010 is immutable after application. This additive migration replaces data
-- written before the R6 sanitization boundary with correlation-safe markers.
-- New application writes are sanitized in TypeScript before INSERT.
--
-- Legacy rows without a tenant or controlled routing identity are explicitly
-- quarantined before redaction. A pending event must never remain eligible if
-- the worker can no longer reconstruct its runtime context.

-- 0010 installs FORCE RLS and a strict NOT VALID tenant check. Temporarily
-- remove both while this migration classifies legacy rows, including null
-- tenant rows that must remain addressable only to quarantine tooling.
ALTER TABLE outbox_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_effects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_attempts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_quarantine NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events NO FORCE ROW LEVEL SECURITY;

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS payload_protection_version text;

ALTER TABLE outbox_effects
  ADD COLUMN IF NOT EXISTS result_protection_version text;

ALTER TABLE outbox_events
  DROP CONSTRAINT IF EXISTS outbox_events_tenant_id_not_null,
  DROP CONSTRAINT IF EXISTS outbox_events_tenant_scope_check,
  DROP CONSTRAINT IF EXISTS outbox_events_status_check,
  DROP CONSTRAINT IF EXISTS outbox_events_attempts_check,
  DROP CONSTRAINT IF EXISTS outbox_events_processing_lease_check,
  DROP CONSTRAINT IF EXISTS outbox_events_failed_available_check,
  DROP CONSTRAINT IF EXISTS outbox_events_dead_letter_check;

-- A quarantined legacy row may retain a null tenant for forensic ownership
-- review, but no new runtime row may use that state. The check is NOT VALID so
-- existing quarantined rows are retained without weakening future writes.
ALTER TABLE outbox_events
  ALTER COLUMN tenant_id DROP NOT NULL;

-- Normalize states before re-installing the NOT VALID durable checks. This
-- also makes the following payload UPDATE safe for databases containing
-- partially-written legacy rows.
UPDATE outbox_events AS event
SET status = 'dead_letter',
    attempts = GREATEST(COALESCE(event.attempts, 0), 1),
    last_error = 'legacy_outbox_invalid_state',
    available_at = COALESCE(event.available_at, event.created_at, now()),
    lease_owner = NULL,
    lease_until = NULL,
    dead_lettered_at = COALESCE(event.dead_lettered_at, now())
WHERE event.status NOT IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')
   OR (event.status = 'processing'
       AND (event.lease_owner IS NULL OR event.lease_until IS NULL))
   OR (event.status = 'failed' AND event.available_at IS NULL)
   OR (event.status = 'dead_letter'
       AND (COALESCE(event.attempts, 0) <= 0
            OR event.last_error IS NULL
            OR event.dead_lettered_at IS NULL));

UPDATE outbox_events
SET attempts = GREATEST(
      COALESCE(attempts, 0),
      CASE WHEN status = 'dead_letter' THEN 1 ELSE 0 END
    ),
    available_at = COALESCE(available_at, created_at, now()),
    tenant_isolation_quarantined = COALESCE(tenant_isolation_quarantined, false);

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter'))
  NOT VALID,
  ADD CONSTRAINT outbox_events_attempts_check
  CHECK (attempts >= 0)
  NOT VALID,
  ADD CONSTRAINT outbox_events_processing_lease_check
  CHECK (
    status <> 'processing'
    OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL)
  )
  NOT VALID,
  ADD CONSTRAINT outbox_events_failed_available_check
  CHECK (status <> 'failed' OR available_at IS NOT NULL)
  NOT VALID,
  ADD CONSTRAINT outbox_events_dead_letter_check
  CHECK (
    status <> 'dead_letter'
    OR (attempts > 0 AND last_error IS NOT NULL AND dead_lettered_at IS NOT NULL)
  )
  NOT VALID,
  ADD CONSTRAINT outbox_events_tenant_id_not_null
  CHECK (tenant_id IS NOT NULL OR tenant_isolation_quarantined = true)
  NOT VALID;

INSERT INTO outbox_quarantine (event_id, tenant_id, reason)
SELECT id, tenant_id, 'legacy_outbox_missing_tenant'
FROM outbox_events
WHERE tenant_id IS NULL
ON CONFLICT (event_id, reason) DO NOTHING;

INSERT INTO outbox_quarantine (event_id, tenant_id, reason)
SELECT id, tenant_id, 'legacy_inbound_missing_runtime_identifiers'
FROM outbox_events
WHERE type = 'inbound.process'
  AND (
    conversation_id IS NULL
    OR session_id IS NULL
    OR inbound_message_id IS NULL
  )
ON CONFLICT (event_id, reason) DO NOTHING;

INSERT INTO outbox_quarantine (event_id, tenant_id, reason)
SELECT id, tenant_id, 'legacy_outbox_event_type_not_controlled'
FROM outbox_events
WHERE type NOT IN ('inbound.process', 'message.outbound')
ON CONFLICT (event_id, reason) DO NOTHING;

UPDATE outbox_events AS event
SET tenant_isolation_quarantined = true,
    status = 'dead_letter',
    attempts = GREATEST(COALESCE(event.attempts, 0), 1),
    last_error = CASE
      WHEN event.tenant_id IS NULL THEN 'legacy_outbox_missing_tenant'
      WHEN event.type = 'inbound.process'
        AND (
          event.conversation_id IS NULL
          OR event.session_id IS NULL
          OR event.inbound_message_id IS NULL
        ) THEN 'legacy_inbound_missing_runtime_identifiers'
      WHEN event.type NOT IN ('inbound.process', 'message.outbound')
        THEN 'legacy_outbox_event_type_not_controlled'
      ELSE 'legacy_outbox_quarantined'
    END,
    available_at = COALESCE(event.available_at, event.created_at, now()),
    lease_owner = NULL,
    lease_until = NULL,
    dead_lettered_at = COALESCE(event.dead_lettered_at, now())
WHERE event.tenant_id IS NULL
   OR (
     event.type = 'inbound.process'
     AND (
       event.conversation_id IS NULL
       OR event.session_id IS NULL
       OR event.inbound_message_id IS NULL
     )
   )
   OR event.type NOT IN ('inbound.process', 'message.outbound');

-- Keep only stable routing metadata. In particular, never copy body, sender,
-- provider identifiers, free text, or an old arbitrary payload forward.
UPDATE outbox_events
SET payload = jsonb_build_object(
      'redacted', true,
      'legacyEventId', id,
      'eventType', type,
      'tenantId', tenant_id,
      'conversationId', conversation_id,
      'sessionId', session_id,
      'agentId', agent_id,
      'agentVersionId', agent_version_id,
      'inboundMessageId', inbound_message_id,
      'policy', 'outbox-r6'
    ),
    payload_protection_version = 'outbox-r6'
WHERE payload_protection_version IS DISTINCT FROM 'outbox-r6';

UPDATE outbox_effects
SET result = jsonb_build_object(
      'redacted', true,
      'policy', 'outbox-r6'
    ),
    result_protection_version = 'outbox-r6'
WHERE result_protection_version IS DISTINCT FROM 'outbox-r6';

-- Error columns are not an evidence channel. Replace legacy free-form
-- messages with fixed migration codes, including claim-attempt history.
UPDATE outbox_events
SET last_error = CASE
  WHEN last_error IS NULL THEN NULL
  WHEN last_error IN (
    'legacy_outbox_missing_tenant',
    'legacy_inbound_missing_runtime_identifiers',
    'legacy_outbox_event_type_not_controlled',
    'legacy_outbox_quarantined',
    'legacy_processed_without_effect_journal',
    'legacy_failed_without_retry_time'
  ) THEN last_error
  ELSE 'legacy_error_redacted'
END;

UPDATE outbox_attempts
SET error = 'legacy_error_redacted'
WHERE error IS NOT NULL;

-- 0010 may already have emitted a legacy terminalization audit. Remove its
-- free-form reason while retaining the event/status/action correlation.
UPDATE audit_events
SET payload = jsonb_build_object(
      'eventId', payload->>'eventId',
      'status', payload->>'status',
      'action', payload->>'action',
      'reason', 'legacy_error_redacted'
    )
WHERE payload->>'action' = 'legacy_terminalization';

COMMENT ON COLUMN outbox_events.payload_protection_version IS
  'Sanitization policy applied before worker exposure; outbox-r6 is correlation-safe.';

COMMENT ON COLUMN outbox_effects.result_protection_version IS
  'Sanitization policy applied before durable effect journaling; outbox-r6 is correlation-safe.';

ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_effects FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_quarantine FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
