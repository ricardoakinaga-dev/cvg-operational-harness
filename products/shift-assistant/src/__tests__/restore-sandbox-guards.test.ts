// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../backup.ts'
import { parseMembers, type Organized } from '../domain.ts'
import { classifyProbe } from '../monitor.ts'
import * as sandboxModule from '../restore-sandbox.ts'
import { ShiftStore } from '../store.ts'
import { buildRestoreFixture } from './support/restore-fixture.ts'
import {
  ANA,
  BRUNO,
  GESTOR,
  setup,
  tempDir,
  wahaPayload
} from './support/harness.ts'

// AUD0621-PRODUCT-PISO008, critic R2 repair (SPEC 0179 section 10): the
// restore sandbox confirms the draft it means to (by identity, never by
// order), its reminder oracle fails when nothing was exercised or the wrong
// tasks were reminded, and it never runs inside the source or the restored
// volume. Readiness needs the /health/ready contract to count as healthy and
// a symlinked volume root is refused by the backup. Synthetic data only.

const CLOSED = 'http://127.0.0.1:9/health/live'
const AT = new Date('2026-09-30T23:00:00.000Z')
const MEMBERS = parseMembers(
  `${ANA}=Dra Ana;${BRUNO}=Dr Bruno;${GESTOR}=Gestor*`
)

function later(name: string): Organized {
  return {
    pacientes: [{ nome: name, exames_pedidos: [], condutas: [] }],
    pendencias: [
      {
        descricao: `Reavaliar ${name}`,
        paciente: name,
        // Due days after the sandbox time: never eligible at its tick.
        quando: '2026-10-05T12:00:00-03:00'
      }
    ],
    duvidas: []
  }
}

/** Source with drafts only, all due after the sandbox tick; then a restore. */
async function laterDrafts(label: string, authors: string[]) {
  const source = tempDir(`${label}-src`)
  const env = setup({
    dataDir: source,
    organize: async (text) => later(/Paciente \d+/.exec(text)?.[0] ?? 'X')
  })
  for (const [index, author] of authors.entries()) {
    await env.deliver(
      wahaPayload(`d${index}`, author, `Paciente ${index + 1} reavaliar dia 5`)
    )
  }
  const draftIds = env.store
    .projection()
    .notes.filter((note) => !note.confirmed)
    .map((note) => note.id)
  expect(draftIds).toHaveLength(authors.length)
  const { receipt, backupDir } = await createBackup({
    dataDir: source,
    outDir: tempDir(`${label}-out`),
    writerStopped: true,
    stoppedUrl: CLOSED
  })
  expect(receipt.status).toBe('VERIFIED')
  const target = join(tempDir(`${label}-target`), 'volume')
  expect((await restoreBackup({ backupDir, targetDir: target })).verdict).toBe(
    'PASS'
  )
  return { source, backupDir, target, draftIds }
}

describe('R2-M1: the sandbox confirms drafts by identity', () => {
  for (const authors of [
    [ANA, ANA],
    [ANA, BRUNO],
    [ANA, BRUNO, ANA]
  ]) {
    it(`confirms its own synthetic draft with ${authors.length} restored drafts due later (${authors.length === 2 && authors[1] === ANA ? 'one author' : 'two authors'})`, async () => {
      const { target, draftIds } = await laterDrafts(
        `sandbox-m1-${authors.length}`,
        authors
      )
      const sandboxDir = join(tempDir('sandbox-m1-copy'), 'volume')
      const sandbox = await sandboxModule.sandboxCheck({
        restoredDir: target,
        sandboxDir,
        members: MEMBERS,
        at: AT
      })
      expect(sandbox.verdict, JSON.stringify(sandbox.checks)).toBe('PASS')
      expect(sandbox.draftSource).toBe('restored')
      expect(sandbox.reminderSource).toBe('synthetic_due_draft')
      // The restored draft confirmed is chosen by identity (smallest id).
      const chosen = [...draftIds].sort()[0]!
      const copy = new ShiftStore(sandboxDir, { readOnly: true })
      const notes = copy.projection().notes
      expect(
        notes.filter((note) => note.confirmed).map((note) => note.id)
      ).toEqual(expect.arrayContaining([chosen]))
      for (const id of draftIds.filter((id) => id !== chosen)) {
        expect(copy.note(id)?.confirmed).toBe(false)
      }
      // The synthetic note made by the sandbox is the one confirmed for the
      // reminder, and it is the only reminder sent.
      const synthetic = notes.find(
        (note) => !draftIds.includes(note.id) && note.confirmed
      )
      expect(synthetic).toBeDefined()
      const syntheticTasks = copy
        .tasksOfNote(synthetic!.id)
        .map((task) => task.number)
      expect(syntheticTasks).toHaveLength(1)
      expect(sandbox.remindedTasks).toEqual(syntheticTasks)
      expect(sandbox.syntheticNoteId).toBe(synthetic!.id)
      expect(sandbox.confirmedNoteId).toBe(chosen)
    })
  }
})

