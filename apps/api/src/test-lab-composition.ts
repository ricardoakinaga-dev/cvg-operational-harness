import { createRealCapabilityGuards } from '@cvg/shared'
import {
  assertComposedKnowledgeResolver,
  createSyntheticKnowledgeResolver,
  type ApprovedKnowledgeResolver
} from '@cvg/platform'

/**
 * SPEC 0317 G3 §1. The Test Lab exists only in the explicit test profile:
 * NODE_ENV=test plus a synthetic composition issued here. A flag alone never
 * registers a route, and asking for the lab anywhere else refuses the boot.
 */
export const TEST_LAB_PROFILE_ENV = 'CVG_TEST_LAB_PROFILE'
const SYNTHETIC_PROFILE = 'synthetic'

export interface TestLabComposition {
  readonly profile: typeof SYNTHETIC_PROFILE
  /** Internal fixture port; requests have no authority over this content. */
  readonly resolveApprovedKnowledge?: ApprovedKnowledgeResolver
}

const issuedCompositions = new WeakSet<object>()

function assertTestProfile(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Test Lab requires the explicit test profile')
  }
  const guards = createRealCapabilityGuards({ env })
  if (
    guards.channels.reason !== 'flag_disabled' ||
    guards.rag.reason !== 'flag_disabled'
  ) {
    throw new Error('Test Lab requires a synthetic composition')
  }
}

export function createSyntheticTestLabComposition(
  input: { resolveApprovedKnowledge?: ApprovedKnowledgeResolver } = {}
): TestLabComposition {
  assertTestProfile(process.env)
  if (input.resolveApprovedKnowledge) {
    assertComposedKnowledgeResolver(input.resolveApprovedKnowledge)
  }
  const composition: TestLabComposition = Object.freeze({
    profile: SYNTHETIC_PROFILE,
    ...(input.resolveApprovedKnowledge
      ? { resolveApprovedKnowledge: input.resolveApprovedKnowledge }
      : {})
  })
  issuedCompositions.add(composition)
  return composition
}

/** Validates the profile for the process that is about to serve. */
export function assertTestLabBootstrap(
  env: NodeJS.ProcessEnv,
  composition: unknown
): TestLabComposition | undefined {
  const requested = env[TEST_LAB_PROFILE_ENV]?.trim()
  if (requested && requested !== SYNTHETIC_PROFILE) {
    throw new Error(`${TEST_LAB_PROFILE_ENV} must be ${SYNTHETIC_PROFILE}`)
  }
  if (requested) assertTestProfile(env)
  if (composition === undefined) return undefined
  assertTestProfile(env)
  if (
    typeof composition !== 'object' ||
    composition === null ||
    !issuedCompositions.has(composition)
  ) {
    throw new Error('Test Lab requires a synthetic composition')
  }
  return composition as TestLabComposition
}

/** Entry for hosts built from the environment, such as the browser suite. */
export function createConfiguredTestLab(
  env: NodeJS.ProcessEnv,
  configured: unknown
): TestLabComposition | undefined {
  const explicit = assertTestLabBootstrap(env, configured)
  if (explicit || !env[TEST_LAB_PROFILE_ENV]?.trim()) return explicit
  if ((env.API_PERSISTENCE_MODE ?? 'memory') !== 'memory') {
    throw new Error('Test Lab requires a synthetic composition')
  }
  return createSyntheticTestLabComposition({
    resolveApprovedKnowledge: createSyntheticKnowledgeResolver()
  })
}
