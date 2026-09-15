import {
  createDomainId,
  DomainError,
  sanitizeAuditEvidencePayload
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import type { QueryResultRow } from 'pg'
import {
  DEFAULT_DRAFT_TTL_MS,
  boundedKey,
  normalizeJourneyAuditContext,
  type JourneyAuditContext,
  boundedOptionalText,
  boundedText,
  buildJourneySlots,
  cloneAppointmentDraft,
  cloneCandidate,
  cloneOwnerDraft,
  clonePatientDraft,
  normalizeOptionalReference,
  normalizePhone,
  syntheticOwners,
  syntheticPatients,
  type AppointmentDraftInput,
  type CreateJourneyTaskInput,
  type JourneyCandidate,
  type JourneyRepositoryOptions,
  type JourneyRepositoryPort,
  type JourneySlot,
  type LinkPatientInput,
  type OwnerDraftInput,
  type PatientDraftInput,
  type RecordHandoffInput,
  type SearchPatientInput
} from './journeys.ts'
import { PostgresRuntimeRepository } from './postgres.ts'
import {
  withTenantTransaction,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'
import type {
  AppointmentDraftRecord,
  JourneyDraftStatus,
  OwnerDraftRecord,
  PatientDraftRecord,
  TaskRecord
} from './schema.ts'

interface OwnerDraftRow extends QueryResultRow {
  tenant_id: string
  id: string
  conversation_id: string | null
  session_id: string | null
  phone: string | null
  name: string | null
  candidate_ids: unknown
  status: JourneyDraftStatus
  idempotency_key: string
  created_at: Date
  updated_at: Date
  expires_at: Date
}

interface PatientDraftRow extends QueryResultRow {
  tenant_id: string
  id: string
  owner_draft_id: string | null
  owner_candidate_id: string | null
  conversation_id: string | null
  session_id: string | null
  name: string | null
  species: string | null
  candidate_ids: unknown
  status: JourneyDraftStatus
  idempotency_key: string
  created_at: Date
  updated_at: Date
  expires_at: Date
}

interface AppointmentDraftRow extends QueryResultRow {
  tenant_id: string
  id: string
  patient_draft_id: string
  conversation_id: string | null
  session_id: string | null
  slot: string
  source_version: string
  status: AppointmentDraftRecord['status']
  confirmation_blocked: boolean
  idempotency_key: string
  created_at: Date
  updated_at: Date
  expires_at: Date
}

const ownerDraftColumns = `
  tenant_id, id, conversation_id, session_id, phone, name, candidate_ids,
  status, idempotency_key, created_at, updated_at, expires_at`

const patientDraftColumns = `
  tenant_id, id, owner_draft_id, owner_candidate_id, conversation_id,
  session_id, name, species, candidate_ids, status, idempotency_key,
  created_at, updated_at, expires_at`

const appointmentDraftColumns = `
  tenant_id, id, patient_draft_id, conversation_id, session_id, slot,
  source_version, status, confirmation_blocked, idempotency_key,
  created_at, updated_at, expires_at`

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function mapOwnerDraftRow(row: OwnerDraftRow): OwnerDraftRecord {
  return {
    tenantId: row.tenant_id as TenantId,
    id: row.id,
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    phone: row.phone,
    name: row.name,
    candidateIds: stringArray(row.candidate_ids),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: new Date(row.expires_at)
  }
}

function mapPatientDraftRow(row: PatientDraftRow): PatientDraftRecord {
  return {
    tenantId: row.tenant_id as TenantId,
    id: row.id,
    ownerDraftId: row.owner_draft_id,
    ownerCandidateId: row.owner_candidate_id,
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    name: row.name,
    species: row.species,
    candidateIds: stringArray(row.candidate_ids),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: new Date(row.expires_at)
  }
}

function mapAppointmentDraftRow(
  row: AppointmentDraftRow
): AppointmentDraftRecord {
  return {
    tenantId: row.tenant_id as TenantId,
    id: row.id,
    patientDraftId: row.patient_draft_id,
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    slot: row.slot,
    sourceVersion: row.source_version,
    status: row.status,
    confirmationBlocked: true,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: new Date(row.expires_at)
  }
}

/**
 * Tenant-scoped PostgreSQL journey drafts.
 *
 * Every operation runs through a tenant-scoped context; mutations commit in a
 * short transaction with their audit event (`withTenantTransaction`), so RLS
 * and the row-level
 * predicates always see exactly one tenant. Drafts are never deleted: expiry
 * marks `status = 'expired'` and keeps the row as evidence. Appointment drafts
 * are draft-only (`confirmation_blocked = true`); no real confirmation state
 * exists.
 */
export class PostgresJourneyRepository implements JourneyRepositoryPort {
  private readonly clock: () => Date
  private readonly draftTtlMs: number

  constructor(
    private readonly pool: PostgresPoolLike,
    options: JourneyRepositoryOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.draftTtlMs = options.draftTtlMs ?? DEFAULT_DRAFT_TTL_MS
    if (!Number.isSafeInteger(this.draftTtlMs) || this.draftTtlMs < 1_000) {
      throw new DomainError('validation_failed', 'Draft TTL is invalid')
    }
  }

  searchOwnerByPhone(
    rawTenantId: TenantId,
    rawPhone: unknown
  ): Promise<JourneyCandidate[]> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return withTenantTransaction(this.pool, tenantId, (client) =>
      this.searchOwnerByPhoneScoped(client, tenantId, rawPhone)
    )
  }

  createOwnerDraft(input: OwnerDraftInput): Promise<OwnerDraftRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, (client) =>
      this.createOwnerDraftScoped(client, tenantId, input)
    )
  }

  listOwnerDrafts(rawTenantId: TenantId): Promise<OwnerDraftRecord[]> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await this.expireOwnerDraftsScoped(client, tenantId)
      const result = await client.query<OwnerDraftRow>(
        `SELECT ${ownerDraftColumns}
         FROM journey_owner_drafts
         WHERE tenant_id = $1
         ORDER BY created_at ASC, id ASC`,
        [tenantId]
      )
      return result.rows.map((row) => cloneOwnerDraft(mapOwnerDraftRow(row)))
    })
  }

  findOwnerDraft(
    rawTenantId: TenantId,
    id: string
  ): Promise<OwnerDraftRecord | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query<OwnerDraftRow>(
        `SELECT ${ownerDraftColumns}
         FROM journey_owner_drafts
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, id]
      )
      const row = result.rows[0]
      if (!row) return null
      return this.expireOwnerDraftRow(client, tenantId, row)
    })
  }

  searchPatient(input: SearchPatientInput): Promise<JourneyCandidate[]> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, (client) =>
      this.searchPatientScoped(client, tenantId, input)
    )
  }

  listPatientDrafts(rawTenantId: TenantId): Promise<PatientDraftRecord[]> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await this.expirePatientDraftsScoped(client, tenantId)
      const result = await client.query<PatientDraftRow>(
        `SELECT ${patientDraftColumns}
         FROM journey_patient_drafts
         WHERE tenant_id = $1
         ORDER BY created_at ASC, id ASC`,
        [tenantId]
      )
      return result.rows.map((row) =>
        clonePatientDraft(mapPatientDraftRow(row))
      )
    })
  }

  findPatientDraft(
    rawTenantId: TenantId,
    id: string
  ): Promise<PatientDraftRecord | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query<PatientDraftRow>(
        `SELECT ${patientDraftColumns}
         FROM journey_patient_drafts
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, id]
      )
      const row = result.rows[0]
      if (!row) return null
      return this.expirePatientDraftRow(client, tenantId, row)
    })
  }

  createPatientDraft(input: PatientDraftInput): Promise<PatientDraftRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, (client) =>
      this.createPatientDraftScoped(client, tenantId, input)
    )
  }

  linkPatient(input: LinkPatientInput): Promise<PatientDraftRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const draft = await this.requirePatientDraftScoped(
        client,
        tenantId,
        input.patientDraftId
      )
      if (draft.status !== 'draft') {
        throw new DomainError('conflict', 'Patient draft is not linkable')
      }
      if (
        draft.candidateIds.length !== 1 ||
        draft.candidateIds[0] !== input.candidateId
      ) {
        throw new DomainError(
          'conflict',
          'Patient candidate is ambiguous or invalid'
        )
      }
      const now = this.now()
      const updated = await client.query<PatientDraftRow>(
        `UPDATE journey_patient_drafts
         SET status = 'linked', updated_at = $3
         WHERE tenant_id = $1 AND id = $2 AND status = 'draft'
         RETURNING ${patientDraftColumns}`,
        [tenantId, draft.id, now]
      )
      const row = updated.rows[0]
      if (!row) {
        throw new DomainError('conflict', 'Patient draft is not linkable')
      }
      await this.appendJourneyAuditScoped(
        client,
        tenantId,
        'patient_linked',
        draft.id,
        draft.conversationId,
        draft.sessionId,
        input.auditContext,
        { candidateId: input.candidateId }
      )
      return clonePatientDraft(mapPatientDraftRow(row))
    })
  }

  findAvailableSlots(rawTenantId: TenantId, limit = 2): JourneySlot[] {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return buildJourneySlots(tenantId, this.now(), limit)
  }

  createAppointmentDraft(
    input: AppointmentDraftInput
  ): Promise<AppointmentDraftRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, (client) =>
      this.createAppointmentDraftScoped(client, tenantId, input)
    )
  }

  listAppointmentDrafts(
    rawTenantId: TenantId
  ): Promise<AppointmentDraftRecord[]> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await this.expireAppointmentDraftsScoped(client, tenantId)
      const result = await client.query<AppointmentDraftRow>(
        `SELECT ${appointmentDraftColumns}
         FROM journey_appointment_drafts
         WHERE tenant_id = $1
         ORDER BY created_at ASC, id ASC`,
        [tenantId]
      )
      return result.rows.map((row) =>
        cloneAppointmentDraft(mapAppointmentDraftRow(row))
      )
    })
  }

  createJourneyTask(input: CreateJourneyTaskInput): Promise<TaskRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, (client) =>
      new PostgresRuntimeRepository(client, {
        tenantIsolation: true,
        clock: this.clock
      }).createTask(
        {
          sessionId: input.sessionId,
          title: boundedText(input.title, 'title'),
          description: boundedText(input.description, 'description'),
          priority: input.priority ?? 'medium',
          source: 'journey-r3',
          idempotencyKey: boundedKey(input.idempotencyKey)
        },
        tenantId,
        async (task) => {
          const context = await this.resolveJourneyContextScoped(
            client,
            tenantId,
            undefined,
            input.sessionId
          )
          await this.appendJourneyAuditScoped(
            client,
            tenantId,
            'journey_task_created',
            task.id,
            context.conversationId,
            context.sessionId,
            input.auditContext
          )
        }
      )
    )
  }

  recordHandoff(input: RecordHandoffInput): Promise<void> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const context = await this.resolveJourneyContextScoped(
        client,
        tenantId,
        input.conversationId,
        input.sessionId
      )
      await this.appendJourneyAuditScoped(
        client,
        tenantId,
        'journey_handoff',
        context.conversationId ??
          context.sessionId ??
          createDomainId('handoff'),
        context.conversationId,
        context.sessionId,
        input.auditContext,
        {
          intent: boundedText(input.intent, 'intent'),
          risk: boundedText(input.risk, 'risk'),
          pendingCount: Math.min(input.pendingItems?.length ?? 0, 20),
          nextStep: boundedText(input.nextStep, 'nextStep')
        }
      )
    })
  }

  private async searchOwnerByPhoneScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    rawPhone: unknown
  ): Promise<JourneyCandidate[]> {
    const phone = normalizePhone(rawPhone)
    await this.expireOwnerDraftsScoped(client, tenantId)
    const drafts = await client.query<{ candidate_ids: unknown }>(
      `SELECT candidate_ids FROM journey_owner_drafts
       WHERE tenant_id = $1 AND phone = $2
         AND status IN ('draft', 'linked')`,
      [tenantId, phone]
    )
    const byId = new Map<string, JourneyCandidate>()
    for (const owner of syntheticOwners(tenantId)) {
      if (owner.phone === phone) byId.set(owner.id, owner.candidate)
    }
    for (const draft of drafts.rows) {
      for (const candidateId of stringArray(draft.candidate_ids)) {
        const candidate = syntheticOwners(tenantId).find(
          (owner) => owner.id === candidateId
        )
        if (candidate) byId.set(candidate.id, candidate.candidate)
      }
    }
    return [...byId.values()].map(cloneCandidate)
  }

  private async createOwnerDraftScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    input: OwnerDraftInput
  ): Promise<OwnerDraftRecord> {
    const context = await this.resolveJourneyContextScoped(
      client,
      tenantId,
      input.conversationId,
      input.sessionId
    )
    const idempotencyKey = boundedKey(input.idempotencyKey)
    const existing = await this.selectOwnerDraftByKey(
      client,
      tenantId,
      idempotencyKey
    )
    if (existing) return this.expireOwnerDraftRow(client, tenantId, existing)
    const now = this.now()
    const phone = input.phone == null ? null : normalizePhone(input.phone)
    const name =
      input.name == null ? null : boundedOptionalText(input.name, 'name')
    const candidates = phone
      ? await this.searchOwnerByPhoneScoped(client, tenantId, phone)
      : []
    const draft: OwnerDraftRecord = {
      tenantId,
      id: createDomainId('owner_draft'),
      conversationId: context.conversationId,
      sessionId: context.sessionId,
      phone,
      name,
      candidateIds: candidates.map((candidate) => candidate.id),
      status: 'draft',
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.draftTtlMs)
    }
    const inserted = await client.query<OwnerDraftRow>(
      `INSERT INTO journey_owner_drafts
         (tenant_id, id, conversation_id, session_id, phone, name,
          candidate_ids, status, idempotency_key, created_at, updated_at,
          expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING ${ownerDraftColumns}`,
      [
        tenantId,
        draft.id,
        draft.conversationId,
        draft.sessionId,
        draft.phone,
        draft.name,
        JSON.stringify(draft.candidateIds),
        draft.status,
        draft.idempotencyKey,
        draft.createdAt,
        draft.updatedAt,
        draft.expiresAt
      ]
    )
    if (!inserted.rows[0]) {
      const winner = await this.selectOwnerDraftByKey(
        client,
        tenantId,
        idempotencyKey
      )
      if (!winner) {
        throw new DomainError('conflict', 'Owner draft insert was not stored')
      }
      return this.expireOwnerDraftRow(client, tenantId, winner)
    }
    await this.appendJourneyAuditScoped(
      client,
      tenantId,
      'owner_draft_created',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext
    )
    return cloneOwnerDraft(draft)
  }

  private async searchPatientScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    input: SearchPatientInput
  ): Promise<JourneyCandidate[]> {
    const ownerDraft = input.ownerDraftId
      ? await this.requireOwnerDraftScoped(client, tenantId, input.ownerDraftId)
      : null
    const ownerCandidateId =
      input.ownerCandidateId ?? ownerDraft?.candidateIds[0] ?? null
    if (
      ownerDraft &&
      ownerDraft.candidateIds.length > 1 &&
      !input.ownerCandidateId
    ) {
      return []
    }
    const name =
      input.name == null
        ? null
        : boundedOptionalText(input.name, 'name')?.toLocaleLowerCase()
    return syntheticPatients(tenantId)
      .filter(
        (patient) => !ownerCandidateId || patient.ownerId === ownerCandidateId
      )
      .filter(
        (patient) => !name || patient.name.toLocaleLowerCase().includes(name)
      )
      .map((patient) => cloneCandidate(patient.candidate))
  }

  private async createPatientDraftScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    input: PatientDraftInput
  ): Promise<PatientDraftRecord> {
    const ownerDraft = input.ownerDraftId
      ? await this.requireOwnerDraftScoped(client, tenantId, input.ownerDraftId)
      : null
    const context = await this.resolveJourneyContextScoped(
      client,
      tenantId,
      input.conversationId,
      input.sessionId,
      ownerDraft
        ? {
            conversationId: ownerDraft.conversationId,
            sessionId: ownerDraft.sessionId
          }
        : undefined
    )
    const idempotencyKey = boundedKey(input.idempotencyKey)
    const existing = await this.selectPatientDraftByKey(
      client,
      tenantId,
      idempotencyKey
    )
    if (existing) return this.expirePatientDraftRow(client, tenantId, existing)
    const ownerCandidateId = input.ownerCandidateId ?? null
    if (
      ownerDraft &&
      ownerCandidateId &&
      !ownerDraft.candidateIds.includes(ownerCandidateId)
    ) {
      throw new DomainError(
        'invalid_action',
        'Owner candidate is not in the draft'
      )
    }
    if (ownerDraft && ownerDraft.candidateIds.length > 1 && !ownerCandidateId) {
      throw new DomainError('conflict', 'Owner identity is ambiguous')
    }
    const name =
      input.name == null ? null : boundedOptionalText(input.name, 'name')
    const species =
      input.species == null
        ? null
        : boundedOptionalText(input.species, 'species')
    const candidates = await this.searchPatientScoped(client, tenantId, {
      tenantId,
      ...(input.ownerDraftId ? { ownerDraftId: input.ownerDraftId } : {}),
      ...(ownerCandidateId ? { ownerCandidateId } : {}),
      ...(name ? { name } : {})
    })
    const now = this.now()
    const draft: PatientDraftRecord = {
      tenantId,
      id: createDomainId('patient_draft'),
      ownerDraftId: input.ownerDraftId ?? null,
      ownerCandidateId,
      conversationId: context.conversationId,
      sessionId: context.sessionId,
      name,
      species,
      candidateIds: candidates.map((candidate) => candidate.id),
      status: 'draft',
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.draftTtlMs)
    }
    const inserted = await client.query<PatientDraftRow>(
      `INSERT INTO journey_patient_drafts
         (tenant_id, id, owner_draft_id, owner_candidate_id, conversation_id,
          session_id, name, species, candidate_ids, status, idempotency_key,
          created_at, updated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING ${patientDraftColumns}`,
      [
        tenantId,
        draft.id,
        draft.ownerDraftId,
        draft.ownerCandidateId,
        draft.conversationId,
        draft.sessionId,
        draft.name,
        draft.species,
        JSON.stringify(draft.candidateIds),
        draft.status,
        draft.idempotencyKey,
        draft.createdAt,
        draft.updatedAt,
        draft.expiresAt
      ]
    )
    if (!inserted.rows[0]) {
      const winner = await this.selectPatientDraftByKey(
        client,
        tenantId,
        idempotencyKey
      )
      if (!winner) {
        throw new DomainError('conflict', 'Patient draft insert was not stored')
      }
      return this.expirePatientDraftRow(client, tenantId, winner)
    }
    await this.appendJourneyAuditScoped(
      client,
      tenantId,
      'patient_draft_created',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext
    )
    return clonePatientDraft(draft)
  }

  private async createAppointmentDraftScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    input: AppointmentDraftInput
  ): Promise<AppointmentDraftRecord> {
    const patientDraft = await this.requirePatientDraftScoped(
      client,
      tenantId,
      input.patientDraftId
    )
    const context = await this.resolveJourneyContextScoped(
      client,
      tenantId,
      input.conversationId,
      input.sessionId,
      {
        conversationId: patientDraft.conversationId,
        sessionId: patientDraft.sessionId
      }
    )
    const idempotencyKey = boundedKey(input.idempotencyKey)
    const existing = await this.selectAppointmentDraftByKey(
      client,
      tenantId,
      idempotencyKey
    )
    if (existing) {
      return this.expireAppointmentDraftRow(client, tenantId, existing)
    }
    if (patientDraft.status !== 'linked') {
      throw new DomainError(
        'invalid_action',
        'Patient must be linked before proposing a slot'
      )
    }
    const slot = buildJourneySlots(tenantId, this.now(), 8).find(
      (candidate) =>
        candidate.startsAt === input.slot || candidate.id === input.slot
    )
    if (!slot) {
      throw new DomainError('conflict', 'Slot is unavailable or expired')
    }
    const now = this.now()
    const draft: AppointmentDraftRecord = {
      tenantId,
      id: createDomainId('appointment_draft'),
      patientDraftId: patientDraft.id,
      conversationId: context.conversationId,
      sessionId: context.sessionId,
      slot: slot.startsAt,
      sourceVersion: slot.sourceVersion,
      status: 'awaiting_approval',
      confirmationBlocked: true,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.draftTtlMs)
    }
    const inserted = await client.query<AppointmentDraftRow>(
      `INSERT INTO journey_appointment_drafts
         (tenant_id, id, patient_draft_id, conversation_id, session_id, slot,
          source_version, status, confirmation_blocked, idempotency_key,
          created_at, updated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING ${appointmentDraftColumns}`,
      [
        tenantId,
        draft.id,
        draft.patientDraftId,
        draft.conversationId,
        draft.sessionId,
        draft.slot,
        draft.sourceVersion,
        draft.status,
        draft.idempotencyKey,
        draft.createdAt,
        draft.updatedAt,
        draft.expiresAt
      ]
    )
    if (!inserted.rows[0]) {
      const winner = await this.selectAppointmentDraftByKey(
        client,
        tenantId,
        idempotencyKey
      )
      if (!winner) {
        throw new DomainError(
          'conflict',
          'Appointment draft insert was not stored'
        )
      }
      return this.expireAppointmentDraftRow(client, tenantId, winner)
    }
    await this.appendJourneyAuditScoped(
      client,
      tenantId,
      'appointment_draft_created',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext
    )
    return cloneAppointmentDraft(draft)
  }

  private async expireOwnerDraftRow(
    client: PostgresPoolClient,
    tenantId: TenantId,
    row: OwnerDraftRow
  ): Promise<OwnerDraftRecord> {
    const draft = mapOwnerDraftRow(row)
    if (
      draft.status !== 'draft' ||
      draft.expiresAt.getTime() > this.now().getTime()
    ) {
      return cloneOwnerDraft(draft)
    }
    const now = this.now()
    const updated = await client.query<OwnerDraftRow>(
      `UPDATE journey_owner_drafts
       SET status = 'expired', updated_at = $3
       WHERE tenant_id = $1 AND id = $2 AND status = 'draft'
       RETURNING ${ownerDraftColumns}`,
      [tenantId, draft.id, now]
    )
    return cloneOwnerDraft(
      updated.rows[0]
        ? mapOwnerDraftRow(updated.rows[0])
        : { ...draft, status: 'expired', updatedAt: now }
    )
  }

  private async expirePatientDraftRow(
    client: PostgresPoolClient,
    tenantId: TenantId,
    row: PatientDraftRow
  ): Promise<PatientDraftRecord> {
    const draft = mapPatientDraftRow(row)
    if (
      draft.status !== 'draft' ||
      draft.expiresAt.getTime() > this.now().getTime()
    ) {
      return clonePatientDraft(draft)
    }
    const now = this.now()
    const updated = await client.query<PatientDraftRow>(
      `UPDATE journey_patient_drafts
       SET status = 'expired', updated_at = $3
       WHERE tenant_id = $1 AND id = $2 AND status = 'draft'
       RETURNING ${patientDraftColumns}`,
      [tenantId, draft.id, now]
    )
    return clonePatientDraft(
      updated.rows[0]
        ? mapPatientDraftRow(updated.rows[0])
        : { ...draft, status: 'expired', updatedAt: now }
    )
  }

  private async expireAppointmentDraftRow(
    client: PostgresPoolClient,
    tenantId: TenantId,
    row: AppointmentDraftRow
  ): Promise<AppointmentDraftRecord> {
    const draft = mapAppointmentDraftRow(row)
    if (
      draft.status === 'expired' ||
      draft.status === 'cancelled' ||
      draft.expiresAt.getTime() > this.now().getTime()
    ) {
      return cloneAppointmentDraft(draft)
    }
    const now = this.now()
    const updated = await client.query<AppointmentDraftRow>(
      `UPDATE journey_appointment_drafts
       SET status = 'expired', updated_at = $3
       WHERE tenant_id = $1 AND id = $2
         AND status NOT IN ('expired', 'cancelled')
       RETURNING ${appointmentDraftColumns}`,
      [tenantId, draft.id, now]
    )
    return cloneAppointmentDraft(
      updated.rows[0]
        ? mapAppointmentDraftRow(updated.rows[0])
        : { ...draft, status: 'expired', updatedAt: now }
    )
  }

  private async expireOwnerDraftsScoped(
    client: PostgresPoolClient,
    tenantId: TenantId
  ): Promise<void> {
    const now = this.now()
    await client.query(
      `UPDATE journey_owner_drafts
       SET status = 'expired', updated_at = $2
       WHERE tenant_id = $1 AND status = 'draft' AND expires_at <= $2`,
      [tenantId, now]
    )
  }

  private async expirePatientDraftsScoped(
    client: PostgresPoolClient,
    tenantId: TenantId
  ): Promise<void> {
    const now = this.now()
    await client.query(
      `UPDATE journey_patient_drafts
       SET status = 'expired', updated_at = $2
       WHERE tenant_id = $1 AND status = 'draft' AND expires_at <= $2`,
      [tenantId, now]
    )
  }

  private async expireAppointmentDraftsScoped(
    client: PostgresPoolClient,
    tenantId: TenantId
  ): Promise<void> {
    const now = this.now()
    await client.query(
      `UPDATE journey_appointment_drafts
       SET status = 'expired', updated_at = $2
       WHERE tenant_id = $1
         AND status NOT IN ('expired', 'cancelled')
         AND expires_at <= $2`,
      [tenantId, now]
    )
  }

  private async requireOwnerDraftScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    id: string
  ): Promise<OwnerDraftRecord> {
    const result = await client.query<OwnerDraftRow>(
      `SELECT ${ownerDraftColumns}
       FROM journey_owner_drafts
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, id]
    )
    const row = result.rows[0]
    if (!row) throw new DomainError('not_found', 'Owner draft not found')
    const current = await this.expireOwnerDraftRow(client, tenantId, row)
    if (current.status === 'expired') {
      throw new DomainError('conflict', 'Owner draft expired')
    }
    return current
  }

  private async requirePatientDraftScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    id: string
  ): Promise<PatientDraftRecord> {
    const result = await client.query<PatientDraftRow>(
      `SELECT ${patientDraftColumns}
       FROM journey_patient_drafts
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, id]
    )
    const row = result.rows[0]
    if (!row) throw new DomainError('not_found', 'Patient draft not found')
    const current = await this.expirePatientDraftRow(client, tenantId, row)
    if (current.status === 'expired') {
      throw new DomainError('conflict', 'Patient draft expired')
    }
    return current
  }

  /**
   * Journey references are caller supplied identifiers, so validate their
   * tenant ownership before persisting them in a draft or audit trail.
   * A session may imply its conversation; an explicit pair must agree.
   */
  private async resolveJourneyContextScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    rawConversationId?: string | null,
    rawSessionId?: string | null,
    inherited?: {
      conversationId: string | null
      sessionId: string | null
    }
  ): Promise<{ conversationId: string | null; sessionId: string | null }> {
    const conversationId = normalizeOptionalReference(
      rawConversationId ?? inherited?.conversationId,
      'conversationId'
    )
    const sessionId = normalizeOptionalReference(
      rawSessionId ?? inherited?.sessionId,
      'sessionId'
    )
    const conversation = conversationId
      ? await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM conversations WHERE id = $1 LIMIT 1`,
          [conversationId]
        )
      : null
    const conversationRow = conversation?.rows[0]
    if (conversationRow && conversationRow.tenant_id !== tenantId) {
      throw new DomainError(
        'forbidden',
        'Journey conversation is outside the tenant scope'
      )
    }
    if (conversationId && !conversationRow) {
      throw new DomainError('invalid_action', 'Conversation not found')
    }
    const session = sessionId
      ? await client.query<{ conversation_id: string }>(
          `SELECT conversation_id FROM sessions WHERE id = $1 LIMIT 1`,
          [sessionId]
        )
      : null
    const sessionRow = session?.rows[0]
    if (sessionId && !sessionRow) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    let sessionConversationId: string | null = null
    if (sessionRow) {
      sessionConversationId = sessionRow.conversation_id
      const sessionConversation = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM conversations WHERE id = $1 LIMIT 1`,
        [sessionConversationId]
      )
      if (sessionConversation.rows[0]?.tenant_id !== tenantId) {
        throw new DomainError(
          'forbidden',
          'Journey session is outside the tenant scope'
        )
      }
    }
    if (
      conversationId &&
      sessionConversationId &&
      sessionConversationId !== conversationId
    ) {
      throw new DomainError(
        'conflict',
        'Journey conversation and session do not match'
      )
    }
    return {
      conversationId: conversationId ?? sessionConversationId ?? null,
      sessionId: sessionId ?? null
    }
  }

  private async appendJourneyAuditScoped(
    client: PostgresPoolClient,
    tenantId: TenantId,
    action: string,
    resourceId: string,
    conversationId: string | null,
    sessionId: string | null,
    auditContext: JourneyAuditContext | undefined,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    const audit = normalizeJourneyAuditContext(auditContext, resourceId)
    const payload = sanitizeAuditEvidencePayload({
      journey: action,
      resourceId,
      ...(conversationId ? { conversationId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...extra
    }).payload
    await client.query(
      `INSERT INTO audit_events
         (tenant_id, id, type, actor_type, actor_id, correlation_id,
          policy_version, payload, created_at)
       VALUES
         ($1, $2, 'integration_event', $3, $4, $5,
          'journey-r3', $6::jsonb, $7)`,
      [
        tenantId,
        createDomainId('audit'),
        audit.actorType,
        audit.actorId,
        audit.correlationId,
        JSON.stringify(payload),
        new Date()
      ]
    )
  }

  private async selectOwnerDraftByKey(
    client: PostgresPoolClient,
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<OwnerDraftRow | null> {
    const result = await client.query<OwnerDraftRow>(
      `SELECT ${ownerDraftColumns}
       FROM journey_owner_drafts
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey]
    )
    return result.rows[0] ?? null
  }

  private async selectPatientDraftByKey(
    client: PostgresPoolClient,
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<PatientDraftRow | null> {
    const result = await client.query<PatientDraftRow>(
      `SELECT ${patientDraftColumns}
       FROM journey_patient_drafts
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey]
    )
    return result.rows[0] ?? null
  }

  private async selectAppointmentDraftByKey(
    client: PostgresPoolClient,
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<AppointmentDraftRow | null> {
    const result = await client.query<AppointmentDraftRow>(
      `SELECT ${appointmentDraftColumns}
       FROM journey_appointment_drafts
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey]
    )
    return result.rows[0] ?? null
  }

  private now(): Date {
    const value = new Date(this.clock())
    if (!Number.isFinite(value.getTime())) {
      throw new DomainError('validation_failed', 'Journey clock is invalid')
    }
    return value
  }
}
