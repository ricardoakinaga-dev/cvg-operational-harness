// @vitest-environment node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../backup.ts'
import { parseMembers } from '../domain.ts'
import { ATTENTION_CODES, READINESS_REASON_CODES } from '../health.ts'
import {
  AlertMonitor,
  classifyProbe,
  httpDeliver,
  probeAssistant,
  startAlertReceiver,
  type AlertEvent,
  type DeliveryResult,
  type ProbeResult
} from '../monitor.ts'
import { sandboxCheck } from '../restore-sandbox.ts'
import { buildShiftServer } from '../server.ts'
import { ShiftStore } from '../store.ts'
import {
  buildRestoreFixture,
  FIXTURE_MEMBERS
} from './support/restore-fixture.ts'
import { ANA, GESTOR, setup, tempDir, wahaPayload } from './support/harness.ts'

// PISO-008 (SPEC 0179 section 10; AUD-0621 F25): backup with inventory and
// SHA-256 verified before `backup_verified`, restore that rejects unsafe or
// divergent sets and compares projections under hold before a transport
// sandbox, and an external monitor that alerts through a durable queue to a
// local receiver that returns receipts. The stop proof runs the real process.
// Synthetic data only; nothing reaches a provider, channel or model.

/** A port nothing listens on: the stopped writer refuses connections. */
const CLOSED = 'http://127.0.0.1:9/health/live'

const sha256 = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex')

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})

async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<{ url: string; port: number; server: Server }> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as AddressInfo).port
  return { url: `http://127.0.0.1:${port}`, port, server }
}

function filesUnder(root: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(root, prefix), {
    withFileTypes: true
  })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...filesUnder(root, path))
    else out.push(path)
  }
  return out.sort()
}

