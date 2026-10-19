import { mayTransmitToModel, type DataClassification } from '@cvg/shared'
import {
  ModelProfileNameSchema,
  type ModelProfile,
  type ModelProfileName
} from './contracts.ts'
import { ModelGatewayError } from './errors.ts'

export interface ModelRoutingRule {
  task: string
  profile: ModelProfileName
}

export interface ModelRoutingOptions {
  rules?: ModelRoutingRule[]
  /** Explicit opt-in only; never substitute model location silently. */
  allowLocalSubstitution?: boolean
  allowFallback?: boolean
}

export interface ModelRoute {
  profile: ModelProfile
  substitutedProfile?: ModelProfileName
  ruleTask?: string
}

export class ModelRouter {
  readonly #profiles: Map<ModelProfileName, ModelProfile>
  readonly #rules: Map<string, ModelProfileName>
  readonly #allowLocalSubstitution: boolean
  readonly #allowFallback: boolean

  constructor(
    profiles: Partial<Record<ModelProfileName, ModelProfile>>,
    options: ModelRoutingOptions = {}
  ) {
    this.#profiles = new Map()
    for (const [name, profile] of Object.entries(profiles)) {
      if (!profile) continue
      const parsedName = ModelProfileNameSchema.safeParse(name)
      if (!parsedName.success) continue
      this.#profiles.set(parsedName.data, profile)
    }
    this.#rules = new Map()
    for (const rule of options.rules ?? []) {
      this.#rules.set(rule.task, rule.profile)
    }
    this.#allowLocalSubstitution = options.allowLocalSubstitution ?? false
    this.#allowFallback = options.allowFallback ?? false
  }

  get allowFallback(): boolean {
    return this.#allowFallback
  }

  profile(name: ModelProfileName): ModelProfile | undefined {
    return this.#profiles.get(name)
  }

  resolve(input: {
    requestedProfile: ModelProfileName
    task?: string
    dataClassification: DataClassification
  }): ModelRoute {
    const requested =
      (input.task !== undefined ? this.#rules.get(input.task) : undefined) ??
      input.requestedProfile
    const profile = this.#profiles.get(requested)
    if (!profile) {
      throw new ModelGatewayError(
        'profile_unknown',
        `Model profile ${requested} is not configured`
      )
    }

    if (mayTransmitToModel(input.dataClassification, profile.location)) {
      return {
        profile,
        ...(input.task !== undefined && this.#rules.has(input.task)
          ? { ruleTask: input.task }
          : {})
      }
    }

    if (this.#allowLocalSubstitution) {
      const local = this.#profiles.get('local')
      if (
        local &&
        local.location === 'local' &&
        mayTransmitToModel(input.dataClassification, 'local')
      ) {
        return { profile: local, substitutedProfile: requested }
      }
    }

    throw new ModelGatewayError(
      'policy_denied',
      `Model profile ${requested} is not allowed for ${
        input.dataClassification
      } data`
    )
  }

  fallbackFor(profile: ModelProfile): ModelProfile | undefined {
    if (!this.#allowFallback) return undefined
    if (!profile.fallbackProfile) return undefined
    const fallback = this.#profiles.get(profile.fallbackProfile)
    if (!fallback) return undefined
    if (profile.location === 'local' && fallback.location === 'external') {
      return undefined
    }
    return fallback
  }
}
