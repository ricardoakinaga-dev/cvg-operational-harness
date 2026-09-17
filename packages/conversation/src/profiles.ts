import {
  ConversationError,
  type ConversationProfileAuthority,
  type ConversationProfile,
  type KnowledgeEvidence,
  type KnowledgeProvider,
  type KnowledgeSearchInput
} from './contracts.ts'
import {
  hasForbiddenMemoryContent,
  hasUntrustedInstructionContent
} from './state.ts'

/**
 * Frozen registry for controlled deployments. A caller can request only an
 * already registered id/version; the returned descriptor owns the capability
 * and approved-source allowlists used by interpretation and planning.
 */
export class StaticConversationProfileAuthority implements ConversationProfileAuthority {
  readonly #profiles: ReadonlyMap<string, ConversationProfile>

  constructor(profiles: readonly ConversationProfile[]) {
    const entries = profiles.map((profile) => {
      const frozen = freezeProfile(profile)
      const key = profileKey(frozen.id, frozen.version)
      return [key, frozen] as const
    })
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new ConversationError(
        'INVALID_INPUT',
        'Profile authority contains a duplicate id/version'
      )
    }
    this.#profiles = new Map(entries)
  }

  resolve(input: {
    readonly profileId: ConversationProfile['id']
    readonly profileVersion: string
  }): ConversationProfile | undefined {
    return this.#profiles.get(profileKey(input.profileId, input.profileVersion))
  }
}

export function createStaticConversationProfileAuthority(
  profiles: readonly ConversationProfile[]
): StaticConversationProfileAuthority {
  return new StaticConversationProfileAuthority(profiles)
}

function profileKey(id: ConversationProfile['id'], version: string): string {
  return `${String(id)}@${version}`
}

function freezeProfile(profile: ConversationProfile): ConversationProfile {
  const capabilities = profile.capabilities.map((capability) =>
    Object.freeze({
      ...capability,
      requiredFields: Object.freeze([...capability.requiredFields])
    })
  )
  const knowledge = profile.knowledge
    ? Object.freeze({
        ...profile.knowledge,
        approvedSourceIds: Object.freeze([
          ...profile.knowledge.approvedSourceIds
        ])
      })
    : undefined
  const copy = Object.freeze({
    ...profile.copy,
    actionLabels: Object.freeze({ ...profile.copy.actionLabels }),
    successPatterns: Object.freeze([...profile.copy.successPatterns]),
    successNegationPatterns: Object.freeze([
      ...profile.copy.successNegationPatterns
    ]),
    answers: Object.freeze({ ...profile.copy.answers })
  })
  const recognition = profile.recognition
    ? Object.freeze({
        ...profile.recognition,
        confirmationPatterns: Object.freeze([
          ...profile.recognition.confirmationPatterns
        ]),
        stopPatterns: Object.freeze([...profile.recognition.stopPatterns]),
        handoffPatterns: Object.freeze([
          ...profile.recognition.handoffPatterns
        ]),
        correctionPatterns: Object.freeze([
          ...profile.recognition.correctionPatterns
        ]),
        sideQuestionPrefixPatterns: Object.freeze([
          ...profile.recognition.sideQuestionPrefixPatterns
        ]),
        sideQuestionContextPatterns: Object.freeze([
          ...profile.recognition.sideQuestionContextPatterns
        ]),
        availabilityPatterns: Object.freeze([
          ...profile.recognition.availabilityPatterns
        ]),
        cancelPatterns: Object.freeze([...profile.recognition.cancelPatterns]),
        modifyPatterns: Object.freeze([...profile.recognition.modifyPatterns]),
        createPatterns: Object.freeze([...profile.recognition.createPatterns]),
        knowledgePatterns: Object.freeze([
          ...profile.recognition.knowledgePatterns
        ]),
        questionPatterns: Object.freeze([
          ...profile.recognition.questionPatterns
        ]),
        ordinalWords: Object.freeze({ ...profile.recognition.ordinalWords }),
        pronounPatterns: Object.freeze([
          ...profile.recognition.pronounPatterns
        ]),
        entityPatterns: Object.freeze(
          profile.recognition.entityPatterns.map((pattern) =>
            Object.freeze({ ...pattern })
          )
        ),
        correctionEntityKeys: Object.freeze([
          ...profile.recognition.correctionEntityKeys
        ]),
        normalizations: Object.freeze({
          DAY: Object.freeze({ ...profile.recognition.normalizations.DAY }),
          TIME_PERIOD: Object.freeze({
            ...profile.recognition.normalizations.TIME_PERIOD
          })
        })
      })
    : undefined
  return Object.freeze({
    ...profile,
    capabilities: Object.freeze(capabilities),
    ...(knowledge ? { knowledge } : {}),
    copy,
    ...(recognition ? { recognition } : {})
  })
}

export interface StaticKnowledgeProviderOptions {
  readonly evidence: readonly KnowledgeEvidence[]
  /** Optional provider-side allowlist; the service still enforces profile policy. */
  readonly approvedSourceIds?: readonly string[]
}

/** Bounded approved-source-only provider for controlled profile fixtures. */
export class StaticKnowledgeProvider implements KnowledgeProvider {
  readonly #evidence: readonly KnowledgeEvidence[]
  readonly #approvedSourceIds: readonly string[] | undefined

  constructor(options: StaticKnowledgeProviderOptions) {
    this.#approvedSourceIds = options.approvedSourceIds
    this.#evidence = options.evidence.filter(
      (item) =>
        item.approved === true &&
        item.sourceId.trim() !== '' &&
        item.version.trim() !== '' &&
        item.sourceId.length <= 200 &&
        item.version.length <= 80 &&
        item.title.length <= 240 &&
        item.text.length <= 4_000 &&
        !hasForbiddenMemoryContent(item.title) &&
        !hasUntrustedInstructionContent(item.title) &&
        (item.citation === undefined ||
          (item.citation.length <= 240 &&
            !hasForbiddenMemoryContent(item.citation) &&
            !hasUntrustedInstructionContent(item.citation))) &&
        !hasForbiddenMemoryContent(item.text) &&
        !hasUntrustedInstructionContent(item.text)
    )
  }

  async search(
    input: KnowledgeSearchInput
  ): Promise<readonly KnowledgeEvidence[]> {
    const allowed = new Set(this.#approvedSourceIds ?? [])
    const queryWords = input.query
      .toLocaleLowerCase('en-US')
      .split(/\s+/)
      .filter(Boolean)
    return this.#evidence
      .filter((item) => allowed.size === 0 || allowed.has(item.sourceId))
      .filter(
        (item) =>
          queryWords.length === 0 ||
          queryWords.some((word) =>
            `${item.title} ${item.text}`
              .toLocaleLowerCase('en-US')
              .includes(word)
          )
      )
      .slice(0, input.maxResults)
  }
}
