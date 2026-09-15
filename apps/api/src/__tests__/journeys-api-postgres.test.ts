import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildServer, buildServerFromEnv } from '../server.ts'
import { runPostgresMigrations, withTenantContext } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const fullTenant = 'tenant_00000000-0000-4000-8000-000000000811' as TenantId
const isolationTenantA =
  'tenant_00000000-0000-4000-8000-000000000812' as TenantId
const isolationTenantB =
  'tenant_00000000-0000-4000-8000-000000000813' as TenantId
const restartTenant = 'tenant_00000000-0000-4000-8000-000000000814' as TenantId
const legacyTenant = 'tenant_00000000-0000-4000-8000-000000000815' as TenantId
const unavailableTenant =
  'tenant_00000000-0000-4000-8000-000000000816' as TenantId
const startupTenant = 'tenant_00000000-0000-4000-8000-000000000817' as TenantId
const atomicTenant = 'tenant_00000000-0000-4000-8000-000000000818' as TenantId
const actorTenant = 'tenant_00000000-0000-4000-8000-000000000819' as TenantId

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

interface OwnerDraft {
  id: string
  candidateIds: string[]
  status: string
}

interface PatientDraft {
  id: string
  candidateIds: string[]
  status: string
}

interface AppointmentDraft {
  id: string
  status: string
  slot: string
  sourceVersion: string
  confirmationBlocked: boolean
}

const headersFor = (tenantId: TenantId, role = 'Operator') => ({
  'x-operator-id': 'operator.journeys.pg',
  'x-operator-role': role,
  'x-tenant-id': tenantId
})

type JourneyTestApp = Pick<ReturnType<typeof buildServer>, 'inject'>

