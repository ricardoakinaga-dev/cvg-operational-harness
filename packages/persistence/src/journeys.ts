import {
  CorrelationIdSchema,
  createDomainId,
  DomainError,
  redactSensitiveText
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import type { InMemoryDatabase } from './db.ts'
import { AuditRepository } from './repositories/audit-repository.ts'
import { TaskRepository } from './repositories/task-repository.ts'
import type {
  AppointmentDraftRecord,
  OwnerDraftRecord,
  PatientDraftRecord,
  TaskRecord
} from './schema.ts'

export const SYNTHETIC_SCHEDULE_VERSION = 'synthetic-schedule-v1'
export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

export interface JourneyCandidate {
  id: string
  displayName: string
  kind: 'owner' | 'patient'
  ownerId?: string
}

export interface JourneySlot {
  id: string
  startsAt: string
  sourceVersion: string
}

export interface JourneyRepositoryOptions {
  clock?: () => Date
  draftTtlMs?: number
}

/**
 * Actor and correlation carried by journey audit events. `System` is an
 * explicit repository/execution identity, never a simulated human operator.
 */
export interface JourneyAuditContext {
  actorType: 'Operator' | 'System'
  actorId: string
  correlationId?: string
}

export interface OwnerDraftInput {
  tenantId: TenantId
  phone?: string | null
  name?: string | null
  conversationId?: string | null
  sessionId?: string | null
  idempotencyKey: string
  auditContext?: JourneyAuditContext
}

export interface PatientDraftInput {
  tenantId: TenantId
  ownerDraftId?: string | null
  ownerCandidateId?: string | null
  name?: string | null
  species?: string | null
  conversationId?: string | null
  sessionId?: string | null
  idempotencyKey: string
  auditContext?: JourneyAuditContext
}

export interface AppointmentDraftInput {
  tenantId: TenantId
  patientDraftId: string
  slot: string
  conversationId?: string | null
  sessionId?: string | null
  idempotencyKey: string
  auditContext?: JourneyAuditContext
}

export interface SearchPatientInput {
  tenantId: TenantId
  ownerDraftId?: string | null
  ownerCandidateId?: string | null
  name?: unknown
}

export interface LinkPatientInput {
  tenantId: TenantId
  patientDraftId: string
  candidateId: string
  auditContext?: JourneyAuditContext
}

export type CreateJourneyTaskInput = {
  tenantId: TenantId
  sessionId: string
  title: string
  description: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  idempotencyKey: string
  auditContext?: JourneyAuditContext
}

export interface RecordHandoffInput {
  tenantId: TenantId
  conversationId?: string | null
  sessionId?: string | null
  intent: string
  risk: string
  pendingItems?: string[]
  nextStep: string
  auditContext?: JourneyAuditContext
}

export type MaybePromise<T> = T | Promise<T>

/**
 * Port shared by the in-memory and PostgreSQL journey repositories. The memory
 * implementation answers synchronously; the PostgreSQL one answers with
 * promises. Callers await either shape.
 */
export interface JourneyRepositoryPort {
  searchOwnerByPhone(
    rawTenantId: TenantId,
    rawPhone: unknown
  ): MaybePromise<JourneyCandidate[]>
  createOwnerDraft(input: OwnerDraftInput): MaybePromise<OwnerDraftRecord>
  listOwnerDrafts(rawTenantId: TenantId): MaybePromise<OwnerDraftRecord[]>
  findOwnerDraft(
    rawTenantId: TenantId,
    id: string
  ): MaybePromise<OwnerDraftRecord | null>
  searchPatient(input: SearchPatientInput): MaybePromise<JourneyCandidate[]>
  listPatientDrafts(rawTenantId: TenantId): MaybePromise<PatientDraftRecord[]>
  findPatientDraft(
    rawTenantId: TenantId,
    id: string
  ): MaybePromise<PatientDraftRecord | null>
  createPatientDraft(input: PatientDraftInput): MaybePromise<PatientDraftRecord>
  linkPatient(input: LinkPatientInput): MaybePromise<PatientDraftRecord>
  findAvailableSlots(
    rawTenantId: TenantId,
    limit?: number
  ): MaybePromise<JourneySlot[]>
  createAppointmentDraft(
    input: AppointmentDraftInput
  ): MaybePromise<AppointmentDraftRecord>
  listAppointmentDrafts(
    rawTenantId: TenantId
  ): MaybePromise<AppointmentDraftRecord[]>
  createJourneyTask(input: CreateJourneyTaskInput): MaybePromise<TaskRecord>
  recordHandoff(input: RecordHandoffInput): MaybePromise<void>
}

/**
 * Controlled persistence for the tutor/pet/agenda journeys.
 *
 * The catalog deliberately contains synthetic fixtures only. It is useful in
 * Test Lab and local development because it proves restart, ambiguity and
 * tenant boundaries without pretending to be a clinical or scheduling system.
 */
export class JourneyRepository implements JourneyRepositoryPort {
  private readonly audit: AuditRepository
  private readonly tasks: TaskRepository
  private readonly clock: () => Date
  private readonly draftTtlMs: number

  constructor(
    private readonly db: InMemoryDatabase,
    options: JourneyRepositoryOptions = {}
  ) {
    this.audit = new AuditRepository(db)
    this.tasks = new TaskRepository(db)
    this.clock = options.clock ?? (() => new Date())
    this.draftTtlMs = options.draftTtlMs ?? DEFAULT_DRAFT_TTL_MS
    if (!Number.isSafeInteger(this.draftTtlMs) || this.draftTtlMs < 1_000) {
      throw new DomainError('validation_failed', 'Draft TTL is invalid')
    }
    this.db.state.ownerDrafts ??= []
    this.db.state.patientDrafts ??= []
    this.db.state.appointmentDrafts ??= []
  }

  searchOwnerByPhone(
    rawTenantId: TenantId,
    rawPhone: unknown
  ): JourneyCandidate[] {
    const tenantId = this.tenant(rawTenantId)
    const phone = normalizePhone(rawPhone)
    const matches = syntheticOwners(tenantId).filter(
      (owner) => owner.phone === phone
    )
    const drafts = this.activeOwnerDrafts(tenantId).filter(
      (draft) => draft.phone === phone
    )
    const byId = new Map<string, JourneyCandidate>()
    for (const owner of matches) byId.set(owner.id, owner.candidate)
    for (const draft of drafts) {
      for (const candidateId of draft.candidateIds) {
        const candidate = syntheticOwners(tenantId).find(
          (owner) => owner.id === candidateId
        )
        if (candidate) byId.set(candidate.id, candidate.candidate)
      }
    }
    return [...byId.values()].map(cloneCandidate)
  }

  createOwnerDraft(input: OwnerDraftInput): OwnerDraftRecord {
    const tenantId = this.tenant(input.tenantId)
    const context = this.resolveJourneyContext(
      tenantId,
      input.conversationId,
      input.sessionId
    )
    const idempotencyKey = boundedKey(input.idempotencyKey)
    const existing = this.db.state.ownerDrafts.find(
      (draft) =>
        draft.tenantId === tenantId && draft.idempotencyKey === idempotencyKey
    )
    if (existing) return this.expireOwnerDraft(existing)
    const now = this.now()
    const phone = input.phone == null ? null : normalizePhone(input.phone)
    const name =
      input.name == null ? null : boundedOptionalText(input.name, 'name')
    const candidates = phone ? this.searchOwnerByPhone(tenantId, phone) : []
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
    this.db.state.ownerDrafts = [...this.db.state.ownerDrafts, draft]
    this.appendJourneyAudit(
      tenantId,
      'owner_draft_created',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext
    )
    return cloneOwnerDraft(draft)
  }

  listOwnerDrafts(rawTenantId: TenantId): OwnerDraftRecord[] {
    const tenantId = this.tenant(rawTenantId)
    return this.db.state.ownerDrafts
      .filter((draft) => draft.tenantId === tenantId)
      .map((draft) => this.expireOwnerDraft(draft))
      .map(cloneOwnerDraft)
  }

  findOwnerDraft(rawTenantId: TenantId, id: string): OwnerDraftRecord | null {
    const tenantId = this.tenant(rawTenantId)
    const draft = this.db.state.ownerDrafts.find(
      (candidate) => candidate.id === id && candidate.tenantId === tenantId
    )
    return draft ? cloneOwnerDraft(this.expireOwnerDraft(draft)) : null
  }

  searchPatient(input: SearchPatientInput): JourneyCandidate[] {
    const tenantId = this.tenant(input.tenantId)
    const ownerDraft = input.ownerDraftId
      ? this.requireOwnerDraft(tenantId, input.ownerDraftId)
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

  listPatientDrafts(rawTenantId: TenantId): PatientDraftRecord[] {
    const tenantId = this.tenant(rawTenantId)
    return this.db.state.patientDrafts
      .filter((draft) => draft.tenantId === tenantId)
      .map((draft) => this.expirePatientDraft(draft))
      .map(clonePatientDraft)
  }

  findPatientDraft(
    rawTenantId: TenantId,
    id: string
  ): PatientDraftRecord | null {
    const tenantId = this.tenant(rawTenantId)
    const draft = this.db.state.patientDrafts.find(
      (candidate) => candidate.id === id && candidate.tenantId === tenantId
    )
    return draft ? clonePatientDraft(this.expirePatientDraft(draft)) : null
  }

  createPatientDraft(input: PatientDraftInput): PatientDraftRecord {
    const tenantId = this.tenant(input.tenantId)
    const ownerDraft = input.ownerDraftId
      ? this.requireOwnerDraft(tenantId, input.ownerDraftId)
      : null
    const context = this.resolveJourneyContext(
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
    const existing = this.db.state.patientDrafts.find(
      (draft) =>
        draft.tenantId === tenantId && draft.idempotencyKey === idempotencyKey
    )
    if (existing) return this.expirePatientDraft(existing)
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
    const candidates = this.searchPatient({
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
    this.db.state.patientDrafts = [...this.db.state.patientDrafts, draft]
    this.appendJourneyAudit(
      tenantId,
      'patient_draft_created',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext
    )
    return clonePatientDraft(draft)
  }

  linkPatient(input: LinkPatientInput): PatientDraftRecord {
    const tenantId = this.tenant(input.tenantId)
    const draft = this.requirePatientDraft(tenantId, input.patientDraftId)
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
    const updated: PatientDraftRecord = {
      ...draft,
      status: 'linked',
      updatedAt: now
    }
    this.db.state.patientDrafts = this.db.state.patientDrafts.map((item) =>
      item.id === draft.id ? updated : item
    )
    this.appendJourneyAudit(
      tenantId,
      'patient_linked',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext,
      {
        candidateId: input.candidateId
      }
    )
    return clonePatientDraft(updated)
  }

  findAvailableSlots(rawTenantId: TenantId, limit = 2): JourneySlot[] {
    return buildJourneySlots(this.tenant(rawTenantId), this.now(), limit)
  }

  createAppointmentDraft(input: AppointmentDraftInput): AppointmentDraftRecord {
    const tenantId = this.tenant(input.tenantId)
    const patientDraft = this.requirePatientDraft(
      tenantId,
      input.patientDraftId
    )
    const context = this.resolveJourneyContext(
      tenantId,
      input.conversationId,
      input.sessionId,
      {
        conversationId: patientDraft.conversationId,
        sessionId: patientDraft.sessionId
      }
    )
    const idempotencyKey = boundedKey(input.idempotencyKey)
    const existing = this.db.state.appointmentDrafts.find(
      (draft) =>
        draft.tenantId === tenantId && draft.idempotencyKey === idempotencyKey
    )
    if (existing) return this.expireAppointmentDraft(existing)
    if (patientDraft.status !== 'linked') {
      throw new DomainError(
        'invalid_action',
        'Patient must be linked before proposing a slot'
      )
    }
    const slot = this.findAvailableSlots(tenantId, 8).find(
      (candidate) =>
        candidate.startsAt === input.slot || candidate.id === input.slot
    )
    if (!slot)
      throw new DomainError('conflict', 'Slot is unavailable or expired')
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
    this.db.state.appointmentDrafts = [
      ...this.db.state.appointmentDrafts,
      draft
    ]
    this.appendJourneyAudit(
      tenantId,
      'appointment_draft_created',
      draft.id,
      draft.conversationId,
      draft.sessionId,
      input.auditContext
    )
    return cloneAppointmentDraft(draft)
  }

  listAppointmentDrafts(rawTenantId: TenantId): AppointmentDraftRecord[] {
    const tenantId = this.tenant(rawTenantId)
    return this.db.state.appointmentDrafts
      .filter((draft) => draft.tenantId === tenantId)
      .map((draft) => this.expireAppointmentDraft(draft))
      .map(cloneAppointmentDraft)
  }

  createJourneyTask(input: CreateJourneyTaskInput): TaskRecord {
    const tenantId = this.tenant(input.tenantId)
    const previousTasks = this.db.state.tasks
    const previousAudit = this.db.state.auditEvents
    const task = this.tasks.create(
      {
        sessionId: input.sessionId,
        title: boundedText(input.title, 'title'),
        description: boundedText(input.description, 'description'),
        priority: input.priority ?? 'medium',
        source: 'journey-r3',
        idempotencyKey: boundedKey(input.idempotencyKey)
      },
      tenantId
    )
    if (previousTasks.some((existing) => existing.id === task.id)) return task
    try {
      const context = this.resolveJourneyContext(
        tenantId,
        undefined,
        input.sessionId
      )
      this.appendJourneyAudit(
        tenantId,
        'journey_task_created',
        task.id,
        context.conversationId,
        context.sessionId,
        input.auditContext
      )
    } catch (error) {
      this.db.state.tasks = previousTasks
      this.db.state.auditEvents = previousAudit
      throw error
    }
    return task
  }

  recordHandoff(input: RecordHandoffInput): void {
    const tenantId = this.tenant(input.tenantId)
    const context = this.resolveJourneyContext(
      tenantId,
      input.conversationId,
      input.sessionId
    )
    this.appendJourneyAudit(
      tenantId,
      'journey_handoff',
      context.conversationId ?? context.sessionId ?? createDomainId('handoff'),
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
  }

  private expireOwnerDraft(draft: OwnerDraftRecord): OwnerDraftRecord {
    if (
      draft.status !== 'draft' ||
      draft.expiresAt.getTime() > this.now().getTime()
    )
      return draft
    const updated = {
      ...draft,
      status: 'expired' as const,
      updatedAt: this.now()
    }
    this.db.state.ownerDrafts = this.db.state.ownerDrafts.map((item) =>
      item.id === draft.id ? updated : item
    )
    return updated
  }

  private expirePatientDraft(draft: PatientDraftRecord): PatientDraftRecord {
    if (
      draft.status !== 'draft' ||
      draft.expiresAt.getTime() > this.now().getTime()
    )
      return draft
    const updated = {
      ...draft,
      status: 'expired' as const,
      updatedAt: this.now()
    }
    this.db.state.patientDrafts = this.db.state.patientDrafts.map((item) =>
      item.id === draft.id ? updated : item
    )
    return updated
  }

  private expireAppointmentDraft(
    draft: AppointmentDraftRecord
  ): AppointmentDraftRecord {
    if (
      draft.status === 'expired' ||
      draft.status === 'cancelled' ||
      draft.expiresAt.getTime() > this.now().getTime()
    )
      return draft
    const updated = {
      ...draft,
      status: 'expired' as const,
      updatedAt: this.now()
    }
    this.db.state.appointmentDrafts = this.db.state.appointmentDrafts.map(
      (item) => (item.id === draft.id ? updated : item)
    )
    return updated
  }

  private activeOwnerDrafts(tenantId: TenantId): OwnerDraftRecord[] {
    return this.db.state.ownerDrafts
      .filter((draft) => draft.tenantId === tenantId)
      .map((draft) => this.expireOwnerDraft(draft))
      .filter((draft) => draft.status === 'draft' || draft.status === 'linked')
  }

  private requireOwnerDraft(tenantId: TenantId, id: string): OwnerDraftRecord {
    const draft = this.db.state.ownerDrafts.find(
      (item) => item.id === id && item.tenantId === tenantId
    )
    if (!draft) throw new DomainError('not_found', 'Owner draft not found')
    const current = this.expireOwnerDraft(draft)
    if (current.status === 'expired')
      throw new DomainError('conflict', 'Owner draft expired')
    return current
  }

  private requirePatientDraft(
    tenantId: TenantId,
    id: string
  ): PatientDraftRecord {
    const draft = this.db.state.patientDrafts.find(
      (item) => item.id === id && item.tenantId === tenantId
    )
    if (!draft) throw new DomainError('not_found', 'Patient draft not found')
    const current = this.expirePatientDraft(draft)
    if (current.status === 'expired')
      throw new DomainError('conflict', 'Patient draft expired')
    return current
  }

  /**
   * Journey references are caller supplied identifiers, so validate their
   * tenant ownership before persisting them in a draft or audit trail.
   * A session may imply its conversation; an explicit pair must agree.
   */
  private resolveJourneyContext(
    tenantId: TenantId,
    rawConversationId?: string | null,
    rawSessionId?: string | null,
    inherited?: {
      conversationId: string | null
      sessionId: string | null
    }
  ): { conversationId: string | null; sessionId: string | null } {
    const conversationId = normalizeOptionalReference(
      rawConversationId ?? inherited?.conversationId,
      'conversationId'
    )
    const sessionId = normalizeOptionalReference(
      rawSessionId ?? inherited?.sessionId,
      'sessionId'
    )
    const conversation = conversationId
      ? this.db.state.conversations.find((item) => item.id === conversationId)
      : undefined
    if (conversation && conversation.tenantId !== tenantId) {
      throw new DomainError(
        'forbidden',
        'Journey conversation is outside the tenant scope'
      )
    }
    if (conversationId && !conversation) {
      throw new DomainError('invalid_action', 'Conversation not found')
    }
    const session = sessionId
      ? this.db.state.sessions.find((item) => item.id === sessionId)
      : undefined
    if (sessionId && !session) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    const sessionConversation = session
      ? this.db.state.conversations.find(
          (item) => item.id === session.conversationId
        )
      : undefined
    if (!sessionConversation || sessionConversation.tenantId !== tenantId) {
      if (session) {
        throw new DomainError(
          'forbidden',
          'Journey session is outside the tenant scope'
        )
      }
    }
    if (
      conversationId &&
      sessionConversation &&
      sessionConversation.id !== conversationId
    ) {
      throw new DomainError(
        'conflict',
        'Journey conversation and session do not match'
      )
    }
    return {
      conversationId: conversationId ?? sessionConversation?.id ?? null,
      sessionId: sessionId ?? null
    }
  }

  private appendJourneyAudit(
    tenantId: TenantId,
    action: string,
    resourceId: string,
    conversationId: string | null,
    sessionId: string | null,
    auditContext: JourneyAuditContext | undefined,
    extra: Record<string, unknown> = {}
  ): void {
    const audit = normalizeJourneyAuditContext(auditContext, resourceId)
    this.audit.append(
      {
        type: 'integration_event',
        actorType: audit.actorType,
        actorId: audit.actorId,
        correlationId: audit.correlationId,
        policyVersion: 'journey-r3',
        payload: {
          journey: action,
          resourceId,
          ...(conversationId ? { conversationId } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...extra
        }
      },
      tenantId
    )
  }

  private tenant(rawTenantId: TenantId): TenantId {
    return TenantIdSchema.parse(rawTenantId)
  }

  private now(): Date {
    const value = new Date(this.clock())
    if (!Number.isFinite(value.getTime()))
      throw new DomainError('validation_failed', 'Journey clock is invalid')
    return value
  }
}

function normalizePhone(raw: unknown): string {
  if (typeof raw !== 'string')
    throw new DomainError('validation_failed', 'Phone is invalid')
  const value = raw.replace(/\D/g, '')
  if (value.length < 8 || value.length > 15)
    throw new DomainError('validation_failed', 'Phone is invalid')
  return `+${value}`
}

function boundedKey(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    raw.trim().length < 8 ||
    raw.trim().length > 200
  ) {
    throw new DomainError('validation_failed', 'Idempotency key is invalid')
  }
  return raw.trim()
}

function boundedText(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 240) {
    throw new DomainError('validation_failed', `${field} is invalid`)
  }
  return redactSensitiveText(raw.trim())
}

function boundedOptionalText(raw: unknown, field: string): string | null {
  if (raw == null) return null
  return boundedText(raw, field)
}

function normalizeOptionalReference(
  raw: string | null | undefined,
  field: string
): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 160) {
    throw new DomainError('validation_failed', `${field} is invalid`)
  }
  return raw.trim()
}

export const SYSTEM_JOURNEY_ACTOR = 'system.journey-repository'

/**
 * Normalizes the caller-supplied audit context shared by the memory and
 * PostgreSQL repositories. Missing context records an explicit system actor;
 * it never fabricates a human operator.
 */
export function normalizeJourneyAuditContext(
  raw: JourneyAuditContext | undefined,
  resourceId: string
): {
  actorType: 'Operator' | 'System'
  actorId: string
  correlationId: string
} {
  if (!raw) {
    return {
      actorType: 'System',
      actorId: SYSTEM_JOURNEY_ACTOR,
      correlationId: `corr_${resourceId.slice(-36).padStart(36, '0')}`
    }
  }
  if (raw.actorType !== 'Operator' && raw.actorType !== 'System') {
    throw new DomainError('validation_failed', 'Audit actor type is invalid')
  }
  const actorId = boundedText(raw.actorId, 'actorId')
  const correlationId =
    raw.correlationId === undefined
      ? `corr_${resourceId.slice(-36).padStart(36, '0')}`
      : CorrelationIdSchema.parse(raw.correlationId)
  return { actorType: raw.actorType, actorId, correlationId }
}

/**
 * Deterministic synthetic slot generation shared by both repositories.
 * Slots are generated from the UTC calendar day, not the instant, so two
 * reads during one day return the same value for a selected slot.
 */
export function buildJourneySlots(
  rawTenantId: TenantId,
  now: Date,
  limit = 2
): JourneySlot[] {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new DomainError('validation_failed', 'Slot limit is invalid')
  }
  const scheduleDay = now.toISOString().slice(0, 10).replace(/\D/g, '')
  return Array.from({ length: limit }, (_, index) => {
    const startsAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + index + 1,
        10 + index * 4,
        0,
        0,
        0
      )
    ).toISOString()
    return {
      // Include the generated start time so an old slot identifier cannot
      // become valid again after the synthetic clock advances.
      id: `slot_${tenantId.slice(-8)}_${scheduleDay}_${index + 1}`,
      startsAt,
      sourceVersion: SYNTHETIC_SCHEDULE_VERSION
    }
  })
}

