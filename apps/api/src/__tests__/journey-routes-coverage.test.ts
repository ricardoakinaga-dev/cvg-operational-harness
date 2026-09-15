import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000801'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000802'

const operatorHeaders = (tenantId = tenantA, role = 'Operator') => ({
  'x-operator-id': 'operator.journeys',
  'x-operator-role': role,
  'x-tenant-id': tenantId
})

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

async function createLinkedPatient(
  app: ReturnType<typeof buildServer>,
  headers: Record<string, string>,
  suffix: string
) {
  const owner = await app.inject({
    method: 'POST',
    url: '/v1/journeys/owner-drafts',
    headers,
    payload: {
      phone: '+5511999990001',
      name: `Tutor ${suffix}`,
      idempotencyKey: `journey-owner-${suffix}`
    }
  })
  const ownerData = (
    owner.json() as Envelope<{ id: string; candidateIds: string[] }>
  ).data
  const patient = await app.inject({
    method: 'POST',
    url: '/v1/journeys/patient-drafts',
    headers,
    payload: {
      ownerDraftId: ownerData?.id,
      ownerCandidateId: ownerData?.candidateIds[0],
      name: 'Bolt',
      idempotencyKey: `journey-patient-${suffix}`
    }
  })
  const patientData = (
    patient.json() as Envelope<{ id: string; candidateIds: string[] }>
  ).data
  const linked = await app.inject({
    method: 'POST',
    url: `/v1/journeys/patient-drafts/${patientData?.id}/link`,
    headers,
    payload: { candidateId: patientData?.candidateIds[0] }
  })
  return {
    owner: ownerData,
    patient: patientData,
    linked: linked.json() as Envelope<{ id: string; status: string }>
  }
}

