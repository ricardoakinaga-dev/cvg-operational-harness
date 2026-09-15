import { describe, expect, it } from 'vitest'
import {
  createAppointmentDraft,
  createJourneyTask,
  createOwnerDraft,
  createPatientDraft,
  findAvailableSlots,
  linkPatient,
  recordJourneyHandoff,
  searchOwnerByPhone,
  searchPatient,
  toolFailure
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000321'

type RepositoryStub = Record<string, (...args: never[]) => unknown>

function recordingRepository(result: unknown = { id: 'synthetic-record' }) {
  const calls: unknown[][] = []
  const repository = new Proxy(
    {},
    {
      get:
        () =>
        (...args: unknown[]) => {
          calls.push(args)
          return result
        }
    }
  ) as RepositoryStub
  return { repository, calls }
}

function explodingRepository(error: unknown) {
  return new Proxy(
    {},
    {
      get: () => () => {
        throw error
      }
    }
  ) as RepositoryStub
}

describe('local journey handlers without a bound context', () => {
  it('requires context for persistent writes', () => {
    expect(createJourneyTask({ title: 'x' })).toEqual({
      status: 'failed',
      error: 'context_required'
    })
    expect(linkPatient({ patientId: 'p1' })).toEqual({
      status: 'failed',
      error: 'context_required'
    })
    expect(recordJourneyHandoff({ reason: 'x' })).toEqual({
      status: 'failed',
      error: 'context_required'
    })
  })

  it('keeps the deterministic legacy fixture responses', () => {
    expect(searchOwnerByPhone({ phone: '+5511999990001' })).toEqual({
      status: 'succeeded',
      data: { matches: [] }
    })
    expect(searchOwnerByPhone({})).toEqual({
      status: 'failed',
      error: 'validation_failed'
    })
    expect(searchOwnerByPhone(null)).toEqual({
      status: 'failed',
      error: 'validation_failed'
    })
    expect(findAvailableSlots()).toMatchObject({
      status: 'succeeded',
      data: {
        slots: ['2026-05-01T10:00:00-03:00', '2026-05-01T14:00:00-03:00']
      }
    })
    expect(createAppointmentDraft(null)).toEqual({
      status: 'succeeded',
      data: { draft: true, confirmationBlocked: true, input: null }
    })
    expect(createOwnerDraft(null)).toEqual({
      status: 'succeeded',
      data: { draft: true, input: null }
    })
    expect(createPatientDraft(null)).toEqual({
      status: 'succeeded',
      data: { draft: true, input: null }
    })
    expect(searchPatient({ name: 'Ana' })).toEqual({
      status: 'succeeded',
      data: { matches: [], input: { name: 'Ana' } }
    })
  })
})

describe('local journey handlers with a bound context', () => {
  it('merges tenant scope into every repository call and coerces non-object input', () => {
    const cases: Array<{
      run: (context: never) => unknown
      method: string
    }> = [
      {
        run: (context) => createJourneyTask(null, context),
        method: 'createJourneyTask'
      },
      { run: (context) => linkPatient('raw', context), method: 'linkPatient' },
      {
        run: (context) => recordJourneyHandoff(42, context),
        method: 'recordHandoff'
      },
      {
        run: (context) => createOwnerDraft(undefined, context),
        method: 'createOwnerDraft'
      },
      {
        run: (context) => createPatientDraft(null, context),
        method: 'createPatientDraft'
      },
      {
        run: (context) => searchPatient(null, context),
        method: 'searchPatient'
      },
      {
        run: (context) => createAppointmentDraft(null, context),
        method: 'createAppointmentDraft'
      },
      {
        run: (context) => findAvailableSlots(context),
        method: 'findAvailableSlots'
      },
      {
        run: (context) => searchOwnerByPhone({ phone: '11999990001' }, context),
        method: 'searchOwnerByPhone'
      }
    ]

    for (const entry of cases) {
      const { repository, calls } = recordingRepository()
      entry.run({ tenantId, repository } as never)
      expect(calls, entry.method).toHaveLength(1)
      if (entry.method === 'findAvailableSlots') {
        expect(calls[0]?.[0], entry.method).toBe(tenantId)
      } else if (entry.method === 'searchOwnerByPhone') {
        expect(calls[0]?.[0], entry.method).toBe(tenantId)
        expect(calls[0]?.[1], entry.method).toBe('11999990001')
      } else {
        expect(calls[0]?.[0], entry.method).toMatchObject({ tenantId })
      }
    }

    const owner = recordingRepository({ id: 'owner-1' })
    expect(
      createOwnerDraft({ phone: '+5511999990001' }, {
        tenantId,
        repository: owner.repository
      } as never)
    ).toEqual({ status: 'succeeded', data: { id: 'owner-1' } })
    expect(owner.calls[0]?.[0]).toEqual({
      phone: '+5511999990001',
      tenantId
    })
  })

  it('maps repository failures with machine codes and fallback errors', () => {
    const coded = explodingRepository({ code: 'repository_unavailable' })
    const context = { tenantId, repository: coded } as never

    expect(createJourneyTask({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(linkPatient({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(recordJourneyHandoff({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(createOwnerDraft({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(createPatientDraft({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(searchPatient({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(createAppointmentDraft({}, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(findAvailableSlots(context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })
    expect(searchOwnerByPhone({ phone: '11999990001' }, context)).toEqual({
      status: 'failed',
      error: 'repository_unavailable'
    })

    const uncoded = explodingRepository(new Error('boom'))
    const uncodedContext = { tenantId, repository: uncoded } as never
    expect(createPatientDraft({}, uncodedContext)).toEqual({
      status: 'failed',
      error: 'validation_failed'
    })
  })
})

describe('tool failure normalization', () => {
  it('preserves only string machine codes', () => {
    expect(toolFailure({ code: 'duplicate' })).toEqual({
      status: 'failed',
      error: 'duplicate'
    })
    expect(toolFailure({ code: 42 })).toEqual({
      status: 'failed',
      error: 'validation_failed'
    })
    expect(toolFailure(null)).toEqual({
      status: 'failed',
      error: 'validation_failed'
    })
    expect(toolFailure('raw')).toEqual({
      status: 'failed',
      error: 'validation_failed'
    })
  })
})