function syntheticOwners(tenantId: TenantId): Array<{
  id: string
  phone: string
  candidate: JourneyCandidate
}> {
  const suffix = tenantId.slice(-12)
  return [
    {
      id: `owner_fixture_${suffix}_1`,
      phone: '+5511999990001',
      candidate: {
        id: `owner_fixture_${suffix}_1`,
        displayName: 'Ana Ficticia',
        kind: 'owner'
      }
    },
    {
      id: `owner_fixture_${suffix}_2a`,
      phone: '+5511999990002',
      candidate: {
        id: `owner_fixture_${suffix}_2a`,
        displayName: 'Bruno Exemplo',
        kind: 'owner'
      }
    },
    {
      id: `owner_fixture_${suffix}_2b`,
      phone: '+5511999990002',
      candidate: {
        id: `owner_fixture_${suffix}_2b`,
        displayName: 'Bia Exemplo',
        kind: 'owner'
      }
    }
  ]
}

function syntheticPatients(tenantId: TenantId): Array<{
  id: string
  name: string
  ownerId: string
  candidate: JourneyCandidate
}> {
  const suffix = tenantId.slice(-12)
  const owner = syntheticOwners(tenantId)[0]!.id
  return [
    {
      id: `patient_fixture_${suffix}_1`,
      name: 'Bolt Ficticio',
      ownerId: owner,
      candidate: {
        id: `patient_fixture_${suffix}_1`,
        displayName: 'Bolt Ficticio',
        kind: 'patient',
        ownerId: owner
      }
    },
    {
      id: `patient_fixture_${suffix}_2`,
      name: 'Luna Exemplo',
      ownerId: owner,
      candidate: {
        id: `patient_fixture_${suffix}_2`,
        displayName: 'Luna Exemplo',
        kind: 'patient',
        ownerId: owner
      }
    }
  ]
}

function cloneCandidate(candidate: JourneyCandidate): JourneyCandidate {
  return { ...candidate }
}

function cloneOwnerDraft(draft: OwnerDraftRecord): OwnerDraftRecord {
  return {
    ...draft,
    candidateIds: [...draft.candidateIds],
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt),
    expiresAt: new Date(draft.expiresAt)
  }
}

function clonePatientDraft(draft: PatientDraftRecord): PatientDraftRecord {
  return {
    ...draft,
    candidateIds: [...draft.candidateIds],
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt),
    expiresAt: new Date(draft.expiresAt)
  }
}

function cloneAppointmentDraft(
  draft: AppointmentDraftRecord
): AppointmentDraftRecord {
  return {
    ...draft,
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt),
    expiresAt: new Date(draft.expiresAt)
  }
}

// Pure helpers shared with the PostgreSQL adapter so candidate search, input
// bounds and clone semantics cannot drift between the two implementations.
export {
  boundedKey,
  boundedOptionalText,
  boundedText,
  cloneAppointmentDraft,
  cloneCandidate,
  cloneOwnerDraft,
  clonePatientDraft,
  normalizeOptionalReference,
  normalizePhone,
  syntheticOwners,
  syntheticPatients
}
