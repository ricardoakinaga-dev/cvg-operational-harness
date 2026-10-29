// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS } from '../domain.ts'
import { DispatchError } from '../transport-limits.ts'
import { previewToken } from '../preview-receipt.ts'
import { ShiftStore } from '../store.ts'
import {
  ANA,
  BRUNO,
  fakeWaha,
  setup,
  tempDir,
  THOR,
  wahaPayload
} from './support/harness.ts'

// AUD0625 F13 slice 1 (SPEC 0283 sections 3-4): receipt of the preview,
// re-presentation, restart and the exact token. Synthetic data only.

/** A channel that provably never carried the request (egress refused). */
function neverLeaves() {
  const client = fakeWaha().client
  return Object.assign(Object.create(client), {
    sendText: async () => {
      throw new DispatchError('EGRESS_DENIED', 'not_sent')
    }
  })
}

const unavailable = () => new Response('unavailable', { status: 503 })

function tokenOf(env: ReturnType<typeof setup>, phone = ANA): string {
  const note = env.store.lastActiveNote(phone)!
  return previewToken(note, env.store.tasksOfNote(note.id))
}

describe('F13 receipt: restart and replay', () => {
  it('keeps a complete receipt across a restart, so "ok" still confirms', async () => {
    const dataDir = tempDir('receipt-complete')
    const env = setup({ dataDir })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const id = env.store.lastActiveNote(ANA)!.id
    expect(env.store.previewState(id)).toMatchObject({
      attempts: 1,
      complete: true
    })
    const reopened = setup({ dataDir })
    expect(reopened.store.previewState(id)).toMatchObject({ complete: true })
    await reopened.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(reopened.store.lastActiveNote(ANA)?.confirmed).toBe(true)
  })

  it('keeps a missing receipt across a restart, so "ok" is still refused', async () => {
    const dataDir = tempDir('receipt-missing')
    const env = setup({ dataDir, extra: { whatsapp: neverLeaves() } })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const reopened = setup({ dataDir })
    const id = reopened.store.lastActiveNote(ANA)!.id
    expect(reopened.store.previewState(id)).toMatchObject({ complete: false })
    await reopened.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(reopened.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(reopened.waha.textsTo(ANA).at(-1)).toContain(
      'CONFIRMATION_NOT_ELIGIBLE: preview_not_delivered'
    )
  })

  it('replays the webhook of "ok" without a second confirmation', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(await env.deliver(wahaPayload('ok1', ANA, 'ok'))).toBe(false)
    expect(env.store.openTasks(ANA)).toHaveLength(1)
  })

  it('treats a draft from a journal without receipts as not eligible until re-presented', async () => {
    const dir = tempDir('receipt-legacy')
    const at = '2026-09-30T18:00:00.000Z'
    const lines = [
      {
        type: 'note_created',
        at,
        note: {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          messageId: 'legacy-m1',
          authorPhone: ANA,
          createdAt: at,
          kind: 'text',
          rawText: 'Thor leito 3',
          organized: THOR,
          unverifiedNumbers: [],
          confirmed: false
        }
      }
    ]
    writeFileSync(
      join(dir, 'events.jsonl'),
      lines.map((line) => `${JSON.stringify(line)}\n`).join('')
    )
    const env = setup({ store: new ShiftStore(dir) })
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.waha.textsTo(ANA).at(-1)).toContain('preview_not_delivered')

    await env.assistant.tick() // the first tick presents it again
    expect(env.waha.textsTo(ANA).at(-1)).toContain('RASCUNHO aaaaaaaa')
    await env.deliver(wahaPayload('ok2', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(true)
  })
})

describe('F13 receipt: re-presentation', () => {
  it('presents again after the delay and then accepts "ok"', async () => {
    let calls = 0
    const env = setup({
      onSend: () => {
        calls += 1
        if (calls === 1) return unavailable()
      }
    })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.assistant.tick()
    expect(calls).toBe(1) // 30 s have not passed
    env.advance(1)
    await env.assistant.tick()
    expect(calls).toBe(2)
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(true)
  })

  it('stops after the attempt budget', async () => {
    let calls = 0
    const env = setup({
      onSend: () => {
        calls += 1
        return unavailable()
      }
    })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    for (let round = 0; round < MAX_ATTEMPTS + 3; round += 1) {
      env.advance(60)
      await env.assistant.tick()
    }
    expect(calls).toBe(MAX_ATTEMPTS)
    const id = env.store.lastActiveNote(ANA)!.id
    expect(env.store.previewState(id)?.attempts).toBe(MAX_ATTEMPTS)
  })

  it('never undoes a complete receipt with a later failed presentation', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const note = env.store.lastActiveNote(ANA)!
    env.store.commit([
      {
        type: 'preview_presented',
        at: env.now().toISOString(),
        noteId: note.id,
        revision: 1,
        contentSha256: 'x',
        parts: [{ index: 0, bytes: 1, partSha256: 'y', outcome: 'not_sent' }],
        truncated: false
      }
    ])
    expect(env.store.previewState(note.id)).toMatchObject({
      attempts: 2,
      complete: true
    })
  })

  it('does not present a cut preview again and tells the author why', async () => {
    const env = setup({
      organize: async () => ({
        pacientes: Array.from({ length: 20 }, (_, index) => ({
          nome: `Paciente${index + 1}`,
          evolucao: 'b'.repeat(4000),
          exames_pedidos: [],
          condutas: Array.from({ length: 5 }, () => 'b'.repeat(500))
        })),
        pendencias: [],
        duvidas: []
      })
    })
    await env.deliver(wahaPayload('m1', ANA, 'Vinte pacientes sintéticos'))
    const sentBefore = env.waha.sent.length
    expect(env.waha.textsTo(ANA).at(-1)).toContain('grande demais')
    env.advance(120)
    await env.assistant.tick()
    expect(env.waha.sent.length).toBe(sentBefore)
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.waha.textsTo(ANA).at(-1)).toContain('preview_truncated')
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
  })
})

