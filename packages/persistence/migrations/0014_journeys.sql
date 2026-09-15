-- AAA-17: tenant-scoped journey drafts (tutor, patient, appointment draft).
--
-- Additive migration. It persists the controlled journey drafts that the
-- in-memory JourneyRepository exposes (owner/tutor, patient and appointment
-- promise) without touching any legacy table. Expiration marks rows as
-- 'expired' and never deletes evidence. The appointment table is draft-only:
-- confirmation_blocked is always true and there is no real confirmed state.

CREATE TABLE IF NOT EXISTS journey_owner_drafts (
  tenant_id text NOT NULL,
  id text NOT NULL,
  conversation_id text,
  session_id text,
  phone text,
  name text,
  candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(candidate_ids) = 'array'),
  status text NOT NULL CHECK (status IN ('draft', 'linked', 'expired')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id),
  FOREIGN KEY (tenant_id, session_id)
    REFERENCES sessions(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS journey_patient_drafts (
  tenant_id text NOT NULL,
  id text NOT NULL,
  owner_draft_id text,
  owner_candidate_id text,
  conversation_id text,
  session_id text,
  name text,
  species text,
  candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(candidate_ids) = 'array'),
  status text NOT NULL CHECK (status IN ('draft', 'linked', 'expired')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, owner_draft_id)
    REFERENCES journey_owner_drafts(tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id),
  FOREIGN KEY (tenant_id, session_id)
    REFERENCES sessions(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS journey_appointment_drafts (
  tenant_id text NOT NULL,
  id text NOT NULL,
  patient_draft_id text NOT NULL,
  conversation_id text,
  session_id text,
  slot text NOT NULL,
  source_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'awaiting_approval', 'expired', 'cancelled')),
  confirmation_blocked boolean NOT NULL DEFAULT true
    CHECK (confirmation_blocked),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, patient_draft_id)
    REFERENCES journey_patient_drafts(tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id),
  FOREIGN KEY (tenant_id, session_id)
    REFERENCES sessions(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_journey_owner_drafts_tenant_status
  ON journey_owner_drafts (tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_journey_owner_drafts_tenant_phone
  ON journey_owner_drafts (tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journey_patient_drafts_tenant_status
  ON journey_patient_drafts (tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_journey_patient_drafts_tenant_owner
  ON journey_patient_drafts (tenant_id, owner_draft_id);
CREATE INDEX IF NOT EXISTS idx_journey_appointment_drafts_tenant_status
  ON journey_appointment_drafts (tenant_id, status, expires_at);

ALTER TABLE journey_owner_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_owner_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE journey_patient_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_patient_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE journey_appointment_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_appointment_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journey_owner_drafts_tenant_isolation
  ON journey_owner_drafts;
CREATE POLICY journey_owner_drafts_tenant_isolation
  ON journey_owner_drafts
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

DROP POLICY IF EXISTS journey_patient_drafts_tenant_isolation
  ON journey_patient_drafts;
CREATE POLICY journey_patient_drafts_tenant_isolation
  ON journey_patient_drafts
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

DROP POLICY IF EXISTS journey_appointment_drafts_tenant_isolation
  ON journey_appointment_drafts;
CREATE POLICY journey_appointment_drafts_tenant_isolation
  ON journey_appointment_drafts
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON journey_owner_drafts FROM PUBLIC;
REVOKE ALL ON journey_patient_drafts FROM PUBLIC;
REVOKE ALL ON journey_appointment_drafts FROM PUBLIC;

COMMENT ON TABLE journey_owner_drafts IS
  'Controlled tutor/owner journey drafts. Expiration marks status=expired in place; rows are never deleted.';
COMMENT ON TABLE journey_patient_drafts IS
  'Controlled patient journey drafts. Expiration marks status=expired in place; rows are never deleted.';
COMMENT ON TABLE journey_appointment_drafts IS
  'Draft-only appointment promise. confirmation_blocked is always true; there is no real confirmed state in this scope.';
COMMENT ON COLUMN journey_appointment_drafts.confirmation_blocked IS
  'Schema-level guarantee that this repository never performs a real appointment confirmation.';
