import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import { ConversationRepository } from '../repositories/conversation-repository.ts'
import {
  JourneyRepository,
  SYNTHETIC_SCHEDULE_VERSION,
  type JourneyRepositoryPort
} from '../journeys.ts'
import { PostgresJourneyRepository } from '../journeys-postgres.ts'
import { readPostgresMigrationSql, runPostgresMigrations } from '../postgres.ts'
import { withTenantContext } from '../tenant-scoped-postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL

const T0 = new Date('2026-09-05T12:00:00.000Z')
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

function makeTenant(): TenantId {
  return `tenant_${randomUUID()}` as TenantId
}

/**
 * Runs a repository call as a promise so synchronous throws (in-memory) and
 * rejections (PostgreSQL) are observed identically by `rejects` assertions.
 */
function attempt<T>(operation: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(operation)
}

interface SeededConversation {
  conversationId: string
  sessionId: string
}

interface JourneyAuditRow {
  actorType: string
  actorId: string
  correlationId: string
  payload: Record<string, unknown>
}

interface JourneyContractHarness {
  repository: JourneyRepositoryPort
  setNow(value: Date): void
  seedConversation(
    tenantId: TenantId,
    label: string
  ): Promise<SeededConversation>
  countDrafts(
    table: 'owner' | 'patient' | 'appointment',
    tenantId: TenantId
  ): Promise<number>
  latestJourneyAudit(
    tenantId: TenantId,
    action: string
  ): Promise<JourneyAuditRow | null>
}

interface JourneyContractBundle {
  harness: JourneyContractHarness
  tenantA: TenantId
  tenantB: TenantId
}

/**
 * Shared behavioural contract. The exact same assertions run against the
 * in-memory journey repository and the PostgreSQL one so a divergence between
 * the two implementations fails the parity suite.
 */
