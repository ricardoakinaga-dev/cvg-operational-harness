-- Durable, tenant-scoped capability approvals. This table is intentionally
-- separate from legacy approval_requests: it authorizes a capability binding
-- (including an input hash), not a human conversation workflow request.

-- HMAC webhook replay state is shared by API instances. It is deliberately
-- not tenant-scoped because signature verification happens before tenant
-- resolution; ownership is the signed event key and its bounded retention.
CREATE TABLE IF NOT EXISTS webhook_replay_events (
  event_key text PRIMARY KEY CHECK (btrim(event_key) <> ''),
  status text NOT NULL CHECK (status IN ('reserved', 'committed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_replay_events_expires
  ON webhook_replay_events (expires_at);

CREATE TABLE IF NOT EXISTS platform_capability_approvals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  version_id text NOT NULL,
  tool_name text NOT NULL CHECK (btrim(tool_name) <> ''),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  actor_id text NOT NULL CHECK (btrim(actor_id) <> ''),
  nonce text NOT NULL CHECK (btrim(nonce) <> ''),
  issuer text NOT NULL CHECK (btrim(issuer) <> ''),
  expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('issued', 'consumed', 'revoked', 'expired')),
  consumed_at timestamptz,
  revoked_at timestamptz,
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  CONSTRAINT platform_capability_approvals_expiry_check
    CHECK (expires_at > issued_at),
  CONSTRAINT platform_capability_approvals_state_check
    CHECK (
      (status = 'issued' AND consumed_at IS NULL AND revoked_at IS NULL)
      OR (status = 'consumed' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
      OR (status = 'revoked' AND consumed_at IS NULL AND revoked_at IS NOT NULL)
      OR (status = 'expired' AND consumed_at IS NULL AND revoked_at IS NULL)
    ),
  CONSTRAINT platform_capability_approvals_tenant_nonce_key
    UNIQUE (tenant_id, nonce),
  CONSTRAINT platform_capability_approvals_tenant_agent_version_fk
    FOREIGN KEY (tenant_id, agent_id, version_id)
    REFERENCES platform_agent_versions (tenant_id, agent_id, id)
);

COMMENT ON TABLE platform_capability_approvals IS
  'Single-use capability approvals bound to tenant, agent/version, tool, input hash, actor and issuer.';

CREATE INDEX IF NOT EXISTS idx_platform_capability_approvals_tenant_status
  ON platform_capability_approvals (tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_capability_approvals_tenant_actor
  ON platform_capability_approvals (tenant_id, actor_id, issued_at DESC);

CREATE OR REPLACE FUNCTION cvg_capability_approval_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.agent_id IS DISTINCT FROM NEW.agent_id
     OR OLD.version_id IS DISTINCT FROM NEW.version_id
     OR OLD.tool_name IS DISTINCT FROM NEW.tool_name
     OR OLD.input_hash IS DISTINCT FROM NEW.input_hash
     OR OLD.actor_id IS DISTINCT FROM NEW.actor_id
     OR OLD.nonce IS DISTINCT FROM NEW.nonce
     OR OLD.issuer IS DISTINCT FROM NEW.issuer
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
     OR OLD.tenant_isolation_quarantined IS DISTINCT FROM NEW.tenant_isolation_quarantined
  THEN
    RAISE EXCEPTION 'Capability approval binding is immutable';
  END IF;

  IF OLD.status = NEW.status
     AND OLD.consumed_at IS NOT DISTINCT FROM NEW.consumed_at
     AND OLD.revoked_at IS NOT DISTINCT FROM NEW.revoked_at
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'issued' THEN
    RAISE EXCEPTION 'Capability approval state is terminal';
  END IF;

  IF NEW.status = 'consumed'
     AND NEW.consumed_at IS NOT NULL
     AND NEW.revoked_at IS NULL
  THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'revoked'
     AND NEW.consumed_at IS NULL
     AND NEW.revoked_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'expired'
     AND NEW.consumed_at IS NULL
     AND NEW.revoked_at IS NULL
  THEN
    IF OLD.expires_at > CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Capability approval cannot expire before expires_at';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Capability approval state transition is invalid';
END;
$$;

DROP TRIGGER IF EXISTS platform_capability_approvals_update_guard
  ON platform_capability_approvals;
CREATE TRIGGER platform_capability_approvals_update_guard
  BEFORE UPDATE ON platform_capability_approvals
  FOR EACH ROW
  EXECUTE FUNCTION cvg_capability_approval_update_guard();

ALTER TABLE platform_capability_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_capability_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_capability_approvals_tenant_isolation
  ON platform_capability_approvals;
CREATE POLICY platform_capability_approvals_tenant_isolation
  ON platform_capability_approvals
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );
