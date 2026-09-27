import { z } from 'zod'
import type { PolicyProfile } from './profile.ts'

export const PolicyEffectSchema = z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL'])
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>

/** Policy documents are validated by `PolicyProfile.policyDocumentSchema`. */
export type PolicyRule = z.output<PolicyProfile['policyRuleSchema']>
export type PolicyRuleInput = z.input<PolicyProfile['policyRuleSchema']>

export type PolicyDocument = z.output<PolicyProfile['policyDocumentSchema']>
export type PolicyDocumentInput = z.input<PolicyProfile['policyDocumentSchema']>

export const ENGINE_POLICY_ID = 'builtin.deny_by_default'
export const ENGINE_POLICY_VERSION = 'policy-engine-v1'

export function policyDocumentKey(policyId: string, version: string): string {
  return `${policyId}@${version}`
}

export class PolicyRegistryError extends Error {
  readonly code: 'policy_duplicate' | 'policy_unknown'

  constructor(code: PolicyRegistryError['code'], message: string) {
    super(message)
    this.name = 'PolicyRegistryError'
    this.code = code
  }
}

/**
 * Versioned policy document registry. Tenant documents are additive with global
 * documents; a tenant document can only make decisions stricter because rule
 * resolution takes the most restrictive matching effect.
 */
export class PolicyRegistry {
  readonly #documents = new Map<string, PolicyDocument>()
  readonly #profile: PolicyProfile

  /** Documents are validated against the capabilities of `profile`. */
  constructor(profile: PolicyProfile) {
    this.#profile = profile
  }

  register(input: PolicyDocumentInput): PolicyDocument {
    const parsed = this.#profile.policyDocumentSchema.parse(input)
    const key = policyDocumentKey(parsed.policyId, parsed.version)
    const existing = this.#documents.get(key)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(parsed)) {
        throw new PolicyRegistryError(
          'policy_duplicate',
          `Policy ${key} is already registered with different content`
        )
      }
      return existing
    }
    this.#documents.set(key, parsed)
    return parsed
  }

  get(policyId: string, version: string): PolicyDocument | undefined {
    return this.#documents.get(policyDocumentKey(policyId, version))
  }

  list(): PolicyDocument[] {
    return [...this.#documents.values()]
  }

  effectiveFor(input: { tenantId: string; at: Date }): PolicyDocument[] {
    return this.list().filter((document) => {
      if (
        document.tenantId !== undefined &&
        document.tenantId !== input.tenantId
      ) {
        return false
      }
      if (input.at.getTime() < Date.parse(document.effectiveFrom)) return false
      if (
        document.effectiveUntil &&
        input.at.getTime() > Date.parse(document.effectiveUntil)
      ) {
        return false
      }
      return true
    })
  }
}
