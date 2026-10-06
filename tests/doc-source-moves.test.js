import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, test } from 'vitest'

const repositoryRoot = process.cwd()
const checker = join(repositoryRoot, 'scripts/check-doc-links.mjs')
const fixtureRoots = []
const old = 'apps/worker/src/shift-assistant/domain.ts'
const destination = 'products/shift-assistant/src/domain.ts'
const move = { old, new: destination, movedBy: 'HISO-004' }

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture(markdown = `[source](../${old})\n`) {
  const root = mkdtempSync(join(tmpdir(), 'doc-source-moves-'))
  fixtureRoots.push(root)
  const write = (path, text = 'export const current = true\n') => {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }
  write('docs/frozen.md', markdown)
  write(destination)
  const frozenBytes = readFileSync(join(root, 'docs/frozen.md'))
  const run = (movedTargets = [move], extraPolicy = {}, roots = ['docs']) => {
    write(
      'policy.json',
      JSON.stringify({
        schemaVersion: 1,
        entries: [],
        movedTargets,
        ...extraPolicy
      })
    )
    const result = spawnSync(process.execPath, [checker, ...roots], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DOC_LINK_POLICY: join(root, 'policy.json') }
    })
    assert.deepEqual(readFileSync(join(root, 'docs/frozen.md')), frozenBytes)
    return {
      ...result,
      output: result.stdout.trim() ? JSON.parse(result.stdout) : undefined
    }
  }
  return { root, run, write }
}

test('policy registers exactly the 20 evidence moves and historical hashes', () => {
  const policy = JSON.parse(
    readFileSync(join(repositoryRoot, 'docs/doc-link-policy.json'), 'utf8')
  )
  const evidence = JSON.parse(
    readFileSync(
      join(
        repositoryRoot,
        'docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/source-moves.json'
      ),
      'utf8'
    )
  )
  assert.equal(policy.movedTargets.length, 20)
  assert.deepEqual(
    policy.movedTargets.map(({ old, new: target, sha256Before }) => ({
      old,
      new: target,
      sha256Before
    })),
    evidence.moves.map(({ old, new: target, sha256Before }) => ({
      old,
      new: target,
      sha256Before
    }))
  )
  assert.match(policy.movedTargetsProvenance, /historical.*not a claim/)
})

test('exact move resolves and reports the raw historical link without editing it', () => {
  const { run } = fixture()
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /DOC_LINKS_OK/)
  assert.deepEqual(result.output.broken, [])
  assert.deepEqual(result.output.historicalRemovedTargets, [])
  assert.deepEqual(result.output.staleMovedTargets, [])
  assert.deepEqual(result.output.missingMovedTargets, [])
  assert.deepEqual(result.output.resolvedMovedTargets, [
    {
      file: result.output.resolvedMovedTargets[0].file,
      target: `../${old}`,
      ...move
    }
  ])
})

test('historical hash is provenance even when current destination bytes differ', () => {
  const { run, write } = fixture()
  write(destination, 'export const editedLater = true\n')
  const result = run([{ ...move, sha256Before: 'a'.repeat(64) }])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.output.resolvedMovedTargets.length, 1)
})

test('line, fragments, encoded links, brackets and reference links retain contracts', () => {
  const targets = [
    `../${old}:12`,
    `../${old}#domain`,
    `../${old}:12#domain`,
    `../${old}#domain:12`,
    `../${old.replace('domain', '%64omain')}`
  ]
  const { run } = fixture(
    targets.map((target, i) => `[source${i}](${target})`).join('\n') +
      `\n[bracket](<../${old}:4>)\n[ref]: ../${old}:8\n`
  )
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    result.output.resolvedMovedTargets.map((entry) => entry.target),
    [...targets, `../${old}:4`, `../${old}:8`]
  )
  assert.ok(
    result.output.resolvedMovedTargets.every(
      (entry) => entry.new === destination
    )
  )
})

test('terminal line zero still names a missing file rather than a source location', () => {
  const { run } = fixture(`[zero](../${old}:0)\n`)
  const result = run()
  assert.equal(result.status, 1)
  assert.deepEqual(result.output.resolvedMovedTargets, [])
  assert.equal(result.output.broken[0].target, `../${old}:0`)
})

test('unregistered sibling and prefix targets fail despite a registered move', () => {
  const targets = [old.replace('domain.ts', 'unknown.ts'), `${old}/extra.ts`]
  const { run } = fixture(
    targets.map((target) => `[missing](../${target})`).join('\n')
  )
  const result = run()
  assert.equal(result.status, 1)
  assert.equal(result.output.broken.length, 2)
  assert.deepEqual(result.output.resolvedMovedTargets, [])
})

test('missing source has no exception without its exact registration', () => {
  const { run } = fixture()
  const result = run([])
  assert.equal(result.status, 1)
  assert.equal(result.output.broken.length, 1)
})

test('missing destination fails globally, including when no link cites the move', () => {
  const { root, run } = fixture('No source link.\n')
  rmSync(join(root, destination))
  const result = run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /MISSING_MOVED_TARGETS=1/)
  assert.deepEqual(result.output.missingMovedTargets, [
    { old, new: destination }
  ])
  assert.deepEqual(result.output.resolvedMovedTargets, [])
})

test('a referenced missing destination stays broken even if also listed as removed', () => {
  const { root, run } = fixture()
  rmSync(join(root, destination))
  const result = run([move], {
    removedTargets: [
      { file: 'docs/frozen.md', targets: [old], removedBy: 'PR-L02' }
    ]
  })
  assert.equal(result.status, 1)
  assert.equal(result.output.broken.length, 1)
  assert.deepEqual(result.output.historicalRemovedTargets, [])
})

