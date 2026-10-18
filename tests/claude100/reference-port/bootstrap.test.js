// @vitest-environment node
// R1-06: synthetic filesystem graphs only; never valid probe CLI/main or native IO.
import { afterEach, describe, expect, it } from 'vitest'
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  lstat,
  readlink,
  chmod,
  rename,
  unlink,
  symlink,
  rm
} from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SOURCE_PATHS, BUILTIN_ALLOWLIST } from './bootstrap.mjs'
import { parseArgs } from '../../../scripts/claude100-reference-port.mjs'

const prefix = path.join(tmpdir(), 'native-port-bootstrap-tests')
const own = [],
  graphs = []
const sourceUrl = new URL('./bootstrap.mjs', import.meta.url)
const specUrl = new URL(
  '../../../docs/02_spec/0235_claude_native_port_probe.md',
  import.meta.url
)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  await mkdir(prefix, { recursive: true, mode: 0o700 })
  const base = await mkdtemp(path.join(prefix, 'bootstrap-case-'))
  own.push(base)
  const checkout = path.join(base, 'source'),
    evidence = path.join(base, 'evidence')
  await mkdir(checkout, { mode: 0o700 })
  await mkdir(evidence, { mode: 0o700 })
  for (const relative of SOURCE_PATHS) {
    const filename = path.join(checkout, relative)
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 })
    const bytes = relative.endsWith('/bootstrap.mjs')
      ? await readFile(sourceUrl)
      : relative.endsWith('/0235_claude_native_port_probe.md')
        ? await readFile(specUrl)
        : relative.endsWith('/package.json')
          ? Buffer.from('{"type":"module"}')
          : Buffer.from(
              'throw new Error("SYNTHETIC_PROTECTED_ORIGINAL_MUST_NOT_IMPORT")\n'
            )
    await writeFile(filename, bytes, { mode: 0o600 })
  }
  // Only the builtin-only bootstrap runs. The protected fixture modules above
  // deliberately throw if anything imports them before/while freezing.
  const module = await import(
    pathToFileURL(
      path.join(checkout, 'tests/claude100/reference-port/bootstrap.mjs')
    ).href
  )
  return { base, checkout, evidence, freeze: module.freezeHostGraph }
}
async function freeze(f) {
  const graph = await f.freeze(f.evidence)
  graphs.push(graph)
  return graph
}
async function close(graph) {
  await Promise.all(graph.pins.map((pin) => pin.close()))
}
async function heldIn(base) {
  const result = []
  for (const name of await readdir('/proc/self/fd')) {
    try {
      const link = await readlink('/proc/self/fd/' + name)
      if (link.startsWith(base + '/')) result.push(link)
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause
    }
  }
  return result
}
afterEach(async () => {
  // Each case owns every synthetic file under its exclusive mkdtemp root.
  for (const graph of graphs.splice(0)) {
    await Promise.allSettled(graph.pins.map((pin) => pin.close()))
    await graph.dispose().catch(() => {}) // Deliberate hostile replacements are retained until own-case cleanup.
  }
  for (const base of own.splice(0))
    await rm(base, { recursive: true, force: true })
})