describe('F13 token: exact confirmation', () => {
  it('carries the revision and changes with the content', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const first = tokenOf(env)
    expect(first).toMatch(/^[0-9a-f]{8}-r1-[0-9a-f]{8}$/)
    await env.deliver(wahaPayload('m2', ANA, 'corrigir Thor leito 4'))
    const second = tokenOf(env)
    expect(second).toMatch(/-r2-[0-9a-f]{8}$/)
    expect(second.split('-')[0]).not.toBe(first.split('-')[0])
  })

  it('confirms with the complete token', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok1', ANA, `ok nota ${tokenOf(env)}`))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(true)
  })

  it('refuses the bare 8-hex code, a wrong hash and a wrong revision', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const token = tokenOf(env)
    const [code, , hash] = token.split('-') as [string, string, string]
    for (const [index, typed] of [
      code,
      `${code}-r1-00000000`,
      `${code}-r2-${hash}`
    ].entries()) {
      await env.deliver(wahaPayload(`bad${index}`, ANA, `ok nota ${typed}`))
      expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
      expect(env.waha.textsTo(ANA).at(-1)).toContain(
        'CONFIRMATION_NOT_ELIGIBLE'
      )
    }
    expect(env.store.openTasks()).toHaveLength(0)
  })

  it('refuses the token of a superseded revision', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const old = tokenOf(env)
    await env.deliver(wahaPayload('m2', ANA, 'corrigir Thor leito 4'))
    await env.deliver(wahaPayload('ok1', ANA, `ok nota ${old}`))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.store.openTasks()).toHaveLength(0)
  })

  it('refuses a token of another author without revealing the note', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const token = tokenOf(env)
    await env.deliver(wahaPayload('ok-b', BRUNO, `ok nota ${token}`))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.waha.textsTo(BRUNO).join('\n')).not.toContain('Thor')
  })

  it('accepts the echoed token when the last part was uncertain', async () => {
    const env = setup({
      onSend: () => {
        throw new Error('connection reset after the request was written')
      }
    })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const token = tokenOf(env)
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    await env.deliver(wahaPayload('ok2', ANA, `ok nota ${token}`))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(true)
  })

  it('does not accept the echoed token when the preview never left', async () => {
    const env = setup({ extra: { whatsapp: neverLeaves() } })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok1', ANA, `ok nota ${tokenOf(env)}`))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
  })
})