describe('R2-M2: the reminder oracle fails when nothing or the wrong thing was exercised', () => {
  const evaluate = (input: {
    expected: number[]
    reminded: number[]
    resent: number
    held: number[]
  }) => {
    const checks = sandboxModule.evaluateReminderRound(input)
    return Object.fromEntries(checks.map((check) => [check.name, check.pass]))
  }
  const ELIGIBLE = 'reminders only for the eligible tasks, once each'
  const HELD = 'no reminder for uncertain or failed sends'
  const RESEND = 'no resend on a second tick'

  it('passes the exact eligible set, once each, without resend', () => {
    expect(
      evaluate({ expected: [4, 5], reminded: [5, 4], resent: 0, held: [2] })
    ).toEqual({ [ELIGIBLE]: true, [HELD]: true, [RESEND]: true })
  })

  it('fails an empty round: nothing eligible and nothing reminded is not a proof', () => {
    const result = evaluate({ expected: [], reminded: [], resent: 0, held: [] })
    expect(result[ELIGIBLE]).toBe(false)
    expect(result[RESEND]).toBe(false)
  })

  it('fails the same count of reminders for the wrong tasks', () => {
    expect(
      evaluate({ expected: [8], reminded: [9], resent: 0, held: [] })[ELIGIBLE]
    ).toBe(false)
    expect(
      evaluate({ expected: [8, 9], reminded: [8, 8], resent: 0, held: [] })[
        ELIGIBLE
      ]
    ).toBe(false)
  })

  it('fails a reminder for a held task and any resend', () => {
    expect(
      evaluate({ expected: [2], reminded: [2], resent: 0, held: [2] })[HELD]
    ).toBe(false)
    expect(
      evaluate({ expected: [4], reminded: [4], resent: 1, held: [] })[RESEND]
    ).toBe(false)
  })
})

describe('R2-M3: the sandbox never runs inside the source or the restored volume', () => {
  const PLACE = 'sandbox outside the source and restored volumes'

  it('refuses the restored volume, a path inside it, an ancestor of it and a symlink into it', async () => {
    const { target } = await laterDrafts('sandbox-m3', [ANA])
    const before = readdirSync(target).sort()
    const holder = join(tempDir('sandbox-m3-link'), 'into-restored')
    symlinkSync(target, holder)
    for (const sandboxDir of [
      target,
      join(target, 'sandbox'),
      join(target, 'media', 'a', 'b'),
      join(target, '..'),
      join(holder, 'sandbox')
    ]) {
      const sandbox = await sandboxModule.sandboxCheck({
        restoredDir: target,
        sandboxDir,
        members: MEMBERS,
        at: AT
      })
      expect(sandbox.verdict, sandboxDir).toBe('FAIL')
      expect(
        sandbox.checks.find((check) => check.name === PLACE)?.pass,
        sandboxDir
      ).toBe(false)
    }
    expect(readdirSync(target).sort()).toEqual(before)
    expect(existsSync(join(target, 'sandbox'))).toBe(false)
  })

  it('refuses a sandbox inside the source volume, directly or through a symlink', async () => {
    const { source, backupDir, target } = await laterDrafts('sandbox-m3s', [
      ANA
    ])
    const sourceRealpathSha256 = JSON.parse(
      readFileSync(join(backupDir, 'inventory.json'), 'utf8')
    ).sourceRealpathSha256 as string
    const before = readdirSync(source).sort()
    const link = join(tempDir('sandbox-m3s-link'), 'into-source')
    symlinkSync(source, link)
    for (const sandboxDir of [
      join(source, 'sandbox-drill'),
      join(source, 'media', 'x'),
      join(link, 'sandbox-drill')
    ]) {
      const sandbox = await sandboxModule.sandboxCheck({
        restoredDir: target,
        sandboxDir,
        members: MEMBERS,
        at: AT,
        sourceRealpathSha256
      })
      expect(sandbox.verdict, sandboxDir).toBe('FAIL')
      expect(
        sandbox.checks.find((check) => check.name === PLACE)?.pass,
        sandboxDir
      ).toBe(false)
    }
    expect(readdirSync(source).sort()).toEqual(before)
  })

  it('still runs in a separate new directory', async () => {
    const { target } = await laterDrafts('sandbox-m3ok', [ANA])
    const outside = join(tempDir('sandbox-m3ok-copy'), 'nested', 'volume')
    mkdirSync(join(outside, '..'), { recursive: true })
    const sandbox = await sandboxModule.sandboxCheck({
      restoredDir: target,
      sandboxDir: outside,
      members: MEMBERS,
      at: AT
    })
    expect(sandbox.verdict, JSON.stringify(sandbox.checks)).toBe('PASS')
  })
})

describe('R2 optional: health that only looks healthy is refused', () => {
  const LIVE = { kind: 'response' as const, status: 200, body: { live: true } }

  it('does not take a 200 readiness outside the /health/ready contract as healthy', () => {
    for (const body of [
      {},
      { mode: 'running' },
      { ready: false, mode: 'running', reasonCodes: [], attention: [] },
      { ready: true, mode: 'mystery', reasonCodes: [], attention: [] },
      { ready: true, mode: 'running', reasonCodes: 'none', attention: [] }
    ]) {
      expect(
        classifyProbe({
          live: LIVE,
          ready: { kind: 'response', status: 200, body }
        }).findings.map((finding) => finding.reasonCode),
        JSON.stringify(body)
      ).toContain('ready_invalid')
    }
    expect(
      classifyProbe({
        live: LIVE,
        ready: {
          kind: 'response',
          status: 200,
          body: {
            ready: true,
            mode: 'running',
            effectsEnabled: true,
            reasonCodes: [],
            attention: []
          }
        }
      }).findings
    ).toEqual([])
  })

  it('refuses a volume root that is a symlink', async () => {
    const fixture = await buildRestoreFixture(tempDir('backup-root-link'))
    const link = join(tempDir('backup-root-link-holder'), 'volume')
    symlinkSync(fixture.dataDir, link)
    const { receipt, backupDir } = await createBackup({
      dataDir: link,
      outDir: tempDir('backup-root-link-out'),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(receipt.status).toBe('FAILED')
    expect(receipt.reasons).toContain('source_symlink')
    expect(existsSync(join(backupDir, 'data'))).toBe(false)
  })
})
