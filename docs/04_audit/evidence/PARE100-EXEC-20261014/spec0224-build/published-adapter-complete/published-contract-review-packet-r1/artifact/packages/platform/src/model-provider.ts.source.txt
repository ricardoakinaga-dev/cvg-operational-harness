import { DomainError } from '@cvg/shared'
import type { ModelConfig } from './contracts.ts'

export const CONTROLLED_MODEL_PROVIDER = 'fake' as const
export const CONTROLLED_MODEL = 'deterministic-v1' as const

export interface ModelProviderRequest {
  prompt: string
  fallbackText: string
}

export interface ModelProviderResponse {
  text: string
  provider: string
  model: string
  externalCall: false
}

export interface ModelProvider {
  readonly name: string
  readonly supportedModels: readonly string[]
  complete(input: ModelProviderRequest): Promise<ModelProviderResponse>
}

export class DeterministicModelProvider implements ModelProvider {
  readonly name = CONTROLLED_MODEL_PROVIDER
  readonly supportedModels = Object.freeze([CONTROLLED_MODEL])

  constructor(config?: ModelConfig) {
    if (config !== undefined) {
      assertControlledModelConfig(config)
    }
    Object.freeze(this)
  }

  async complete(input: ModelProviderRequest): Promise<ModelProviderResponse> {
    void input.prompt
    return {
      text: input.fallbackText,
      provider: this.name,
      model: CONTROLLED_MODEL,
      externalCall: false
    }
  }
}

export class ModelProviderRegistry {
  private readonly providers: ModelProvider[]

  constructor(providers: ModelProvider[] = []) {
    const registeredProviders = providers.map(freezeRegisteredProvider)
    const names = registeredProviders.map((provider) => provider.name)
    if (new Set(names).size !== names.length) {
      throw new Error('Model provider already registered')
    }
    this.providers = [...registeredProviders]
    Object.freeze(this.providers)
    Object.freeze(this)
  }

  register(provider: ModelProvider): ModelProviderRegistry {
    if (this.resolve(provider.name)) {
      throw new Error(`Model provider already registered: ${provider.name}`)
    }
    return new ModelProviderRegistry([...this.providers, provider])
  }

  resolve(name: string): ModelProvider | null {
    return this.providers.find((provider) => provider.name === name) ?? null
  }

  resolveForConfig(config: ModelConfig): ModelProvider {
    if (config.fallbackProvider !== undefined) {
      throw new DomainError(
        'invalid_action',
        'Fallback model provider is unavailable in controlled runtime'
      )
    }
    const provider = this.resolve(config.provider)
    if (!provider || !provider.supportedModels.includes(config.model)) {
      throw new DomainError(
        'invalid_action',
        'Configured model provider is unavailable in controlled runtime'
      )
    }
    return provider
  }

  list(): ModelProvider[] {
    return [...this.providers]
  }
}

export function createControlledModelProviderRegistry(): ModelProviderRegistry {
  return new ModelProviderRegistry([new DeterministicModelProvider()])
}

export function resolveControlledModelProvider(
  config: ModelConfig
): ModelProvider {
  return createControlledModelProviderRegistry().resolveForConfig(config)
}

export function createDryRunModelProvider(config: ModelConfig): ModelProvider {
  return resolveControlledModelProvider(config)
}

function assertControlledModelConfig(config: ModelConfig): void {
  if (
    config.provider !== CONTROLLED_MODEL_PROVIDER ||
    config.model !== CONTROLLED_MODEL ||
    config.fallbackProvider !== undefined
  ) {
    throw new DomainError(
      'invalid_action',
      'Configured model provider is unavailable in controlled runtime'
    )
  }
}

function freezeRegisteredProvider(provider: ModelProvider): ModelProvider {
  if (Object.isFrozen(provider) && Object.isFrozen(provider.supportedModels)) {
    return provider
  }
  return Object.freeze({
    name: provider.name,
    supportedModels: Object.freeze([...provider.supportedModels]),
    complete: provider.complete.bind(provider)
  })
}
