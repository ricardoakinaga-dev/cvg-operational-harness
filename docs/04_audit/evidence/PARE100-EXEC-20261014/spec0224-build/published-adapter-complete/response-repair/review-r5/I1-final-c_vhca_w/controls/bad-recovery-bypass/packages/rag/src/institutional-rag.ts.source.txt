import { createDomainId, DomainError, redactSensitiveText } from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'

export interface ApprovedInstitutionalSource {
  version: string
  answer: string
  source: string
}

export interface KnowledgeSourceVersion {
  tenantId: TenantId
  id: string
  version: string
  question: string
  answer: string
  source: string
  status: 'draft' | 'published' | 'revoked'
  createdAt: Date
  publishedAt: Date | null
  revokedAt: Date | null
}

/** Versioned local catalog; a revoked or missing source always hands off. */
export class VersionedKnowledgeCatalog {
  private readonly records: KnowledgeSourceVersion[] = []

  add(input: {
    tenantId: TenantId
    version: string
    question: string
    answer: string
    source: string
  }): KnowledgeSourceVersion {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const version = bounded(input.version, 'version', 80)
    const question = bounded(input.question, 'question', 240)
    const answer = bounded(input.answer, 'answer', 4_000)
    const source = bounded(input.source, 'source', 240)
    const now = new Date()
    const record: KnowledgeSourceVersion = {
      tenantId,
      id: createDomainId('knowledge_fixture'),
      version,
      question,
      answer: redactSensitiveText(answer),
      source,
      status: 'draft',
      createdAt: now,
      publishedAt: null,
      revokedAt: null
    }
    this.records.push(record)
    return cloneRecord(record)
  }

  publish(rawTenantId: TenantId, id: string): KnowledgeSourceVersion {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const record = this.require(tenantId, id)
    if (record.status === 'revoked')
      throw new DomainError('conflict', 'Knowledge source is revoked')
    const now = new Date()
    record.status = 'published'
    record.publishedAt = now
    return cloneRecord(record)
  }

  revoke(rawTenantId: TenantId, id: string): KnowledgeSourceVersion {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const record = this.require(tenantId, id)
    record.status = 'revoked'
    record.revokedAt = new Date()
    return cloneRecord(record)
  }

  answer(
    rawTenantId: TenantId,
    question: string
  ): ReturnType<typeof answerFromInstitutionalSource> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const normalized = bounded(question, 'question', 240).toLocaleLowerCase()
    const record = this.records
      .filter(
        (item) => item.tenantId === tenantId && item.status === 'published'
      )
      .sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
      )
      .find(
        (item) =>
          normalized.includes(item.question.toLocaleLowerCase()) ||
          item.question.toLocaleLowerCase().includes(normalized)
      )
    if (!record) return { status: 'handoff', reason: 'approved_source_missing' }
    return answerFromInstitutionalSource(question, {
      version: record.version,
      answer: record.answer,
      source: record.source
    })
  }

  list(rawTenantId: TenantId): KnowledgeSourceVersion[] {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.records
      .filter((item) => item.tenantId === tenantId)
      .map(cloneRecord)
  }

  private require(tenantId: TenantId, id: string): KnowledgeSourceVersion {
    const record = this.records.find(
      (item) => item.tenantId === tenantId && item.id === id
    )
    if (!record)
      throw new DomainError('not_found', 'Knowledge source not found')
    return record
  }
}

export function answerFromInstitutionalSource(
  question: string,
  source: ApprovedInstitutionalSource | null
) {
  if (!source) return { status: 'handoff', reason: 'approved_source_missing' }
  if (/diagn[oó]stico|tratamento|prescri/i.test(question))
    return { status: 'handoff', reason: 'medical_question' }
  return {
    status: 'answered',
    answer: source.answer,
    source: source.source,
    version: source.version
  }
}

function bounded(raw: unknown, field: string, max: number): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > max) {
    throw new DomainError('validation_failed', `Knowledge ${field} is invalid`)
  }
  return raw.trim()
}

function cloneRecord(record: KnowledgeSourceVersion): KnowledgeSourceVersion {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
    revokedAt: record.revokedAt ? new Date(record.revokedAt) : null
  }
}
