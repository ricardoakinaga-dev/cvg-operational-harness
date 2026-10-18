// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import {
  createResolutionSession,
  revalidateResolutionSnapshot,
  RESOLUTION_LIMITS,
  RESOLUTION_PROFILE
} from '../scripts/boundary-semantic-resolution.mjs'

const BASE = '/mnt/ia/cvg-hiso005-build0237-runtime-20261018/helper'
const parents = [],
  sessions = []
const hash = (b) => createHash('sha256').update(b).digest('hex')
const write = (root, file, bytes) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    typeof bytes === 'object' && !Buffer.isBuffer(bytes)
      ? JSON.stringify(bytes)
      : bytes
  )
  return target
}
const symlink = (root, file, raw) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.symlinkSync(raw, target)
}
function fixture({
  scoped = false,
  workspace = false,
  mode = 'import',
  exports = './entry.js',
  main
} = {}) {
  fs.mkdirSync(BASE, { recursive: true })
  const parent = fs.mkdtempSync(path.join(BASE, 'fixture-'))
  parents.push(parent)
  const root = path.join(parent, 'raíz com espaço')
  const name = scoped ? '@random/demo' : 'demo',
    key = 'node_modules/' + name
  write(root, 'package.json', {
    name: 'fixture',
    type: mode === 'import' ? 'module' : 'commonjs',
    workspaces: ['packages/*']
  })
  write(root, 'src/caller.js', 'throw new Error("NEVER EXECUTE FIXTURE")\n')
  const owner = workspace ? 'packages/member' : key
  write(root, owner + '/package.json', {
    name,
    type: mode === 'import' ? 'module' : 'commonjs',
    ...(exports === undefined ? {} : { exports }),
    ...(main === undefined ? {} : { main })
  })
  write(root, owner + '/entry.js', 'throw new Error("NEVER EXECUTE TARGET")\n')
  if (workspace)
    symlink(root, key, scoped ? '../../packages/member' : '../packages/member')
  return { root, parent, name, key, owner, mode, from: 'src/caller.js' }
}
function session(f, limits, onProduct) {
  const s = createResolutionSession({ root: f.root, limits, onProduct })
  sessions.push(s)
  return s
}
const resolve = (s, f, specifier = f.name, mode = f.mode) =>
  s.resolve({ from: f.from, specifier, mode })
const fdCount = () => fs.readdirSync('/proc/self/fd').length
afterEach(() => {
  vi.restoreAllMocks()
  for (const s of sessions.splice(0)) s.close()
  for (const p of parents.splice(0))
    fs.rmSync(p, { recursive: true, force: true })
})

