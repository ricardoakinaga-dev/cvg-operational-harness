import { createHash } from 'node:crypto'
import { DomainError } from '@cvg/shared'
import { canonicalizeCapabilityInput } from './approval-authority.ts'
import {
  AgentConfigSchema,
  type AgentConfig,
  type AgentVersionRecord,
  type PromptBlock
} from './contracts.ts'
import { composePrompt } from './prompt-composer.ts'

export const CONTROLLED_KERNEL_PROMPT_BLOCK: Readonly<PromptBlock> =
  Object.freeze({
    id: 'kernel-safety',
    kind: 'safety',
    content:
      'Não prescreva, diagnostique, confirme consultas reais nem exponha dados confidenciais. Encaminhe ações sensíveis para revisão humana.',
    priority: -10000,
    enabled: true,
    locked: true
  })

export const KERNEL_RESPONSE_TEMPLATE_KEYS = Object.freeze([
  'security_blocked',
  'emergency',
  'medication_advice',
  'human_takeover',
  'system_error'
])

const secretPattern =
  /(sk-[A-Za-z0-9][A-Za-z0-9_-]*|pk_[A-Za-z0-9][A-Za-z0-9_-]*|Bearer\s+[A-Za-z0-9._~+/=-]+|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=])/i
const responseTemplateKeyPattern = /^[A-Za-z0-9._:-]+$/
const prototypeKeys = new Set(['__proto__', 'constructor', 'prototype'])

export interface PromptProfileSnapshot {
  version: string
  status: AgentVersionRecord['status']
  checksum: string
  blockIds: string[]
  templateKeys: string[]
}

export function createPromptProfileChecksum(
  config: Pick<AgentConfig, 'promptBlocks' | 'responseTemplates'>
): string {
  const canonical = canonicalizeCapabilityInput({
    promptBlocks: [...config.promptBlocks]
      .map((block) => ({
        id: block.id,
        kind: block.kind,
        content: block.content,
        priority: block.priority,
        enabled: block.enabled,
        locked: block.locked === true
      }))
      .sort(comparePromptBlocks),
    responseTemplates: Object.fromEntries(
      Object.entries(config.responseTemplates).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    )
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function createPromptProfileSnapshot(
  version: Pick<AgentVersionRecord, 'id' | 'version' | 'status' | 'config'>
): PromptProfileSnapshot {
  const composed = composePrompt(version.config)
  return {
    version: `${version.id}:v${version.version}`,
    status: version.status,
    checksum: createPromptProfileChecksum(version.config),
    blockIds: composed.blockIds,
    templateKeys: Object.keys(version.config.responseTemplates).sort(
      (left, right) => left.localeCompare(right)
    )
  }
}

export function assertPromptProfileIntegrity(config: AgentConfig): void {
  const parsed = AgentConfigSchema.parse(config)
  const promptBlockIds = new Set<string>()
  for (const block of parsed.promptBlocks) {
    if (promptBlockIds.has(block.id)) {
      throw new DomainError(
        'validation_failed',
        'Prompt block id must be unique'
      )
    }
    promptBlockIds.add(block.id)
  }
  const kernel = parsed.promptBlocks.find(
    (block) => block.id === CONTROLLED_KERNEL_PROMPT_BLOCK.id
  )
  if (kernel && !sameProtectedBlock(kernel, CONTROLLED_KERNEL_PROMPT_BLOCK)) {
    throw new DomainError(
      'invalid_action',
      'Protected kernel prompt block cannot be changed'
    )
  }

  for (const block of parsed.promptBlocks) {
    if (
      block.locked === true &&
      !sameProtectedBlock(block, CONTROLLED_KERNEL_PROMPT_BLOCK)
    ) {
      throw new DomainError(
        'invalid_action',
        'Only the controlled kernel prompt block may be locked'
      )
    }
    if (secretPattern.test(block.content)) {
      throw new DomainError(
        'validation_failed',
        'Prompt content cannot contain credential-like values'
      )
    }
  }

  for (const [key, value] of Object.entries(parsed.responseTemplates)) {
    if (
      key.length === 0 ||
      key.length > 120 ||
      !responseTemplateKeyPattern.test(key) ||
      prototypeKeys.has(key)
    ) {
      throw new DomainError(
        'validation_failed',
        'Response template key is invalid'
      )
    }
    if (
      KERNEL_RESPONSE_TEMPLATE_KEYS.includes(
        key as (typeof KERNEL_RESPONSE_TEMPLATE_KEYS)[number]
      )
    ) {
      throw new DomainError(
        'invalid_action',
        'Response template is reserved by kernel safety'
      )
    }
    if (secretPattern.test(value)) {
      throw new DomainError(
        'validation_failed',
        'Response template cannot contain credential-like values'
      )
    }
  }
}

export function assertPromptProfileClone(
  source: AgentConfig,
  next: AgentConfig
): void {
  assertPromptProfileIntegrity(next)
  for (const protectedBlock of source.promptBlocks.filter(
    isProtectedPromptBlock
  )) {
    const candidate = next.promptBlocks.find(
      (block) => block.id === protectedBlock.id
    )
    if (!candidate || !sameProtectedBlock(candidate, protectedBlock)) {
      throw new DomainError(
        'invalid_action',
        'Protected prompt block must be preserved'
      )
    }
  }
  for (const key of KERNEL_RESPONSE_TEMPLATE_KEYS) {
    const sourceValue = source.responseTemplates[key]
    const nextValue = next.responseTemplates[key]
    if (sourceValue !== undefined || nextValue !== undefined) {
      throw new DomainError(
        'invalid_action',
        'Response template is reserved by kernel safety'
      )
    }
  }

  const sourceProtectedIds = new Set(
    source.promptBlocks.filter(isProtectedPromptBlock).map((block) => block.id)
  )
  for (const block of next.promptBlocks.filter(isProtectedPromptBlock)) {
    if (
      block.id !== CONTROLLED_KERNEL_PROMPT_BLOCK.id &&
      !sourceProtectedIds.has(block.id)
    ) {
      throw new DomainError(
        'invalid_action',
        'New protected prompt block is not allowed'
      )
    }
  }
}

export function isProtectedPromptBlock(block: PromptBlock): boolean {
  return (
    block.locked === true ||
    block.kind === 'system' ||
    block.kind === 'safety' ||
    block.id === CONTROLLED_KERNEL_PROMPT_BLOCK.id
  )
}

function sameProtectedBlock(left: PromptBlock, right: PromptBlock): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.content === right.content &&
    left.priority === right.priority &&
    left.enabled === right.enabled &&
    left.locked === right.locked
  )
}

function comparePromptBlocks(left: PromptBlock, right: PromptBlock): number {
  if (left.priority !== right.priority) return left.priority - right.priority
  return left.id.localeCompare(right.id)
}
