import { describe, expect, it } from 'vitest'
import { DomainError } from '@cvg/shared'
import { VersionedKnowledgeCatalog } from '../institutional-rag.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000801' as const
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000802' as const

function addSource(
  catalog: VersionedKnowledgeCatalog,
  overrides: Partial<{
    tenantId: typeof tenantId
    version: string
    question: string
    answer: string
    source: string
  }> = {}
) {
  return catalog.add({
    tenantId,
    version: 'fixture-v1',
    question: 'qual o horario de funcionamento',
    answer: 'Atendimento das 8h as 18h.',
    source: 'fixture-manual',
    ...overrides
  })
}

describe('versioned knowledge catalog validation', () => {
  it('rejects invalid source fields before storing them', () => {
    const catalog = new VersionedKnowledgeCatalog()
    const invalidInputs = [
      { version: '', question: 'q', answer: 'a', source: 's' },
      { version: 'v', question: '   ', answer: 'a', source: 's' },
      { version: 'v', question: 'q', answer: '', source: 's' },
      { version: 'v', question: 'q', answer: 'a'.repeat(4001), source: 's' },
      { version: 'v'.repeat(81), question: 'q', answer: 'a', source: 's' },
      { version: 'v', question: 'q', answer: 'a', source: 's'.repeat(241) },
      { version: 'v', question: 42, answer: 'a', source: 's' }
    ]

    for (const input of invalidInputs) {
      expect(() => catalog.add({ tenantId, ...input } as never)).toThrow(
        DomainError
      )
    }
    expect(catalog.list(tenantId)).toEqual([])
  })

  it('rejects unknown ids and refuses to republish a revoked source', () => {
    const catalog = new VersionedKnowledgeCatalog()

    expect(() => catalog.publish(tenantId, 'missing')).toThrow(/not found/)
    expect(() => catalog.revoke(tenantId, 'missing')).toThrow(/not found/)

    const record = addSource(catalog)
    catalog.revoke(tenantId, record.id)
    expect(() => catalog.publish(tenantId, record.id)).toThrow(
      /Knowledge source is revoked/
    )
  })

  it('rejects questions outside the bounded length', () => {
    const catalog = new VersionedKnowledgeCatalog()
    expect(() => catalog.answer(tenantId, 'q'.repeat(241))).toThrow(
      /Knowledge question is invalid/
    )
    expect(() => catalog.answer(tenantId, '   ')).toThrow(
      /Knowledge question is invalid/
    )
  })
})

describe('versioned knowledge catalog answering', () => {
  it('answers from the most recently published matching version', async () => {
    const catalog = new VersionedKnowledgeCatalog()
    const older = addSource(catalog, { version: 'fixture-v1' })
    catalog.publish(tenantId, older.id)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const newer = addSource(catalog, {
      version: 'fixture-v2',
      answer: 'Atendimento das 9h as 17h.'
    })
    catalog.publish(tenantId, newer.id)

    expect(
      catalog.answer(tenantId, 'qual o horario de funcionamento?')
    ).toEqual({
      status: 'answered',
      answer: 'Atendimento das 9h as 17h.',
      source: 'fixture-manual',
      version: 'fixture-v2'
    })
  })

  it('matches partial questions in both directions', () => {
    const catalog = new VersionedKnowledgeCatalog()
    const record = addSource(catalog)
    catalog.publish(tenantId, record.id)

    expect(catalog.answer(tenantId, 'horario')).toMatchObject({
      status: 'answered',
      version: 'fixture-v1'
    })
    expect(
      catalog.answer(tenantId, 'qual o horario de funcionamento hoje?')
    ).toMatchObject({ status: 'answered', version: 'fixture-v1' })
  })

  it('hands off clinical questions and other tenants even when a source matches', () => {
    const catalog = new VersionedKnowledgeCatalog()
    const record = addSource(catalog, {
      question: 'tratamento indicado',
      answer: 'Fonte administrativa.'
    })
    catalog.publish(tenantId, record.id)

    expect(catalog.answer(tenantId, 'tratamento indicado')).toEqual({
      status: 'handoff',
      reason: 'medical_question'
    })
    expect(
      catalog.answer(otherTenant, 'qual o horario de funcionamento')
    ).toEqual({ status: 'handoff', reason: 'approved_source_missing' })
  })

  it('lists tenant-scoped clones including revoked records', () => {
    const catalog = new VersionedKnowledgeCatalog()
    const published = addSource(catalog, { version: 'fixture-v1' })
    const revoked = addSource(catalog, { version: 'fixture-v2' })
    catalog.publish(tenantId, published.id)
    catalog.publish(tenantId, revoked.id)
    catalog.revoke(tenantId, revoked.id)

    const listed = catalog.list(tenantId)
    expect(listed).toHaveLength(2)
    expect(listed.map((item) => item.status)).toEqual(['published', 'revoked'])
    expect(listed[1]?.revokedAt).toBeInstanceOf(Date)
    expect(listed[0]?.publishedAt).toBeInstanceOf(Date)
    expect(catalog.list(otherTenant)).toEqual([])

    listed[0]!.status = 'revoked'
    expect(catalog.list(tenantId)[0]?.status).toBe('published')
  })

  it('redacts sensitive content at rest before it can be answered', () => {
    const catalog = new VersionedKnowledgeCatalog()
    const record = addSource(catalog, {
      question: 'qual o canal de contato',
      answer: 'Envie email para ana@example.com ou ligue +55 11 99999-9999',
      source: 'fixture-manual'
    })

    expect(record.answer).toContain('[redacted-email]')
    expect(record.answer).toContain('[redacted-phone]')
    expect(record.answer).not.toContain('ana@example.com')

    catalog.publish(tenantId, record.id)
    const answer = catalog.answer(tenantId, 'qual o canal de contato')
    expect(answer).toMatchObject({ status: 'answered' })
    expect(JSON.stringify(answer)).not.toContain('ana@example.com')
  })
})
