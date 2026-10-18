// @vitest-environment node
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  symlink,
  link,
  rm
} from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { openEvidenceRoot } from './safe-io.mjs'

const roots = [],
  readers = []
const hash = (v) => createHash('sha256').update(v).digest('hex')
async function setup() {
  const parent = await mkdtemp(path.join(tmpdir(), 'claude100-io-'))
  roots.push(parent)
  const root = path.join(parent, 'evidence')
  await mkdir(root)
  const io = await openEvidenceRoot(root)
  readers.push(io)
  return { parent, root, io }
}
afterEach(async () => {
  for (const reader of readers.splice(0)) await reader.close()
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true })
})

describe('SPEC0229 confined materialized evidence IO', () => {
  it('hashes the same bounded snapshot, detaches buffers and counts hardlinks once', async () => {
    const { root, io } = await setup()
    await writeFile(path.join(root, 'a'), 'synthetic')
    await link(path.join(root, 'a'), path.join(root, 'b'))
    const first = await io.read('a', 9)
    expect(first.sha256).toBe(hash(Buffer.from('synthetic')))
    expect(first.size).toBe(9)
    first.bytes.fill(0)
    const second = await io.read('b', 9)
    expect(second.bytes.toString()).toBe('synthetic')
    expect(io.totalBytes).toBe(9)
    await expect(io.read('a', 8)).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
  })
  it('does not silently reuse a stale snapshot after in-place mutation', async () => {
    const { root, io } = await setup()
    await writeFile(path.join(root, 'a'), 'first')
    await io.read('a')
    await writeFile(path.join(root, 'a'), 'second')
    await expect(io.read('a')).rejects.toHaveProperty('status', 'INVALID_INPUT')
  })
  it('refuses outside paths and symlinks before reading their content', async () => {
    const { parent, root, io } = await setup()
    await writeFile(path.join(parent, 'outside'), 'synthetic outside marker')
    await mkdir(path.join(parent, 'outside-dir'))
    await writeFile(path.join(parent, 'outside-dir', 'file'), 'synthetic')
    await symlink(path.join(parent, 'outside'), path.join(root, 'alias'))
    await symlink(
      path.join(parent, 'outside-dir'),
      path.join(root, 'directory')
    )
    for (const name of [
      '../outside',
      path.join(parent, 'outside'),
      'alias',
      'directory/file',
      'directory/../alias',
      'a\0b'
    ]) {
      await expect(io.read(name)).rejects.toHaveProperty(
        'status',
        'INVALID_INPUT'
      )
    }
    expect(io.totalBytes).toBe(0)
  })
  it('rejects symlink evidence roots and nonregular files without hanging', async () => {
    const { parent, root, io } = await setup()
    await symlink(root, path.join(parent, 'root-alias'))
    await expect(
      openEvidenceRoot(path.join(parent, 'root-alias'))
    ).rejects.toHaveProperty('status', 'INVALID_INPUT')
    await expect(io.read('missing')).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
    await mkdir(path.join(root, 'directory'))
    await expect(io.read('directory')).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
    execFileSync('mkfifo', [path.join(root, 'fifo')], { timeout: 1000 })
    await expect(io.read('fifo')).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
  })
  it('refuses profile and secret files even when a manifest names them under its root', async () => {
    const { root, io } = await setup()
    for (const name of [
      '.env',
      '.env.local',
      '.npmrc',
      '.netrc',
      '.git-credentials'
    ]) {
      await writeFile(path.join(root, name), 'SYNTHETIC_SECRET_SENTINEL')
      await expect(io.read(name)).rejects.toHaveProperty(
        'status',
        'INVALID_INPUT'
      )
    }
    await mkdir(path.join(root, '.ssh'))
    await writeFile(
      path.join(root, '.ssh', 'id_rsa'),
      'SYNTHETIC_SECRET_SENTINEL'
    )
    await expect(io.read('.ssh/id_rsa')).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
    expect(io.totalBytes).toBe(0)
  })
  it('enforces exact and one-over byte boundaries including empty files', async () => {
    const { root, io } = await setup()
    await writeFile(path.join(root, 'empty'), '')
    expect((await io.read('empty', 0)).size).toBe(0)
    await writeFile(path.join(root, 'unicode'), 'á')
    expect((await io.read('unicode', 2)).size).toBe(2)
    await expect(io.read('unicode', 1)).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
    for (const bad of [-1, 0.1, NaN, 4 * 1024 * 1024 + 1])
      await expect(io.read('empty', bad)).rejects.toHaveProperty(
        'status',
        'INVALID_INPUT'
      )
  })
  it('fails above the aggregate cap rather than truncating or omitting inputs', async () => {
    const { root, io } = await setup()
    const bytes = Buffer.alloc(4 * 1024 * 1024, 97)
    for (let i = 0; i < 17; i++) {
      await writeFile(path.join(root, `input-${i}`), bytes)
      if (i < 16) expect((await io.read(`input-${i}`)).size).toBe(bytes.length)
      else
        await expect(io.read(`input-${i}`)).rejects.toHaveProperty(
          'status',
          'INVALID_INPUT'
        )
    }
    expect(io.totalBytes).toBe(64 * 1024 * 1024)
  })
  it('creates only new output, anchors its files, and never overwrites evidence', async () => {
    const { root, io } = await setup()
    const out = await io.createOutput('run-17')
    const item = await out.write('report.json', '{"synthetic":true}')
    expect(item.path).toBe('run-17/report.json')
    expect(item.sha256).toBe(hash(await readFile(path.join(root, item.path))))
    await expect(out.write('report.json', 'replace')).rejects.toHaveProperty(
      'status',
      'INFRA_FAILURE'
    )
    await expect(io.createOutput('run-17')).rejects.toHaveProperty(
      'status',
      'INFRA_FAILURE'
    )
    expect((await readFile(path.join(root, item.path))).toString()).toBe(
      '{"synthetic":true}'
    )
    for (const name of [
      '../outside',
      '/outside',
      'nested/file',
      '.',
      '',
      'x\0y'
    ])
      await expect(out.write(name, 'x')).rejects.toHaveProperty(
        'status',
        'INVALID_INPUT'
      )
  })
  it('serializes concurrent snapshots so their aggregate cannot exceed the input cap', async () => {
    const { root, io } = await setup()
    const bytes = Buffer.alloc(4 * 1024 * 1024, 97)
    for (let i = 0; i < 17; i++)
      await writeFile(path.join(root, `concurrent-${i}`), bytes)
    const results = await Promise.allSettled(
      Array.from({ length: 17 }, (_, i) => io.read(`concurrent-${i}`))
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(16)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(io.totalBytes).toBe(64 * 1024 * 1024)
  })
  it('rejects an output parent alias and a preexisting directory without changing either', async () => {
    const { parent, root, io } = await setup()
    await mkdir(path.join(parent, 'other'))
    await symlink(path.join(parent, 'other'), path.join(root, 'alias'))
    await expect(io.createOutput('alias/new')).rejects.toHaveProperty(
      'status',
      'INFRA_FAILURE'
    )
    await expect(io.createOutput('../new')).rejects.toHaveProperty(
      'status',
      'INVALID_INPUT'
    )
    await expect(
      readFile(path.join(parent, 'other', 'new'))
    ).rejects.toHaveProperty('code', 'ENOENT')
  })
  it('closes its own handles idempotently and refuses later operations', async () => {
    const { io } = await setup()
    const out = await io.createOutput('new')
    await io.close()
    await io.close()
    await expect(io.read('x')).rejects.toHaveProperty('status', 'INFRA_FAILURE')
    await expect(out.write('x', 'x')).rejects.toHaveProperty(
      'status',
      'INFRA_FAILURE'
    )
  })
})