function journeyContractSuite(
  label: string,
  createBundle: () => Promise<JourneyContractBundle>
): void {
  describe(label, () => {
    let harness: JourneyContractHarness
    let tenantA: TenantId
    let tenantB: TenantId

    beforeEach(async () => {
      const bundle = await createBundle()
      harness = bundle.harness
      tenantA = bundle.tenantA
      tenantB = bundle.tenantB
    })

    it('creates, reloads and lists owner drafts with normalized candidates', async () => {
      harness.setNow(T0)
      const owner = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+55 (11) 99999-0001',
        name: 'Ana Ficticia',
        idempotencyKey: 'owner-normalized-1'
      })
      expect(owner).toMatchObject({
        tenantId: tenantA,
        status: 'draft',
        phone: '+5511999990001'
      })
      expect(owner.candidateIds).toHaveLength(1)

      const matches = await harness.repository.searchOwnerByPhone(
        tenantA,
        '+5511999990001'
      )
      expect(matches.map((candidate) => candidate.id)).toEqual(
        owner.candidateIds
      )

      const replay = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        name: 'Ana Ficticia',
        idempotencyKey: 'owner-normalized-1'
      })
      expect(replay.id).toBe(owner.id)
      expect(await harness.repository.listOwnerDrafts(tenantA)).toHaveLength(1)

      const ambiguous = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990002',
        idempotencyKey: 'owner-ambiguous-1'
      })
      expect(ambiguous.candidateIds).toHaveLength(2)
      await expect(
        attempt(() =>
          harness.repository.createPatientDraft({
            tenantId: tenantA,
            ownerDraftId: ambiguous.id,
            name: 'Luna',
            idempotencyKey: 'patient-ambiguous-1'
          })
        )
      ).rejects.toMatchObject({ code: 'conflict' })

      const patient = await harness.repository.createPatientDraft({
        tenantId: tenantA,
        ownerDraftId: ambiguous.id,
        ownerCandidateId: ambiguous.candidateIds[0] ?? null,
        name: 'Bolt',
        idempotencyKey: 'patient-explicit-1'
      })
      expect(patient).toMatchObject({
        status: 'draft',
        ownerCandidateId: ambiguous.candidateIds[0]
      })
    })

    it('records journey audit with the supplied actor and correlation', async () => {
      harness.setNow(T0)
      const correlationId = 'corr_00000000-0000-4000-8000-000000000901'
      const owner = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        idempotencyKey: 'audit-context-operator-1',
        auditContext: {
          actorType: 'Operator',
          actorId: 'operator.journey.audit',
          correlationId
        }
      })
      const operatorEvent = await harness.latestJourneyAudit(
        tenantA,
        'owner_draft_created'
      )
      expect(operatorEvent).toMatchObject({
        actorType: 'Operator',
        actorId: 'operator.journey.audit',
        correlationId
      })
      expect(operatorEvent?.payload).toMatchObject({ resourceId: owner.id })

      await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        idempotencyKey: 'audit-context-system-1'
      })
      const systemEvent = await harness.latestJourneyAudit(
        tenantA,
        'owner_draft_created'
      )
      expect(systemEvent).toMatchObject({
        actorType: 'System',
        actorId: 'system.journey-repository'
      })
      expect(systemEvent?.correlationId).toMatch(/^corr_/)
    })

    it('audits journey tasks once with trusted actor and session context', async () => {
      const seeded = await harness.seedConversation(tenantA, 'task-audit')
      const input = {
        tenantId: tenantA,
        sessionId: seeded.sessionId,
        title: 'Synthetic',
        description: 'Synthetic',
        idempotencyKey: 'task-audit',
        auditContext: {
          actorType: 'Operator' as const,
          actorId: 'operator.synthetic',
          correlationId: 'corr_00000000-0000-4000-8000-000000000901'
        }
      }
      const task = await harness.repository.createJourneyTask(input)
      const event = await harness.latestJourneyAudit(
        tenantA,
        'journey_task_created'
      )
      expect(event).toMatchObject({
        ...input.auditContext,
        payload: {
          resourceId: task.id,
          conversationId: seeded.conversationId,
          sessionId: seeded.sessionId
        }
      })
      expect(
        (
          await harness.repository.createJourneyTask({
            ...input,
            auditContext: { ...input.auditContext, actorId: 'operator.replay' }
          })
        ).id
      ).toBe(task.id)
      expect(
        await harness.latestJourneyAudit(tenantA, 'journey_task_created')
      ).toEqual(event)
    })

    it('links a patient and creates an approval-blocked appointment draft', async () => {
      harness.setNow(T0)
      const seeded = await harness.seedConversation(tenantA, 'linked')
      const owner = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        conversationId: seeded.conversationId,
        sessionId: seeded.sessionId,
        idempotencyKey: 'owner-linked-1'
      })
      const patient = await harness.repository.createPatientDraft({
        tenantId: tenantA,
        ownerDraftId: owner.id,
        ownerCandidateId: owner.candidateIds[0] ?? null,
        name: 'Bolt',
        species: 'dog',
        conversationId: seeded.conversationId,
        sessionId: seeded.sessionId,
        idempotencyKey: 'patient-linked-1'
      })
      const candidateId = patient.candidateIds[0]!
      const linked = await harness.repository.linkPatient({
        tenantId: tenantA,
        patientDraftId: patient.id,
        candidateId
      })
      expect(linked.status).toBe('linked')
      await expect(
        attempt(() =>
          harness.repository.linkPatient({
            tenantId: tenantA,
            patientDraftId: patient.id,
            candidateId
          })
        )
      ).rejects.toMatchObject({ code: 'conflict' })

      const slots = await harness.repository.findAvailableSlots(tenantA)
      expect(slots).toHaveLength(2)
      expect(slots[0]).toMatchObject({
        sourceVersion: SYNTHETIC_SCHEDULE_VERSION
      })
      harness.setNow(new Date(T0.getTime() + 25_000))
      expect(await harness.repository.findAvailableSlots(tenantA)).toEqual(
        slots
      )

      const appointment = await harness.repository.createAppointmentDraft({
        tenantId: tenantA,
        patientDraftId: linked.id,
        slot: slots[0]!.id,
        conversationId: seeded.conversationId,
        sessionId: seeded.sessionId,
        idempotencyKey: 'appointment-linked-1'
      })
      expect(appointment).toMatchObject({
        status: 'awaiting_approval',
        confirmationBlocked: true,
        sourceVersion: SYNTHETIC_SCHEDULE_VERSION,
        slot: slots[0]!.startsAt
      })

      const replay = await harness.repository.createAppointmentDraft({
        tenantId: tenantA,
        patientDraftId: linked.id,
        slot: slots[0]!.id,
        idempotencyKey: 'appointment-linked-1'
      })
      expect(replay.id).toBe(appointment.id)
      expect(
        await harness.repository.listAppointmentDrafts(tenantA)
      ).toHaveLength(1)
    })

    it('expires drafts in place without deleting evidence or inventing confirmation', async () => {
      harness.setNow(T0)
      const owner = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        idempotencyKey: 'owner-expiry-1'
      })
      const patient = await harness.repository.createPatientDraft({
        tenantId: tenantA,
        ownerDraftId: owner.id,
        ownerCandidateId: owner.candidateIds[0] ?? null,
        name: 'Bolt',
        idempotencyKey: 'patient-expiry-1'
      })
      await harness.repository.linkPatient({
        tenantId: tenantA,
        patientDraftId: patient.id,
        candidateId: patient.candidateIds[0]!
      })
      const slots = await harness.repository.findAvailableSlots(tenantA)
      const appointment = await harness.repository.createAppointmentDraft({
        tenantId: tenantA,
        patientDraftId: patient.id,
        slot: slots[0]!.id,
        idempotencyKey: 'appointment-expiry-1'
      })

      harness.setNow(new Date(T0.getTime() + DRAFT_TTL_MS + 60_000))

      const expiredOwner = await harness.repository.findOwnerDraft(
        tenantA,
        owner.id
      )
      expect(expiredOwner).toMatchObject({ id: owner.id, status: 'expired' })
      expect(await harness.countDrafts('owner', tenantA)).toBe(1)

      const expiredPatient = await harness.repository.findPatientDraft(
        tenantA,
        patient.id
      )
      // Linked identities are not invalidated by the draft TTL: a real
      // confirmation never happened, so the link is kept as evidence.
      expect(expiredPatient).toMatchObject({
        id: patient.id,
        status: 'linked'
      })
      expect(await harness.countDrafts('patient', tenantA)).toBe(1)

      const expiredAppointments =
        await harness.repository.listAppointmentDrafts(tenantA)
      expect(expiredAppointments[0]).toMatchObject({
        id: appointment.id,
        status: 'expired',
        confirmationBlocked: true
      })
      expect(await harness.countDrafts('appointment', tenantA)).toBe(1)

      const replay = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        idempotencyKey: 'owner-expiry-1'
      })
      expect(replay).toMatchObject({ id: owner.id, status: 'expired' })
      expect(await harness.countDrafts('owner', tenantA)).toBe(1)

      const fresh = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        idempotencyKey: 'owner-expiry-2'
      })
      expect(fresh).toMatchObject({ status: 'draft' })

      await expect(
        attempt(() =>
          harness.repository.createAppointmentDraft({
            tenantId: tenantA,
            patientDraftId: patient.id,
            slot: slots[0]!.id,
            idempotencyKey: 'appointment-expired-slot-1'
          })
        )
      ).rejects.toMatchObject({ code: 'conflict' })
    })

    it('fails closed across tenant boundaries for reads and writes', async () => {
      harness.setNow(T0)
      const owner = await harness.repository.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        idempotencyKey: 'owner-scope-1'
      })
      const patient = await harness.repository.createPatientDraft({
        tenantId: tenantA,
        ownerDraftId: owner.id,
        ownerCandidateId: owner.candidateIds[0] ?? null,
        name: 'Bolt',
        idempotencyKey: 'patient-scope-1'
      })

      expect(
        await harness.repository.findOwnerDraft(tenantB, owner.id)
      ).toBeNull()
      expect(await harness.repository.listOwnerDrafts(tenantB)).toEqual([])
      expect(
        await harness.repository.findPatientDraft(tenantB, patient.id)
      ).toBeNull()
      expect(await harness.repository.listPatientDrafts(tenantB)).toEqual([])
      expect(await harness.repository.listAppointmentDrafts(tenantB)).toEqual(
        []
      )

      await expect(
        attempt(() =>
          harness.repository.linkPatient({
            tenantId: tenantB,
            patientDraftId: patient.id,
            candidateId: patient.candidateIds[0]!
          })
        )
      ).rejects.toMatchObject({ code: 'not_found' })
      await expect(
        attempt(() =>
          harness.repository.createPatientDraft({
            tenantId: tenantB,
            ownerDraftId: owner.id,
            ownerCandidateId: owner.candidateIds[0] ?? null,
            idempotencyKey: 'patient-cross-1'
          })
        )
      ).rejects.toMatchObject({ code: 'not_found' })
      await expect(
        attempt(() =>
          harness.repository.searchPatient({
            tenantId: tenantB,
            ownerDraftId: owner.id
          })
        )
      ).rejects.toMatchObject({ code: 'not_found' })
      await expect(
        attempt(() =>
          harness.repository.createAppointmentDraft({
            tenantId: tenantB,
            patientDraftId: patient.id,
            slot: 'missing-slot',
            idempotencyKey: 'appointment-cross-1'
          })
        )
      ).rejects.toMatchObject({ code: 'not_found' })

      const otherTenant = await harness.seedConversation(tenantB, 'other')
      await expect(
        attempt(() =>
          harness.repository.createOwnerDraft({
            tenantId: tenantA,
            phone: '+5511999990001',
            conversationId: otherTenant.conversationId,
            sessionId: otherTenant.sessionId,
            idempotencyKey: 'owner-cross-context-1'
          })
        )
      ).rejects.toMatchObject({ code: 'forbidden' })
      await expect(
        attempt(() =>
          harness.repository.createOwnerDraft({
            tenantId: tenantA,
            phone: '+5511999990001',
            conversationId: `conv_${randomUUID()}`,
            idempotencyKey: 'owner-missing-context-1'
          })
        )
      ).rejects.toMatchObject({ code: 'invalid_action' })
    })

    it('creates journey tasks idempotently and records handoffs', async () => {
      harness.setNow(T0)
      const seeded = await harness.seedConversation(tenantA, 'task')
      const task = await harness.repository.createJourneyTask({
        tenantId: tenantA,
        sessionId: seeded.sessionId,
        title: 'Retorno ficticio',
        description: 'Ligar para tutor ficticio',
        idempotencyKey: 'journey-task-1'
      })
      expect(task).toMatchObject({ source: 'journey-r3', status: 'open' })
      const replay = await harness.repository.createJourneyTask({
        tenantId: tenantA,
        sessionId: seeded.sessionId,
        title: 'Retorno ficticio',
        description: 'Ligar para tutor ficticio',
        idempotencyKey: 'journey-task-1'
      })
      expect(replay.id).toBe(task.id)

      await expect(
        attempt(() =>
          harness.repository.createJourneyTask({
            tenantId: tenantA,
            sessionId: `sess_${randomUUID()}`,
            title: 'Retorno ficticio',
            description: 'Ligar para tutor ficticio',
            idempotencyKey: 'journey-task-missing-1'
          })
        )
      ).rejects.toThrow(/session not found/i)

      await expect(
        attempt(() =>
          harness.repository.recordHandoff({
            tenantId: tenantA,
            conversationId: seeded.conversationId,
            sessionId: seeded.sessionId,
            intent: 'agendamento',
            risk: 'medium',
            pendingItems: ['slot'],
            nextStep: 'handoff humano ficticio'
          })
        )
      ).resolves.toBeUndefined()
    })

    it('rejects invalid inputs with stable validation failures', async () => {
      await expect(
        attempt(() => harness.repository.findAvailableSlots(tenantA, 0))
      ).rejects.toMatchObject({ code: 'validation_failed' })
      await expect(
        attempt(() => harness.repository.findAvailableSlots(tenantA, 9))
      ).rejects.toMatchObject({ code: 'validation_failed' })
      await expect(
        attempt(() =>
          harness.repository.createOwnerDraft({
            tenantId: tenantA,
            phone: '+5511999990001',
            idempotencyKey: 'short'
          })
        )
      ).rejects.toMatchObject({ code: 'validation_failed' })
      await expect(
        attempt(() =>
          harness.repository.createOwnerDraft({
            tenantId: tenantA,
            phone: '123',
            idempotencyKey: 'owner-bad-phone-1'
          })
        )
      ).rejects.toMatchObject({ code: 'validation_failed' })
      await expect(
        attempt(() =>
          harness.repository.createOwnerDraft({
            tenantId: tenantA,
            phone: '+5511999990001',
            name: 'x'.repeat(241),
            idempotencyKey: 'owner-long-name-1'
          })
        )
      ).rejects.toMatchObject({ code: 'validation_failed' })
    })
  })
}