describe('0237 helper physical acquisition and deterministic premises', () => {
  it('returns exact bytes, bigint fstat, stable hashes and charges once across rereads', () => {
    const f = fixture(),
      s = session(f),
      first = s.read(f.from),
      before = s.usage
    expect(first.bytes.toString('utf8')).toBe(first.text)
    expect(first.sha256).toBe(hash(first.bytes))
    expect(typeof first.stat.ino).toBe('bigint')
    expect(s.read(f.from).sha256).toBe(first.sha256)
    expect(s.usage).toEqual(before)
    expect(s.usage.fileBytes).toBeGreaterThanOrEqual(first.bytes.length)
    expect(s.usage.totalBytes).toBeGreaterThan(first.bytes.length)
    expect(s.usage.files).toBeGreaterThan(0)
    expect(s.revalidate()).toBe(true)
    expect(s.snapshot().profile).toBe(RESOLUTION_PROFILE)
  })
  it('snapshots are byteidentical for immutable inputs independent of descriptor numbers', () => {
    const f = fixture({ workspace: true }),
      a = session(f)
    resolve(a, f)
    const noise = fs.openSync(
      f.root,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
    )
    try {
      const b = session(f)
      resolve(b, f)
      expect(b.snapshot()).toEqual(a.snapshot())
      const snap = a.snapshot()
      expect(snap.inputs.map((x) => x.kind)).toEqual(
        expect.arrayContaining([
          'file',
          'stat',
          'link',
          'inventory',
          'absence',
          'anchor'
        ])
      )
      expect(JSON.stringify(snap)).not.toMatch(/\/proc\/|"fd"|"pid"/)
      expect(
        revalidateResolutionSnapshot({
          root: f.root,
          snapshot: JSON.parse(JSON.stringify(snap))
        })
      ).toBe(true)
    } finally {
      fs.closeSync(noise)
    }
  })
  it.each([
    'file',
    'ancestor',
    'root',
    'absent',
    'manifest',
    'inventory',
    'link'
  ])('invalidates real %s mutation after successful acquisition', (kind) => {
    const f = fixture({ workspace: true }),
      s = session(f)
    resolve(s, f)
    s.probe('src/absent.js')
    const snap = s.snapshot()
    if (kind === 'file')
      write(f.root, f.owner + '/entry.js', 'export const changed = 1')
    if (kind === 'ancestor') {
      fs.renameSync(path.join(f.root, 'src'), path.join(f.root, 'src-old'))
      write(f.root, f.from, 'throw new Error("replacement")')
    }
    if (kind === 'root') {
      fs.renameSync(f.root, f.root + '-old')
      fs.mkdirSync(f.root)
    }
    if (kind === 'absent') write(f.root, 'src/absent.js', 'export {}')
    if (kind === 'manifest')
      write(f.root, f.owner + '/package.json', { name: 'changed' })
    if (kind === 'inventory')
      write(f.root, 'packages/new/package.json', { name: 'new' })
    if (kind === 'link') {
      fs.unlinkSync(path.join(f.root, f.key))
      symlink(f.root, f.key, '../packages/elsewhere')
    }
    expect(() => s.revalidate()).toThrow(/UNKNOWN_/)
    expect(() =>
      revalidateResolutionSnapshot({ root: f.root, snapshot: snap })
    ).toThrow(/UNKNOWN_/)
  })
  it('keeps proof inputs stable when only an unrelated parent sibling changes', () => {
    const f = fixture(),
      s = session(f)
    resolve(s, f)
    const snap = s.snapshot()
    write(f.parent, 'parent-change.txt', 'metadata premise mutation')
    expect(s.revalidate()).toBe(true)
    expect(revalidateResolutionSnapshot({ root: f.root, snapshot: snap })).toBe(
      true
    )
    expect(s.snapshot()).toEqual(snap)
  })
  it('invalidates actual parent replacement even if the root directory inode is moved intact', () => {
    const f = fixture(),
      s = session(f)
    resolve(s, f)
    const snap = s.snapshot(),
      oldParent = f.parent + '-moved'
    const originalInode = fs.statSync(f.root).ino
    fs.renameSync(f.parent, oldParent)
    parents.push(oldParent)
    fs.mkdirSync(f.parent)
    fs.renameSync(path.join(oldParent, path.basename(f.root)), f.root)
    expect(fs.statSync(f.root).ino).toBe(originalInode)
    expect(() => s.revalidate()).toThrow(/UNKNOWN_(?:ROOT|RESOLUTION)_MUTATION/)
    expect(() =>
      revalidateResolutionSnapshot({ root: f.root, snapshot: snap })
    ).toThrow(/UNKNOWN_(?:ROOT|RESOLUTION)_MUTATION/)
  })
  it('reads no content through a swapped leaf while its previously opened fd remains safe', () => {
    const f = fixture(),
      s = session(f),
      original = fs.readSync
    const external = write(f.parent, 'foreign.js', 'FOREIGN CONTENT')
    let swapped = false
    vi.spyOn(fs, 'readSync').mockImplementation((...args) => {
      const n = original(...args)
      if (!swapped) {
        swapped = true
        fs.unlinkSync(path.join(f.root, f.from))
        fs.symlinkSync(external, path.join(f.root, f.from))
      }
      return n
    })
    const before = fdCount()
    expect(() => s.read(f.from)).toThrow(/UNKNOWN_INPUT_MUTATION/)
    expect(swapped).toBe(true)
    expect(fdCount()).toBe(before)
    expect(s.snapshot().inputs.some((i) => i.kind === 'file')).toBe(false)
  })
  it('detects a real parent rename during a held-fd read, retaining all descriptor cleanup', () => {
    const f = fixture(),
      s = session(f),
      original = fs.readSync
    let swapped = false
    vi.spyOn(fs, 'readSync').mockImplementation((...args) => {
      const n = original(...args)
      if (!swapped) {
        swapped = true
        fs.renameSync(path.join(f.root, 'src'), path.join(f.root, 'old-src'))
        symlink(f.root, 'src', '../foreign')
      }
      return n
    })
    const before = fdCount()
    expect(() => s.read(f.from)).toThrow(/UNKNOWN_(INPUT|RESOLUTION)_MUTATION/)
    expect(fdCount()).toBe(before)
  })
  it('bounds growth and detects short reads during actual read mutation', () => {
    const f = fixture(),
      s = session(f),
      original = fs.readSync
    let changed = false
    vi.spyOn(fs, 'readSync').mockImplementation((...args) => {
      if (!changed) {
        changed = true
        fs.truncateSync(path.join(f.root, f.from), 0)
      }
      return original(...args)
    })
    expect(() => s.read(f.from)).toThrow(/UNKNOWN_INPUT_MUTATION/)
  })
  it('refuses invalid UTF8 file bytes without replacement decoding', () => {
    const f = fixture()
    write(f.root, 'bad.js', Buffer.from([0xc3, 0x28]))
    expect(() => session(f).read('bad.js')).toThrow('UNKNOWN_INPUT_ENCODING')
  })
  it('refuses a canonical-root alias and all ancestor links before content read', () => {
    const f = fixture(),
      alias = path.join(f.parent, 'alias')
    fs.symlinkSync(f.root, alias)
    expect(() => createResolutionSession({ root: alias })).toThrow(
      'UNKNOWN_ROOT_ALIAS'
    )
    symlink(f.root, 'alias-src', 'src')
    const s = session(f)
    expect(() => s.read('alias-src/caller.js')).toThrow(
      'UNKNOWN_ANCESTOR_SYMLINK'
    )
    expect(() => s.probe('alias-src/missing.js')).toThrow(
      'UNKNOWN_ANCESTOR_SYMLINK'
    )
  })
  it('never opens a foreign leaf symlink for content', () => {
    const f = fixture(),
      outside = write(f.parent, 'foreign.js', 'FOREIGN')
    symlink(f.root, 'foreign.js', outside)
    const s = session(f),
      original = fs.openSync,
      paths = []
    vi.spyOn(fs, 'openSync').mockImplementation((...args) => {
      paths.push(String(args[0]))
      return original(...args)
    })
    expect(() => s.read('foreign.js')).toThrow('UNKNOWN_SYMLINK')
    expect(paths.some((p) => p.endsWith('/foreign.js'))).toBe(false)
    expect(s.revalidate()).toBe(true)
  })
  it.each([
    '../outside',
    '/proc/self/fd/1',
    'src//caller.js',
    'src/../caller.js',
    'src\\caller.js',
    'src/\0x'
  ])('rejects untrusted read/probe path %j', (file) => {
    const s = session(fixture())
    expect(() => s.read(file)).toThrow('UNKNOWN_PATH')
    expect(() => s.probe(file)).toThrow('UNKNOWN_PATH')
  })
  it.each(['file', 'link', 'stat', 'inventory', 'absence'])(
    'rejects forged snapshot %s path before acquisition',
    (kind) => {
      const f = fixture(),
        s = session(f),
        snap = s.snapshot()
      snap.premises.push({ kind, file: '../foreign', sha256: '0'.repeat(64) })
      expect(() =>
        revalidateResolutionSnapshot({ root: f.root, snapshot: snap })
      ).toThrow('UNKNOWN_INVALID_SNAPSHOT')
    }
  )
  it('rejects forged hashes, profiles, missing premises and duplicate premises', () => {
    const f = fixture(),
      s = session(f)
    s.read(f.from)
    for (const mutate of [
      (x) => {
        x.inputs[0].sha256 = '0'.repeat(64)
      },
      (x) => {
        x.profile = 'other'
      },
      (x) => {
        x.premises = []
      },
      (x) => {
        x.premises.push(x.premises[0])
      }
    ]) {
      const snap = s.snapshot()
      mutate(snap)
      expect(() =>
        revalidateResolutionSnapshot({ root: f.root, snapshot: snap })
      ).toThrow(/UNKNOWN_/)
    }
  })
  it('rejects forged resolution paths and active code in untrusted snapshot data', () => {
    const f = fixture(),
      s = session(f)
    resolve(s, f)
    for (const mutate of [
      (x) => {
        x.resolutions[0].canonicalFile = '../foreign'
      },
      (x) => {
        x.resolutions[0].logicalURL = 'file:///proc/self/fd/99'
      },
      (x) => {
        x.resolutions[0].mode = 'custom'
      },
      (x) => {
        x.resolutions[0].specifier = 'fs/promises'
      },
      (x) => {
        x.resolutions[0].conditions = ['browser']
      }
    ]) {
      const snap = s.snapshot()
      mutate(snap)
      expect(() =>
        revalidateResolutionSnapshot({ root: f.root, snapshot: snap })
      ).toThrow('UNKNOWN_INVALID_SNAPSHOT')
    }
    let calls = 0
    const snap = s.snapshot()
    Object.defineProperty(snap, 'toJSON', {
      enumerable: true,
      value: () => {
        calls++
        return {}
      }
    })
    expect(() =>
      revalidateResolutionSnapshot({ root: f.root, snapshot: snap })
    ).toThrow('UNKNOWN_INVALID_SNAPSHOT')
    expect(calls).toBe(0)
  })
  it('closes every fd on repeated success, refusal, revalidation and factory failure', () => {
    const f = fixture(),
      before = fdCount()
    for (let i = 0; i < 20; i++) {
      const s = createResolutionSession({ root: f.root })
      try {
        resolve(s, f)
        expect(() => s.read('missing.js')).toThrow(/UNKNOWN_/)
        expect(s.revalidate()).toBe(true)
      } finally {
        s.close()
        s.close()
      }
      expect(() =>
        createResolutionSession({
          root: f.root,
          limits: { maxOpenDescriptors: 0 }
        })
      ).toThrow('maxOpenDescriptors')
    }
    expect(fdCount()).toBe(before)
  })
  it.each(['EMFILE', 'EACCES'])(
    'fails closed on injected OS %s without descriptor leaks',
    (code) => {
      const f = fixture(),
        before = fdCount(),
        s = session(f),
        original = fs.openSync
      vi.spyOn(fs, 'openSync').mockImplementation((file, ...args) => {
        if (String(file).endsWith('/caller.js'))
          throw Object.assign(Error('private OS path'), { code })
        return original(file, ...args)
      })
      expect(() => s.read(f.from)).toThrow(
        'UNKNOWN_ACQUISITION_' + code + ':src/caller.js'
      )
      s.close()
      expect(fdCount()).toBe(before)
    }
  )
  it('fails closed when own procfs is unavailable during root acquisition', () => {
    const f = fixture(),
      original = fs.statSync,
      before = fdCount()
    vi.spyOn(fs, 'statSync').mockImplementation((file, ...args) => {
      if (String(file).startsWith('/proc/self/fd/'))
        throw Object.assign(Error('sensitive proc path'), { code: 'ENOENT' })
      return original(file, ...args)
    })
    expect(() => createResolutionSession({ root: f.root })).toThrow(
      'UNKNOWN_ACQUISITION_ENOENT'
    )
    expect(fdCount()).toBe(before)
  })
  it('refuses actual permission-denied content and restores only its fixture mode', () => {
    const f = fixture(),
      s = session(f),
      file = path.join(f.root, f.from),
      before = fdCount()
    fs.chmodSync(file, 0)
    try {
      expect(() => s.read(f.from)).toThrow('UNKNOWN_ACQUISITION_EACCES')
      expect(fdCount()).toBe(before)
    } finally {
      fs.chmodSync(file, 0o600)
    }
  })
})