describe('trusted pre-import source graph', () => {
  it('declares exactly the frozen20 sources and12 sorted builtin imports', async () => {
    expect(SOURCE_PATHS).toHaveLength(20)
    expect(new Set(SOURCE_PATHS).size).toBe(20)
    expect(SOURCE_PATHS).toEqual([...SOURCE_PATHS].sort())
    expect(SOURCE_PATHS).toContain(
      'tests/claude100/reference-port/bootstrap.mjs'
    )
    expect(SOURCE_PATHS).not.toContain(
      'tests/claude100/reference-port/bootstrap.test.js'
    )
    expect(Object.isFrozen(SOURCE_PATHS)).toBe(true)
    expect(BUILTIN_ALLOWLIST).toEqual([
      'node:buffer',
      'node:child_process',
      'node:crypto',
      'node:events',
      'node:fs',
      'node:fs/promises',
      'node:http',
      'node:os',
      'node:path',
      'node:perf_hooks',
      'node:url',
      'node:util'
    ])
    expect(Object.isFrozen(BUILTIN_ALLOWLIST)).toBe(true)
    const text = await readFile(sourceUrl, 'utf8')
    const imports = [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1]
    )
    expect(imports.length).toBeGreaterThan(0)
    expect(imports.every((name) => BUILTIN_ALLOWLIST.includes(name))).toBe(true)
    expect(text).not.toMatch(/\bimport\s*\(/)
    expect(text).not.toContain('process.env')
  })
  it('freezes only fixed bytes without importing protected originals and pins both physical graphs', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    expect(Object.keys(graph).sort()).toEqual(
      [
        'root',
        'pins',
        'entries',
        'totalBytes',
        'builtinAllowlist',
        'dispose'
      ].sort()
    )
    expect(path.dirname(graph.root)).toBe(f.evidence)
    expect(path.basename(graph.root)).toMatch(
      /^\.native-port-bootstrap-[a-f0-9]{32}$/
    )
    expect((await lstat(graph.root)).mode & 0o777).toBe(0o700)
    expect(graph.entries.map((entry) => entry.path)).toEqual(SOURCE_PATHS)
    expect(graph.pins).toHaveLength(40)
    let bytes = 0
    for (const entry of graph.entries) {
      const original = await readFile(path.join(f.checkout, entry.path))
      const copyName = path.join(graph.root, entry.path),
        copy = await readFile(copyName)
      expect(copy).toEqual(original)
      expect(entry).toEqual({
        path: entry.path,
        sha256: digest(original),
        bytes: original.length
      })
      expect((await lstat(copyName)).mode & 0o777).toBe(0o600)
      bytes += original.length
    }
    expect(graph.totalBytes).toBe(bytes)
    expect(graph.builtinAllowlist).toEqual(BUILTIN_ALLOWLIST)
    for (const pin of graph.pins) {
      const metadata = await pin.verify()
      expect(metadata).toMatchObject({
        path: pin.filename,
        sha256: pin.sha256,
        bytes: pin.size
      })
      expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata)
    }
    await close(graph)
    await graph.dispose()
    await graph.dispose()
    await expect(lstat(graph.root)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await heldIn(f.base)).toEqual([])
  })
  it('keeps parseArgs inert and CLI imports only bootstrap before one fixed snapshot controller', async () => {
    expect(
      parseArgs([
        '--manifest',
        'synthetic',
        '--evidence-root',
        '/synthetic',
        '--out',
        'new'
      ])
    ).toEqual({ manifest: 'synthetic', evidenceRoot: '/synthetic', out: 'new' })
    for (const args of [
      [],
      ['--command', 'unapproved'],
      ['--manifest', 'secret'],
      ['--manifest', 'a', '--manifest', 'b']
    ])
      expect(() => parseArgs(args)).toThrow('USAGE')
    const text = await readFile(
      new URL('../../../scripts/claude100-reference-port.mjs', import.meta.url),
      'utf8'
    )
    const imports = [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
      (m) => m[1]
    )
    expect(imports).toEqual([
      'node:url',
      '../tests/claude100/reference-port/bootstrap.mjs'
    ])
    expect([...text.matchAll(/\bimport\s*\(/g)]).toHaveLength(1)
    expect(text).toContain(
      "graph.root + '/tests/claude100/reference-port/controller.mjs'"
    )
    expect(text.indexOf('await freezeHostGraph')).toBeLessThan(
      text.indexOf('await import(')
    )
    expect(text).toMatch(
      /controller\.runProbe\(\s*options,\s*graph,\s*releaseEntrySignals\s*\)/
    )
    expect(text).toContain('if (graph && !returned)')
  })
  it('loads a declared synthetic helper from the copied graph after freeze, never from its mutated original', async () => {
    const f = await fixture()
    const controller = path.join(
      f.checkout,
      'tests/claude100/reference-port/controller.mjs'
    )
    const helper = path.join(
      f.checkout,
      'tests/claude100/reference-port/protocol.mjs'
    )
    const key = 'CVG_BOOTSTRAP_SYNTHETIC_' + path.basename(f.base)
    await writeFile(
      controller,
      "import { value } from './protocol.mjs'; export const captured = value\n"
    )
    await writeFile(
      helper,
      `globalThis[${JSON.stringify(key)}] = 'COPIED_STUB_RAN'; export const value = 'FROZEN_SYNTHETIC_VALUE'\n`
    )
    const graph = await freeze(f)
    try {
      expect(globalThis[key]).toBeUndefined()
      await writeFile(
        helper,
        'throw new Error("MUTATED_ORIGINAL_MUST_NOT_RUN")\n'
      )
      const copied = await import(
        pathToFileURL(
          path.join(graph.root, 'tests/claude100/reference-port/controller.mjs')
        ).href
      )
      expect(copied.captured).toBe('FROZEN_SYNTHETIC_VALUE')
      expect(globalThis[key]).toBe('COPIED_STUB_RAN')
      const originalPin = graph.pins.find((pin) => pin.filename === helper)
      await expect(originalPin.verify()).rejects.toMatchObject({
        code: 'DRIFT_RUNTIME'
      })
      await close(graph)
      await graph.dispose()
      expect(await heldIn(f.base)).toEqual([])
    } finally {
      delete globalThis[key]
    }
  })
  it.each([0o755, 0o750, 0o770])(
    'denies evidence-root mode %s and closes its handles',
    async (mode) => {
      const f = await fixture()
      await chmod(f.evidence, mode)
      await expect(f.freeze(f.evidence)).rejects.toMatchObject({
        code: 'INPUT_INVALID'
      })
      expect(await readdir(f.evidence)).toEqual([])
      expect(await heldIn(f.base)).toEqual([])
    }
  )
  it('denies symlink evidence components and traversal before creating a snapshot', async () => {
    const f = await fixture(),
      alias = path.join(f.base, 'alias')
    await symlink(f.evidence, alias)
    for (const name of [
      alias,
      f.evidence + '/../evidence',
      f.evidence + '/./',
      'relative',
      null
    ])
      await expect(f.freeze(name)).rejects.toMatchObject({
        code: 'INPUT_INVALID'
      })
    expect(await readdir(f.evidence)).toEqual([])
    expect(await heldIn(f.base)).toEqual([])
  })
  it('rejects source leaf and intermediate symlinks without importing them or leaking FDs', async () => {
    const f = await fixture(),
      filename = path.join(f.checkout, 'scripts/claude100-reference-port.mjs')
    await rename(filename, filename + '.old')
    await symlink(filename + '.old', filename)
    await expect(f.freeze(f.evidence)).rejects.toBeInstanceOf(Error)
    expect(await readdir(f.evidence)).toEqual([])
    expect(await heldIn(f.base)).toEqual([])
    await unlink(filename)
    await rename(filename + '.old', filename)
    const parent = path.join(f.checkout, 'tests/claude100/qualification')
    await rename(parent, parent + '-old')
    await symlink(parent + '-old', parent)
    await expect(f.freeze(f.evidence)).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    })
    expect(await heldIn(f.base)).toEqual([])
  })
  it('closes partial originals/copies and removes only its partial exclusive snapshot on missing source', async () => {
    const f = await fixture()
    await unlink(
      path.join(f.checkout, 'tests/claude100/reference-port/controller.mjs')
    )
    let error
    try {
      await f.freeze(f.evidence)
    } catch (cause) {
      error = cause
    }
    expect(error).toBeInstanceOf(Error)
    expect(error.cause.code).toBe('ENOENT')
    expect(await readdir(f.evidence)).toEqual([])
    expect(await heldIn(f.base)).toEqual([])
  })
  it('rejects a source directory/special type and approved-SPEC mutation', async () => {
    const f = await fixture(),
      filename = path.join(f.checkout, 'scripts/claude100-reference-port.mjs')
    await unlink(filename)
    await mkdir(filename, { mode: 0o700 })
    await expect(f.freeze(f.evidence)).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    })
    expect(await heldIn(f.base)).toEqual([])
    const f2 = await fixture()
    await writeFile(
      path.join(f2.checkout, 'docs/02_spec/0235_claude_native_port_probe.md'),
      'SYNTHETIC_MUTANT'
    )
    await expect(f2.freeze(f2.evidence)).rejects.toMatchObject({
      code: 'IDENTITY_MISMATCH'
    })
    expect(await readdir(f2.evidence)).toEqual([])
    expect(await heldIn(f2.base)).toEqual([])
  })
  it('enforces aggregate1MiB exactly and rejects +1 with no leaked descriptors', async () => {
    const f = await fixture()
    let total = 0
    for (const name of SOURCE_PATHS)
      total += (await lstat(path.join(f.checkout, name))).size
    const target = path.join(
      f.checkout,
      'tests/claude100/reference-port/protocol.mjs'
    )
    const old = await readFile(target)
    await writeFile(
      target,
      Buffer.concat([old, Buffer.alloc(1024 * 1024 - total, 32)])
    )
    const graph = await freeze(f)
    expect(graph.totalBytes).toBe(1024 * 1024)
    await close(graph)
    await graph.dispose()
    await writeFile(
      target,
      Buffer.concat([await readFile(target), Buffer.from('x')])
    )
    await expect(f.freeze(f.evidence)).rejects.toMatchObject({ code: 'CAP' })
    expect(await readdir(f.evidence)).toEqual([])
    expect(await heldIn(f.base)).toEqual([])
  })
  it('rejects an oversized single source without reading an unlimited file', async () => {
    const f = await fixture()
    await writeFile(
      path.join(f.checkout, 'scripts/claude100-reference-port.mjs'),
      Buffer.alloc(1024 * 1024 + 1)
    )
    await expect(f.freeze(f.evidence)).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    })
    expect(await heldIn(f.base)).toEqual([])
  })
})

