import {
  DefaultConversationService,
  InMemoryConversationStore,
  RulesFirstDialogueInterpreter,
  StaticKnowledgeProvider,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asProfileId,
  asSessionId,
  asTenantId,
  asTurnId,
  createStaticConversationProfileAuthority,
  type ConversationProfile,
  type KnowledgeEvidence,
  type KnowledgeProvider,
  type KnowledgeSearchInput,
  type ConversationTurnResult,
  type TurnAcceptanceInput
} from '@cvg/conversation'
import { createSyntheticKnowledgeAssistantProfile } from './profiles.ts'

const KNOWLEDGE_SOURCE_ID = 'synthetic-knowledge-handbook'
const KNOWLEDGE_PROFILE_ID = 'synthetic-knowledge-assistant'
const FIXED_NOW = '2026-09-17T12:00:00.000Z'

export const SYNTHETIC_KNOWLEDGE_EVIDENCE: readonly KnowledgeEvidence[] = [
  {
    sourceId: KNOWLEDGE_SOURCE_ID,
    version: '1.0.0',
    title: 'Synthetic support handbook',
    text: 'The synthetic support plan includes priority routing during weekday service hours.',
    approved: true,
    citation: 'synthetic-knowledge-handbook § plans'
  },
  {
    sourceId: 'synthetic-service-desk-handbook',
    version: '1.0.0',
    title: 'Service Desk handbook decoy',
    text: 'This source belongs to another profile and must not be returned here.',
    approved: true,
    citation: 'synthetic-service-desk-handbook § decoy'
  }
]

export interface KnowledgeSearchRecord {
  readonly query: string
  readonly returnedSourceIds: readonly string[]
}

/**
 * Approved-only provider fixture. The generic package still owns the profile
 * allowlist check; this consumer adds a second fail-closed source filter and
 * records only metadata for the deterministic demonstration.
 */
export class ApprovedOnlyKnowledgeProvider implements KnowledgeProvider {
  readonly searches: KnowledgeSearchRecord[] = []
  readonly #provider: StaticKnowledgeProvider

  constructor(
    evidence: readonly KnowledgeEvidence[] = SYNTHETIC_KNOWLEDGE_EVIDENCE
  ) {
    this.#provider = new StaticKnowledgeProvider({
      evidence,
      approvedSourceIds: [KNOWLEDGE_SOURCE_ID]
    })
  }

  async search(
    input: KnowledgeSearchInput
  ): Promise<readonly KnowledgeEvidence[]> {
    const profileAllowsSource =
      input.scope.profileId === asProfileId(KNOWLEDGE_PROFILE_ID)
    const results = profileAllowsSource
      ? await this.#provider.search(input)
      : []
    const approved = results.filter(
      (item) =>
        item.approved === true &&
        item.sourceId === KNOWLEDGE_SOURCE_ID &&
        item.version.trim() !== ''
    )
    this.searches.push({
      query: input.query,
      returnedSourceIds: approved.map((item) => item.sourceId)
    })
    return approved
  }
}

export interface KnowledgeAssistantDemoResult {
  readonly profile: { readonly id: string; readonly version: string }
  readonly transcript: readonly [
    KnowledgeTranscriptEntry,
    KnowledgeTranscriptEntry
  ]
  readonly grounding: {
    readonly accepted: true
    readonly sourceId: string
    readonly sourceVersion: string
    readonly citationPresent: true
    readonly providerSearches: number
  }
  readonly provider: {
    readonly approvedOnly: true
    readonly approvedSourceIds: readonly string[]
    readonly excludedDecoySource: string
  }
  readonly harness: {
    readonly configured: false
    readonly externalEffects: false
  }
  readonly controlledScope: 'synthetic-local-only'
}

export interface KnowledgeTranscriptEntry {
  readonly step: string
  readonly userText: string
  readonly planKind: string | null
  readonly turnStatus: string
  readonly response: string
  readonly groundingAccepted: boolean
  readonly replayed: boolean
}

/** Run the independent knowledge-centric consumer through the same service. */
export async function runKnowledgeAssistantDemo(): Promise<KnowledgeAssistantDemoResult> {
  const profile = createSyntheticKnowledgeAssistantProfile()
  const profileAuthority = createStaticConversationProfileAuthority([profile])
  const provider = new ApprovedOnlyKnowledgeProvider()
  const service = new DefaultConversationService({
    store: new InMemoryConversationStore(),
    profileAuthority,
    interpreter: new RulesFirstDialogueInterpreter(),
    knowledge: provider,
    clock: () => new Date(FIXED_NOW)
  })
  const input = makeTurn(profile)
  const grounded = await service.runTurn(input)
  if (
    grounded.turn.planKind !== 'SEARCH_KNOWLEDGE' ||
    grounded.response.groundingAccepted !== true ||
    provider.searches.length !== 1 ||
    provider.searches[0]?.returnedSourceIds[0] !== KNOWLEDGE_SOURCE_ID ||
    !grounded.response.text.includes('[synthetic-knowledge-handbook § plans]')
  ) {
    throw new Error(
      'Knowledge Assistant demo did not produce an approved grounded answer'
    )
  }

  const replayed = await service.runTurn(input)
  if (replayed.replayed !== true || provider.searches.length !== 1) {
    throw new Error('Knowledge Assistant replay unexpectedly searched again')
  }

  return {
    profile: { id: String(profile.id), version: profile.version },
    transcript: [
      knowledgeTranscriptEntry('grounded-answer', input.text, grounded),
      knowledgeTranscriptEntry('duplicate-replay', input.text, replayed)
    ],
    grounding: {
      accepted: true,
      sourceId: KNOWLEDGE_SOURCE_ID,
      sourceVersion: '1.0.0',
      citationPresent: true,
      providerSearches: provider.searches.length
    },
    provider: {
      approvedOnly: true,
      approvedSourceIds: [KNOWLEDGE_SOURCE_ID],
      excludedDecoySource: 'synthetic-service-desk-handbook'
    },
    harness: {
      configured: false,
      externalEffects: false
    },
    controlledScope: 'synthetic-local-only'
  }
}

function makeTurn(profile: ConversationProfile): TurnAcceptanceInput {
  return {
    tenantId: asTenantId('tenant.phase4a.synthetic.knowledge'),
    conversationId: asConversationId(
      'conversation.phase4a.knowledge-assistant'
    ),
    sessionId: asSessionId('session.phase4a.knowledge-assistant'),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId('turn.phase4a.knowledge-assistant.01'),
    messageId: asMessageId('message.phase4a.knowledge-assistant.01'),
    correlationId: asCorrelationId(
      'correlation.phase4a.knowledge-assistant.01'
    ),
    text: 'What is the synthetic support plan?',
    idempotencyKey: 'idempotency.phase4a.knowledge-assistant.01',
    receivedAt: '2026-09-17T12:01:00.000Z',
    profile
  }
}

function knowledgeTranscriptEntry(
  step: string,
  userText: string,
  result: ConversationTurnResult
): KnowledgeTranscriptEntry {
  return {
    step,
    userText,
    planKind: result.turn.planKind ?? null,
    turnStatus: result.turn.status,
    response: result.response.text,
    groundingAccepted: result.response.groundingAccepted,
    replayed: result.replayed
  }
}