describe('journey PostgreSQL migration artifact', () => {
  it('ships an additive draft-only migration with forced RLS', async () => {
    const migration = await readPostgresMigrationSql('0014_journeys')

    for (const table of [
      'journey_owner_drafts',
      'journey_patient_drafts',
      'journey_appointment_drafts'
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
      expect(migration).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`
      )
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      )
    }
    expect(migration).toContain('UNIQUE (tenant_id, idempotency_key)')
    expect(migration).toContain("current_setting('cvg.tenant_id', true)")
    expect(migration).toContain(
      "CHECK (status IN ('draft', 'linked', 'expired'))"
    )
    expect(migration).toContain(
      "CHECK (status IN ('proposed', 'awaiting_approval', 'expired', 'cancelled'))"
    )
    expect(migration).toContain('CHECK (confirmation_blocked)')
    expect(migration).not.toContain("'confirmed'")
  })
})

journeyContractSuite('journey contract (in-memory)', async () => {
  const db = new InMemoryDatabase()
  let current = new Date(T0)
  const repository = new JourneyRepository(db, { clock: () => current })
  const conversations = new ConversationRepository(db)
  let seedCounter = 0
  return {
    tenantA: makeTenant(),
    tenantB: makeTenant(),
    harness: {
      repository,
      setNow(value) {
        current = value
      },
      async seedConversation(tenantId, label) {
        seedCounter += 1
        const created = conversations.createWithSession({
          tenantId,
          channel: 'web',
          senderRef: `journey-${label}-sender`,
          externalMessageId: `journey-${label}-${seedCounter}`,
          body: 'Fixture'
        })
        return {
          conversationId: created.conversation.id,
          sessionId: created.session.id
        }
      },
      async countDrafts(table, tenantId) {
        const rows =
          table === 'owner'
            ? db.state.ownerDrafts
            : table === 'patient'
              ? db.state.patientDrafts
              : db.state.appointmentDrafts
        return rows.filter((row) => row.tenantId === tenantId).length
      },
      async latestJourneyAudit(tenantId, action) {
        const events = db.state.auditEvents.filter(
          (event) =>
            event.tenantId === tenantId &&
            typeof event.payload === 'object' &&
            event.payload !== null &&
            (event.payload as Record<string, unknown>).journey === action
        )
        const event = events[events.length - 1]
        if (!event) return null
        return {
          actorType: event.actorType,
          actorId: event.actorId,
          correlationId: event.correlationId,
          payload: event.payload as Record<string, unknown>
        }
      }
    }
  }
})

const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

describeWithPostgres('journey PostgreSQL persistence', () => {
  const schema = `cvg_journeys_${Date.now()}_${randomBytes(3).toString('hex')}`
  let admin: Client
  let pool: Pool

  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    pool = new Pool({
      connectionString: testDatabaseUrl,
      max: 3,
      options: `-c search_path=${schema}`
    })
  })

  afterAll(async () => {
    if (!testDatabaseUrl) return
    await pool?.end().catch(() => undefined)
    await admin
      ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  journeyContractSuite('journey contract (postgres parity)', async () => {
    let current = new Date(T0)
    const repository = new PostgresJourneyRepository(pool, {
      clock: () => current
    })
    return {
      tenantA: makeTenant(),
      tenantB: makeTenant(),
      harness: {
        repository,
        setNow(value) {
          current = value
        },
        async seedConversation(tenantId, label) {
          const conversationId = `conv_${randomUUID()}`
          const sessionId = `sess_${randomUUID()}`
          await withTenantContext(pool, tenantId, async (client) => {
            await client.query(
              `INSERT INTO conversations
                 (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
               VALUES ($1, $2, 'web', $3, $4, 'active', $5, $6, $6)`,
              [
                tenantId,
                conversationId,
                `journey-${label}-sender`,
                'f'.repeat(64),
                `corr_${randomUUID()}`,
                T0
              ]
            )
            await client.query(
              `INSERT INTO sessions
                 (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
               VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', $4, $4)`,
              [tenantId, sessionId, conversationId, T0]
            )
          })
          return { conversationId, sessionId }
        },
        async countDrafts(table, tenantId) {
          const name =
            table === 'owner'
              ? 'journey_owner_drafts'
              : table === 'patient'
                ? 'journey_patient_drafts'
                : 'journey_appointment_drafts'
          return withTenantContext(pool, tenantId, async (client) => {
            const result = await client.query<{ count: string }>(
              `SELECT count(*)::text AS count FROM ${name} WHERE tenant_id = $1`,
              [tenantId]
            )
            return Number(result.rows[0]?.count ?? 0)
          })
        },
        async latestJourneyAudit(tenantId, action) {
          return withTenantContext(pool, tenantId, async (client) => {
            const result = await client.query<{
              actor_type: string
              actor_id: string
              correlation_id: string
              payload: Record<string, unknown>
            }>(
              `SELECT actor_type, actor_id, correlation_id, payload
                 FROM audit_events
                WHERE tenant_id = $1 AND payload->>'journey' = $2
                ORDER BY created_at DESC, id DESC
                LIMIT 1`,
              [tenantId, action]
            )
            const row = result.rows[0]
            if (!row) return null
            return {
              actorType: row.actor_type,
              actorId: row.actor_id,
              correlationId: row.correlation_id,
              payload: row.payload
            }
          })
        }
      }
    }
  })

  it('applies 0014 with forced RLS, idempotency constraints and draft-only states', async () => {
    const applied = await admin.query<{ version: string; checksum: string }>(
      `SELECT version, checksum FROM schema_migrations WHERE version = $1`,
      ['0014_journeys']
    )
    expect(applied.rows).toHaveLength(1)
    expect(applied.rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)

    const tables = {
      journey_owner_drafts: ['draft', 'linked', 'expired'],
      journey_patient_drafts: ['draft', 'linked', 'expired'],
      journey_appointment_drafts: [
        'proposed',
        'awaiting_approval',
        'expired',
        'cancelled'
      ]
    }
    for (const [table, statuses] of Object.entries(tables)) {
      const rls = await admin.query<{
        relrowsecurity: boolean
        relforcerowsecurity: boolean
      }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class AS c
         INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2`,
        [schema, table]
      )
      expect(rls.rows[0]).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true
      })
      const policy = await admin.query<{ qual: string; with_check: string }>(
        `SELECT qual, with_check FROM pg_policies
         WHERE schemaname = $1 AND tablename = $2`,
        [schema, table]
      )
      expect(policy.rows).toHaveLength(1)
      expect(policy.rows[0]?.qual).toContain(
        "current_setting('cvg.tenant_id'::text, true)"
      )
      const constraints = await admin.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint WHERE conrelid = $1::regclass`,
        [`${schema}.${table}`]
      )
      const definitions = constraints.rows
        .map((row) => row.definition)
        .join('\n')
      for (const status of statuses) {
        expect(definitions).toContain(`'${status}'`)
      }
      expect(definitions).not.toContain("'confirmed'")
      expect(
        definitions.split('\n').some((definition) => {
          return (
            definition.startsWith('UNIQUE') &&
            definition.includes('tenant_id') &&
            definition.includes('idempotency_key')
          )
        })
      ).toBe(true)
    }

    const appointment = await admin.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = $1::regclass AND contype = 'c'`,
      [`${schema}.journey_appointment_drafts`]
    )
    const appointmentDefinitions = appointment.rows
      .map((row) => row.definition)
      .join('\n')
    expect(appointmentDefinitions).toContain('confirmation_blocked')
  })

  it('applies 0014 additively over a 0013 database and preserves prior data', async () => {
    const legacySchema = `cvg_journeys_legacy_${Date.now()}_${randomBytes(3).toString('hex')}`
    const legacy = new Client({ connectionString: testDatabaseUrl })
    const priorMigrations = [
      '0000_initial',
      '0001_tenant_isolation',
      '0002_capability_approvals',
      '0003_test_suite_catalog',
      '0004_plugin_manifest_catalog',
      '0005_knowledge_source_catalog',
      '0006_release_candidate_evidence',
      '0007_audit_evidence_checkpoint',
      '0008_session_agent_version_pin',
      '0009_release_candidate_validator_integrity',
      '0010_outbox_durability',
      '0011_outbox_payload_redaction',
      '0012_channel_effect_journal',
      '0013_runtime_effect_journal'
    ]
    const tenantId = makeTenant()
    const conversationId = `conv_${randomUUID()}`
    const sessionId = `sess_${randomUUID()}`
    const taskId = `task_${randomUUID()}`
    const auditId = `audit_${randomUUID()}`

    await legacy.connect()
    try {
      await runPostgresMigrations(legacy, {
        schemaName: legacySchema,
        migrations: priorMigrations
      })
      await legacy.query(
        `INSERT INTO conversations
           (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
         VALUES ($1, $2, 'web', 'legacy-journey-sender', $3, 'active', $4, now(), now())`,
        [tenantId, conversationId, 'a'.repeat(64), `corr_${randomUUID()}`]
      )
      await legacy.query(
        `INSERT INTO sessions
           (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', now(), now())`,
        [tenantId, sessionId, conversationId]
      )
      await legacy.query(
        `INSERT INTO tasks
           (tenant_id, id, session_id, title, description, priority, source, status, idempotency_key, created_at)
         VALUES ($1, $2, $3, 'Legacy task', 'Fixture', 'medium', 'legacy-journey', 'open', 'legacy-key', now())`,
        [tenantId, taskId, sessionId]
      )
      await legacy.query(
        `INSERT INTO audit_events
           (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
         VALUES ($1, $2, 'integration_event', 'System', 'legacy', $3, 'legacy', '{}'::jsonb, now())`,
        [tenantId, auditId, `corr_${randomUUID()}`]
      )

      await runPostgresMigrations(legacy, { schemaName: legacySchema })
      await runPostgresMigrations(legacy, { schemaName: legacySchema })

      const preservedTask = await legacy.query(
        `SELECT id FROM tasks WHERE id = $1`,
        [taskId]
      )
      expect(preservedTask.rows).toHaveLength(1)
      const preservedAudit = await legacy.query(
        `SELECT id FROM audit_events WHERE id = $1`,
        [auditId]
      )
      expect(preservedAudit.rows).toHaveLength(1)
      const preservedConversation = await legacy.query(
        `SELECT id FROM conversations WHERE id = $1`,
        [conversationId]
      )
      expect(preservedConversation.rows).toHaveLength(1)

      const journeyTables = await legacy.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name IN
             ('journey_owner_drafts', 'journey_patient_drafts', 'journey_appointment_drafts')
         ORDER BY table_name`,
        [legacySchema]
      )
      expect(journeyTables.rows.map((row) => row.table_name)).toEqual([
        'journey_appointment_drafts',
        'journey_owner_drafts',
        'journey_patient_drafts'
      ])
      const applied = await legacy.query<{ checksum: string }>(
        `SELECT checksum FROM schema_migrations WHERE version = $1`,
        ['0014_journeys']
      )
      expect(applied.rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await legacy
        .query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`)
        .catch(() => undefined)
      await legacy.end().catch(() => undefined)
    }
  })

  it('fails closed for a non-BYPASSRLS runtime role without tenant context', async () => {
    const roleName = `cvg_journeys_rls_${Date.now()}_${randomBytes(3).toString('hex')}`
    const password = randomBytes(18).toString('hex')
    const roleUrl = new URL(testDatabaseUrl as string)
    roleUrl.username = roleName
    roleUrl.password = password
    const roleAdmin = new Client({ connectionString: testDatabaseUrl })
    const runtime = new Client({ connectionString: roleUrl.toString() })
    const tenant1 = makeTenant()
    const tenant2 = makeTenant()
    const current = new Date(T0)
    const repository = new PostgresJourneyRepository(pool, {
      clock: () => current
    })

    await roleAdmin.connect()
    try {
      await roleAdmin.query(
        `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`
      )
      await roleAdmin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${roleName}`)
      await roleAdmin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON
           ${schema}.journey_owner_drafts,
           ${schema}.journey_patient_drafts,
           ${schema}.journey_appointment_drafts,
           ${schema}.conversations,
           ${schema}.sessions,
           ${schema}.tasks,
           ${schema}.audit_events TO ${roleName}`
      )
      await roleAdmin.query(
        `ALTER ROLE ${roleName} SET search_path TO ${schema}`
      )
      const flags = await roleAdmin.query<{ rolbypassrls: boolean }>(
        `SELECT rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [roleName]
      )
      expect(flags.rows[0]?.rolbypassrls).toBe(false)

      const owner = await repository.createOwnerDraft({
        tenantId: tenant1,
        phone: '+5511999990001',
        idempotencyKey: `rls-owner-${tenant1.slice(-12)}`
      })
      await runtime.connect()

      const hidden = await runtime.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM journey_owner_drafts`
      )
      expect(hidden.rows[0]?.count).toBe('0')

      await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
        tenant2
      ])
      const otherTenant = await runtime.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM journey_owner_drafts`
      )
      expect(otherTenant.rows[0]?.count).toBe('0')
      const deniedUpdate = await runtime.query(
        `UPDATE journey_owner_drafts SET status = 'expired' WHERE id = $1`,
        [owner.id]
      )
      expect(deniedUpdate.rowCount).toBe(0)
      await expect(
        runtime.query(
          `INSERT INTO journey_owner_drafts
             (tenant_id, id, phone, name, candidate_ids, status, idempotency_key, created_at, updated_at, expires_at)
           VALUES ($1, $2, NULL, NULL, '[]'::jsonb, 'draft', $3, now(), now(), now() + interval '1 day')`,
          [tenant1, `owner_draft_${randomUUID()}`, `rls-insert-${Date.now()}`]
        )
      ).rejects.toThrow(/row-level security/i)

      await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
        tenant1
      ])
      const visible = await runtime.query<{ id: string }>(
        `SELECT id FROM journey_owner_drafts WHERE id = $1`,
        [owner.id]
      )
      expect(visible.rows).toHaveLength(1)
    } finally {
      await runtime.end().catch(() => undefined)
      await roleAdmin
        .query(`DROP ROLE IF EXISTS ${roleName}`)
        .catch(() => undefined)
      await roleAdmin.end().catch(() => undefined)
    }
  })

  it('persists journey task and handoff evidence through the tenant scope', async () => {
    const tenantId = makeTenant()
    const current = new Date(T0)
    const repository = new PostgresJourneyRepository(pool, {
      clock: () => current
    })
    const conversationId = `conv_${randomUUID()}`
    const sessionId = `sess_${randomUUID()}`
    await withTenantContext(pool, tenantId, async (client) => {
      await client.query(
        `INSERT INTO conversations
           (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
         VALUES ($1, $2, 'web', 'journey-evidence-sender', $3, 'active', $4, $5, $5)`,
        [tenantId, conversationId, 'e'.repeat(64), `corr_${randomUUID()}`, T0]
      )
      await client.query(
        `INSERT INTO sessions
           (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', $4, $4)`,
        [tenantId, sessionId, conversationId, T0]
      )
    })

    const task = await repository.createJourneyTask({
      tenantId,
      sessionId,
      title: 'Retorno ficticio',
      description: 'Evidencia sintetica',
      idempotencyKey: `journey-evidence-task-${tenantId.slice(-12)}`
    })
    await repository.recordHandoff({
      tenantId,
      conversationId,
      sessionId,
      intent: 'agendamento',
      risk: 'medium',
      pendingItems: ['slot'],
      nextStep: 'handoff humano ficticio'
    })

    const count = await withTenantContext(pool, tenantId, async (client) => {
      const storedTask = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM tasks WHERE id = $1 AND tenant_id = $2`,
        [task.id, tenantId]
      )
      const handoffAudit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_events
           WHERE tenant_id = $1
             AND payload->>'journey' = 'journey_handoff'
             AND payload->>'resourceId' = $2`,
        [tenantId, conversationId]
      )
      return {
        tasks: Number(storedTask.rows[0]?.count ?? 0),
        handoffs: Number(handoffAudit.rows[0]?.count ?? 0)
      }
    })
    expect(count).toEqual({ tasks: 1, handoffs: 1 })
  })

  it('rolls back the whole journey mutation when the audit insert fails', async () => {
    const tenantId = makeTenant()
    const repository = new PostgresJourneyRepository(pool, {
      clock: () => T0
    })
    const idempotencyKey = `atomic-owner-${randomUUID()}`
    await admin.query(
      `CREATE OR REPLACE FUNCTION ${schema}.reject_journey_audit()
         RETURNS trigger LANGUAGE plpgsql AS
         $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
    )
    await admin.query(
      `CREATE TRIGGER reject_journey_audit
         BEFORE INSERT ON ${schema}.audit_events
         FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_journey_audit()`
    )
    try {
      await expect(
        attempt(() =>
          repository.createOwnerDraft({
            tenantId,
            phone: '+5511999990001',
            idempotencyKey
          })
        )
      ).rejects.toThrow(/synthetic audit failure/)
      const afterFailure = await withTenantContext(
        pool,
        tenantId,
        async (client) => {
          const drafts = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM journey_owner_drafts
              WHERE tenant_id = $1`,
            [tenantId]
          )
          const audits = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM audit_events
              WHERE tenant_id = $1`,
            [tenantId]
          )
          return {
            drafts: Number(drafts.rows[0]?.count ?? 0),
            audits: Number(audits.rows[0]?.count ?? 0)
          }
        }
      )
      expect(afterFailure).toEqual({ drafts: 0, audits: 0 })
    } finally {
      await admin.query(
        `DROP TRIGGER IF EXISTS reject_journey_audit
           ON ${schema}.audit_events`
      )
      await admin.query(
        `DROP FUNCTION IF EXISTS ${schema}.reject_journey_audit()`
      )
    }

    const replay = await repository.createOwnerDraft({
      tenantId,
      phone: '+5511999990001',
      idempotencyKey
    })
    expect(replay.status).toBe('draft')
    const afterReplay = await withTenantContext(
      pool,
      tenantId,
      async (client) => {
        const drafts = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM journey_owner_drafts
          WHERE tenant_id = $1`,
          [tenantId]
        )
        const audits = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM audit_events
          WHERE tenant_id = $1`,
          [tenantId]
        )
        return {
          drafts: Number(drafts.rows[0]?.count ?? 0),
          audits: Number(audits.rows[0]?.count ?? 0)
        }
      }
    )
    expect(afterReplay).toEqual({ drafts: 1, audits: 1 })
  })

  it('serializes concurrent creates with the same idempotency key', async () => {
    const tenantId = makeTenant()
    const repository = new PostgresJourneyRepository(pool, {
      clock: () => T0
    })
    const idempotencyKey = `atomic-concurrent-${randomUUID()}`
    const results = await Promise.all([
      attempt(() =>
        repository.createOwnerDraft({
          tenantId,
          phone: '+5511999990001',
          idempotencyKey
        })
      ),
      attempt(() =>
        repository.createOwnerDraft({
          tenantId,
          phone: '+5511999990001',
          idempotencyKey
        })
      )
    ])
    expect(new Set(results.map((draft) => draft.id)).size).toBe(1)
    const counts = await withTenantContext(pool, tenantId, async (client) => {
      const drafts = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM journey_owner_drafts
          WHERE tenant_id = $1`,
        [tenantId]
      )
      const audits = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_events
          WHERE tenant_id = $1`,
        [tenantId]
      )
      return {
        drafts: Number(drafts.rows[0]?.count ?? 0),
        audits: Number(audits.rows[0]?.count ?? 0)
      }
    })
    expect(counts).toEqual({ drafts: 1, audits: 1 })
  })

  it('clears the tenant context of the borrowed connection after a transaction', async () => {
    const single = new Pool({
      connectionString: testDatabaseUrl,
      max: 1,
      options: `-c search_path=${schema}`
    })
    const tenantId = makeTenant()
    try {
      const repository = new PostgresJourneyRepository(single, {
        clock: () => T0
      })
      await repository.createOwnerDraft({
        tenantId,
        phone: '+5511999990001',
        idempotencyKey: `atomic-context-${randomUUID()}`
      })
      const leaked = await single.query<{ tenant: string | null }>(
        `SELECT NULLIF(current_setting('cvg.tenant_id', true), '') AS tenant`
      )
      expect(leaked.rows[0]?.tenant).toBeNull()
    } finally {
      await single.end()
    }
  })
})