describe('0237 helper workspace/owner/exports/URL without target evaluation', () => {
  it.each([false, true])(
    'resolves relative and absolute direct workspace links scoped=%s with URL roundtrip',
    (scoped) => {
      const f = fixture({ scoped, workspace: true })
      for (const raw of [
        scoped ? '../../packages/member' : '../packages/member',
        f.root + '/packages/member'
      ]) {
        fs.unlinkSync(path.join(f.root, f.key))
        symlink(f.root, f.key, raw)
        const s = session(f),
          result = resolve(s, f)
        expect(result.file).toBe('packages/member/entry.js')
        expect(result.owner).toMatchObject({
          key: f.key,
          manifest: 'packages/member/package.json',
          workspace: true
        })
        expect(result.trace.logicalURL).toBe(
          pathToFileURL(path.join(f.root, f.key, 'entry.js')).href
        )
        expect(result.trace.canonicalURL).toBe(
          pathToFileURL(path.join(f.root, result.file)).href
        )
        expect(s.revalidate()).toBe(true)
        s.close()
      }
    }
  )
  it.each([
    '../missing/../packages/member',
    '../packages/other/../member',
    '../packages//member',
    '../packages/member/',
    '../outside',
    '../chain',
    '../packages/alias'
  ])(
    'refuses nonexact workspace link %j without content substitution',
    (raw) => {
      const f = fixture({ workspace: true })
      symlink(f.root, 'chain', 'packages/member')
      symlink(f.root, 'packages/alias', 'member')
      fs.unlinkSync(path.join(f.root, f.key))
      symlink(f.root, f.key, raw)
      const s = session(f)
      expect(() => resolve(s, f)).toThrow(/UNKNOWN_/)
      expect(
        s
          .snapshot()
          .inputs.some((x) => x.kind === 'file' && x.file.endsWith('entry.js'))
      ).toBe(false)
    }
  )
  it('refuses invalid UTF8 link text exactly', () => {
    const f = fixture({ workspace: true })
    fs.unlinkSync(path.join(f.root, f.key))
    fs.symlinkSync(Buffer.from([0xff, 0xfe]), path.join(f.root, f.key))
    expect(() => resolve(session(f), f)).toThrow('UNKNOWN_METADATA_ENCODING')
  })
  it('refuses invalid UTF8 directory entry bytes without acquiring an approximate workspace', () => {
    const f = fixture({ workspace: true })
    const raw = Buffer.concat([
      Buffer.from(f.root + '/packages/'),
      Buffer.from([0xff])
    ])
    fs.mkdirSync(raw)
    expect(() => resolve(session(f), f)).toThrow('UNKNOWN_METADATA_ENCODING')
  })
  it.each(['cycle', 'foreign', 'nested'])(
    'refuses physical %s links without content acquisition',
    (kind) => {
      const f = fixture({ workspace: true })
      fs.unlinkSync(path.join(f.root, f.key))
      if (kind === 'cycle') {
        symlink(f.root, f.key, '../loop')
        symlink(f.root, 'loop', f.key)
      }
      if (kind === 'foreign')
        symlink(f.root, f.key, path.join(f.parent, 'foreign'))
      if (kind === 'nested') {
        symlink(f.root, f.key, '../packages/member')
        symlink(f.root, 'src/node_modules/demo', '../../packages/member')
      }
      const s = session(f)
      expect(() => resolve(s, f)).toThrow(/UNKNOWN_/)
      expect(
        s
          .snapshot()
          .inputs.some((x) => x.kind === 'file' && x.file.endsWith('/entry.js'))
      ).toBe(false)
    }
  )
  it.each([
    'missing',
    'duplicate',
    'additional-pattern',
    'bad-entry',
    'symlink-workspace',
    'name-mismatch'
  ])('refuses workspace registry %s', (kind) => {
    const f = fixture({ workspace: true })
    if (kind === 'missing') write(f.root, 'package.json', { workspaces: [] })
    if (kind === 'duplicate')
      write(f.root, 'packages/duplicate/package.json', { name: f.name })
    if (kind === 'additional-pattern')
      write(f.root, 'package.json', { workspaces: ['packages/**'] })
    if (kind === 'bad-entry')
      fs.mkdirSync(path.join(f.root, 'packages/no-manifest'))
    if (kind === 'symlink-workspace')
      symlink(f.root, 'packages/alias', 'member')
    if (kind === 'name-mismatch')
      write(f.root, 'packages/member/package.json', {
        name: 'other',
        exports: './entry.js'
      })
    expect(() => resolve(session(f), f)).toThrow(/UNKNOWN_WORKSPACE_CONFIG/)
  })
  it.each(['direct', 'intermediate', 'ancestor', 'conditional'])(
    'records known product before cap/refusal via %s without reading product content',
    (kind) => {
      const f = fixture({
        workspace: kind !== 'conditional',
        exports:
          kind === 'conditional'
            ? {
                import: '../../products/shift/index.mjs',
                default: './entry.js'
              }
            : './entry.js'
      })
      write(
        f.root,
        'products/shift/index.mjs',
        'throw new Error("PRODUCT NEVER EXECUTED")'
      )
      if (kind !== 'conditional') {
        fs.unlinkSync(path.join(f.root, f.key))
        if (kind === 'direct') symlink(f.root, f.key, '../products/shift')
        if (kind === 'intermediate') {
          symlink(f.root, f.key, '../intermediate')
          symlink(f.root, 'intermediate', 'products/shift')
        }
        if (kind === 'ancestor') {
          symlink(f.root, f.key, '../middle/shift')
          symlink(f.root, 'middle', 'products')
        }
      }
      const products = [],
        s = session(f, { maxWorkspaces: 0 }, (file, from) =>
          products.push({ file, from })
        )
      expect(() => resolve(s, f)).toThrow(/UNKNOWN_/)
      expect(products.some((x) => x.file.startsWith('products/shift'))).toBe(
        true
      )
      expect(
        s
          .snapshot()
          .inputs.filter((x) => x.kind === 'file')
          .some((x) => x.file.startsWith('products/'))
      ).toBe(false)
    }
  )
  it.each(['maxWorkspaces', 'maxLinks', 'maxLinkBytes'])(
    'preserves selected workspace conditional product before reduced %s cap',
    (cap) => {
      const f = fixture({
        workspace: true,
        exports: { node: '../../products/shift/index.mjs' }
      })
      write(
        f.root,
        'products/shift/index.mjs',
        'throw new Error("NEVER EXECUTE PRODUCT")'
      )
      const products = [],
        s = session(f, { [cap]: 0 }, (file) => products.push(file))
      expect(() => resolve(s, f)).toThrow(/UNKNOWN_/)
      expect(products).toContain('products/shift/index.mjs')
      expect(
        s
          .snapshot()
          .inputs.filter((x) => x.kind === 'file')
          .some((x) => x.file.startsWith('products/'))
      ).toBe(false)
    }
  )
  it('detects physical mutation during streamed inventory and closes its directory handle', () => {
    const f = fixture({ workspace: true }),
      original = fs.opendirSync,
      before = fdCount()
    let changed = false
    vi.spyOn(fs, 'opendirSync').mockImplementation((...args) => {
      const directory = original(...args),
        read = directory.readSync.bind(directory)
      vi.spyOn(directory, 'readSync').mockImplementation(() => {
        const entry = read()
        if (!changed) {
          changed = true
          write(f.root, 'packages/new/package.json', { name: 'new' })
        }
        return entry
      })
      return directory
    })
    const s = session(f)
    expect(() => resolve(s, f)).toThrow(/UNKNOWN_(INPUT|RESOLUTION)_MUTATION/)
    expect(changed).toBe(true)
    s.close()
    expect(fdCount()).toBe(before)
  })
  it.each(['import', 'require'])(
    'exact builtin guard precedes importer, scope, owner and link metadata in %s mode',
    (mode) => {
      const f = fixture(),
        s = session(f),
        before = s.snapshot()
      for (const specifier of [
        'module',
        'fs',
        'fs/promises',
        'node:fs',
        'node:test'
      ])
        expect(() =>
          s.resolve({ from: 'does-not-exist', specifier, mode })
        ).toThrow('UNKNOWN_NATIVE_BUILTIN')
      expect(s.snapshot()).toEqual(before)
    }
  )
  it.each(['test', 'fs-promises'])(
    'ordinary name %s is resolved by ordinary rules',
    (name) => {
      const f = fixture()
      fs.renameSync(
        path.join(f.root, f.key),
        path.join(f.root, 'node_modules', name)
      )
      write(f.root, 'node_modules/' + name + '/package.json', {
        name,
        type: 'module',
        exports: './entry.js'
      })
      expect(resolve(session(f), f, name).file).toBe(
        'node_modules/' + name + '/entry.js'
      )
    }
  )
  it.each(['import', 'require'])(
    'refuses self reference before substituting external owner in %s mode',
    (mode) => {
      const f = fixture({ mode })
      write(f.root, 'src/package.json', { name: f.name, exports: './local.js' })
      expect(() => resolve(session(f), f)).toThrow(
        'UNKNOWN_PACKAGE_SELF_REFERENCE'
      )
    }
  )
  it.each(['missing-manifest', 'invalid-manifest', 'mismatched-name'])(
    'first present owner %s is decisive, never skips to outer convenient owner',
    (kind) => {
      const f = fixture(),
        key = 'src/node_modules/demo'
      fs.mkdirSync(path.join(f.root, key), { recursive: true })
      if (kind === 'invalid-manifest')
        write(f.root, key + '/package.json', '{invalid')
      if (kind === 'mismatched-name')
        write(f.root, key + '/package.json', {
          name: 'wrong',
          type: 'module',
          exports: './entry.js'
        })
      expect(() => resolve(session(f), f)).toThrow(/UNKNOWN_/)
    }
  )
  it('CJS rejects sibling files before legacy directory but honors directory exports first', () => {
    const f = fixture({ mode: 'require' })
    write(f.root, 'node_modules/demo.js', 'throw new Error("DO NOT EXECUTE")')
    expect(resolve(session(f), f).file).toBe(f.key + '/entry.js')
    write(f.root, f.key + '/package.json', { name: f.name, main: './entry.js' })
    expect(() => resolve(session(f), f)).toThrow('UNKNOWN_CJS_FILE_PACKAGE')
  })
  it.each([
    [
      { default: './early.js', import: './later.js' },
      'import',
      'early.js',
      ['default']
    ],
    [
      { browser: './inactive.js', node: './node.js', default: './late.js' },
      'import',
      'node.js',
      ['node']
    ],
    [
      { import: './esm.js', require: './cjs.js' },
      'require',
      'cjs.js',
      ['require']
    ],
    [
      { import: { browser: './inactive.js' }, default: './fallback.js' },
      'import',
      'fallback.js',
      ['default']
    ],
    [
      { 'module-sync': './sync.js', default: './late.js' },
      'require',
      'sync.js',
      ['module-sync']
    ],
    [
      { 'node-addons': './addons.js', default: './late.js' },
      'import',
      'addons.js',
      ['node-addons']
    ]
  ])(
    'selects finite ordered branches %j under %s',
    (exports, mode, expected, branch) => {
      const f = fixture({ exports, mode })
      for (const file of [
        'early.js',
        'later.js',
        'inactive.js',
        'node.js',
        'late.js',
        'esm.js',
        'cjs.js',
        'fallback.js',
        'sync.js',
        'addons.js'
      ])
        write(f.root, f.key + '/' + file, 'throw new Error("DO NOT EXECUTE")')
      const s = session(f),
        result = resolve(s, f)
      expect(result.file).toBe(f.key + '/' + expected)
      expect(result.trace.branch).toEqual(branch)
      expect(s.revalidate()).toBe(true)
    }
  )
  it('exact nested subpath selects only its literal key', () => {
    const f = fixture({
      exports: { '.': './entry.js', './nested/tool': { import: './entry.js' } }
    })
    expect(resolve(session(f), f, 'demo/nested/tool').trace.branch).toEqual([
      './nested/tool',
      'import'
    ])
    expect(() => resolve(session(f), f, 'demo/nested/other')).toThrow(
      'UNKNOWN_UNRESOLVED_EXPORT'
    )
  })
  it.each([
    { import: null, default: './entry.js' },
    { import: ['./entry.js'], default: './entry.js' },
    { import: 42, default: './entry.js' },
    { '.': './entry.js', import: './entry.js' },
    { './*': './entry.js' },
    { 1: './entry.js', default: './entry.js' },
    { './x': { import: { browser: './entry.js' } } }
  ])(
    'refuses blocked/unmodelled exports %j instead of convenient fallback',
    (exports) => {
      const f = fixture({ exports })
      expect(() => resolve(session(f), f)).toThrow(/UNKNOWN_/)
    }
  )
  it.each([
    './sa\tfe.mjs',
    './safe.mjs\r',
    './safe.mjs\n',
    './entry.js ',
    './%65ntry.js',
    './a/../entry.js',
    './a//entry.js',
    './node_modules/x.js',
    './é.js',
    './entry.js?x',
    './entry.js#x',
    './entry.js/',
    './a\\entry.js'
  ])('never repairs target %j into a positive', (exports) => {
    const f = fixture({ exports })
    write(f.root, f.key + '/safe.mjs', 'throw new Error("DO NOT EXECUTE")')
    write(
      f.root,
      f.key + '/sa\tfe.mjs',
      'throw new Error("TAB TARGET DO NOT EXECUTE")'
    )
    expect(() => resolve(session(f), f)).toThrow(
      'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION'
    )
  })
  it.each([
    'demo//x',
    'demo/../x',
    'demo/%78',
    'demo/x?x',
    '#alias',
    'node:ordinary',
    'demo/x ',
    'demo\\x'
  ])('refuses unsupported bare specifier %j', (specifier) => {
    const f = fixture()
    expect(() => resolve(session(f), f, specifier)).toThrow(/UNKNOWN_/)
  })
  it.each(['import', 'require'])(
    'exports target is exact without extension or index fallback in %s',
    (mode) => {
      const f = fixture({ mode, exports: './entry' })
      expect(() => resolve(session(f), f)).toThrow(/UNKNOWN_/)
      write(f.root, f.key + '/entry', 'throw new Error("DO NOT EXECUTE")')
      expect(() => resolve(session(f), f)).toThrow(
        /UNKNOWN_(FORMAT|EXACT_EXPORTS_TARGET)/
      )
      write(f.root, f.key + '/package.json', {
        name: f.name,
        type: mode === 'import' ? 'module' : 'commonjs',
        exports: './entry.js'
      })
      expect(resolve(session(f), f).file).toBe(f.key + '/entry.js')
    }
  )
  it.each(['/outside/entry.js', 'file:///outside/entry.js'])(
    'refuses absolute or URL main %j without rewriting it',
    (main) => {
      const f = fixture()
      write(f.root, f.key + '/package.json', {
        name: f.name,
        type: 'module',
        main
      })
      expect(() => resolve(session(f), f)).toThrow(
        'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY'
      )
      write(f.root, f.key + '/package.json', {
        name: f.name,
        type: 'module',
        main,
        exports: './entry.js'
      })
      expect(resolve(session(f), f).file).toBe(f.key + '/entry.js')
    }
  )
  it('repaired conservative legacy explicit and CJS extension fallback retain negative alternatives', () => {
    const f = fixture({ mode: 'require' })
    write(f.root, f.key + '/package.json', { name: f.name, main: './entry' })
    expect(resolve(session(f), f).file).toBe(f.key + '/entry.js')
    write(f.root, f.key + '/entry.json', '{}')
    expect(() => resolve(session(f), f)).toThrow(
      'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION'
    )
  })
  it('relative exact JS positive and nonmodelled interop negative are paired', () => {
    const f = fixture(),
      s = session(f)
    write(f.root, 'src/target.mjs', 'throw new Error("DO NOT EXECUTE")')
    // Fresh session after fixture mutation is required.
    s.close()
    expect(resolve(session(f), f, './target.mjs').file).toBe('src/target.mjs')
    expect(() => resolve(session(f), f, './target.mjs', 'require')).toThrow(
      'UNKNOWN_MODULE_INTEROP'
    )
  })
})

