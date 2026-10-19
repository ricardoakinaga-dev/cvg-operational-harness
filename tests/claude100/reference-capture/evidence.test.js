// @vitest-environment node
// Evidence writer, inputs, marker and workspace state on private temp roots.
import { afterAll, describe, expect, it } from 'vitest'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FIXTURE_BYTES, MARKER_ROOT, canonical, sha256 } from './constants.mjs'
import { binding, createEvidence } from './evidence.mjs'
import {
  createHostMarker,
  parseManifest,
  pinEmptyDirectory,
  pinFile,
  scriptInventoryEntries
} from './inputs.mjs'
import { plannedScripts } from './script.mjs'
import { expectedWorkspaceState, observeWorkspace } from './workspace.mjs'

const roots = []
afterAll(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
})
async function root(mode = 0o700) {
  await mkdir(path.join(tmpdir(), 'reference-capture-tests'), {
    recursive: true,
    mode: 0o700
  })
  const r = await mkdtemp(path.join(tmpdir(), 'reference-capture-tests', 'e-'))
  await chmod(r, mode)
  roots.push(r)
  return r
}
const host = binding('HOST')

describe('exclusive evidence writer', () => {
  it('requires an own 0700 root and a new destination', async () => {
    await expect(
      createEvidence(await root(0o755), 'out')
    ).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    })
    const r = await root()
    await mkdir(path.join(r, 'out'))
    await expect(createEvidence(r, 'out')).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    })
    for (const bad of ['../x', 'a/b', '.hidden', ''])
      await expect(createEvidence(await root(), bad)).rejects.toMatchObject({
        code: 'INPUT_INVALID'
      })
  })
  it('writes exclusively, re-reads through the same descriptors and publishes once', async () => {
    const r = await root()
    const e = await createEvidence(r, 'out')
    const a = await e.add(
      'INPUT_FIXTURE',
      'inputs/a.txt',
      Buffer.from('abc'),
      host
    )
    expect(a).toEqual({
      path: 'inputs/a.txt',
      role: 'INPUT_FIXTURE',
      sha256: sha256('abc'),
      bytes: 3,
      bindings: host
    })
    await expect(
      e.add('INPUT_FIXTURE', 'inputs/a.txt', Buffer.from('x'), host)
    ).rejects.toMatchObject({ code: 'PROTOCOL' })
    await expect(
      e.add('NOT_A_ROLE', 'x', Buffer.alloc(0), host)
    ).rejects.toThrow()
    await expect(
      e.add('FAILURES', '../x', Buffer.alloc(0), host)
    ).rejects.toThrow()
    const files = await e.reread()
    expect(files.get('inputs/a.txt').toString()).toBe('abc')
    await e.publish(Buffer.from('{"ok":true}'))
    expect(await readFile(path.join(r, 'out', 'report.json'), 'utf8')).toBe(
      '{"ok":true}'
    )
    await expect(
      e.add('FAILURES', 'late.json', Buffer.alloc(0), host)
    ).rejects.toThrow()
  })
  it('detects a replaced artifact pathname even with identical bytes', async () => {
    const r = await root()
    const e = await createEvidence(r, 'out')
    await e.add('INPUT_FIXTURE', 'a.txt', Buffer.from('same'), host)
    await rename(path.join(r, 'out', 'a.txt'), path.join(r, 'moved'))
    await writeFile(path.join(r, 'out', 'a.txt'), 'same', { mode: 0o600 })
    await expect(e.reread()).rejects.toMatchObject({ code: 'DRIFT_RUNTIME' })
    await e.abort()
    await expect(
      lstat(path.join(r, 'out', 'report.json'))
    ).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })
  it('caps at 512 files', async () => {
    const e = await createEvidence(await root(), 'out')
    for (let i = 0; i < 512; i++)
      await e.add('INPUT_FIXTURE', `f/${i}.bin`, Buffer.alloc(0), host)
    await expect(
      e.add('INPUT_FIXTURE', 'f/extra.bin', Buffer.alloc(0), host)
    ).rejects.toMatchObject({ code: 'CAP' })
    await e.abort()
  })
  it('caps the aggregate at 16MiB exactly', async () => {
    const e = await createEvidence(await root(), 'out')
    await e.add(
      'INPUT_FIXTURE',
      'big.bin',
      Buffer.alloc(16 * 1024 * 1024 - 1),
      host
    )
    await e.add('INPUT_FIXTURE', 'one.bin', Buffer.alloc(1), host)
    await expect(
      e.add('INPUT_FIXTURE', 'two.bin', Buffer.alloc(1), host)
    ).rejects.toMatchObject({ code: 'CAP' })
    await e.abort()
  })
})

