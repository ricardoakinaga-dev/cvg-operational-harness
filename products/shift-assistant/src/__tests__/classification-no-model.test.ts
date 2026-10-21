// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DeterministicModelProvider,
  ModelGateway,
  type GenerateRequest
} from '@cvg/model-gateway'
import { afterEach, describe, expect, it } from 'vitest'
import { composeShiftApp, type ShiftApp } from '../compose.ts'
import { loadShiftConfig } from '../config.ts'
import {
  buildOrganizerGateway,
  ModelOrganizer,
  ORGANIZER_DATA_CLASSIFICATION,
  organizerPromptRegistry
} from '../organizer.ts'
import {
  startSandboxServices,
  type SandboxServices
} from '../sandbox/services.ts'

// AUD-0621 F24 (D009 under B3): shift notes are CLINICAL and NO_MODEL stays in
// force. Organisation goes through the public model gateway, which denies it
// before any budget, provider, DNS or HTTP. Synthetic data only.

const ANA = '5511900000001'
const GESTOR = '5511900000009'
const SECRET = 'segredo-sintetico-de-teste-123456'
const CLINICAL_NOTE =
  'Paciente sintético Thor, leito 3, vomitou duas vezes; ligar pro tutor 16h'
const NOW = new Date('2026-10-01T17:00:00.000Z')

function countingProvider(location: 'local' | 'external') {
  let calls = 0
  const provider = new DeterministicModelProvider({
    id: 'shift-organizer',
    model: 'sandbox',
    respond: (request) => {
      calls += 1
      return {
        text: '{"pacientes":[],"pendencias":[],"duvidas":[]}',
        usage: { inputTokens: 1, outputTokens: 1 },
        providerId: 'shift-organizer',
        model: request.model,
        externalCall: location === 'external',
        finishReason: 'stop'
      }
    }
  })
  Object.defineProperty(provider, 'location', { value: location })
  return { provider, calls: () => calls }
}

describe('F24: clinical notes never reach a model', () => {
  it('classifies every organisation request as CLINICAL', async () => {
    expect(ORGANIZER_DATA_CLASSIFICATION).toBe('CLINICAL')
    const seen: GenerateRequest[] = []
    const organizer = new ModelOrganizer({
      generate: async (request: GenerateRequest) => {
        seen.push(request)
        throw new Error('stop here')
      }
    } as unknown as ModelGateway)
    await expect(organizer.organize(CLINICAL_NOTE, NOW)).rejects.toThrow()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ dataClassification: 'CLINICAL' })
  })

  it.each(['external', 'local'] as const)(
    'is denied by the gateway before the %s provider, with zero calls',
    async (location) => {
      const { provider, calls } = countingProvider(location)
      const gateway = buildOrganizerGateway({
        provider,
        model: 'sandbox',
        location,
        timeoutMs: 60_000
      })
      const organizer = new ModelOrganizer(gateway, {
        profile: location === 'local' ? 'local' : 'balanced'
      })
      await expect(
        organizer.organize(CLINICAL_NOTE, NOW)
      ).rejects.toMatchObject({ code: 'policy_denied' })
      expect(calls()).toBe(0)
    }
  )

  it('cannot be routed around with substitution or fallback', async () => {
    const external = countingProvider('external')
    const local = countingProvider('local')
    Object.defineProperty(local.provider, 'id', { value: 'shift-local' })
    const profile = (
      name: 'balanced' | 'local',
      providerId: string,
      location: 'external' | 'local'
    ) => ({
      name,
      providerId,
      model: 'sandbox',
      location,
      temperature: 0,
      maxTokens: 1500,
      timeoutMs: 60_000,
      maxCostUsd: 1,
      estimatedCostUsd: 0,
      maxRetries: 0,
      pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
    })
    // A gateway configured as permissively as the public contract allows.
    const gateway = new ModelGateway({
      providers: [external.provider, local.provider],
      profiles: {
        balanced: {
          ...profile('balanced', 'shift-organizer', 'external'),
          fallbackProfile: 'local'
        },
        local: profile('local', 'shift-local', 'local')
      },
      prompts: organizerPromptRegistry(),
      routing: { allowLocalSubstitution: true, allowFallback: true }
    })
    for (const name of ['balanced', 'local'] as const) {
      await expect(
        new ModelOrganizer(gateway, { profile: name }).organize(
          CLINICAL_NOTE,
          NOW
        )
      ).rejects.toMatchObject({ code: 'policy_denied' })
    }
    expect(external.calls()).toBe(0)
    expect(local.calls()).toBe(0)
  })
})

describe('F24: production composition keeps the model out of shift notes', () => {
  let services: SandboxServices | undefined
  let app: ShiftApp | undefined

  afterEach(async () => {
    await app?.stop()
    await services?.close()
    app = undefined
    services = undefined
  })

  it('stores the note as a raw document and makes zero model requests', async () => {
    services = await startSandboxServices()
    const config = loadShiftConfig({
      SHIFT_PROVIDER: 'waha',
      SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
      SHIFT_WEBHOOK_SECRET: SECRET,
      SHIFT_DATA_DIR: mkdtempSync(join(tmpdir(), 'shift-no-model-')),
      SHIFT_PORT: '0',
      SHIFT_HOST: '127.0.0.1',
      SHIFT_TICK_SECONDS: '3600',
      WAHA_URL: services.wahaUrl,
      WAHA_API_KEY: 'sandbox-waha-key',
      WHISPER_URL: services.whisperUrl,
      LLM_BASE_URL: services.llmUrl,
      LLM_MODEL: 'sandbox',
      LLM_LOCATION: 'local'
    })
    app = composeShiftApp(config, { clock: () => NOW })
    const port = await app.start()
    const response = await fetch(`http://127.0.0.1:${port}/webhooks/waha`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cvg-webhook-secret': SECRET
      },
      body: JSON.stringify({
        event: 'message',
        payload: {
          id: 'n1',
          from: `${ANA}@c.us`,
          fromMe: false,
          body: CLINICAL_NOTE
        }
      })
    })
    expect(await response.json()).toEqual({ accepted: true })
    await app.assistant.idle()
    expect(services.llmCalls).toBe(0)
    const note = app.store.lastActiveNote(ANA)
    expect(note?.rawText).toBe(CLINICAL_NOTE)
    expect(note?.organized).toBeUndefined()
    expect(app.store.task(1)).toBeUndefined()
    expect(app.store.unprocessedMessages()).toHaveLength(0)
    const reply = services.sent.at(-1)?.text ?? ''
    expect(reply).toContain(CLINICAL_NOTE)
    expect(reply).toContain('sem organização automática')
  })
})