describe('0237 deterministic cap boundaries', () => {
  it('counts the held session root descriptor during revalidation under a reduced fd cap', () => {
    const f = fixture({ workspace: true }),
      originalOpen = fs.openSync,
      originalClose = fs.closeSync
    const owned = new Set()
    let peak = 0
    vi.spyOn(fs, 'openSync').mockImplementation((...args) => {
      const fd = originalOpen(...args)
      owned.add(fd)
      peak = Math.max(peak, owned.size)
      return fd
    })
    vi.spyOn(fs, 'closeSync').mockImplementation((fd) => {
      owned.delete(fd)
      return originalClose(fd)
    })
    const s = session(f, { maxOpenDescriptors: 4 })
    resolve(s, f)
    expect(s.revalidate()).toBe(true)
    s.close()
    expect(peak).toBeLessThanOrEqual(4)
    expect(owned.size).toBe(0)
  })
  it('keeps the frozen exported cap shape and rejects any increase or profile override', () => {
    expect(RESOLUTION_LIMITS).toEqual({
      maxWorkspaces: 512,
      maxLinks: 512,
      maxLinkBytes: 4096,
      maxPathComponents: 64,
      maxOpenDescriptors: 72
    })
    const f = fixture()
    for (const [key, value] of Object.entries(RESOLUTION_LIMITS))
      expect(() => session(f, { [key]: value + 1 })).toThrow(
        'UNKNOWN_INVALID_LIMITS'
      )
    expect(() => session(f, { profile: 1 })).toThrow('UNKNOWN_INVALID_LIMITS')
  })
  it.each([
    'maxWorkspaces',
    'maxLinks',
    'maxLinkBytes',
    'maxPathComponents',
    'maxOpenDescriptors'
  ])('has physical positive and overflow controls for %s', (key) => {
    const f = fixture({ workspace: true }),
      s = session(f)
    resolve(s, f)
    const used = {
      maxWorkspaces: s.usage.workspaces,
      maxLinks: s.usage.links,
      maxLinkBytes: s.usage.linkBytes,
      maxPathComponents: s.usage.pathComponents,
      maxOpenDescriptors: s.usage.openDescriptors
    }[key]
    expect(used).toBeGreaterThan(0)
    expect(resolve(session(f, { [key]: used }), f).file).toBe(
      'packages/member/entry.js'
    )
    expect(() => resolve(session(f, { [key]: used - 1 }), f)).toThrow(
      'UNKNOWN_RESOLUTION_LIMIT:' + key
    )
  })
  it.each(['maxFileBytes', 'maxTotalBytes', 'maxFiles'])(
    'bounds actual acquisition using %s and closes on failure',
    (key) => {
      const f = fixture(),
        s = session(f)
      resolve(s, f)
      const used = {
        maxFileBytes: s.usage.fileBytes,
        maxTotalBytes: s.usage.totalBytes,
        maxFiles: s.usage.files
      }[key]
      expect(resolve(session(f, { [key]: used }), f).file).toBe(
        f.key + '/entry.js'
      )
      expect(() => resolve(session(f, { [key]: used - 1 }), f)).toThrow(
        'UNKNOWN_ANALYSIS_LIMIT:' + key
      )
    }
  )
})
