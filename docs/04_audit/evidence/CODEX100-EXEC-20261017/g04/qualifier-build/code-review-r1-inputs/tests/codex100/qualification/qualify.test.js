// @vitest-environment node
import { cp, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { qualifyCodex as qualify } from '../../claude100/qualification/qualify.mjs'
import { canonicalJson } from '../../support/governed-test-kit/index.js'

const roots = []
const fixture = fileURLToPath(
  new URL('../../claude100/qualification/fixtures/wire-v1/', import.meta.url)
)
const cli = fileURLToPath(
  new URL('../../../scripts/codex100-qualify.mjs', import.meta.url)
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const digest = (data) => sha(canonicalJson(data))
const clone = (data) => JSON.parse(JSON.stringify(data))
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true })
})

async function setup() {
  const root = await mkdtemp(
    path.join(tmpdir(), 'claude100-synthetic-qualifier-')
  )
  roots.push(root)
  await cp(fixture, root, { recursive: true })
  const baseline = JSON.parse(
    await readFile(
      new URL('./catalog-baseline.v1.json', import.meta.url),
      'utf8'
    )
  )
  const catalog = {
    schema_version: 1,
    catalog_id: 'CODEX-CAP-v1',
    revision: 'synthetic-mechanism-only',
    program: 'CODEX100',
    reference: {
      repository: baseline.repository,
      commit: baseline.source_commit
    },
    family_count: baseline.families.length,
    functional_denominator: baseline.functional_minimum,
    mandatory_cvg_controls: baseline.control_minimum,
    families: baseline.families.map((id) => ({
      id,
      name: id,
      owner: 'synthetic',
      source: 'synthetic',
      reuse: []
    })),
    requirements: baseline.requirements.map((row) => ({
      ...row,
      mandatory: true,
      owner: 'synthetic',
      sources: [{ path: 'synthetic' }],
      status: 'NOT_RUN',
      receipt: null
    }))
  }
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify(catalog))

  const read = async (name) =>
    JSON.parse(await readFile(path.join(root, name), 'utf8'))
  const write = async (name, data) =>
    writeFile(path.join(root, name), JSON.stringify(data, null, 2) + '\n')
  const s = {
    root,
    read,
    write,
    manifest: await read('manifest.json'),
    rule: await read('rule.json'),
    captures: await read('capture-index.json'),
    authorities: await read('authority-index.json')
  }
  s.options = {
    evidenceRoot: root,
    manifest: 'manifest.json',
    catalog: 'catalog.json',
    rule: 'rule.json',
    captureIndex: 'capture-index.json',
    authorityIndex: 'authority-index.json',
    out: 'result'
  }

  s.manifest.requirementIds = [baseline.requirements[0].id]
  s.rule.requirementIds = [...s.manifest.requirementIds]
  const catalogSha = sha(await readFile(path.join(root, 'catalog.json')))
  s.manifest.catalogSha256 = catalogSha
  s.captures.catalogSha256 = catalogSha
  s.authorities.catalogSha256 = catalogSha
  // This is explicitly a fabricated operator/collector for mechanism tests.
  // Rebinding here never changes production evidence or grants real authority.
  s.seal = async () => {
    await write('rule.json', s.rule)
    const ruleSha256 = sha(await readFile(path.join(root, 'rule.json')))
    s.manifest.ruleSha256 = ruleSha256
    for (const entry of s.authorities.entries) entry.ruleSha256 = ruleSha256
    const entries = []
    for (const [position, side] of (s.manifest.reference === null
      ? ['cvg']
      : ['reference', 'cvg']
    ).entries()) {
      const current = s.manifest[side]
      for (const item of current.artifacts) {
        const bytes = await readFile(path.join(root, item.path))
        item.sha256 = sha(bytes)
        item.bytes = bytes.length
      }
      current.artifacts.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0
      )
      const captureId = s.manifest.captureAttestations[position]
      const receipt = {
        version: 1,
        captureId,
        collectorId: 'synthetic-test-collector',
        runId: s.manifest.runId,
        scenarioId: s.manifest.scenarioId,
        side,
        fixtureSha256: s.manifest.fixtureSha256,
        ruleSha256,
        ...clone(current)
      }
      const receiptPath = `${side}/receipt.json`
      await write(receiptPath, receipt)
      entries.push({
        captureId,
        collectorId: receipt.collectorId,
        runId: receipt.runId,
        scenarioId: receipt.scenarioId,
        side,
        identitySha256: digest(current.identity),
        artifactSetSha256: digest(current.artifacts),
        receiptPath,
        receiptSha256: sha(await readFile(path.join(root, receiptPath)))
      })
    }
    s.captures.entries = entries
    await s.flush()
  }
  s.flush = async () => {
    await write('manifest.json', s.manifest)
    await write('capture-index.json', s.captures)
    await write('authority-index.json', s.authorities)
  }
  s.document = async (side, data) => {
    const item = s.manifest[side].artifacts.find(
      (item) => item.role === s.rule.projection[`${side}Role`]
    )
    await write(item.path, data)
  }
  s.run = async (status = 'MATCH_REQUIRES_REVIEW') => {
    const result = await qualify(s.options)
    expect(result.status).toBe(status)
    expect(result.exitCode).toBe(status === 'MATCH_REQUIRES_REVIEW' ? 0 : 1)
    expect(result.reviewStatus).toBe('PENDING')
    expect(Object.keys(result).sort()).toEqual(
      [
        'version',
        'runId',
        'scenarioId',
        'requirementIds',
        'status',
        'exitCode',
        'inputs',
        'identities',
        'checks',
        'diffs',
        'evidence',
        'limitations',
        'reviewStatus'
      ].sort()
    )
    expect(result.limitations.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('PASS_CURRENT')
    return result
  }
  await s.seal()
  return s
}