describe('PISO-008: backup inventories, copies and verifies before backup_verified', () => {
  it('backs up every document of a stopped volume with relative paths and SHA-256', async () => {
    const fixture = await buildRestoreFixture(tempDir('backup-src'))
    const out = tempDir('backup-out')
    const before = filesUnder(fixture.dataDir).map((path) => [
      path,
      sha256(readFileSync(join(fixture.dataDir, path)))
    ])

    const { receipt, backupDir } = await createBackup({
      dataDir: fixture.dataDir,
      outDir: out,
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(receipt).toMatchObject({
      event: 'backup_verified',
      status: 'VERIFIED',
      reasons: []
    })
    // The source is never modified, moved or pruned (D4).
    expect(
      filesUnder(fixture.dataDir).map((path) => [
        path,
        sha256(readFileSync(join(fixture.dataDir, path)))
      ])
    ).toEqual(before)

    const inventoryBytes = readFileSync(join(backupDir, 'inventory.json'))
    expect(sha256(inventoryBytes)).toBe(receipt.inventorySha256)
    const inventory = JSON.parse(inventoryBytes.toString('utf8'))
    expect(inventory.files.map((file: { path: string }) => file.path)).toEqual(
      filesUnder(fixture.dataDir)
    )
    for (const file of inventory.files) {
      expect(file.path).not.toMatch(/^\/|(^|\/)\.\.(\/|$)/)
      const copy = readFileSync(join(backupDir, 'data', file.path))
      expect(copy.byteLength).toBe(file.bytes)
      expect(sha256(copy)).toBe(file.sha256)
      expect(statSync(join(backupDir, 'data', file.path)).mode & 0o777).toBe(
        0o600
      )
    }
    expect(statSync(backupDir).mode & 0o777).toBe(0o700)
    // Recovery copies, the successor segment and the orphan are kept.
    const kinds = new Set(
      inventory.files.map((file: { kind: string }) => file.kind)
    )
    expect(kinds).toEqual(
      new Set(['journal_manifest', 'journal_segment', 'recovery', 'media'])
    )
    expect(inventory.media.orphans).toEqual([fixture.orphan])
    expect(inventory.media.missing).toEqual([])
    expect(inventory.journal).toMatchObject({
      format: 'v1',
      uuid: null,
      seq: null
    })
    expect(inventory.journal.segments).toHaveLength(2)
    expect(inventory.journal.segments[0].sealedPrefixBytes).toBeGreaterThan(0)
    expect(inventory.writer).toMatchObject({
      operatorConfirmedStopped: true,
      stableDuringCopy: true
    })
    // Content-free: no phone, patient or note text in inventory/receipt.
    for (const text of [
      inventoryBytes.toString('utf8'),
      readFileSync(join(backupDir, 'receipt.json'), 'utf8'),
      readFileSync(join(backupDir, 'projection.json'), 'utf8')
    ]) {
      expect(text).not.toContain(ANA)
      expect(text).not.toContain('Thor')
      expect(text).not.toContain('tutor')
    }
  })

  it('refuses without the operator statement or while the writer still answers', async () => {
    const fixture = await buildRestoreFixture(tempDir('backup-guard'))
    const unconfirmed = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir('backup-guard-out'),
      writerStopped: false
    })
    expect(unconfirmed.receipt).toMatchObject({
      status: 'FAILED',
      event: 'backup_failed'
    })
    expect(unconfirmed.receipt.reasons).toContain(
      'writer_not_confirmed_stopped'
    )
    expect(existsSync(join(unconfirmed.backupDir, 'data'))).toBe(false)

    const live = await serve((_, response) => {
      response.end('{"live":true}')
    })
    const answering = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir('backup-guard-out2'),
      writerStopped: true,
      stoppedUrl: `${live.url}/health/live`
    })
    expect(answering.receipt.status).toBe('FAILED')
    expect(answering.receipt.reasons).toContain('writer_answering')
    expect(existsSync(join(answering.backupDir, 'data'))).toBe(false)

    const refused = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir('backup-guard-out3'),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(refused.receipt.status).toBe('VERIFIED')
  })

  it('fails when the source changes during the copy, holds a symlink or misses media', async () => {
    const fixture = await buildRestoreFixture(tempDir('backup-moving'))
    const writer = new ShiftStore(fixture.dataDir)
    let writes = 0
    const timer = setInterval(() => {
      writer.append({
        type: 'paused',
        at: new Date().toISOString(),
        by: GESTOR
      })
      writes += 1
    }, 0)
    let moving
    try {
      moving = await createBackup({
        dataDir: fixture.dataDir,
        outDir: tempDir('backup-moving-out'),
        writerStopped: true,
        stoppedUrl: CLOSED
      })
    } finally {
      clearInterval(timer)
    }
    expect(writes).toBeGreaterThan(0)
    expect(moving.receipt.status).toBe('FAILED')
    expect(moving.receipt.reasons).toContain('source_changed_during_copy')

    const linked = await buildRestoreFixture(tempDir('backup-link'))
    symlinkSync('/etc/hostname', join(linked.dataDir, 'media', 'link.ogg'))
    const withLink = await createBackup({
      dataDir: linked.dataDir,
      outDir: tempDir('backup-link-out'),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(withLink.receipt.status).toBe('FAILED')
    expect(withLink.receipt.reasons).toContain('unsupported_entry_in_source')

    const lost = await buildRestoreFixture(tempDir('backup-lost'))
    const media = readdirSync(join(lost.dataDir, 'media')).find(
      (name) => !lost.orphan.endsWith(name)
    )!
    unlinkSync(join(lost.dataDir, 'media', media))
    const missing = await createBackup({
      dataDir: lost.dataDir,
      outDir: tempDir('backup-lost-out'),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(missing.receipt.status).toBe('FAILED')
    expect(missing.receipt.reasons).toContain('media_missing')
  })
})

describe('PISO-008: restore rejects unsafe sets, compares under hold and proves a sandbox', () => {
  async function verifiedBackup(label: string) {
    const fixture = await buildRestoreFixture(tempDir(`${label}-src`))
    const { receipt, backupDir } = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir(`${label}-out`),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(receipt.status).toBe('VERIFIED')
    return { fixture, backupDir }
  }

  /** Rewrites the inventory as an attacker would, keeping the receipt consistent. */
  function tamperInventory(
    backupDir: string,
    change: (inventory: { files: Array<Record<string, unknown>> }) => void
  ) {
    const inventory = JSON.parse(
      readFileSync(join(backupDir, 'inventory.json'), 'utf8')
    )
    change(inventory)
    const bytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`)
    writeFileSync(join(backupDir, 'inventory.json'), bytes)
    const receipt = JSON.parse(
      readFileSync(join(backupDir, 'receipt.json'), 'utf8')
    )
    receipt.inventorySha256 = sha256(bytes)
    writeFileSync(join(backupDir, 'receipt.json'), JSON.stringify(receipt))
  }

  it('restores into a new volume, matches projections under hold and passes the sandbox', async () => {
    const { fixture, backupDir } = await verifiedBackup('restore-ok')
    const target = join(tempDir('restore-ok-target'), 'volume')
    const report = await restoreBackup({ backupDir, targetDir: target })
    expect(report.verdict).toBe('PASS')
    expect(report.checks.every((check) => check.pass)).toBe(true)
    expect(report.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'receipt verified',
        'inventory hash matches receipt',
        'paths are relative and inside the set',
        'no symlink or special file',
        'set matches the inventory exactly',
        'hashes match before writing',
        'target is new and empty',
        'copied hashes match',
        'projection matches under hold',
        'referenced media present'
      ])
    )
    expect(filesUnder(target)).toEqual(filesUnder(fixture.dataDir))

    // Every state survived: compare the projections field by field.
    const source = new ShiftStore(fixture.dataDir, { readOnly: true })
    const restored = new ShiftStore(target, { readOnly: true })
    expect(restored.projection()).toEqual(source.projection())
    const { tasks } = fixture
    expect(restored.task(tasks.replaced)?.status).toBe('cancelled')
    expect(restored.task(tasks.corrected)).toMatchObject({
      status: 'open',
      remindedCount: 1,
      reminderUncertain: true
    })
    expect(restored.task(tasks.done)?.status).toBe('done')
    expect(restored.task(tasks.snoozed)?.dueAt).toBe('2026-09-30T20:00:00.000Z')
    expect(restored.task(tasks.draft)?.status).toBe('draft')
    expect(restored.retryState('r1')).toMatchObject({ attempt: 1 })
    expect(restored.paused).toBe(false)
    // Under hold nothing can be written.
    expect(() =>
      restored.append({
        type: 'paused',
        at: new Date().toISOString(),
        by: GESTOR
      })
    ).toThrow(/STORAGE_UNAVAILABLE/)
    expect(filesUnder(target)).toEqual(filesUnder(fixture.dataDir))

    // Sandbox: hold released on a copy, transport stubbed in-process.
    const sandbox = await sandboxCheck({
      restoredDir: target,
      sandboxDir: join(tempDir('restore-ok-sandbox'), 'volume'),
      members: parseMembers(FIXTURE_MEMBERS),
      // After the snoozed (20:00) and the draft (21:10) due times.
      at: new Date('2026-09-30T23:00:00.000Z')
    })
    expect(sandbox.verdict).toBe('PASS')
    expect(sandbox.helpReplies).toBe(3)
    expect(sandbox.confirmedTasks).toEqual([tasks.draft])
    expect(new Set(sandbox.remindedTasks)).toEqual(
      new Set([tasks.snoozed, tasks.draft])
    )
    expect(sandbox.remindedTasks).not.toContain(tasks.corrected)
    expect(sandbox.resentAfterSecondTick).toBe(0)
    expect(sandbox.sends.every((send) => send.to !== 'outside')).toBe(true)
    // The restored volume itself was not touched by the sandbox.
    expect(filesUnder(target)).toEqual(filesUnder(fixture.dataDir))
  })

  it('rejects a divergent hash, a missing or extra file and leaves the target untouched', async () => {
    const { backupDir } = await verifiedBackup('restore-hash')
    const segment = join(backupDir, 'data', 'events.jsonl')
    const original = readFileSync(segment)
    const flipped = Buffer.from(original)
    flipped[10] = flipped[10]! ^ 0x01
    writeFileSync(segment, flipped)
    const target = join(tempDir('restore-hash-target'), 'volume')
    const report = await restoreBackup({ backupDir, targetDir: target })
    expect(report.verdict).toBe('FAIL')
    expect(
      report.checks.find(
        (check) => check.name === 'hashes match before writing'
      )?.pass
    ).toBe(false)
    expect(existsSync(target)).toBe(false)

    writeFileSync(segment, original)
    writeFileSync(join(backupDir, 'data', 'media', 'extra.ogg'), 'x')
    const extra = await restoreBackup({ backupDir, targetDir: target })
    expect(extra.verdict).toBe('FAIL')
    expect(existsSync(target)).toBe(false)
    unlinkSync(join(backupDir, 'data', 'media', 'extra.ogg'))

    unlinkSync(join(backupDir, 'data', 'journal.json'))
    const missing = await restoreBackup({ backupDir, targetDir: target })
    expect(missing.verdict).toBe('FAIL')
    expect(existsSync(target)).toBe(false)
  })

  it('rejects absolute paths, traversal and symlinks even with a consistent receipt', async () => {
    for (const path of ['/etc/passwd', '../fora.jsonl', 'media/../../fora']) {
      const { backupDir } = await verifiedBackup('restore-path')
      tamperInventory(backupDir, (inventory) => {
        inventory.files[0]!.path = path
      })
      const target = join(tempDir('restore-path-target'), 'volume')
      const report = await restoreBackup({ backupDir, targetDir: target })
      expect(report.verdict, path).toBe('FAIL')
      expect(
        report.checks.find(
          (check) => check.name === 'paths are relative and inside the set'
        )?.pass
      ).toBe(false)
      expect(existsSync(target)).toBe(false)
    }

    const { backupDir } = await verifiedBackup('restore-link')
    const media = join(backupDir, 'data', 'media')
    const name = readdirSync(media)[0]!
    const bytes = readFileSync(join(media, name))
    unlinkSync(join(media, name))
    const outside = join(tempDir('restore-link-outside'), name)
    writeFileSync(outside, bytes)
    symlinkSync(outside, join(media, name))
    const target = join(tempDir('restore-link-target'), 'volume')
    const report = await restoreBackup({ backupDir, targetDir: target })
    expect(report.verdict).toBe('FAIL')
    expect(
      report.checks.find((check) => check.name === 'no symlink or special file')
        ?.pass
    ).toBe(false)
    expect(existsSync(target)).toBe(false)
  })

  it('never writes into a non-empty target or the source volume', async () => {
    const { fixture, backupDir } = await verifiedBackup('restore-target')
    const busy = tempDir('restore-target-busy')
    writeFileSync(join(busy, 'outro.txt'), 'x')
    const report = await restoreBackup({ backupDir, targetDir: busy })
    expect(report.verdict).toBe('FAIL')
    expect(readdirSync(busy)).toEqual(['outro.txt'])

    const before = filesUnder(fixture.dataDir)
    const onto = await restoreBackup({
      backupDir,
      targetDir: fixture.dataDir
    })
    expect(onto.verdict).toBe('FAIL')
    expect(filesUnder(fixture.dataDir)).toEqual(before)
  })

  it('fails when the restored projection differs from the backed-up one', async () => {
    const { backupDir } = await verifiedBackup('restore-diverge')
    // A tampered projection (with a consistent receipt) must not pass: the
    // comparison really reads the restored journal.
    const projection = JSON.parse(
      readFileSync(join(backupDir, 'projection.json'), 'utf8')
    )
    projection.tasks[0].status = 'done'
    const bytes = Buffer.from(JSON.stringify(projection))
    writeFileSync(join(backupDir, 'projection.json'), bytes)
    const receipt = JSON.parse(
      readFileSync(join(backupDir, 'receipt.json'), 'utf8')
    )
    receipt.projectionSha256 = sha256(bytes)
    writeFileSync(join(backupDir, 'receipt.json'), JSON.stringify(receipt))
    const report = await restoreBackup({
      backupDir,
      targetDir: join(tempDir('restore-diverge-target'), 'volume')
    })
    expect(report.verdict).toBe('FAIL')
    expect(
      report.checks.find(
        (check) => check.name === 'projection matches under hold'
      )?.pass
    ).toBe(false)
  })
})

describe('PISO-008: backup and restore never write into the source volume', () => {
  it('requires the stopped URL check or a recorded operator waiver', async () => {
    const fixture = await buildRestoreFixture(tempDir('backup-url'))
    const missing = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir('backup-url-out'),
      writerStopped: true
    })
    expect(missing.receipt.status).toBe('FAILED')
    expect(missing.receipt.reasons).toContain('stopped_url_required')
    expect(existsSync(join(missing.backupDir, 'data'))).toBe(false)
    const waived = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir('backup-url-out2'),
      writerStopped: true,
      stoppedUrlWaived: true
    })
    expect(waived.receipt.status).toBe('VERIFIED')
    const inventory = JSON.parse(
      readFileSync(join(waived.backupDir, 'inventory.json'), 'utf8')
    )
    expect(inventory.writer.stoppedUrl).toBe('waived_by_operator')
  })

  it('refuses an output directory inside the volume before writing anything', async () => {
    const fixture = await buildRestoreFixture(tempDir('backup-inside'))
    const before = filesUnder(fixture.dataDir)
    await expect(
      createBackup({
        dataDir: fixture.dataDir,
        outDir: join(fixture.dataDir, 'backups'),
        writerStopped: true,
        stoppedUrl: CLOSED
      })
    ).rejects.toThrow(/out_inside_source/)
    const outside = tempDir('backup-inside-link')
    symlinkSync(fixture.dataDir, join(outside, 'volume'))
    await expect(
      createBackup({
        dataDir: fixture.dataDir,
        outDir: join(outside, 'volume', 'media', 'backups'),
        writerStopped: true,
        stoppedUrl: CLOSED
      })
    ).rejects.toThrow(/out_inside_source/)
    expect(filesUnder(fixture.dataDir)).toEqual(before)
  })

  it('refuses a restore target inside the source, directly or through a symlinked parent', async () => {
    const fixture = await buildRestoreFixture(tempDir('restore-inside'))
    const { receipt, backupDir } = await createBackup({
      dataDir: fixture.dataDir,
      outDir: tempDir('restore-inside-out'),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(receipt.status).toBe('VERIFIED')
    const before = filesUnder(fixture.dataDir)
    const linked = tempDir('restore-inside-link')
    symlinkSync(fixture.dataDir, join(linked, 'volume'))
    for (const target of [
      join(fixture.dataDir, 'restored'),
      join(fixture.dataDir, 'media', 'novo', 'restored'),
      join(linked, 'volume', 'restored')
    ]) {
      const report = await restoreBackup({ backupDir, targetDir: target })
      expect(report.verdict, target).toBe('FAIL')
      expect(
        report.checks.find((check) => check.name === 'target is new and empty')
      ).toMatchObject({ pass: false, detail: 'source volume or inside it' })
    }
    expect(filesUnder(fixture.dataDir)).toEqual(before)
  })
})

describe('PISO-008: the sandbox exercises every check', () => {
  async function restored(
    label: string,
    build: (dir: string) => Promise<void>
  ) {
    const source = tempDir(`${label}-src`)
    await build(source)
    const { receipt, backupDir } = await createBackup({
      dataDir: source,
      outDir: tempDir(`${label}-out`),
      writerStopped: true,
      stoppedUrl: CLOSED
    })
    expect(receipt.status).toBe('VERIFIED')
    const target = join(tempDir(`${label}-target`), 'volume')
    expect(
      (await restoreBackup({ backupDir, targetDir: target })).verdict
    ).toBe('PASS')
    return target
  }

  it('resumes a volume backed up while paused on the sandbox copy, as the runbook leaves it', async () => {
    const target = await restored('sandbox-paused', async (dir) => {
      await buildRestoreFixture(dir)
      // Runbook step 1: the manager pauses before the backup.
      const env = setup({ store: new ShiftStore(dir) })
      await env.deliver(
        wahaPayload('pause-before-backup', GESTOR, 'pausar assistente')
      )
    })
    expect(new ShiftStore(target, { readOnly: true }).paused).toBe(true)
    const sandbox = await sandboxCheck({
      restoredDir: target,
      sandboxDir: join(tempDir('sandbox-paused-copy'), 'volume'),
      members: parseMembers(FIXTURE_MEMBERS),
      at: new Date('2026-09-30T23:00:00.000Z')
    })
    expect(sandbox.verdict).toBe('PASS')
    expect(sandbox.resumedInSandbox).toBe(true)
    expect(sandbox.helpReplies).toBe(3)
    expect(sandbox.confirmedTasks).toHaveLength(1)
    expect(sandbox.remindedTasks.length).toBeGreaterThan(0)
    // The restored volume stays paused; only the copy was resumed.
    expect(new ShiftStore(target, { readOnly: true }).paused).toBe(true)

    const noManager = await sandboxCheck({
      restoredDir: target,
      sandboxDir: join(tempDir('sandbox-paused-nomgr'), 'volume'),
      members: parseMembers(`${ANA}=Dra Ana`),
      at: new Date('2026-09-30T23:00:00.000Z')
    })
    expect(noManager.verdict).toBe('FAIL')
    expect(
      noManager.checks.find(
        (check) => check.name === 'operation resumed on the sandbox copy'
      )?.pass
    ).toBe(false)
  })

  it('creates and confirms a synthetic draft when the volume has none, and reminds it', async () => {
    const target = await restored('sandbox-nodraft', async (dir) => {
      const env = setup({ dataDir: dir })
      await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3 ligar tutor'))
      await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    })
    const sandbox = await sandboxCheck({
      restoredDir: target,
      sandboxDir: join(tempDir('sandbox-nodraft-copy'), 'volume'),
      members: parseMembers(`${ANA}=Dra Ana;${GESTOR}=Gestor*`),
      at: new Date('2026-09-30T23:00:00.000Z')
    })
    expect(sandbox.verdict).toBe('PASS')
    expect(sandbox.draftSource).toBe('generated_in_sandbox')
    expect(sandbox.confirmedTasks).toHaveLength(1)
    expect(sandbox.remindedTasks).toEqual(
      expect.arrayContaining(sandbox.confirmedTasks)
    )
    expect(sandbox.resentAfterSecondTick).toBe(0)
  })

  it('fails instead of passing empty when there is no one to talk to', async () => {
    const target = await restored('sandbox-empty', async (dir) => {
      await buildRestoreFixture(dir)
    })
    const sandbox = await sandboxCheck({
      restoredDir: target,
      sandboxDir: join(tempDir('sandbox-empty-copy'), 'volume'),
      members: [],
      at: new Date('2026-09-30T23:00:00.000Z')
    })
    expect(sandbox.verdict).toBe('FAIL')
  })
})

const EVENT_KEYS = [
  'alertId',
  'candidateDigest',
  'firstObservedAt',
  'instanceOpaqueId',
  'observedAt',
  'product',
  'reasonCode',
  'severity',
  'state'
].sort()

const T0 = Date.parse('2026-10-21T03:00:00.000Z')
const at = (seconds: number) => new Date(T0 + seconds * 1000)
const OK: ProbeResult = {
  live: { kind: 'response', status: 200, body: { live: true } },
  ready: {
    kind: 'response',
    status: 200,
    body: { ready: true, mode: 'running', reasonCodes: [], attention: [] }
  }
}
const DOWN: ProbeResult = { live: { kind: 'timeout' } }

function monitorAt(
  stateFile: string,
  deliver: (body: string) => Promise<DeliveryResult>,
  clock: { now: Date },
  log: Array<[string, Record<string, unknown>]> = []
) {
  return new AlertMonitor({
    stateFile,
    candidateDigest: 'sha256:candidato-sintetico',
    instanceOpaqueId: 'instancia-sintetica-1',
    deliver,
    clock: () => clock.now,
    logger: (event, fields) => log.push([event, fields])
  })
}

describe('PISO-008: external monitor alerts with one episode id and a durable queue', () => {
  it('fires after two consecutive failures, rate-limits updates and resolves after two good probes', async () => {
    const delivered: AlertEvent[] = []
    const deliver = async (body: string): Promise<DeliveryResult> => {
      delivered.push(JSON.parse(body))
      return {
        ok: true,
        receiptId: `r${delivered.length}`,
        payloadSha256: sha256(body)
      }
    }
    const clock = { now: at(0) }
    const monitor = monitorAt(
      join(tempDir('monitor-episode'), 'state.json'),
      deliver,
      clock
    )
    const step = async (seconds: number, probe: ProbeResult) => {
      clock.now = at(seconds)
      monitor.observe({ at: clock.now, ...classifyProbe(probe) })
      await monitor.flush()
    }
    // One isolated failure is not an incident.
    await step(0, DOWN)
    await step(10, OK)
    expect(delivered).toHaveLength(0)
    await step(20, DOWN)
    await step(30, DOWN)
    expect(delivered).toHaveLength(1)
    const firing = delivered[0]!
    expect(Object.keys(firing).sort()).toEqual(EVENT_KEYS)
    expect(firing).toMatchObject({
      product: 'shift-assistant',
      reasonCode: 'live_timeout',
      severity: 'critical',
      state: 'firing',
      firstObservedAt: at(20).toISOString(),
      observedAt: at(30).toISOString()
    })
    // Within ≤30 s of the first failed probe.
    expect(
      Date.parse(firing.observedAt) - Date.parse(firing.firstObservedAt)
    ).toBeLessThanOrEqual(30_000)
    for (let second = 40; second <= 150; second += 10) await step(second, DOWN)
    const updates = delivered.slice(1)
    expect(updates.map((event) => event.observedAt)).toEqual([
      at(90).toISOString(),
      at(150).toISOString()
    ])
    expect(new Set(delivered.map((event) => event.alertId)).size).toBe(1)
    await step(160, OK)
    expect(delivered.at(-1)!.state).toBe('firing')
    await step(170, OK)
    expect(delivered.at(-1)).toMatchObject({
      alertId: firing.alertId,
      state: 'resolved',
      firstObservedAt: firing.firstObservedAt
    })
    // A new episode has a new id.
    await step(180, DOWN)
    await step(190, DOWN)
    expect(delivered.at(-1)!.alertId).not.toBe(firing.alertId)
    expect(delivered.at(-1)!.state).toBe('firing')
  })

  it('resolves a live episode only after live answers 200, not when it fails another way', async () => {
    const delivered: AlertEvent[] = []
    const deliver = async (body: string): Promise<DeliveryResult> => {
      delivered.push(JSON.parse(body))
      return {
        ok: true,
        receiptId: `r${delivered.length}`,
        payloadSha256: sha256(body)
      }
    }
    const clock = { now: at(0) }
    const monitor = monitorAt(
      join(tempDir('monitor-switch'), 'state.json'),
      deliver,
      clock
    )
    const UNREACHABLE: ProbeResult = { live: { kind: 'unreachable' } }
    const steps: Array<[number, ProbeResult]> = [
      [0, DOWN],
      [10, DOWN],
      [20, UNREACHABLE],
      [30, UNREACHABLE],
      [40, UNREACHABLE]
    ]
    for (const [second, probe] of steps) {
      clock.now = at(second)
      monitor.observe({ at: clock.now, ...classifyProbe(probe) })
      await monitor.flush()
    }
    expect(
      delivered.map((event) => `${event.reasonCode}:${event.state}`)
    ).toEqual(['live_timeout:firing', 'live_unreachable:firing'])
    for (const second of [50, 60]) {
      clock.now = at(second)
      monitor.observe({ at: clock.now, ...classifyProbe(OK) })
      await monitor.flush()
    }
    expect(
      delivered
        .slice(2)
        .map((event) => `${event.reasonCode}:${event.state}`)
        .sort()
    ).toEqual(['live_timeout:resolved', 'live_unreachable:resolved'])
  })

  it('does not take a 200 readiness without a readable body as healthy', () => {
    expect(
      classifyProbe({
        live: OK.live,
        ready: { kind: 'response', status: 200, body: undefined }
      }).findings
    ).toEqual([
      { reasonCode: 'ready_invalid', severity: 'critical', source: 'ready' }
    ])
  })

  it('maps pause to a notice, storage and scheduler to incidents and attention to warnings', () => {
    const paused = classifyProbe({
      live: OK.live,
      ready: {
        kind: 'response',
        status: 200,
        body: { mode: 'paused', reasonCodes: [], attention: [] }
      }
    })
    expect(paused.findings).toEqual([
      { reasonCode: 'paused', severity: 'info', source: 'ready' }
    ])
    const degraded = classifyProbe({
      live: OK.live,
      ready: {
        kind: 'response',
        status: 503,
        body: {
          mode: 'running',
          reasonCodes: [
            'storage_unavailable',
            'scheduler_stale',
            'telefone 5511900000001'
          ],
          attention: ['reminder_uncertain', 'texto livre']
        }
      }
    })
    expect(degraded.findings).toEqual([
      {
        reasonCode: 'storage_unavailable',
        severity: 'critical',
        source: 'ready'
      },
      { reasonCode: 'scheduler_stale', severity: 'critical', source: 'ready' },
      { reasonCode: 'not_ready', severity: 'critical', source: 'ready' },
      { reasonCode: 'reminder_uncertain', severity: 'warning', source: 'ready' }
    ])
    for (const code of [...READINESS_REASON_CODES, ...ATTENTION_CODES]) {
      const result = classifyProbe({
        live: OK.live,
        ready: {
          kind: 'response',
          status: 503,
          body: { reasonCodes: [code], attention: [code] }
        }
      })
      expect(result.findings.map((finding) => finding.reasonCode)).toContain(
        code
      )
    }
    expect(classifyProbe({ live: { kind: 'unreachable' } })).toEqual({
      findings: [
        { reasonCode: 'live_unreachable', severity: 'critical', source: 'live' }
      ],
      liveOk: false,
      readyObserved: false
    })
  })

  it('retries delivery at 30 s, 2, 10 and 30 min across a restart, then reports failure without a receipt', async () => {
    const stateFile = join(tempDir('monitor-queue'), 'state.json')
    const attempts: number[] = []
    const failing = async (): Promise<DeliveryResult> => {
      attempts.push((clock.now.getTime() - T0) / 1000)
      return { ok: false, code: 'unreachable' }
    }
    const clock = { now: at(0) }
    const log: Array<[string, Record<string, unknown>]> = []
    let monitor = monitorAt(stateFile, failing, clock, log)
    monitor.observe({ at: at(0), ...classifyProbe(DOWN) })
    monitor.observe({ at: at(10), ...classifyProbe(DOWN) })
    for (let second = 10; second <= 3 * 3600; second += 10) {
      clock.now = at(second)
      if (second === 200) {
        // The monitor process restarts: queue and episode come from disk.
        monitor = monitorAt(stateFile, failing, clock, log)
      }
      await monitor.flush()
    }
    expect(attempts).toEqual([10, 40, 160, 760, 2560])
    const status = monitor.status()
    expect(status.pending).toBe(0)
    expect(status.delivered).toHaveLength(0)
    expect(status.failed).toHaveLength(1)
    expect(status.failed[0]).toMatchObject({
      attempts: 5,
      reasonCode: 'live_timeout'
    })
    expect(status.failed[0]).not.toHaveProperty('receiptId')
    expect(log.map(([event]) => event)).toContain(
      'shift.monitor.delivery_failed'
    )
    expect(status.open.map((episode) => episode.reasonCode)).toEqual([
      'live_timeout'
    ])
  })

  it('does not take a receipt for another payload as delivery', async () => {
    const clock = { now: at(0) }
    let calls = 0
    const wrong = async (): Promise<DeliveryResult> => {
      calls += 1
      return { ok: true, receiptId: `r${calls}`, payloadSha256: '0'.repeat(64) }
    }
    const monitor = monitorAt(
      join(tempDir('monitor-mismatch'), 'state.json'),
      wrong,
      clock
    )
    monitor.observe({ at: at(0), ...classifyProbe(DOWN) })
    monitor.observe({ at: at(10), ...classifyProbe(DOWN) })
    clock.now = at(10)
    await monitor.flush()
    expect(calls).toBe(1)
    const status = monitor.status()
    expect(status.delivered).toHaveLength(0)
    expect(status.pending).toBe(1)
  })

  it('delivers to the exclusive local receiver, which stores payload, hash and time and returns the receipt', async () => {
    const dir = tempDir('receiver')
    const receiver = await startAlertReceiver({
      dir,
      token: 'token-sintetico-do-receptor-123'
    })
    try {
      const clock = { now: at(0) }
      const stateFile = join(tempDir('monitor-receipt'), 'state.json')
      const monitor = monitorAt(
        stateFile,
        httpDeliver(receiver.url, 'token-sintetico-do-receptor-123'),
        clock
      )
      for (const [second, probe] of [
        [0, DOWN],
        [10, DOWN],
        [20, OK],
        [30, OK]
      ] as const) {
        clock.now = at(second)
        monitor.observe({ at: clock.now, ...classifyProbe(probe) })
        await monitor.flush()
      }
      const delivered = monitor.status().delivered
      expect(delivered.map((entry) => entry.state)).toEqual([
        'firing',
        'resolved'
      ])
      for (const entry of delivered) {
        const stored = JSON.parse(
          readFileSync(join(dir, `${entry.receiptId}.json`), 'utf8')
        )
        expect(stored.receiptId).toBe(entry.receiptId)
        expect(stored.payloadSha256).toBe(entry.payloadSha256)
        expect(sha256(JSON.stringify(stored.payload))).toBe(entry.payloadSha256)
        expect(Date.parse(stored.receivedAt)).not.toBeNaN()
        expect(Object.keys(stored.payload).sort()).toEqual(EVENT_KEYS)
      }

      // Wrong token and a payload with an extra field are refused and not stored.
      const files = readdirSync(dir).length
      const body = JSON.stringify({
        ...JSON.parse(
          readFileSync(join(dir, `${delivered[0]!.receiptId}.json`), 'utf8')
        ).payload,
        phone: ANA
      })
      expect(
        await httpDeliver(receiver.url, 'token-errado-000000000000')(body)
      ).toMatchObject({ ok: false })
      expect(
        await httpDeliver(receiver.url, 'token-sintetico-do-receptor-123')(body)
      ).toMatchObject({ ok: false })
      expect(readdirSync(dir).length).toBe(files)
    } finally {
      await receiver.close()
    }
  })

  it('probes the real server: healthy, paused, slow and closed', async () => {
    const env = setup()
    const server = buildShiftServer({
      assistant: env.assistant,
      store: env.store,
      whatsapp: env.waha.client,
      webhookSecret: 'segredo-sintetico-de-teste-123456'
    })
    servers.push(server)
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const probe = () =>
      probeAssistant(`${base}/health/live`, `${base}/health/ready`, {
        timeoutMs: 2000
      })
    expect(classifyProbe(await probe()).findings).toEqual([])
    await env.deliver(wahaPayload('p1', GESTOR, 'pausar assistente'))
    expect(classifyProbe(await probe()).findings).toEqual([
      { reasonCode: 'paused', severity: 'info', source: 'ready' }
    ])

    const slow = await serve((_, response) => {
      setTimeout(() => response.end('{"live":true}'), 600)
    })
    const late = await probeAssistant(
      `${slow.url}/health/live`,
      `${slow.url}/health/ready`,
      { timeoutMs: 200 }
    )
    expect(classifyProbe(late).findings[0]?.reasonCode).toBe('live_timeout')
    const closed = await probeAssistant(
      'http://127.0.0.1:9/health/live',
      'http://127.0.0.1:9/health/ready',
      { timeoutMs: 500 }
    )
    expect(classifyProbe(closed).findings[0]?.reasonCode).toBe(
      'live_unreachable'
    )
  })

  it('exposes attention codes on /health/ready for the monitor', async () => {
    const dataDir = tempDir('ready-attention')
    const env = setup({ dataDir })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    const number = env.store.openTasks(ANA)[0]!.number
    // A reminder whose dispatch started and never recorded an outcome.
    env.store.reserveReminder(number, 1, '2026-09-30T19:05:00.000Z')
    const restarted = setup({
      store: new ShiftStore(dataDir),
      start: new Date('2026-09-30T19:05:00.000Z')
    })
    const server = buildShiftServer({
      assistant: restarted.assistant,
      store: restarted.store,
      whatsapp: restarted.waha.client,
      webhookSecret: 'segredo-sintetico-de-teste-123456'
    })
    servers.push(server)
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const response = await fetch(`${base}/health/ready`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ready: true,
      mode: 'running',
      effectsEnabled: true,
      reasonCodes: [],
      attention: ['reminder_uncertain']
    })
    expect(
      classifyProbe(
        await probeAssistant(`${base}/health/live`, `${base}/health/ready`, {
          timeoutMs: 2000
        })
      ).findings
    ).toEqual([
      { reasonCode: 'reminder_uncertain', severity: 'warning', source: 'ready' }
    ])
  })
})

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('PISO-008/PISO-006: the real process stops on SIGTERM in bounded time', () => {
  it('ends within 10 s with a hung send and a hung Whisper, keeping pending work recoverable', async () => {
    const dataDir = tempDir('stop-real')
    const seed = setup({ dataDir })
    await seed.deliver(wahaPayload('m1', ANA, 'Thor leito 3 ligar tutor'))
    await seed.deliver(wahaPayload('ok1', ANA, 'ok'))
    const number = seed.store.openTasks(ANA)[0]!.number

    const sends: string[] = []
    let whisperCalls = 0
    const waha = await serve((request, response) => {
      if (request.url?.startsWith('/api/files/')) {
        response.writeHead(200, { 'content-type': 'audio/ogg' })
        response.end(Buffer.from([1, 2, 3]))
        return
      }
      if (request.url === '/api/sendText') {
        sends.push('send')
        request.resume() // never answers: the send hangs
        return
      }
      response.writeHead(404).end()
    })
    const whisper = await serve((request) => {
      whisperCalls += 1
      request.resume() // never answers
    })
    const secret = 'segredo-sintetico-de-teste-123456'
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'products/shift-assistant/src/main.ts'],
      {
        cwd: ROOT,
        env: {
          PATH: process.env.PATH ?? '',
          NODE_ENV: 'production',
          SHIFT_PROVIDER: 'waha',
          SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
          SHIFT_WEBHOOK_SECRET: secret,
          SHIFT_DATA_DIR: dataDir,
          SHIFT_PORT: '0',
          SHIFT_HOST: '127.0.0.1',
          SHIFT_TICK_SECONDS: '10',
          WAHA_URL: waha.url,
          WAHA_API_KEY: 'sandbox-waha-key',
          WHISPER_URL: whisper.url,
          LLM_BASE_URL: 'http://127.0.0.1:9/v1',
          LLM_MODEL: 'sandbox',
          LLM_LOCATION: 'local'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    let stdout = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stdout += String(chunk)))
    const exited = new Promise<{ code: number | null; signal: string | null }>(
      (done) => child.on('exit', (code, signal) => done({ code, signal }))
    )
    try {
      const until = async (condition: () => boolean, ms: number) => {
        const deadline = Date.now() + ms
        while (!condition()) {
          if (Date.now() > deadline) throw new Error(`timeout: ${stdout}`)
          await new Promise((done) => setTimeout(done, 50))
        }
      }
      await until(() => /"shift\.started"/.test(stdout), 20_000)
      const port = Number(/"port":(\d+)/.exec(stdout)![1])
      const audio = await fetch(`http://127.0.0.1:${port}/webhooks/waha`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cvg-webhook-secret': secret
        },
        body: JSON.stringify(
          wahaPayload('a1', ANA, '', {
            hasMedia: true,
            media: {
              url: `${waha.url}/api/files/a1.ogg`,
              mimetype: 'audio/ogg'
            }
          })
        )
      })
      expect(audio.status).toBe(200)
      // The reminder send starts at the first tick (10 s) and hangs.
      await until(() => whisperCalls > 0 && sends.length > 0, 20_000)

      const started = Date.now()
      child.kill('SIGTERM')
      const result = await exited
      const elapsed = Date.now() - started
      expect(elapsed).toBeLessThan(10_000)
      expect(result).toEqual({ code: 0, signal: null })
      expect(stdout).toMatch(/"shift\.stopped","clean":true/)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
    }

    // Pending work survived: the audio waits for processing and the
    // interrupted reminder is uncertain, never resent blindly.
    const reopened = new ShiftStore(dataDir, { readOnly: true })
    expect(reopened.unprocessedMessages().map((m) => m.messageId)).toEqual([
      'a1'
    ])
    expect(reopened.task(number)).toMatchObject({
      status: 'open',
      remindedCount: 0,
      reminderUncertain: true
    })
    const events = readFileSync(join(dataDir, 'events.jsonl'), 'utf8')
    expect(events).toContain('"reminder_dispatch_started"')
    expect(events).not.toContain('"task_reminded"')
  }, 60_000)
})
