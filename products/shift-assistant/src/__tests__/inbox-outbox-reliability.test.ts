// @vitest-environment node
import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANA, setup, tempDir, THOR, wahaPayload } from './support/harness.ts'

// AUD-0621 F07 (PISO-003): a failed stage never ends the stored message; it
// stays eligible for a bounded, durable retry. SPEC 0179 section 6.

const NOTE = 'Thor leito 3 vomitou 2 vezes, ligo pro tutor 16h'

describe('F07: failed processing stays recoverable', () => {
  it('retries a transient organizer failure instead of closing the message', async () => {
    let calls = 0
    let failing = true
    const env = setup({
      organize: async () => {
        calls += 1
        if (failing) throw new Error('synthetic dependency failure')
        return THOR
      }
    })
    await env.deliver(wahaPayload('m1', ANA, NOTE))
    expect(calls).toBe(1)
    expect(env.store.unprocessedMessages().map((m) => m.messageId)).toEqual([
      'm1'
    ])
    expect(env.store.lastActiveNote(ANA)).toBeUndefined()
    expect(env.waha.textsTo(ANA).at(-1)).toContain('vou tentar de novo')

    // A redelivery is a duplicate, not a second job, and keeps eligibility.
    expect(await env.deliver(wahaPayload('m1', ANA, NOTE))).toBe(false)
    expect(calls).toBe(1)
    expect(env.store.unprocessedMessages()).toHaveLength(1)

    // Not before the persisted retry time.
    expect(env.assistant.resumePending()).toBe(1)
    await env.assistant.idle()
    expect(calls).toBe(1)

    failing = false
    env.advance(1)
    await env.assistant.tick()
    await env.assistant.idle()
    expect(calls).toBe(2)
    expect(env.store.unprocessedMessages()).toHaveLength(0)
    expect(env.store.lastActiveNote(ANA)?.rawText).toBe(NOTE)
  })

  it('survives a restart with the retry budget intact', async () => {
    const dataDir = tempDir('retry-restart')
    const env = setup({
      dataDir,
      transcribe: async () => {
        throw new Error('synthetic whisper outage')
      }
    })
    await env.deliver(
      wahaPayload('a1', ANA, '', {
        hasMedia: true,
        media: {
          url: 'http://waha.local:3000/api/files/a1.oga',
          mimetype: 'audio/ogg'
        }
      })
    )
    expect(env.store.unprocessedMessages()).toHaveLength(1)
    expect(env.store.retryState('a1')).toMatchObject({
      stage: 'transcribe',
      attempt: 1
    })

    const restarted = setup({
      dataDir,
      start: new Date('2026-09-30T18:05:00.000Z'),
      transcribe: async () => NOTE
    })
    expect(restarted.assistant.resumePending()).toBe(1)
    await restarted.assistant.idle()
    expect(restarted.store.unprocessedMessages()).toHaveLength(0)
    expect(restarted.store.lastActiveNote(ANA)?.rawText).toBe(NOTE)
  })

  it('keeps the raw text after the retry budget is exhausted, without tasks', async () => {
    let calls = 0
    const env = setup({
      organize: async () => {
        calls += 1
        throw new Error('synthetic dependency failure')
      }
    })
    await env.deliver(wahaPayload('m1', ANA, NOTE))
    for (const minutes of [1, 3, 11, 31]) {
      env.advance(minutes)
      await env.assistant.tick()
      await env.assistant.idle()
    }
    expect(calls).toBe(5)
    expect(env.store.unprocessedMessages()).toHaveLength(0)
    const note = env.store.lastActiveNote(ANA)
    expect(note?.rawText).toBe(NOTE)
    expect(note?.organized).toBeUndefined()
    expect(env.store.task(1)).toBeUndefined()
    expect(env.waha.textsTo(ANA).at(-1)).toContain(NOTE)
    env.advance(60)
    await env.assistant.tick()
    await env.assistant.idle()
    expect(calls).toBe(5)
  })

  it('keeps one retry budget per message when the failing stage alternates', async () => {
    let downloads = 0
    const env = setup({
      onMedia: () => {
        downloads += 1
        return downloads % 2 === 1
          ? new Response('busy', { status: 503 })
          : undefined
      },
      transcribe: async () => {
        throw new Error('synthetic whisper outage')
      }
    })
    await env.deliver(
      wahaPayload('a1', ANA, '', {
        hasMedia: true,
        media: {
          url: 'http://waha.local:3000/api/files/a1.oga',
          mimetype: 'audio/ogg'
        }
      })
    )
    for (let round = 0; round < 30; round += 1) {
      env.advance(31)
      await env.assistant.tick()
      await env.assistant.idle()
    }
    expect(downloads).toBe(5)
    expect(env.store.unprocessedMessages()).toHaveLength(0)
    expect(env.store.reviewRequiredMessages().map((m) => m.messageId)).toEqual([
      'a1'
    ])
    const notices = env.waha.textsTo(ANA)
    expect(
      notices.filter((text) => text.includes('vou tentar de novo'))
    ).toHaveLength(1)
    expect(notices.at(-1)).toContain('ficou guardada para revisão')
    expect(notices).toHaveLength(2)
  })

  it('does not poison the queue when the journal write fails', async () => {
    const dataDir = tempDir('append-failure')
    const env = setup({ dataDir })
    env.assistant.receive(
      env.waha.client.parseWebhook(
        wahaPayload('m1', ANA, NOTE),
        env.now().toISOString()
      )!
    )
    const journal = join(dataDir, 'events.jsonl')
    chmodSync(journal, 0o444)
    try {
      await expect(env.assistant.idle()).resolves.toBeUndefined()
    } finally {
      chmodSync(journal, 0o644)
    }
    expect(env.store.unprocessedMessages()).toHaveLength(1)

    const restarted = setup({ dataDir })
    expect(restarted.assistant.resumePending()).toBe(1)
    await restarted.assistant.idle()
    expect(restarted.store.unprocessedMessages()).toHaveLength(0)
    expect(restarted.store.lastActiveNote(ANA)?.rawText).toBe(NOTE)
  })
})