describe('inputs and identities (RC01)', () => {
  it.each([
    ['{"version":1,"runId":"a"}', 'a'],
    ['  {"runId":"b-_9","version":1}\n', 'b-_9']
  ])('accepts %s', (text, runId) => {
    expect(parseManifest(Buffer.from(text))).toEqual({ version: 1, runId })
  })
  it.each([
    '{"version":1,"runId":"a","runId":"a"}',
    '{"version":1,"runId":"a","fixtureId":"x"}',
    '{"version":"1","runId":"a"}',
    `{"version":1,"runId":"${'a'.repeat(65)}"}`,
    '{"version":1,"runId":"../x"}',
    '{"version":1,"runId":"a","__proto__":{}}',
    '[1]',
    '{"version":1,"runId":{"x":1}}'
  ])('rejects %s', (text) => {
    expect(() => parseManifest(Buffer.from(text))).toThrow(
      expect.objectContaining({ code: 'INPUT_INVALID' })
    )
  })
  it('pins files by descriptor and path; drift is DRIFT_RUNTIME, mismatch IDENTITY_MISMATCH', async () => {
    const r = await root()
    const file = path.join(r, 'tool')
    await writeFile(file, 'bytes')
    await expect(pinFile(file, '0'.repeat(64), 100)).rejects.toMatchObject({
      code: 'IDENTITY_MISMATCH'
    })
    const pin = await pinFile(file, sha256('bytes'), 100)
    expect((await pin.verify()).sha256).toBe(sha256('bytes'))
    await writeFile(file, 'BYTES')
    await expect(pin.verify()).rejects.toMatchObject({ code: 'DRIFT_RUNTIME' })
    await pin.close()
    await expect(pinFile(path.join(r, 'missing'), null, 1)).rejects.toThrow()
  })
  it('pins the empty volume directory and detects any new child', async () => {
    const dir = path.join(await root(), 'empty')
    await mkdir(dir, { mode: 0o700 })
    const pin = await pinEmptyDirectory(dir)
    await writeFile(path.join(dir, 'x'), 'x')
    await expect(pin.verify()).rejects.toMatchObject({ code: 'DRIFT_RUNTIME' })
    await pin.close()
  })
  it('creates the unmounted marker exclusively and removes only its own inode', async () => {
    const nonce = 'f'.repeat(31) + '0'
    const marker = await createHostMarker(nonce)
    expect(marker.path).toBe(`${MARKER_ROOT}/${nonce}`)
    expect((await lstat(MARKER_ROOT)).mode & 0o777).toBe(0o700)
    await expect(createHostMarker(nonce)).rejects.toThrow()
    await marker.close()
    expect(marker.removed).toBe(true)
    expect(await readdir(MARKER_ROOT)).not.toContain(nonce)
    await expect(createHostMarker('x')).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    })
  })
  it('inventories every planned script byte with stable paths', () => {
    const entries = scriptInventoryEntries()
    const total = plannedScripts().reduce(
      (n, s) => n + s.segments.length + 2,
      0
    )
    expect(entries).toHaveLength(total)
    expect(new Set(entries.map((e) => e.artifactPath)).size).toBe(total)
    for (const e of entries) expect(sha256(e.content)).toBe(e.sha256)
  })
})

describe('workspace state', () => {
  it('enumerates exactly the three pinned files and the explicit absence of denied.txt', async () => {
    const expected = expectedWorkspaceState()
    expect(expected.document.entries.map((e) => e.path)).toEqual([
      '/workspace/input.txt',
      '/workspace/mcp.json',
      '/workspace/settings.json'
    ])
    expect(expected.document.denied).toEqual({
      path: '/workspace/denied.txt',
      present: false
    })
    expect(expected.bytes.toString()).toBe(canonical(expected.document))
    const dir = await root()
    await writeFile(path.join(dir, 'input.txt'), FIXTURE_BYTES)
    await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}')
    await writeFile(
      path.join(dir, 'settings.json'),
      '{"permissions":{"defaultMode":"dontAsk","allow":["Read"]}}'
    )
    expect((await observeWorkspace(dir)).sha256).toBe(expected.sha256)
    await writeFile(path.join(dir, 'denied.txt'), 'x')
    const drift = await observeWorkspace(dir)
    expect(drift.document.denied.present).toBe(true)
    expect(drift.sha256).not.toBe(expected.sha256)
  })
})
