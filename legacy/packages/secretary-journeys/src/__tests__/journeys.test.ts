import { describe, expect, it } from 'vitest'
import { InMemoryDatabase } from '@cvg/persistence'
import { ConversationRepository } from '@cvg/persistence'
import { JourneyRepository } from '../memory-repository.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000301' as const
const tenantB = 'tenant_00000000-0000-4000-8000-000000000302' as const

describe('controlled journey repository', () => {
  it('persists owner/patient drafts across a reconstructed repository and blocks ambiguity', () => {
    const db = new InMemoryDatabase()
    let now = new Date('2026-09-05T12:00:00.000Z')
    const first = new JourneyRepository(db, { clock: () => now })
    const owner = first.createOwnerDraft({
      tenantId: tenantA,
      phone: '+55 (11) 99999-0001',
      name: 'Ana Ficticia',
      idempotencyKey: 'journey-owner-301'
    })
    expect(first.searchOwnerByPhone(tenantA, '+5511999990001')).toHaveLength(1)

    const restarted = new JourneyRepository(db, { clock: () => now })
    const restored = restarted.findOwnerDraft(tenantA, owner.id)
    expect(restored).toMatchObject({ id: owner.id, status: 'draft' })
    expect(() =>
      restarted.createPatientDraft({
        tenantId: tenantA,
        ownerDraftId: owner.id,
        name: 'Bolt',
        idempotencyKey: 'journey-patient-301'
      })
    ).not.toThrow()

    const ambiguous = restarted.createOwnerDraft({
      tenantId: tenantA,
      phone: '+5511999990002',
      idempotencyKey: 'journey-owner-ambiguous-301'
    })
    expect(ambiguous.candidateIds).toHaveLength(2)
    expect(() =>
      restarted.createPatientDraft({
        tenantId: tenantA,
        ownerDraftId: ambiguous.id,
        name: 'Luna',
        idempotencyKey: 'journey-patient-ambiguous-301'
      })
    ).toThrowError(/ambiguous/i)

    now = new Date('2026-09-06T13:00:00.000Z')
    expect(restarted.findOwnerDraft(tenantA, owner.id)).toMatchObject({
      status: 'expired'
    })
  })

  it('keeps tenant scope, links an explicit candidate and creates an approval-blocked appointment draft', () => {
    const db = new InMemoryDatabase()
    let now = new Date('2026-09-05T12:00:00.000Z')
    const conversations = new ConversationRepository(db)
    const session = conversations.createWithSession({
      tenantId: tenantA,
      channel: 'web',
      senderRef: 'journey-fixture-301',
      externalMessageId: 'journey-message-301',
      body: 'Fixture'
    })
    const other = conversations.createWithSession({
      tenantId: tenantB,
      channel: 'web',
      senderRef: 'journey-fixture-302',
      externalMessageId: 'journey-message-302',
      body: 'Fixture'
    })
    const journeys = new JourneyRepository(db, { clock: () => now })
    expect(() =>
      journeys.createOwnerDraft({
        tenantId: tenantA,
        phone: '+5511999990001',
        conversationId: other.conversation.id,
        sessionId: other.session.id,
        idempotencyKey: 'journey-cross-tenant-301'
      })
    ).toThrowError(/tenant scope/i)
    const owner = journeys.createOwnerDraft({
      tenantId: tenantA,
      phone: '+5511999990001',
      idempotencyKey: 'journey-owner-linked-301',
      conversationId: session.conversation.id,
      sessionId: session.session.id
    })
    const patient = journeys.createPatientDraft({
      tenantId: tenantA,
      ownerDraftId: owner.id,
      ownerCandidateId: owner.candidateIds[0] ?? null,
      name: 'Bolt',
      species: 'dog',
      idempotencyKey: 'journey-patient-linked-301',
      conversationId: session.conversation.id,
      sessionId: session.session.id
    })
    expect(journeys.findOwnerDraft(tenantB, owner.id)).toBeNull()
    expect(() =>
      journeys.linkPatient({
        tenantId: tenantB,
        patientDraftId: patient.id,
        candidateId: patient.candidateIds[0]!
      })
    ).toThrowError(/not found/i)
    const linked = journeys.linkPatient({
      tenantId: tenantA,
      patientDraftId: patient.id,
      candidateId: patient.candidateIds[0]!
    })
    expect(linked.status).toBe('linked')
    const slots = journeys.findAvailableSlots(tenantA)
    expect(new Date(slots[0]!.startsAt).getTime()).toBeGreaterThan(
      now.getTime()
    )
    now = new Date('2026-09-05T12:00:25.000Z')
    const slotsAfterClockDrift = journeys.findAvailableSlots(tenantA)
    expect(slotsAfterClockDrift[0]).toEqual(slots[0])
    const appointment = journeys.createAppointmentDraft({
      tenantId: tenantA,
      patientDraftId: linked.id,
      slot: slots[0]!.id,
      idempotencyKey: 'journey-appointment-301',
      conversationId: session.conversation.id,
      sessionId: session.session.id
    })
    expect(appointment).toMatchObject({
      status: 'awaiting_approval',
      confirmationBlocked: true,
      sourceVersion: 'synthetic-schedule-v1'
    })
    expect(
      db.state.auditEvents.some((event) =>
        JSON.stringify(event.payload).includes('journey-appointment-301')
      )
    ).toBe(false)

    now = new Date('2026-09-12T12:00:00.000Z')
    expect(() =>
      journeys.createAppointmentDraft({
        tenantId: tenantA,
        patientDraftId: linked.id,
        slot: slots[0]!.id,
        idempotencyKey: 'journey-appointment-expired-301'
      })
    ).toThrowError(/unavailable|expired/i)
  })
})
