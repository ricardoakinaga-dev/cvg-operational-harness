// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Organized } from '../domain.ts'
import { previewToken } from '../preview-receipt.ts'
import { ShiftStore } from '../store.ts'
import {
  ANA,
  BRUNO,
  setup,
  tempDir,
  THOR,
  wahaPayload
} from './support/harness.ts'

// AUD-0621 F08 (PISO-001) and F09 (PISO-002): a draft never activates a task
// or a reminder, and two patients with the same name are never told apart
// by list order. SPEC 0179 sections 3-4.

const TWO_REX: Organized = {
  pacientes: [
    { nome: 'Rex', id: '101', leito: '1', exames_pedidos: [], condutas: [] },
    { nome: 'Rex', id: '202', leito: '2', exames_pedidos: [], condutas: [] }
  ],
  pendencias: [
    {
      paciente: 'Rex',
      descricao: 'Revisar nota sintética',
      quando: '2026-09-30T16:00:00-03:00'
    }
  ],
  duvidas: []
}

describe('F08: draft tasks stay inactive until the author confirms', () => {
  it('keeps the proposed task out of the scheduler until "ok"', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3, ligo pro tutor'))
    const note = env.store.lastActiveNote(ANA)
    expect(note?.confirmed).toBe(false)
    expect(env.store.openTasks()).toHaveLength(0)
    expect(env.store.task(1)?.status).toBe('draft')
    expect(env.waha.textsTo(ANA).at(-1)).toContain('ainda sem lembrete')

    env.advance(120) // well past the 16:00 due time
    expect(await env.assistant.tick()).toBe(0)
    expect(env.waha.textsTo(ANA).join('\n')).not.toContain('⏰ Lembrete')

    // Done/snooze never act on a draft.
    await env.deliver(wahaPayload('c1', ANA, 'feito 1'))
    expect(env.store.task(1)?.status).toBe('draft')

    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(true)
    expect(env.store.openTasks(ANA).map((task) => task.number)).toEqual([1])
    expect(await env.assistant.tick()).toBe(1)
    expect(env.waha.textsTo(ANA).at(-1)).toContain('⏰ Lembrete #1')
  })

  it('confirms once: a replayed or repeated "ok" adds no task or reminder', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(await env.deliver(wahaPayload('ok1', ANA, 'ok'))).toBe(false)
    await env.deliver(wahaPayload('ok2', ANA, 'confirmo'))
    expect(env.store.openTasks(ANA)).toHaveLength(1)
    expect(env.store.task(2)).toBeUndefined()
  })

  it('never lets one member confirm another member draft', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok-b', BRUNO, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.store.openTasks()).toHaveLength(0)
  })

  it('asks which draft to confirm when there is more than one', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('m2', ANA, 'Thor leito 3 de novo'))
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.openTasks()).toHaveLength(0)
    const reply = env.waha.textsTo(ANA).at(-1) ?? ''
    expect(reply).toContain('ok nota')
    const code = /ok nota ([0-9a-f]{8}-r1-[0-9a-f]{8})/.exec(reply)?.[1]
    expect(code).toBeDefined()
    await env.deliver(wahaPayload('ok2', ANA, `ok nota ${code}`))
    expect(env.store.openTasks(ANA)).toHaveLength(1)
  })

  it('does not let a bare "ok" land on an older draft while a note is pending', async () => {
    let fail = false
    const env = setup({
      organize: async () => {
        if (fail) throw new Error('synthetic dependency failure')
        return THOR
      }
    })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    fail = true
    await env.deliver(wahaPayload('m2', ANA, 'Thor leito 3, nova nota'))
    expect(env.store.unprocessedMessages()).toHaveLength(1) // retry wait
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.store.openTasks()).toHaveLength(0)
    expect(env.waha.textsTo(ANA).at(-1)).toContain('Ainda estou processando')
  })

  it('requires a new confirmation after a correction', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.task(1)?.status).toBe('open')
    await env.deliver(wahaPayload('m2', ANA, 'corrigir Thor leito 4'))
    expect(env.store.task(1)?.status).toBe('cancelled')
    expect(env.store.task(2)?.status).toBe('draft')
    env.advance(120)
    expect(await env.assistant.tick()).toBe(0)
  })

  it('keeps drafts inactive after a restart, including legacy journals', async () => {
    const dataDir = tempDir('draft-restart')
    const env = setup({ dataDir })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const reopened = setup({ dataDir, start: new Date('2026-09-30T21:00:00Z') })
    expect(reopened.store.task(1)?.status).toBe('draft')
    expect(await reopened.assistant.tick()).toBe(0)

    // A journal written before AUD-0621 stored the task as open next to an
    // unconfirmed note; it must project as an inactive draft.
    const legacyDir = tempDir('legacy')
    const at = '2026-09-30T18:00:00.000Z'
    const lines = [
      {
        type: 'note_created',
        at,
        note: {
          id: 'legacy-note',
          messageId: 'legacy-m1',
          authorPhone: ANA,
          createdAt: at,
          kind: 'text',
          rawText: 'Thor leito 3',
          organized: THOR,
          unverifiedNumbers: [],
          confirmed: false
        }
      },
      {
        type: 'task_created',
        at,
        task: {
          number: 1,
          ownerPhone: ANA,
          noteId: 'legacy-note',
          description: 'Ligar para o tutor',
          dueAt: '2026-09-30T19:00:00.000Z',
          createdAt: at,
          status: 'open',
          remindedCount: 0
        }
      }
    ]
    writeFileSync(
      join(legacyDir, 'events.jsonl'),
      lines.map((line) => `${JSON.stringify(line)}\n`).join('')
    )
    const legacy = setup({
      store: new ShiftStore(legacyDir),
      start: new Date('2026-09-30T21:00:00Z')
    })
    expect(legacy.store.openTasks()).toHaveLength(0)
    expect(await legacy.assistant.tick()).toBe(0)
  })
})

