import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Organized } from '../../domain.ts'
import { ShiftStore } from '../../store.ts'
import { ANA, BRUNO, GESTOR, setup, WAHA, wahaPayload } from './harness.ts'

// PISO-008 (SPEC 0179 section 10): a synthetic volume with every state the
// restore proof must carry over: draft, confirmed, corrected, done, snoozed,
// retry, pause/resume, an interrupted reminder dispatch, an isolated journal
// tail and an orphan media file. Fictitious patients and phones only; no
// provider, channel or model is contacted.

const DUE = '2026-09-30T16:00:00-03:00'

function patient(name: string, bed: string, task: string): Organized {
  return {
    pacientes: [
      {
        nome: name,
        leito: bed,
        especie: 'canino',
        evolucao: 'Estável (sintético)',
        exames_pedidos: [],
        condutas: []
      }
    ],
    pendencias: [{ descricao: task, paciente: name, quando: DUE }],
    duvidas: []
  }
}

/** Organized output by the patient named in the synthetic text. */
export function fixtureOrganize(text: string): Promise<Organized> {
  if (/Nina/.test(text)) {
    return Promise.reject(new Error('synthetic transient failure'))
  }
  if (/Mel/.test(text)) {
    return Promise.resolve(patient('Mel', '5', 'Medir glicemia'))
  }
  if (/Bob/.test(text)) {
    return Promise.resolve(patient('Bob', '7', 'Trocar curativo'))
  }
  if (/transcri/.test(text)) {
    return Promise.resolve(patient('Luna', '2', 'Reavaliar dor'))
  }
  if (/leito 4/.test(text)) {
    return Promise.resolve(patient('Thor', '4', 'Ligar para o tutor'))
  }
  return Promise.resolve(patient('Thor', '3', 'Ligar para o tutor'))
}

export interface RestoreFixture {
  dataDir: string
  /** Task numbers by state, for assertions. */
  tasks: {
    corrected: number
    replaced: number
    done: number
    snoozed: number
    draft: number
  }
  orphan: string
  members: string
}

export const FIXTURE_MEMBERS = `${ANA}=Dra Ana;5511900000002=Dr Bruno;${GESTOR}=Gestor*`

/** Builds the synthetic volume in `dataDir` (created if missing). */
export async function buildRestoreFixture(
  dataDir: string
): Promise<RestoreFixture> {
  const first = setup({
    dataDir,
    organize: fixtureOrganize,
    start: new Date('2026-09-30T18:00:00.000Z')
  })
  // Confirmed, then corrected: the replacement is confirmed in turn.
  await first.deliver(wahaPayload('m1', ANA, 'Thor leito 3 ligar tutor'))
  await first.deliver(wahaPayload('ok1', ANA, 'ok'))
  const replaced = first.store.openTasks(ANA)[0]!.number
  await first.deliver(
    wahaPayload('c1', ANA, 'corrigir Thor leito 4 ligar tutor')
  )
  await first.deliver(wahaPayload('ok2', ANA, 'ok'))
  const corrected = first.store.openTasks(ANA)[0]!.number
  // Done.
  await first.deliver(wahaPayload('m2', ANA, 'Mel leito 5 glicemia'))
  await first.deliver(wahaPayload('ok3', ANA, 'ok'))
  const done = first.store
    .openTasks(ANA)
    .find((task) => task.patient === 'Mel')!.number
  await first.deliver(wahaPayload('f1', ANA, `feito ${done}`))
  // Snoozed.
  await first.deliver(wahaPayload('m3', ANA, 'Bob leito 7 curativo'))
  await first.deliver(wahaPayload('ok4', ANA, 'ok'))
  const snoozed = first.store
    .openTasks(ANA)
    .find((task) => task.patient === 'Bob')!.number
  await first.deliver(wahaPayload('s1', ANA, `adiar ${snoozed} 60`))

  // A crash in the middle of a line: the final bytes have no newline. The
  // next start isolates them under recovery/ and continues in a successor.
  appendFileSync(
    join(dataDir, 'events.jsonl'),
    '{"type":"task_done","at":"2026-09-30T18:30:00.000Z","num'
  )

  const second = setup({
    store: new ShiftStore(dataDir),
    organize: fixtureOrganize,
    start: new Date('2026-09-30T19:10:00.000Z')
  })
  // Audio kept as media, transcribed and left as a draft.
  await second.deliver(
    wahaPayload('a1', ANA, '', {
      hasMedia: true,
      media: { url: `${WAHA}/api/files/a1.ogg`, mimetype: 'audio/ogg' }
    })
  )
  const draft = second.store
    .tasksOfNote(second.store.lastActiveNote(ANA)!.id)
    .at(0)!.number
  // Retry: the organizer fails transiently for this note.
  await second.deliver(wahaPayload('r1', BRUNO, 'Nina leito 9 soro'))
  // Pause and resume by the manager.
  await second.deliver(wahaPayload('p1', GESTOR, 'pausar assistente'))
  await second.deliver(wahaPayload('p2', GESTOR, 'retomar assistente'))
  await second.assistant.idle()
  // Accepted reminder for the corrected task, then a second reminder whose
  // dispatch started and never recorded an outcome (crash).
  await second.assistant.tick()
  const reserved = second.store.reserveReminder(
    corrected,
    2,
    '2026-09-30T19:50:00.000Z'
  )
  if (!reserved) throw new Error('fixture: reservation refused')

  const orphan = 'media/orfao-sintetico.ogg'
  writeFileSync(join(dataDir, orphan), Buffer.from([9, 9, 9]), {
    mode: 0o600
  })
  return {
    dataDir,
    tasks: { corrected, replaced, done, snoozed, draft },
    orphan,
    members: FIXTURE_MEMBERS
  }
}
