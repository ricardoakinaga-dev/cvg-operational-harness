import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DataClassificationSchema, type DataClassification } from '@cvg/shared'

export const PromptStatusSchema = z.enum(['draft', 'approved', 'revoked'])
export type PromptStatus = z.infer<typeof PromptStatusSchema>

export const PromptRecordInputSchema = z
  .object({
    promptId: z.string().min(1).max(120),
    version: z.string().min(1).max(60),
    content: z.string().min(1).max(200_000),
    owner: z.string().min(1).max(120),
    approvedBy: z.string().min(1).max(120).optional(),
    status: PromptStatusSchema.default('draft'),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime().optional(),
    classification: DataClassificationSchema.default('INTERNAL'),
    tenantId: z.string().min(1).max(120).optional()
  })
  .strict()

export type PromptRecordInput = z.input<typeof PromptRecordInputSchema>
export type NormalizedPromptRecordInput = z.output<
  typeof PromptRecordInputSchema
>

export interface PromptRecord extends NormalizedPromptRecordInput {
  sha256: string
}

export interface PromptReference {
  promptId: string
  version: string
  sha256?: string
}

export class PromptRegistryError extends Error {
  readonly code:
    | 'prompt_duplicate'
    | 'prompt_unknown'
    | 'prompt_revoked'
    | 'prompt_not_effective'
    | 'prompt_expired'
    | 'prompt_hash_mismatch'
    | 'prompt_tenant_mismatch'

  constructor(code: PromptRegistryError['code'], message: string) {
    super(message)
    this.name = 'PromptRegistryError'
    this.code = code
  }
}

export function computePromptSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Versioned prompt registry. Production prompts must be approved, effective and
 * hash-verified before use; sessions remain pinned to a concrete version.
 */
export class PromptRegistry {
  readonly #records = new Map<string, PromptRecord>()

  #key(promptId: string, version: string): string {
    return `${promptId}@${version}`
  }

  register(input: PromptRecordInput): PromptRecord {
    const parsed = PromptRecordInputSchema.parse(input)
    const sha256 = computePromptSha256(parsed.content)
    const key = this.#key(parsed.promptId, parsed.version)
    const existing = this.#records.get(key)
    if (existing) {
      if (existing.sha256 !== sha256) {
        throw new PromptRegistryError(
          'prompt_duplicate',
          `Prompt ${key} is already registered with different content`
        )
      }
      return existing
    }
    const record: PromptRecord = { ...parsed, sha256 }
    this.#records.set(key, record)
    return record
  }

  get(promptId: string, version: string): PromptRecord | undefined {
    return this.#records.get(this.#key(promptId, version))
  }

  resolve(
    reference: PromptReference,
    options: {
      tenantId?: string
      at?: Date
    } = {}
  ): PromptRecord {
    const record = this.get(reference.promptId, reference.version)
    if (!record) {
      throw new PromptRegistryError(
        'prompt_unknown',
        `Prompt ${reference.promptId}@${reference.version} is not registered`
      )
    }
    if (record.status === 'revoked') {
      throw new PromptRegistryError(
        'prompt_revoked',
        `Prompt ${reference.promptId}@${reference.version} is revoked`
      )
    }
    if (record.status !== 'approved') {
      throw new PromptRegistryError(
        'prompt_not_effective',
        `Prompt ${reference.promptId}@${reference.version} is not approved`
      )
    }
    if (
      options.tenantId !== undefined &&
      record.tenantId !== undefined &&
      record.tenantId !== options.tenantId
    ) {
      throw new PromptRegistryError(
        'prompt_tenant_mismatch',
        'Prompt is not visible to this tenant'
      )
    }
    const at = options.at ?? new Date()
    if (at.getTime() < Date.parse(record.effectiveFrom)) {
      throw new PromptRegistryError(
        'prompt_not_effective',
        `Prompt ${reference.promptId}@${reference.version} is not effective yet`
      )
    }
    if (
      record.effectiveUntil &&
      at.getTime() > Date.parse(record.effectiveUntil)
    ) {
      throw new PromptRegistryError(
        'prompt_expired',
        `Prompt ${reference.promptId}@${reference.version} expired`
      )
    }
    if (reference.sha256 && reference.sha256 !== record.sha256) {
      throw new PromptRegistryError(
        'prompt_hash_mismatch',
        'Prompt content hash does not match the pinned reference'
      )
    }
    return record
  }

  list(): PromptRecord[] {
    return [...this.#records.values()]
  }
}

export function promptContainsClassification(
  record: Pick<PromptRecord, 'classification'>
): DataClassification {
  return record.classification
}