describe('F09: homonyms never bind a task to the first patient', () => {
  it('leaves the task unbound, asks and blocks confirmation', async () => {
    const env = setup({ organize: async () => TWO_REX })
    await env.deliver(
      wahaPayload('m1', ANA, 'Rex 101 leito 1 e Rex 202 leito 2; revisar nota')
    )
    const task = env.store.task(1)
    expect(task?.status).toBe('draft')
    expect(task?.patientId).toBeUndefined()
    const reply = env.waha.textsTo(ANA).at(-1) ?? ''
    expect(reply).toContain('mais de um paciente chamado Rex')

    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.store.openTasks()).toHaveLength(0)
    env.advance(120)
    expect(await env.assistant.tick()).toBe(0)
  })

  it('binds the ID when exactly one patient carries the name', async () => {
    const one: Organized = {
      ...TWO_REX,
      pacientes: [TWO_REX.pacientes[1]!]
    }
    const env = setup({ organize: async () => one })
    await env.deliver(wahaPayload('m1', ANA, 'Rex 202 leito 2; revisar nota'))
    expect(env.store.task(1)?.patientId).toBe('202')
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.openTasks(ANA).at(0)?.patientId).toBe('202')
  })

  it('never gives a remembered ID to two homonyms of the same note', async () => {
    const remembered: Organized = {
      pacientes: [
        { nome: 'Rex', id: '101', leito: '1', exames_pedidos: [], condutas: [] }
      ],
      pendencias: [],
      duvidas: []
    }
    const twoWithoutId: Organized = {
      pacientes: [
        { nome: 'Rex', exames_pedidos: [], condutas: ['dipirona'] },
        { nome: 'Rex', exames_pedidos: [], condutas: ['soro'] }
      ],
      pendencias: [{ descricao: 'Repor material sintético', paciente: null }],
      duvidas: []
    }
    let next = remembered
    const env = setup({ organize: async () => next })
    await env.deliver(wahaPayload('m1', ANA, 'Rex ID 101 leito 1'))
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    next = twoWithoutId
    await env.deliver(wahaPayload('m2', ANA, 'Rex dipirona; Rex soro'))
    const draft = env.store.lastActiveNote(ANA)!
    expect(draft.organized?.pacientes.map((patient) => patient.id)).toEqual([
      undefined,
      undefined
    ])
    expect(draft.blockingIssues?.join(' ')).toContain(
      'mais de um paciente chamado Rex'
    )
    expect(env.waha.textsTo(ANA).at(-1)).not.toContain('ID 101')
    await env.deliver(wahaPayload('ok2', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.store.knownPatients('Rex').map((patient) => patient.id)).toEqual(
      ['101']
    )
  })

  it('never completes an ID from an unconfirmed draft', async () => {
    const withId: Organized = {
      pacientes: [
        { nome: 'Bob', id: '111', leito: '4', exames_pedidos: [], condutas: [] }
      ],
      pendencias: [],
      duvidas: []
    }
    const withoutId: Organized = {
      pacientes: [{ nome: 'Bob', exames_pedidos: [], condutas: [] }],
      pendencias: [],
      duvidas: []
    }
    let next = withId
    const env = setup({ organize: async () => next })
    await env.deliver(wahaPayload('m1', ANA, 'Bob ID 111 leito 4'))
    next = withoutId
    await env.deliver(wahaPayload('m2', BRUNO, 'Bob comeu bem'))
    expect(env.waha.textsTo(BRUNO).at(-1)).toContain('Qual é o ID do Bob?')

    await env.deliver(wahaPayload('ok1', ANA, 'ok nota ' + noteCode(env)))
    await env.deliver(wahaPayload('m3', BRUNO, 'Bob comeu bem de novo'))
    expect(env.waha.textsTo(BRUNO).at(-1)).toContain('ID 111 do Bob')
  })
})

function noteCode(env: ReturnType<typeof setup>): string {
  const note = env.store.lastActiveNote(ANA)!
  return previewToken(note, env.store.tasksOfNote(note.id))
}