describe('journey routes coverage', () => {
  it('runs the full owner, patient, slot, appointment and task journey', async () => {
    const app = buildServer({ inboundTenantResolver: () => tenantA })
    const headers = operatorHeaders()
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'journey-coverage-1',
        senderRef: 'fixture-sender',
        body: 'Mensagem fictícia para jornada',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    const sessionId = (inbound.json() as Envelope<{ sessionId: string }>).data
      ?.sessionId
    const ownerDraft = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers,
      payload: {
        phone: '+5511999990001',
        name: 'Tutor Fictício',
        idempotencyKey: 'coverage-owner-1'
      }
    })
    const ownerData = (
      ownerDraft.json() as Envelope<{ id: string; candidateIds: string[] }>
    ).data
    const ownerList = await app.inject({
      method: 'GET',
      url: '/v1/journeys/owner-drafts',
      headers
    })
    const ownerSearch = await app.inject({
      method: 'GET',
      url: '/v1/journeys/owners/search?phone=%2B5511999990001',
      headers
    })
    const patientSearch = await app.inject({
      method: 'GET',
      url: `/v1/journeys/patients/search?ownerDraftId=${ownerData?.id}&ownerCandidateId=${ownerData?.candidateIds[0]}&name=Pet`,
      headers
    })
    const patientDraft = await app.inject({
      method: 'POST',
      url: '/v1/journeys/patient-drafts',
      headers,
      payload: {
        ownerDraftId: ownerData?.id,
        ownerCandidateId: ownerData?.candidateIds[0],
        name: 'Bolt',
        species: 'felino',
        idempotencyKey: 'coverage-patient-1'
      }
    })
    const patientData = (
      patientDraft.json() as Envelope<{ id: string; candidateIds: string[] }>
    ).data
    const patientList = await app.inject({
      method: 'GET',
      url: '/v1/journeys/patient-drafts',
      headers
    })
    const linked = await app.inject({
      method: 'POST',
      url: `/v1/journeys/patient-drafts/${patientData?.id}/link`,
      headers,
      payload: { candidateId: patientData?.candidateIds[0] }
    })
    const slots = await app.inject({
      method: 'GET',
      url: '/v1/journeys/slots',
      headers
    })
    const slot = (
      slots.json() as Envelope<{
        slots: Array<{ id: string; startsAt: string }>
      }>
    ).data?.slots[0]
    const appointmentDraft = await app.inject({
      method: 'POST',
      url: '/v1/journeys/appointment-drafts',
      headers,
      payload: {
        patientDraftId: patientData?.id,
        slot: slot?.id,
        idempotencyKey: 'coverage-appointment-1'
      }
    })
    const appointmentList = await app.inject({
      method: 'GET',
      url: '/v1/journeys/appointment-drafts',
      headers
    })
    const parentTask = await app.inject({
      method: 'POST',
      url: '/v1/journeys/tasks',
      headers,
      payload: {
        sessionId,
        title: 'Confirmar retorno fictício',
        description: 'Ligar para tutor fictício',
        priority: 'high',
        idempotencyKey: 'coverage-journey-task-1'
      }
    })
    await app.close()

    expect(ownerDraft.statusCode).toBe(200)
    expect((ownerList.json() as Envelope<unknown[]>).data).toHaveLength(1)
    expect(
      (ownerSearch.json() as Envelope<{ matches: unknown[] }>).data?.matches
    ).toHaveLength(1)
    expect(patientSearch.statusCode).toBe(200)
    expect(patientDraft.statusCode).toBe(200)
    expect(
      (patientList.json() as Envelope<{ drafts: unknown[] }>).data?.drafts
    ).toHaveLength(1)
    expect(linked.statusCode).toBe(200)
    expect(linked.json().data?.status).toBe('linked')
    expect(slot?.id).toBeDefined()
    expect(appointmentDraft.statusCode).toBe(200)
    expect(
      (appointmentList.json() as Envelope<{ drafts: unknown[] }>).data?.drafts
    ).toHaveLength(1)
    expect(parentTask.statusCode).toBe(200)
    expect(
      (parentTask.json() as Envelope<{ status: string }>).data?.status
    ).toBe('open')
  })

  it('rejects unauthenticated, cross-tenant and malformed journey requests', async () => {
    const app = buildServer()
    const trustedApp = buildServer({
      operatorIdentityResolver: () => ({
        operatorId: 'operator.journeys',
        role: 'Operator',
        tenantId: tenantA
      })
    })
    const headers = operatorHeaders()
    const linkedFixture = await createLinkedPatient(app, headers, '900')

    const missingIdentity = await app.inject({
      method: 'GET',
      url: '/v1/journeys/owner-drafts'
    })
    const crossTenant = await trustedApp.inject({
      method: 'GET',
      url: '/v1/journeys/owner-drafts',
      headers: operatorHeaders(tenantB)
    })
    const invalidCandidate = await app.inject({
      method: 'POST',
      url: `/v1/journeys/patient-drafts/${linkedFixture.patient?.id}/link`,
      headers,
      payload: { candidateId: 42 }
    })
    const unknownPatient = await app.inject({
      method: 'POST',
      url: '/v1/journeys/patient-drafts/patient_draft_missing/link',
      headers,
      payload: { candidateId: 'candidate_missing' }
    })
    const invalidRole = await app.inject({
      method: 'GET',
      url: '/v1/journeys/slots',
      headers: {
        'x-operator-id': 'operator.journeys',
        'x-operator-role': 'Root',
        'x-tenant-id': tenantA
      }
    })
    const appointmentWithoutLink = await app.inject({
      method: 'POST',
      url: '/v1/journeys/appointment-drafts',
      headers,
      payload: {
        patientDraftId: 'patient_draft_missing',
        slot: '2026-01-01T00:00:00.000Z',
        idempotencyKey: 'coverage-appointment-missing'
      }
    })
    const unavailableSlot = await app.inject({
      method: 'POST',
      url: '/v1/journeys/appointment-drafts',
      headers,
      payload: {
        patientDraftId: linkedFixture.patient?.id,
        slot: '2026-01-01T00:00:00.000Z',
        idempotencyKey: 'coverage-appointment-bad-slot'
      }
    })
    await app.close()
    await trustedApp.close()

    expect(missingIdentity.statusCode).toBe(401)
    expect(crossTenant.statusCode).toBe(403)
    expect(invalidCandidate.statusCode).toBe(400)
    expect((invalidCandidate.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
    expect(unknownPatient.statusCode).toBe(404)
    expect(invalidRole.statusCode).toBe(401)
    expect(appointmentWithoutLink.statusCode).toBe(404)
    expect(unavailableSlot.statusCode).toBe(409)
  })

  it('requires an authenticated identity on mutations when enabled', async () => {
    const app = buildServer({
      requireAuthenticatedMutations: true,
      inboundTenantResolver: () => tenantA,
      operatorIdentityResolver: (headers) => {
        if (
          headers['x-operator-id'] !== 'operator.journeys' ||
          headers['x-operator-role'] !== 'Operator'
        ) {
          throw new Error('Untrusted operator identity')
        }
        return {
          operatorId: 'operator.journeys',
          role: 'Operator',
          tenantId: tenantA
        }
      }
    })
    const headers = operatorHeaders()
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'journey-coverage-2',
        senderRef: 'fixture-sender',
        body: 'Mensagem fictícia autenticada',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    const sessionId = (inbound.json() as Envelope<{ sessionId: string }>).data
      ?.sessionId

    const unauthenticatedOwner = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      payload: {
        phone: '+5511999900002',
        idempotencyKey: 'coverage-owner-2'
      }
    })
    const owner = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers,
      payload: {
        phone: '+5511999900002',
        name: 'Tutor Autenticado',
        idempotencyKey: 'coverage-owner-2'
      }
    })
    const ownerData = (
      owner.json() as Envelope<{ id: string; candidateIds: string[] }>
    ).data
    const crossTenantOwner = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers: operatorHeaders(tenantB),
      payload: {
        phone: '+5511999900003',
        name: 'Tutor Outro Tenant',
        idempotencyKey: 'coverage-owner-3'
      }
    })
    const patient = await app.inject({
      method: 'POST',
      url: '/v1/journeys/patient-drafts',
      headers,
      payload: {
        ownerDraftId: ownerData?.id,
        ownerCandidateId: ownerData?.candidateIds[0],
        name: 'Pet Autenticado',
        idempotencyKey: 'coverage-patient-2'
      }
    })
    const crossTenantPatient = await app.inject({
      method: 'POST',
      url: '/v1/journeys/patient-drafts',
      headers: operatorHeaders(tenantB),
      payload: {
        ownerDraftId: ownerData?.id,
        name: 'Pet Cross Tenant',
        idempotencyKey: 'coverage-patient-3'
      }
    })
    const appointment = await app.inject({
      method: 'POST',
      url: '/v1/journeys/appointment-drafts',
      headers,
      payload: {
        patientDraftId: 'patient_draft_authenticated',
        slot: '2026-01-01T00:00:00.000Z',
        idempotencyKey: 'coverage-appointment-2'
      }
    })
    const task = await app.inject({
      method: 'POST',
      url: '/v1/journeys/tasks',
      headers,
      payload: {
        sessionId,
        title: 'Tarefa autenticada fictícia',
        description: 'Sem efeito real',
        idempotencyKey: 'coverage-journey-task-2'
      }
    })
    const unauthenticatedTask = await app.inject({
      method: 'POST',
      url: '/v1/journeys/tasks',
      payload: {
        sessionId: 'sess_00000000-0000-4000-8000-000000000803',
        title: 'Tarefa sem identidade',
        description: 'Sem efeito real',
        idempotencyKey: 'coverage-journey-task-3'
      }
    })
    await app.close()

    expect(unauthenticatedOwner.statusCode).toBe(401)
    expect(owner.statusCode).toBe(200)
    expect(crossTenantOwner.statusCode).toBe(403)
    expect(patient.statusCode).toBe(200)
    expect(crossTenantPatient.statusCode).toBe(403)
    expect(appointment.statusCode).toBe(404)
    expect(task.statusCode).toBe(200)
    expect(unauthenticatedTask.statusCode).toBe(401)
  })

  it('fails journey routes closed when PostgreSQL mode has no journey repository', async () => {
    const client = { query: async () => ({ rows: [] }) }
    const app = buildServer({
      persistence: { kind: 'postgres', client: client as never },
      journeyRepository: null
    })
    const headers = operatorHeaders()
    const unavailable = [
      {
        method: 'GET' as const,
        url: '/v1/journeys/owners/search?phone=%2B5511'
      },
      { method: 'GET' as const, url: '/v1/journeys/patients/search' },
      { method: 'GET' as const, url: '/v1/journeys/owner-drafts' },
      { method: 'GET' as const, url: '/v1/journeys/patient-drafts' },
      { method: 'GET' as const, url: '/v1/journeys/slots' },
      { method: 'GET' as const, url: '/v1/journeys/appointment-drafts' },
      {
        method: 'POST' as const,
        url: '/v1/journeys/owner-drafts',
        payload: { phone: '+5511999900004', idempotencyKey: 'coverage-pg-1' }
      },
      {
        method: 'POST' as const,
        url: '/v1/journeys/patient-drafts',
        payload: {
          ownerDraftId: 'owner_draft_x',
          name: 'Pet',
          idempotencyKey: 'coverage-pg-2'
        }
      },
      {
        method: 'POST' as const,
        url: '/v1/journeys/patient-drafts/patient_draft_x/link',
        payload: { candidateId: 'candidate_x' }
      },
      {
        method: 'POST' as const,
        url: '/v1/journeys/appointment-drafts',
        payload: {
          patientDraftId: 'patient_draft_x',
          slot: '2026-01-01T00:00:00.000Z',
          idempotencyKey: 'coverage-pg-3'
        }
      },
      {
        method: 'POST' as const,
        url: '/v1/journeys/tasks',
        payload: {
          sessionId: 'sess_00000000-0000-4000-8000-000000000804',
          title: 'Tarefa PostgreSQL',
          description: 'Sem efeito real',
          idempotencyKey: 'coverage-pg-4'
        }
      }
    ]
    const responses = []
    for (const request of unavailable) {
      responses.push(
        await app.inject(
          request.method === 'GET'
            ? { method: request.method, url: request.url, headers }
            : {
                method: request.method,
                url: request.url,
                payload: request.payload
              }
        )
      )
    }
    await app.close()

    for (const response of responses) {
      expect(response.statusCode).toBe(400)
      expect((response.json() as Envelope<never>).error?.code).toBe(
        'invalid_action'
      )
    }
  })
})