test('a directory cannot stand in for the moved destination file', () => {
  const { root, run } = fixture()
  rmSync(join(root, destination))
  mkdirSync(join(root, destination))
  const result = run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /MISSING_MOVED_TARGETS=1/)
})

test('stale origin fails even when its link and the destination both exist', () => {
  const { run, write } = fixture()
  write(old)
  const result = run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /STALE_MOVED_TARGETS=1/)
  assert.deepEqual(result.output.staleMovedTargets, [{ old, new: destination }])
  assert.deepEqual(result.output.resolvedMovedTargets, [])
})

test('an uncited stale origin and a dangling origin symlink cannot evade validation', () => {
  const { root, run, write } = fixture('No links.\n')
  write(old)
  let result = run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /STALE_MOVED_TARGETS=1/)
  rmSync(join(root, old))
  symlinkSync('missing.ts', join(root, old))
  result = run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /STALE_MOVED_TARGETS=1/)
})

test.each([
  '',
  '../escape.ts',
  '/outside.ts',
  './source.ts',
  'a/../source.ts',
  'a/./source.ts',
  'a//source.ts',
  'a/',
  'C:/source.ts',
  'a\\source.ts',
  '%2e%2e/source.ts',
  'source.ts:3',
  'source.ts#frag',
  'source.ts?query',
  ' source.ts',
  'source.ts ',
  'a\u0000b.ts',
  'a\nb.ts',
  null,
  42
])('rejects unsafe mapping paths in either direction: %j', (path) => {
  const { run } = fixture()
  for (const field of ['old', 'new']) {
    const result = run([{ ...move, [field]: path }])
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /DOC_LINK_POLICY_INVALID=.*unsafe moved target path/
    )
  }
})

test.each(
  [null, {}, 'invalid', [null], [[]], [{}]].map((movedTargets) => ({
    movedTargets
  }))
)('rejects malformed movedTargets: %j', ({ movedTargets }) => {
  const { run } = fixture()
  const result = run(movedTargets)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DOC_LINK_POLICY_INVALID/)
})

test.each([undefined, null, '', ' ', 'HISO', ' HISO-004', 'HISO-004\n', 42])(
  'requires a meaningful registered moving task: %j',
  (movedBy) => {
    const { run } = fixture()
    const result = run([{ ...move, movedBy }])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /DOC_LINK_POLICY_INVALID=.*task identifier/)
  }
)

test.each(
  [
    [move, move],
    [move, { ...move, new: 'products/other.ts' }],
    [move, { ...move, old: 'apps/other.ts' }],
    [{ ...move, new: old }],
    [move, { old: destination, new: 'products/later.ts', movedBy: 'HISO-007' }]
  ].map((moves) => ({ moves }))
)('rejects duplicate, identity and chained mappings: %j', ({ moves }) => {
  const { run } = fixture()
  const result = run(moves)
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /DOC_LINK_POLICY_INVALID=.*(duplicate|identity|chained)/
  )
})

test('rejects an invalid provenance hash without using hashes as current checksums', () => {
  const { run } = fixture()
  const result = run([{ ...move, sha256Before: 'not-a-sha256' }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DOC_LINK_POLICY_INVALID=.*sha256Before/)
})

test('rejects symlink escapes through ancestors of either mapping path', () => {
  const { root, run } = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'doc-source-moves-outside-'))
  fixtureRoots.push(outside)
  symlinkSync(outside, join(root, 'escape'))
  for (const field of ['old', 'new']) {
    const result = run([{ ...move, [field]: 'escape/missing.ts' }])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /DOC_LINK_POLICY_INVALID=.*escapes repository/)
  }
})

test('masking still ignores example moves and exposes real broken links', () => {
  const { run } = fixture(
    `\`[inline](../${old})\`\n\`\`\`md\n[fenced](../${old})\n\`\`\`\n` +
      '[broken](../missing.ts:2)\n'
  )
  const result = run()
  assert.equal(result.status, 1)
  assert.deepEqual(result.output.resolvedMovedTargets, [])
  assert.equal(result.output.broken[0].target, '../missing.ts:2')
})

test('absolute links remain nonportable and are never resolved through the move map', () => {
  const { run } = fixture(`[absolute](/${old}:4)\n`)
  const result = run()
  assert.equal(result.status, 1)
  assert.deepEqual(result.output.resolvedMovedTargets, [])
  assert.equal(result.output.unallowlistedNonPortableAbsolute.length, 1)
})

test('removedTargets keeps its exact document scope, task and stale semantics', () => {
  const { run, write } = fixture(
    '[removed](../gone/legacy.ts:3)\n[unregistered](../gone/other.ts)\n'
  )
  const removedTargets = [
    { file: 'docs/frozen.md', targets: ['gone/legacy.ts'], removedBy: 'PR-L02' }
  ]
  let result = run([], { removedTargets })
  assert.equal(result.status, 1)
  assert.equal(result.output.historicalRemovedTargets[0].removedBy, 'PR-L02')
  assert.equal(result.output.broken[0].target, '../gone/other.ts')
  write('gone/legacy.ts')
  result = run([], { removedTargets })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /STALE_REMOVED_TARGETS=1/)
  assert.equal(result.output.staleRemovedTargets.length, 1)
  result = run([], {
    removedTargets: [{ ...removedTargets[0], file: 'docs/other.md' }]
  })
  assert.equal(result.status, 1)
  assert.deepEqual(result.output.historicalRemovedTargets, [])
})