describeWithPostgres('journeys API over PostgreSQL', () => {
  const schema = `cvg_journeys_api_${Date.now()}_${randomBytes(3).toString('hex')}`
  let admin: Client
  let pool: Pool

  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    pool = new Pool({
      connectionString: testDatabaseUrl,
      max: 4,
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

  async function seedConversation(tenantId: TenantId, label: string) {
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
          `journey-api-${label}`,
          'f'.repeat(64),
          `corr_${randomUUID()}`,
          new Date()
        ]
      )
      await client.query(
        `INSERT INTO sessions
           (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', $4, $4)`,
        [tenantId, sessionId, conversationId, new Date()]
      )
    })
    return { conversationId, sessionId }
  }

  async function createOwnerDraft(
    app: JourneyTestApp,
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<OwnerDraft> {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers: headersFor(tenantId),
      payload: {
        phone: '+5511999990001',
        name: 'Tutor Fictício PostgreSQL',
        idempotencyKey
      }
    })
    expect(response.statusCode).toBe(200)
    return (response.json() as Envelope<OwnerDraft>).data!
  }

  async function createLinkedPatient(
    app: JourneyTestApp,
    tenantId: TenantId,
    suffix: string
  ): Promise<PatientDraft> {
    const owner = await createOwnerDraft(app, tenantId, `pg-owner-${suffix}`)
    const patientResponse = await app.inject({
      method: 'POST',
      url: '/v1/journeys/patient-drafts',
      headers: headersFor(tenantId),
      payload: {
        ownerDraftId: owner.id,
        ownerCandidateId: owner.candidateIds[0],
        name: 'Bolt',
        species: 'felino',
        idempotencyKey: `pg-patient-${suffix}`
      }
    })
    expect(patientResponse.statusCode).toBe(200)
    const patient = (patientResponse.json() as Envelope<PatientDraft>).data!
    const link = await app.inject({
      method: 'POST',
      url: `/v1/journeys/patient-drafts/${patient.id}/link`,
      headers: headersFor(tenantId),
      payload: { candidateId: patient.candidateIds[0] }
    })
    expect(link.statusCode).toBe(200)
    expect((link.json() as Envelope<PatientDraft>).data?.status).toBe('linked')
    return (link.json() as Envelope<PatientDraft>).data!
  }

  it('serves the full owner, patient, slot, appointment and task journey over HTTP', async () => {
    const app = buildServer({ persistence: { kind: 'postgres-pool', pool } })
    const headers = headersFor(fullTenant)
    const { sessionId } = await seedConversation(fullTenant, 'full')
    try {
      const owner = await createOwnerDraft(
        app,
        fullTenant,
        `pg-full-owner-${randomUUID()}`
      )
      expect(owner.candidateIds).toHaveLength(1)

      const ownerSearch = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owners/search?phone=%2B5511999990001',
        headers
      })
      expect(ownerSearch.statusCode).toBe(200)
      expect(
        (ownerSearch.json() as Envelope<{ matches: OwnerDraft[] }>).data
          ?.matches
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: owner.candidateIds[0] })
        ])
      )

      const patientResponse = await app.inject({
        method: 'POST',
        url: '/v1/journeys/patient-drafts',
        headers,
        payload: {
          ownerDraftId: owner.id,
          ownerCandidateId: owner.candidateIds[0],
          name: 'Bolt',
          species: 'felino',
          idempotencyKey: `pg-full-patient-${randomUUID()}`
        }
      })
      expect(patientResponse.statusCode).toBe(200)
      const patient = (patientResponse.json() as Envelope<PatientDraft>).data!

      const patientSearch = await app.inject({
        method: 'GET',
        url: `/v1/journeys/patients/search?ownerDraftId=${owner.id}&ownerCandidateId=${owner.candidateIds[0]}&name=Bolt`,
        headers
      })
      expect(patientSearch.statusCode).toBe(200)
      expect(
        (patientSearch.json() as Envelope<{ matches: unknown[] }>).data?.matches
      ).toHaveLength(1)

      const linked = await app.inject({
        method: 'POST',
        url: `/v1/journeys/patient-drafts/${patient.id}/link`,
        headers,
        payload: { candidateId: patient.candidateIds[0] }
      })
      expect(linked.statusCode).toBe(200)
      expect((linked.json() as Envelope<PatientDraft>).data?.status).toBe(
        'linked'
      )

      const slots = await app.inject({
        method: 'GET',
        url: '/v1/journeys/slots',
        headers
      })
      expect(slots.statusCode).toBe(200)
      const slot = (
        slots.json() as Envelope<{
          slots: Array<{ id: string; startsAt: string }>
        }>
      ).data!.slots[0]!
      expect(slot.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const appointment = await app.inject({
        method: 'POST',
        url: '/v1/journeys/appointment-drafts',
        headers,
        payload: {
          patientDraftId: patient.id,
          slot: slot.id,
          idempotencyKey: `pg-full-appointment-${randomUUID()}`
        }
      })
      expect(appointment.statusCode).toBe(200)
      const appointmentData = (appointment.json() as Envelope<AppointmentDraft>)
        .data!
      expect(appointmentData).toMatchObject({
        status: 'awaiting_approval',
        confirmationBlocked: true,
        slot: slot.startsAt
      })

      const ownerList = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owner-drafts',
        headers
      })
      expect(ownerList.statusCode).toBe(200)
      expect(ownerList.json()).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: owner.id, status: 'draft' })
        ])
      })

      const patientList = await app.inject({
        method: 'GET',
        url: '/v1/journeys/patient-drafts',
        headers
      })
      expect(patientList.statusCode).toBe(200)
      expect(patientList.json()).toMatchObject({
        success: true,
        data: {
          drafts: expect.arrayContaining([
            expect.objectContaining({ id: patient.id, status: 'linked' })
          ])
        }
      })

      const appointmentList = await app.inject({
        method: 'GET',
        url: '/v1/journeys/appointment-drafts',
        headers
      })
      expect(appointmentList.statusCode).toBe(200)
      expect(appointmentList.json()).toMatchObject({
        success: true,
        data: {
          drafts: expect.arrayContaining([
            expect.objectContaining({
              id: appointmentData.id,
              status: 'awaiting_approval',
              confirmationBlocked: true
            })
          ])
        }
      })

      const task = await app.inject({
        method: 'POST',
        url: '/v1/journeys/tasks',
        headers,
        payload: {
          sessionId,
          title: 'Confirmar retorno fictício PostgreSQL',
          description: 'Ligar para tutor fictício',
          priority: 'high',
          idempotencyKey: `pg-full-task-${randomUUID()}`
        }
      })
      expect(task.statusCode).toBe(200)
      expect(task.json()).toMatchObject({
        success: true,
        data: { sessionId, status: 'open', source: 'journey-r3' }
      })

      const confirmation = await app.inject({
        method: 'POST',
        url: `/v1/journeys/appointment-drafts/${appointmentData.id}/confirm`,
        headers,
        payload: {}
      })
      expect(confirmation.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('keeps journey state tenant-isolated over HTTP', async () => {
    const app = buildServer({ persistence: { kind: 'postgres-pool', pool } })
    try {
      const owner = await createOwnerDraft(
        app,
        isolationTenantA,
        `pg-isolation-owner-${randomUUID()}`
      )
      const patient = await createLinkedPatient(
        app,
        isolationTenantA,
        `isolation-${randomUUID()}`
      )

      const listForOtherTenant = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owner-drafts',
        headers: headersFor(isolationTenantB)
      })
      expect(listForOtherTenant.statusCode).toBe(200)
      expect(
        (listForOtherTenant.json() as Envelope<OwnerDraft[]>).data
      ).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: owner.id })])
      )

      const crossTenantPatient = await app.inject({
        method: 'POST',
        url: '/v1/journeys/patient-drafts',
        headers: headersFor(isolationTenantB),
        payload: {
          ownerDraftId: owner.id,
          ownerCandidateId: owner.candidateIds[0],
          name: 'Pet Cross Tenant',
          idempotencyKey: `pg-isolation-cross-patient-${randomUUID()}`
        }
      })
      expect(crossTenantPatient.statusCode).toBe(404)
      expect((crossTenantPatient.json() as Envelope<never>).error?.code).toBe(
        'not_found'
      )

      const crossTenantLink = await app.inject({
        method: 'POST',
        url: `/v1/journeys/patient-drafts/${patient.id}/link`,
        headers: headersFor(isolationTenantB),
        payload: { candidateId: patient.candidateIds[0] }
      })
      expect(crossTenantLink.statusCode).toBe(404)
      expect((crossTenantLink.json() as Envelope<never>).error?.code).toBe(
        'not_found'
      )

      const ownerSearchForOtherTenant = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owners/search?phone=%2B5511999990001',
        headers: headersFor(isolationTenantB)
      })
      expect(ownerSearchForOtherTenant.statusCode).toBe(200)
      const otherMatches = (
        ownerSearchForOtherTenant.json() as Envelope<{
          matches: Array<{ id: string }>
        }>
      ).data
      expect(otherMatches?.matches.map((match) => match.id)).not.toEqual(
        expect.arrayContaining(owner.candidateIds)
      )
    } finally {
      await app.close()
    }
  })

  it('preserves authentication, validation and approval boundaries over PostgreSQL', async () => {
    const app = buildServer({ persistence: { kind: 'postgres-pool', pool } })
    const headers = headersFor(isolationTenantA)
    try {
      const missingIdentity = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owner-drafts'
      })
      expect(missingIdentity.statusCode).toBe(401)

      const invalidRole = await app.inject({
        method: 'GET',
        url: '/v1/journeys/slots',
        headers: headersFor(isolationTenantA, 'Root')
      })
      expect(invalidRole.statusCode).toBe(401)

      const invalidPhone = await app.inject({
        method: 'POST',
        url: '/v1/journeys/owner-drafts',
        headers,
        payload: { phone: '123', idempotencyKey: `pg-invalid-${randomUUID()}` }
      })
      expect(invalidPhone.statusCode).toBe(400)
      expect((invalidPhone.json() as Envelope<never>).error?.code).toBe(
        'validation_failed'
      )

      const linkingCandidate = await createLinkedPatient(
        app,
        isolationTenantA,
        `boundary-${randomUUID()}`
      )
      const invalidCandidate = await app.inject({
        method: 'POST',
        url: `/v1/journeys/patient-drafts/${linkingCandidate.id}/link`,
        headers,
        payload: { candidateId: 42 }
      })
      expect(invalidCandidate.statusCode).toBe(400)
      expect((invalidCandidate.json() as Envelope<never>).error?.code).toBe(
        'validation_failed'
      )

      const unknownPatient = await app.inject({
        method: 'POST',
        url: '/v1/journeys/patient-drafts/patient_draft_missing/link',
        headers,
        payload: { candidateId: 'candidate_missing' }
      })
      expect(unknownPatient.statusCode).toBe(404)

      const unavailableSlot = await app.inject({
        method: 'POST',
        url: '/v1/journeys/appointment-drafts',
        headers,
        payload: {
          patientDraftId: linkingCandidate.id,
          slot: '2026-01-01T00:00:00.000Z',
          idempotencyKey: `pg-bad-slot-${randomUUID()}`
        }
      })
      expect(unavailableSlot.statusCode).toBe(409)
      expect((unavailableSlot.json() as Envelope<never>).error?.code).toBe(
        'conflict'
      )
    } finally {
      await app.close()
    }
  })

  it('reads created journey state back after a server restart', async () => {
    const firstPool = new Pool({
      connectionString: testDatabaseUrl,
      max: 2,
      options: `-c search_path=${schema}`
    })
    const firstApp = buildServer({
      persistence: { kind: 'postgres-pool', pool: firstPool }
    })
    const owner = await createOwnerDraft(
      firstApp,
      restartTenant,
      `pg-restart-owner-${randomUUID()}`
    )
    const patient = await createLinkedPatient(
      firstApp,
      restartTenant,
      `restart-${randomUUID()}`
    )
    const slots = await firstApp.inject({
      method: 'GET',
      url: '/v1/journeys/slots',
      headers: headersFor(restartTenant)
    })
    const slot = (
      slots.json() as Envelope<{
        slots: Array<{ id: string; startsAt: string }>
      }>
    ).data!.slots[0]!
    const appointment = await firstApp.inject({
      method: 'POST',
      url: '/v1/journeys/appointment-drafts',
      headers: headersFor(restartTenant),
      payload: {
        patientDraftId: patient.id,
        slot: slot.id,
        idempotencyKey: `pg-restart-appointment-${randomUUID()}`
      }
    })
    const appointmentData = (appointment.json() as Envelope<AppointmentDraft>)
      .data!
    expect(appointmentData.status).toBe('awaiting_approval')
    await firstApp.close()
    await firstPool.end()

    const secondPool = new Pool({
      connectionString: testDatabaseUrl,
      max: 2,
      options: `-c search_path=${schema}`
    })
    const secondApp = buildServer({
      persistence: { kind: 'postgres-pool', pool: secondPool }
    })
    try {
      const ownerList = await secondApp.inject({
        method: 'GET',
        url: '/v1/journeys/owner-drafts',
        headers: headersFor(restartTenant)
      })
      expect(ownerList.statusCode).toBe(200)
      expect(ownerList.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: owner.id, status: 'draft' })
        ])
      })

      const patientList = await secondApp.inject({
        method: 'GET',
        url: '/v1/journeys/patient-drafts',
        headers: headersFor(restartTenant)
      })
      expect(patientList.statusCode).toBe(200)
      expect(patientList.json()).toMatchObject({
        data: {
          drafts: expect.arrayContaining([
            expect.objectContaining({ id: patient.id, status: 'linked' })
          ])
        }
      })

      const appointmentList = await secondApp.inject({
        method: 'GET',
        url: '/v1/journeys/appointment-drafts',
        headers: headersFor(restartTenant)
      })
      expect(appointmentList.statusCode).toBe(200)
      expect(appointmentList.json()).toMatchObject({
        data: {
          drafts: expect.arrayContaining([
            expect.objectContaining({
              id: appointmentData.id,
              status: 'awaiting_approval',
              confirmationBlocked: true,
              slot: slot.startsAt
            })
          ])
        }
      })

      const persisted = await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM journey_appointment_drafts
         WHERE tenant_id = $1 AND id = $2`,
        [restartTenant, appointmentData.id]
      )
      expect(persisted.rows[0]?.count).toBe('1')
    } finally {
      await secondApp.close()
      await secondPool.end()
    }
  })

  it('serves journeys through a direct PostgreSQL client without a pool', async () => {
    const client = new Client({ connectionString: testDatabaseUrl })
    await client.connect()
    const app = buildServer({
      persistence: { kind: 'postgres', client }
    })
    try {
      await client.query(`SET search_path TO ${schema}`)
      const owner = await createOwnerDraft(
        app,
        legacyTenant,
        `pg-legacy-owner-${randomUUID()}`
      )
      const list = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owner-drafts',
        headers: headersFor(legacyTenant)
      })
      expect(list.statusCode).toBe(200)
      expect(list.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: owner.id, status: 'draft' })
        ])
      })
    } finally {
      await app.close()
      await client.end()
    }
  })

  it('applies migration 0014 during postgres startup before serving journeys', async () => {
    const startupSchema = `cvg_journeys_startup_${Date.now()}_${randomBytes(3).toString('hex')}`
    let app: Awaited<ReturnType<typeof buildServerFromEnv>> | undefined
    try {
      app = await buildServerFromEnv({
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: testDatabaseUrl,
        POSTGRES_SCHEMA: startupSchema,
        POSTGRES_AUTO_MIGRATE: 'true'
      })
      const applied = await admin.query<{ checksum: string }>(
        `SELECT checksum FROM ${startupSchema}.schema_migrations
         WHERE version = '0014_journeys'`
      )
      expect(applied.rows[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)

      const owner = await createOwnerDraft(
        app,
        startupTenant,
        `pg-startup-owner-${randomUUID()}`
      )
      const list = await app.inject({
        method: 'GET',
        url: '/v1/journeys/owner-drafts',
        headers: headersFor(startupTenant)
      })
      expect(list.statusCode).toBe(200)
      expect(list.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: owner.id, status: 'draft' })
        ])
      })
    } finally {
      await app?.close()
      await admin
        .query(`DROP SCHEMA IF EXISTS ${startupSchema} CASCADE`)
        .catch(() => undefined)
    }
  })

  it('fails journey routes closed when no journey repository is available', async () => {
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool },
      journeyRepository: null
    })
    const headers = headersFor(unavailableTenant)
    try {
      const unavailable = [
        {
          method: 'GET' as const,
          url: '/v1/journeys/owners/search?phone=%2B5511999990001'
        },
        { method: 'GET' as const, url: '/v1/journeys/patients/search' },
        { method: 'GET' as const, url: '/v1/journeys/owner-drafts' },
        { method: 'GET' as const, url: '/v1/journeys/patient-drafts' },
        { method: 'GET' as const, url: '/v1/journeys/slots' },
        { method: 'GET' as const, url: '/v1/journeys/appointment-drafts' },
        {
          method: 'POST' as const,
          url: '/v1/journeys/owner-drafts',
          payload: {
            phone: '+5511999990001',
            idempotencyKey: `pg-unavailable-${randomUUID()}`
          }
        },
        {
          method: 'POST' as const,
          url: '/v1/journeys/patient-drafts/patient_draft_x/link',
          payload: { candidateId: 'candidate_x' }
        },
        {
          method: 'POST' as const,
          url: '/v1/journeys/tasks',
          payload: {
            sessionId: 'sess_00000000-0000-4000-8000-000000000817',
            title: 'Tarefa indisponível',
            description: 'Sem efeito real',
            idempotencyKey: `pg-unavailable-task-${randomUUID()}`
          }
        }
      ]

      for (const request of unavailable) {
        const response = await app.inject(
          request.method === 'GET'
            ? { method: request.method, url: request.url, headers }
            : {
                method: request.method,
                url: request.url,
                payload: request.payload
              }
        )
        expect(response.statusCode).toBe(400)
        expect((response.json() as Envelope<never>).error?.code).toBe(
          'invalid_action'
        )
      }
    } finally {
      await app.close()
    }
  })

  it('fails startup when a postgres pool cannot construct the journey repository', () => {
    expect(() =>
      buildServer({
        persistence: { kind: 'postgres-pool', pool: {} as never }
      })
    ).toThrow(
      'PostgreSQL journey persistence requires a pool adapter with connect()'
    )
    expect(() =>
      buildServer({
        persistence: {
          kind: 'postgres',
          client: {} as never
        }
      })
    ).toThrow(
      'PostgreSQL journey persistence requires a queryable persistence client'
    )
  })

  it('records the authenticated actor and request correlation on journey audit', async () => {
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool },
      requireAuthenticatedMutations: true
    })
    const headers = headersFor(actorTenant)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers,
      payload: {
        phone: '+5511999990001',
        name: 'Tutor Ator',
        idempotencyKey: `pg-actor-owner-${randomUUID()}`,
        actorId: 'spoofed.actor',
        actorType: 'Admin',
        correlationId: 'corr_00000000-0000-4000-8000-000000000bad',
        auditContext: {
          actorType: 'Admin',
          actorId: 'spoofed.actor'
        }
      }
    })
    expect(response.statusCode).toBe(200)
    const correlationId = (response.json() as Envelope<OwnerDraft>).meta
      .correlationId
    expect(correlationId).toMatch(/^corr_/)
    const audit = await withTenantContext(pool, actorTenant, async (client) => {
      const result = await client.query<{
        actor_type: string
        actor_id: string
        correlation_id: string
      }>(
        `SELECT actor_type, actor_id, correlation_id
           FROM audit_events
          WHERE tenant_id = $1 AND payload->>'journey' = 'owner_draft_created'
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [actorTenant]
      )
      return result.rows[0] ?? null
    })
    expect(audit).toEqual({
      actor_type: 'Operator',
      actor_id: 'operator.journeys.pg',
      correlation_id: correlationId
    })
    await app.close()
  })

  it('keeps the HTTP journey mutation and audit atomic and replayable', async () => {
    const app = buildServer({ persistence: { kind: 'postgres-pool', pool } })
    const headers = headersFor(atomicTenant)
    const idempotencyKey = `pg-atomic-owner-${randomUUID()}`
    const countAtomic = async () =>
      withTenantContext(pool, atomicTenant, async (client) => {
        const drafts = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM journey_owner_drafts
            WHERE tenant_id = $1`,
          [atomicTenant]
        )
        const audits = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM audit_events
            WHERE tenant_id = $1`,
          [atomicTenant]
        )
        return {
          drafts: Number(drafts.rows[0]?.count ?? 0),
          audits: Number(audits.rows[0]?.count ?? 0)
        }
      })
    try {
      await admin.query(
        `CREATE OR REPLACE FUNCTION ${schema}.reject_http_journey_audit()
           RETURNS trigger LANGUAGE plpgsql AS
           $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
      )
      await admin.query(
        `CREATE TRIGGER reject_http_journey_audit
           BEFORE INSERT ON ${schema}.audit_events
           FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_http_journey_audit()`
      )
      const failed = await app.inject({
        method: 'POST',
        url: '/v1/journeys/owner-drafts',
        headers,
        payload: {
          phone: '+5511999990001',
          name: 'Tutor Atômico',
          idempotencyKey
        }
      })
      expect(failed.statusCode).toBe(500)
      expect((failed.json() as Envelope<never>).error?.code).toBe(
        'internal_error'
      )
      expect(await countAtomic()).toEqual({ drafts: 0, audits: 0 })
    } finally {
      await admin.query(
        `DROP TRIGGER IF EXISTS reject_http_journey_audit
           ON ${schema}.audit_events`
      )
      await admin.query(
        `DROP FUNCTION IF EXISTS ${schema}.reject_http_journey_audit()`
      )
    }

    const retried = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers,
      payload: {
        phone: '+5511999990001',
        name: 'Tutor Atômico',
        idempotencyKey
      }
    })
    expect(retried.statusCode).toBe(200)
    expect((retried.json() as Envelope<OwnerDraft>).data?.status).toBe('draft')
    expect(await countAtomic()).toEqual({ drafts: 1, audits: 1 })
    await app.close()
  })
})