describe('SPEC0231 CodeX qualifier across actual private files', () => {
  it('accepts authenticated synthetic equality without granting functional parity', async () => {
    const s = await setup()
    const report = await s.run()
    expect(report.checks.every((check) => check.status === 'PASS')).toBe(true)
    expect(report.requirementIds).toEqual(['CDX100-01-01'])
    expect(report.inputs.catalogSha256).toBe(s.manifest.catalogSha256)
  })
  it.each([
    '9007199254740992',
    '9007199254740993',
    '0.1000000000000000000001',
    '-0'
  ])('rejects lossy JSON input %s before projection/digest', async (token) => {
    const s = await setup()
    for (const side of ['reference', 'cvg'])
      await writeFile(
        path.join(s.root, side, 'stdout.json'),
        '{"unused":' + token + '}'
      )
    await s.seal()
    const report = await s.run('INVALID_INPUT')
    expect(report.checks.find((c) => c.id === 'COMPARISON').status).toBe(
      'NOT_RUN'
    )
  })
  it('preserves complete i64 bytes and distinguishes adjacent IDs above 2^53', async () => {
    const s = await setup()
    s.rule.projection.kind = 'EXACT_BYTES'
    await writeFile(
      path.join(s.root, 'reference/stdout.json'),
      '{"id":9007199254740992}\n'
    )
    await writeFile(
      path.join(s.root, 'cvg/stdout.json'),
      '{"id":9007199254740993}\n'
    )
    await s.seal()
    await s.run('MISMATCH')
    s.options.out = 'identical-result'
    await writeFile(
      path.join(s.root, 'reference/stdout.json'),
      '{"id":9007199254740993}\n'
    )
    await s.seal()
    await s.run()
  })
  it('rejects forged capture origins', async () => {
    const s = await setup()
    s.captures.entries[0].collectorId = 'forged'
    await s.flush()
    await s.run('UNTRUSTED_CAPTURE')
  })
  it('rejects expired authority', async () => {
    const s = await setup()
    s.authorities.entries[0].expiresAt = '2026-01-01T00:00:00.000Z'
    await s.flush()
    await s.run('BLOCKED_CVG_SPEC')
  })
  it('does not convert authenticated timeouts into equality', async () => {
    const s = await setup()
    s.manifest.cvg.execution.timeout = true
    s.manifest.cvg.execution.outcomeKind = 'INFRA_FAILURE'
    s.manifest.cvg.execution.exitCode = null
    await s.seal()
    await s.run('INFRA_FAILURE')
  })
  it('reports actual body divergence', async () => {
    const s = await setup()
    await s.document('cvg', { value: 'different' })
    await s.seal()
    await s.run('MISMATCH')
  })
  it('rejects artifact symlinks through the CodeX entrypoint', async () => {
    const s = await setup()
    await rm(path.join(s.root, 'cvg/stdout.json'))
    await symlink(
      '../reference/stdout.json',
      path.join(s.root, 'cvg/stdout.json')
    )
    await s.run('INVALID_INPUT')
  })
  it('publishes a CodeX CLI report using exactly seven options', async () => {
    const s = await setup()
    const args = Object.entries({
      manifest: '--manifest',
      catalog: '--catalog',
      rule: '--rule',
      captureIndex: '--capture-index',
      authorityIndex: '--authority-index',
      evidenceRoot: '--evidence-root',
      out: '--out'
    }).flatMap(([key, flag]) => [flag, s.options[key]])
    const child = spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8'
    })
    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout).status).toBe('MATCH_REQUIRES_REVIEW')
    const legacyCli = fileURLToPath(
      new URL('../../../scripts/claude100-qualify.mjs', import.meta.url)
    )
    args[args.length - 1] = 'legacy-reject'
    const legacy = spawnSync(process.execPath, [legacyCli, ...args], {
      encoding: 'utf8'
    })
    expect(legacy.status).toBe(1)
    expect(JSON.parse(legacy.stdout).status).toBe('INVALID_INPUT')
  })
  it.each([
    { args: [] },
    { args: ['--manifest'] },
    { args: ['--unknown', 'data'] },
    { args: ['positional'] },
    { args: ['--out', 'a', '--out', 'b'] }
  ])('returns usage exit 2 for malformed flags $args', ({ args }) => {
    const child = spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8'
    })
    expect(child.status).toBe(2)
    expect(child.stdout).toBe('')
  })
  it('reports an absent functional reference without inventing a capture', async () => {
    const s = await setup()
    s.manifest.reference = null
    s.manifest.captureAttestations = [s.manifest.captureAttestations[1]]
    await s.flush()
    await s.run('BLOCKED_REFERENCE')
  })
  it('does not let caller data select another executable profile', async () => {
    const s = await setup()
    await writeFile(
      path.join(s.root, 'cvg/stdout.json'),
      '{"id":9007199254740993}'
    )
    await s.seal()
    s.options.profile = 'LEGACY_FINITE'
    s.options.validator = () => {
      throw Error('untrusted callback invoked')
    }
    await s.run('INVALID_INPUT')
  })
  it('never overwrites a previously published report', async () => {
    const s = await setup()
    await s.run()
    const before = await readFile(path.join(s.root, 'result/report.json'))
    await s.run('INFRA_FAILURE')
    expect(await readFile(path.join(s.root, 'result/report.json'))).toEqual(
      before
    )
  })
  it('CLI imports do not execute a main', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'await import(' + JSON.stringify(cli) + ')'
      ],
      { encoding: 'utf8' }
    )
    expect(child.status).toBe(0)
    expect(child.stdout).toBe('')
    expect(child.stderr).toBe('')
  })
})
