import { describe, expect, it } from 'vitest'
import {
  RulesFirstDialogueInterpreter,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createEmptyWorkingMemory,
  applyInterpretation
} from '../../packages/conversation/src/index.ts'
import { createSyntheticServiceDeskProfile } from '../../examples/phase4a/profiles.ts'
import { GOLDEN_DIALOGUE_CORPUS } from './golden-corpus.ts'
import { GOLDEN_TRAJECTORIES } from './golden-trajectories.ts'

const profile = createSyntheticServiceDeskProfile()
const interpreter = new RulesFirstDialogueInterpreter()

describe('AAA-4A golden dialogue corpus', () => {
  it('covers 15 scenarios with a paraphrase and mutation for each case', async () => {
    expect(GOLDEN_DIALOGUE_CORPUS).toHaveLength(15)
    for (const [index, scenario] of GOLDEN_DIALOGUE_CORPUS.entries()) {
      for (const [variant, text] of [
        ['canonical', scenario.canonical],
        ['paraphrase', scenario.paraphrase],
        ['mutation', scenario.mutation]
      ] as const) {
        const interpretation = await interpreter.interpret({
          identity: {
            tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000915'),
            conversationId: asConversationId(`conversation-golden-${index}`),
            sessionId: asSessionId(`session-golden-${index}`),
            profileId: profile.id,
            profileVersion: profile.version,
            turnId: asTurnId(`turn-golden-${index}-${variant}`),
            messageId: asMessageId(`message-golden-${index}-${variant}`),
            correlationId: asCorrelationId(
              `correlation-golden-${index}-${variant}`
            )
          },
          text,
          memory: createEmptyWorkingMemory(),
          profile
        })
        expect(interpretation.intent, `${scenario.id}/${variant}`).toBe(
          scenario.expectedIntent
        )
      }
    }
  })

  it('executes 15 bounded multi-turn trajectories with explicit intent expectations', async () => {
    expect(GOLDEN_TRAJECTORIES).toHaveLength(15)
    expect(new Set(GOLDEN_TRAJECTORIES.map((item) => item.id))).toEqual(
      new Set(GOLDEN_DIALOGUE_CORPUS.map((item) => item.id))
    )
    for (const trajectory of GOLDEN_TRAJECTORIES) {
      let memory = createEmptyWorkingMemory()
      for (const [index, text] of trajectory.turns.entries()) {
        const interpretation = await interpreter.interpret({
          identity: {
            tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000916'),
            conversationId: asConversationId(
              `conversation-trajectory-${trajectory.id}`
            ),
            sessionId: asSessionId(`session-trajectory-${trajectory.id}`),
            profileId: profile.id,
            profileVersion: profile.version,
            turnId: asTurnId(`turn-trajectory-${trajectory.id}-${index}`),
            messageId: asMessageId(
              `message-trajectory-${trajectory.id}-${index}`
            ),
            correlationId: asCorrelationId(
              `correlation-trajectory-${trajectory.id}-${index}`
            )
          },
          text,
          memory,
          profile
        })
        expect(interpretation.intent, `${trajectory.id}/${index}`).toBe(
          trajectory.expectedIntents[index]
        )
        memory = applyInterpretation(
          memory,
          interpretation,
          asTurnId(`turn-trajectory-${trajectory.id}-${index}`),
          '2026-09-17T00:00:00.000Z'
        )
      }
    }
  })
})