describe('retained identity and conservative owned cleanup', () => {
  it.each(['original', 'snapshot'])(
    'detects %s content drift with DRIFT_RUNTIME',
    async (which) => {
      const f = await fixture(),
        graph = await freeze(f)
      const filename = path.join(
        which === 'original' ? f.checkout : graph.root,
        'tests/claude100/reference-port/protocol.mjs'
      )
      const pin = graph.pins.find((p) => p.filename === filename)
      const previous = await readFile(filename)
      await writeFile(filename, Buffer.alloc(previous.length, 120))
      await expect(pin.verify()).rejects.toMatchObject({
        code: 'DRIFT_RUNTIME'
      })
      await close(graph)
      if (which === 'snapshot')
        await expect(graph.dispose()).rejects.toMatchObject({ code: 'CLEANUP' })
      else await graph.dispose()
      expect(await heldIn(f.base)).toEqual([])
    }
  )
  it('detects original pathname rebinding even when bytes match and old FD remains valid', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    const filename = path.join(
        f.checkout,
        'tests/claude100/reference-port/protocol.mjs'
      ),
      bytes = await readFile(filename)
    const pin = graph.pins.find((p) => p.filename === filename)
    await rename(filename, path.join(f.base, 'original-detached'))
    await writeFile(filename, bytes, { mode: 0o600 })
    await expect(pin.verify()).rejects.toMatchObject({ code: 'DRIFT_RUNTIME' })
    await close(graph)
    await graph.dispose()
    expect(await readFile(filename)).toEqual(bytes)
    expect(await heldIn(f.base)).toEqual([])
  })
  it('refuses dispose before pins close, then allows idempotent verified cleanup', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    await expect(graph.dispose()).rejects.toMatchObject({ code: 'CLEANUP' })
    expect((await lstat(graph.root)).isDirectory()).toBe(true)
    await close(graph)
    await close(graph)
    await expect(graph.pins[0].verify()).rejects.toMatchObject({
      code: 'DRIFT_RUNTIME'
    })
    await graph.dispose()
    await graph.dispose()
    expect(await heldIn(f.base)).toEqual([])
  })
  it('refuses an unknown child before deleting any known file, closes directory FDs, and preserves foreign bytes', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    await close(graph)
    const foreign = path.join(graph.root, 'foreign-synthetic.txt')
    await writeFile(foreign, 'MUST_REMAIN', { mode: 0o600 })
    let failure
    try {
      await graph.dispose()
    } catch (cause) {
      failure = cause
    }
    expect(failure).toMatchObject({ code: 'CLEANUP' })
    expect(failure.cause).toBeInstanceOf(AggregateError)
    expect(failure.cause.errors.length).toBeGreaterThan(0)
    await expect(graph.dispose()).rejects.toBe(failure)
    expect(await readFile(foreign, 'utf8')).toBe('MUST_REMAIN')
    for (const name of SOURCE_PATHS)
      expect((await lstat(path.join(graph.root, name))).isFile()).toBe(true)
    expect(await heldIn(f.base)).toEqual([])
  })
  it('rejects replacement of an otherwise identical snapshot file without removing it', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    await close(graph)
    const filename = path.join(
        graph.root,
        'tests/claude100/reference-port/protocol.mjs'
      ),
      bytes = await readFile(filename)
    await rename(filename, path.join(f.base, 'snapshot-detached'))
    await writeFile(filename, bytes, { mode: 0o600 })
    await expect(graph.dispose()).rejects.toMatchObject({ code: 'CLEANUP' })
    expect(await readFile(filename)).toEqual(bytes)
    expect(await heldIn(f.base)).toEqual([])
  })
  it('rejects a replaced snapshot root and leaves its replacement untouched', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    await close(graph)
    await rename(graph.root, path.join(f.base, 'snapshot-detached'))
    await mkdir(graph.root, { mode: 0o700 })
    await writeFile(path.join(graph.root, 'foreign'), 'MUST_REMAIN')
    await expect(graph.dispose()).rejects.toMatchObject({ code: 'CLEANUP' })
    expect(await readFile(path.join(graph.root, 'foreign'), 'utf8')).toBe(
      'MUST_REMAIN'
    )
    expect(await heldIn(f.base)).toEqual([])
  })
  it('detects a snapshot path symlink and does not follow it during cleanup', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    const filename = path.join(
      graph.root,
      'tests/claude100/reference-port/protocol.mjs'
    )
    const pin = graph.pins.find((p) => p.filename === filename)
    const target = path.join(f.base, 'foreign')
    await writeFile(target, 'MUST_REMAIN')
    await rename(filename, path.join(f.base, 'snapshot-detached'))
    await symlink(target, filename)
    await expect(pin.verify()).rejects.toMatchObject({ code: 'DRIFT_RUNTIME' })
    await close(graph)
    await expect(graph.dispose()).rejects.toMatchObject({ code: 'CLEANUP' })
    expect(await readFile(target, 'utf8')).toBe('MUST_REMAIN')
    expect((await lstat(filename)).isSymbolicLink()).toBe(true)
    expect(await heldIn(f.base)).toEqual([])
  })
  it('retains source identity after ancestor pathname substitution', async () => {
    const f = await fixture(),
      graph = await freeze(f)
    const sourceParent = path.join(f.checkout, 'tests/claude100/reference-port')
    const pin = graph.pins.find(
      (p) => p.filename === path.join(sourceParent, 'protocol.mjs')
    )
    await rename(sourceParent, path.join(f.base, 'source-detached'))
    await mkdir(sourceParent, { mode: 0o700 })
    await expect(pin.verify()).rejects.toMatchObject({ code: 'DRIFT_RUNTIME' })
    await close(graph)
    await graph.dispose()
    expect(await heldIn(f.base)).toEqual([])
  })
})

