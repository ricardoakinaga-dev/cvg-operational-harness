// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createResolutionSession } from '../scripts/boundary-semantic-resolution.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

// SPEC0258: a true regular file found by a workspace glob (for example
// legacy/packages/README.md) is documentation, not a workspace.
const BASE = ownedRunParent('b6-0258-workspace')
const parents = [],
  sessions = []
const write = (root, file, bytes) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    typeof bytes === 'object' && !Buffer.isBuffer(bytes)
      ? JSON.stringify(bytes)
      : bytes
  )
}
const symlink = (root, file, raw) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.symlinkSync(raw, target)
}
function fixture() {
  const parent = fs.mkdtempSync(path.join(BASE, 'fixture-'))
  parents.push(parent)
  const root = path.join(parent, 'root')
  write(root, 'package.json', {
    name: 'fixture',
    type: 'module',
    workspaces: ['packages/*', 'legacy/packages/*']
  })
  write(root, 'src/caller.js', 'throw new Error("NEVER EXECUTE FIXTURE")\n')
  write(root, 'packages/member/package.json', {
    name: 'demo',
    type: 'module',
    exports: './entry.js'
  })
  write(root, 'packages/member/entry.js', 'throw new Error("NEVER")\n')
  symlink(root, 'node_modules/demo', '../packages/member')
  return { root, parent }
}
const session = (f, limits) => {
  const s = createResolutionSession({ root: f.root, limits })
  sessions.push(s)
  return s
}
const resolve = (s) =>
  s.resolve({ from: 'src/caller.js', specifier: 'demo', mode: 'import' })
const entryDigest = (s) =>
  s
    .snapshot()
    .inputs.find((x) => x.kind === 'file' && x.file.endsWith('/entry.js'))
    ?.sha256
afterEach(() => {
  for (const s of sessions.splice(0)) s.close()
  for (const p of parents.splice(0))
    fs.rmSync(p, { recursive: true, force: true })
})

describe('0258 regular files in workspace globs', () => {
  it('WM01 resolves the same package, target, digest and owner with or without regular files', () => {
    const f = fixture(),
      base = session(f),
      without = resolve(base),
      digest = entryDigest(base)
    write(f.root, 'legacy/packages/README.md', '# docs\n')
    write(f.root, 'packages/README.md', '# docs\n')
    const s = session(f),
      withReadme = resolve(s)
    expect(withReadme.file).toBe(without.file)
    expect(withReadme.owner).toEqual(without.owner)
    expect(withReadme.owner.workspace).toBe(true)
    expect(entryDigest(s)).toBe(digest)
    expect(s.revalidate()).toBe(true)
  })
  it('WM01 ignored files are not counted as workspaces', () => {
    const f = fixture()
    write(f.root, 'legacy/packages/README.md', '# docs\n')
    write(f.root, 'legacy/packages/NOTES.txt', 'x')
    const s = session(f)
    resolve(s)
    expect(s.usage.workspaces).toBe(1)
  })
  it('WM02 a regular file with an invalid package name is only a file and its content is never read', () => {
    const f = fixture()
    write(f.root, 'legacy/packages/Not A Package!.md', '{ "name": throw }')
    write(f.root, 'packages/.hidden', 'throw new Error("NEVER")')
    const s = session(f)
    expect(resolve(s).file).toBe('packages/member/entry.js')
    expect(
      s
        .snapshot()
        .inputs.some(
          (x) => x.kind === 'file' && /Not A Package|\.hidden/.test(x.file)
        )
    ).toBe(false)
  })
  it.each(['link-named-readme', 'link-to-directory', 'fifo', 'dangling-link'])(
    'WM03 %s is still refused without follow',
    (kind) => {
      const f = fixture()
      write(f.root, 'legacy/packages/real/package.json', { name: 'real' })
      if (kind === 'link-named-readme') {
        write(f.root, 'docs/README.md', '# docs')
        symlink(f.root, 'legacy/packages/README.md', '../../docs/README.md')
      }
      if (kind === 'link-to-directory')
        symlink(f.root, 'legacy/packages/alias', 'real')
      if (kind === 'fifo')
        execFileSync('mkfifo', [path.join(f.root, 'legacy/packages/pipe')])
      if (kind === 'dangling-link')
        symlink(f.root, 'legacy/packages/README.md', 'missing')
      expect(() => resolve(session(f))).toThrow(/UNKNOWN_WORKSPACE_CONFIG/)
    }
  )
  it.each(['no-manifest', 'invalid-name', 'duplicate-name', 'manifest-link'])(
    'WM04 directory %s is still refused even next to a regular file',
    (kind) => {
      const f = fixture()
      write(f.root, 'legacy/packages/README.md', '# docs\n')
      if (kind === 'no-manifest')
        fs.mkdirSync(path.join(f.root, 'legacy/packages/empty'))
      if (kind === 'invalid-name')
        write(f.root, 'legacy/packages/Bad Name/package.json', { name: 'bad' })
      if (kind === 'duplicate-name')
        write(f.root, 'legacy/packages/dup/package.json', { name: 'demo' })
      if (kind === 'manifest-link') {
        write(f.root, 'elsewhere.json', { name: 'x' })
        symlink(
          f.root,
          'legacy/packages/odd/package.json',
          '../../../elsewhere.json'
        )
      }
      expect(() => resolve(session(f))).toThrow(/UNKNOWN_/)
    }
  )
  it.each(['to-directory', 'to-link', 'content-same-name', 'removed'])(
    'WM05 revalidation rejects the ignored entry changing (%s)',
    (kind) => {
      const f = fixture()
      write(f.root, 'legacy/packages/README.md', '# docs\n')
      const s = session(f)
      resolve(s)
      const snap = s.snapshot()
      const file = path.join(f.root, 'legacy/packages/README.md')
      if (kind === 'to-directory') {
        fs.unlinkSync(file)
        fs.mkdirSync(file)
      }
      if (kind === 'to-link') {
        fs.unlinkSync(file)
        fs.symlinkSync('missing', file)
      }
      if (kind === 'content-same-name') {
        fs.unlinkSync(file)
        fs.writeFileSync(file, '# docs, rewritten\n')
      }
      if (kind === 'removed') fs.unlinkSync(file)
      expect(() => s.revalidate()).toThrow(/UNKNOWN_/)
      expect(
        snap.premises.some((p) => p.file === 'legacy/packages/README.md')
      ).toBe(true)
    }
  )
  it('WM05 a new regular file after acquisition invalidates the inventory', () => {
    const f = fixture()
    const s = session(f)
    resolve(s)
    write(f.root, 'legacy/packages/README.md', '# late\n')
    expect(() => s.revalidate()).toThrow(/UNKNOWN_/)
  })
  it('WM06 ignored files still pay the metadata budget and never become workspaces', () => {
    const f = fixture()
    for (let i = 0; i < 40; i++)
      write(f.root, `legacy/packages/doc-${i}.md`, 'x')
    const ok = session(f)
    resolve(ok)
    expect(ok.usage.workspaces).toBe(1)
    expect(ok.usage.metadataEntries).toBeGreaterThanOrEqual(40)
    expect(() => resolve(session(f, { maxFiles: 20 }))).toThrow(
      /UNKNOWN_ANALYSIS_LIMIT:maxFiles/
    )
  })
})
