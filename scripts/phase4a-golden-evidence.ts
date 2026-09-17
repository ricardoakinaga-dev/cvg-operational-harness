import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  RulesFirstDialogueInterpreter,
  applyInterpretation,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createEmptyWorkingMemory
} from '../packages/conversation/src/index.ts'
import { createSyntheticServiceDeskProfile } from '../examples/phase4a/profiles.ts'
import { GOLDEN_DIALOGUE_CORPUS } from '../tests/phase4a/golden-corpus.ts'
import { GOLDEN_TRAJECTORIES } from '../tests/phase4a/golden-trajectories.ts'

const outputPath = 'docs/phase4a/evidence/GOLDEN_RESULTS.json'
const interpreter = new RulesFirstDialogueInterpreter()
const profile = createSyntheticServiceDeskProfile()

async function readCandidateBinding(): Promise<{
  readonly candidateId: string
  readonly candidateDigest: string
} | null> {
  try {
    const value = JSON.parse(
      await readFile('docs/phase4a/evidence/CANDIDATE.json', 'utf8')
    ) as { candidateId?: unknown; candidateDigest?: unknown }
    if (
      typeof value.candidateId !== 'string' ||
      typeof value.candidateDigest !== 'string'
    )
      return null
    return {
      candidateId: value.candidateId,
      candidateDigest: value.candidateDigest
    }
  } catch {
    return null
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function identity(scenario: string, variant: string, index: number) {
  return {
    tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000916'),
    conversationId: asConversationId(`conversation-evidence-${scenario}`),
    sessionId: asSessionId(`session-evidence-${scenario}`),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId(`turn-evidence-${scenario}-${variant}-${index}`),
    messageId: asMessageId(`message-evidence-${scenario}-${variant}-${index}`),
    correlationId: asCorrelationId(
      `correlation-evidence-${scenario}-${variant}-${index}`
    )
  }
}

async function main(): Promise<void> {
  const candidate = await readCandidateBinding()
  const variantResults = []
  for (const scenario of GOLDEN_DIALOGUE_CORPUS) {
    for (const [variant, text] of [
      ['canonical', scenario.canonical],
      ['paraphrase', scenario.paraphrase],
      ['mutation', scenario.mutation]
    ] as const) {
      const interpretation = await interpreter.interpret({
        identity: identity(scenario.id, variant, 0),
        text,
        memory: createEmptyWorkingMemory(),
        profile
      })
      variantResults.push({
        scenarioId: scenario.id,
        variant,
        expectedIntent: scenario.expectedIntent,
        actualIntent: interpretation.intent,
        passed: interpretation.intent === scenario.expectedIntent
      })
    }
  }

  const trajectoryResults = []
  for (const trajectory of GOLDEN_TRAJECTORIES) {
    let memory = createEmptyWorkingMemory()
    const turns = []
    for (const [index, text] of trajectory.turns.entries()) {
      const interpretation = await interpreter.interpret({
        identity: identity(trajectory.id, 'trajectory', index),
        text,
        memory,
        profile
      })
      const expectedIntent = trajectory.expectedIntents[index]
      turns.push({
        index,
        text,
        expectedIntent,
        actualIntent: interpretation.intent,
        passed: interpretation.intent === expectedIntent
      })
      memory = applyInterpretation(
        memory,
        interpretation,
        asTurnId(`turn-evidence-${trajectory.id}-${index}`),
        '2026-09-17T00:00:00.000Z'
      )
    }
    trajectoryResults.push({
      scenarioId: trajectory.id,
      turns,
      requiredInvariant: trajectory.requiredInvariant,
      proofRef: trajectory.proofRef,
      passed: turns.every((turn) => turn.passed)
    })
  }

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    controlledScope: 'synthetic-local-only',
    production: 'NO_GO',
    candidateId: candidate?.candidateId ?? null,
    candidateDigest: candidate?.candidateDigest ?? null,
    candidateBound: candidate !== null,
    corpusSha256: digest({ GOLDEN_DIALOGUE_CORPUS, GOLDEN_TRAJECTORIES }),
    scenarioCount: GOLDEN_DIALOGUE_CORPUS.length,
    variantCount: variantResults.length,
    trajectoryCount: trajectoryResults.length,
    variantResults,
    trajectoryResults,
    summary: {
      variantsPassed: variantResults.filter((result) => result.passed).length,
      trajectoriesPassed: trajectoryResults.filter((result) => result.passed)
        .length,
      allPassed:
        variantResults.every((result) => result.passed) &&
        trajectoryResults.every((result) => result.passed)
    }
  }

  await mkdir('docs/phase4a/evidence', { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(
    JSON.stringify({
      event: 'phase4a.golden_evidence',
      outputPath,
      scenarioCount: evidence.scenarioCount,
      variantCount: evidence.variantCount,
      trajectoryCount: evidence.trajectoryCount,
      allPassed: evidence.summary.allPassed,
      controlledScope: evidence.controlledScope,
      production: evidence.production,
      candidateBound: evidence.candidateBound
    })
  )
  if (!evidence.summary.allPassed || !evidence.candidateBound)
    process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