it.each(['SIGINT', 'SIGTERM'])(
  'cancels partial bootstrap on actual %s and removes only its own snapshot',
  async (signal) => {
    const f = await fixture()
    const script = `
    import { watch } from 'node:fs';
    import { readdir, readlink } from 'node:fs/promises';
    import { pathToFileURL } from 'node:url';
    const [file, evidence, signal, checkout] = process.argv.slice(1);
    const { freezeHostGraph } = await import(pathToFileURL(file));
    const before = Object.fromEntries(['SIGINT','SIGTERM'].map(s => [s, process.listenerCount(s)]));
    let sent = false, actual = null, graph = null;
    const watcher = watch(evidence, (_type, name) => {
      if (!sent && String(name).startsWith('.native-port-bootstrap-')) {
        sent = true; process.kill(process.pid, signal);
      }
    });
    try { graph = await freezeHostGraph(evidence); }
    catch (error) {
      const seen = new Set(), chain = [];
      function collect(e) { if (!e || seen.has(e)) return; seen.add(e); chain.push({code:e.code ?? null,signal:e.signal ?? null}); collect(e.cause); for (const c of e.errors ?? []) collect(c); }
      collect(error); actual = {code:error.code,chain};
    } finally {
      watcher.close();
      if (graph) { await Promise.all(graph.pins.map(p => p.close())); await graph.dispose(); }
    }
    const leftovers = (await readdir(evidence)).filter(n => n.startsWith('.native-port-bootstrap-'));
    const openOwned = [];
    for (const fd of await readdir('/proc/self/fd')) {
      try { const p = await readlink('/proc/self/fd/'+fd); if (p.startsWith(checkout) || p.startsWith(evidence)) openOwned.push(p); } catch {}
    }
    const after = Object.fromEntries(['SIGINT','SIGTERM'].map(s => [s, process.listenerCount(s)]));
    console.log(JSON.stringify({sent,actual,leftovers,openOwned,before,after}));
  `
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        script,
        path.join(f.checkout, 'tests/claude100/reference-port/bootstrap.mjs'),
        f.evidence,
        signal,
        f.checkout
      ],
      {
        env: { PATH: '/usr/bin:/bin', HOME: f.base, LANG: 'C.UTF-8' },
        timeout: 4000
      }
    )
    const result = JSON.parse(stdout)
    expect(stderr).toBe('')
    expect(result.sent).toBe(true)
    expect(result.actual.code).toBe('SIGNAL')
    expect(result.actual.chain.some((e) => e.signal === signal)).toBe(true)
    expect(result.leftovers).toEqual([])
    expect(result.openOwned).toEqual([])
    expect(result.after).toEqual(result.before)
  }
)
