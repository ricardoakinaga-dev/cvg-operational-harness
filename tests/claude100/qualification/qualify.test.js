// @vitest-environment node
import {
  cp,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  unlink,
  readdir
} from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { qualify } from './qualify.mjs'
import { canonicalJson } from '../../support/governed-test-kit/index.js'

const roots = []
const fixture = fileURLToPath(new URL('./fixtures/wire-v1/', import.meta.url))
const cli = fileURLToPath(
  new URL('../../../scripts/claude100-qualify.mjs', import.meta.url)
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
  return s
}

describe('SPEC0229 synthetic mechanism only, complete real file boundary', () => {
  it('applies the approved ID128 limit to normalization namespaces before document expansion', async () => {
    const s = await setup()
    s.rule.normalizationPolicy = [
      { field: 'eventId', mode: 'id', namespace: 'n'.repeat(40000) }
    ]
    const document = Array.from({ length: 20000 }, () => ({ eventId: 'a' }))
    await s.document('reference', document)
    await s.document('cvg', document)
    await s.seal()
    await s.run('INVALID_INPUT')
  })
  it('accepts a within-budget namespace at the approved128-character limit', async () => {
    const s = await setup()
    s.rule.normalizationPolicy = [
      { field: 'eventId', mode: 'id', namespace: 'n'.repeat(128) }
    ]
    const document = Array.from({ length: 20000 }, () => ({
      eventId: 'a',
      tenant: 'synthetic',
      payload: { eventId: 'protected' }
    }))
    await s.document('reference', document)
    await s.document('cvg', document)
    await s.seal()
    await s.run()
  }, 15000)
  it('preserves canonical numeric expansion in ordered parts below the descriptor cap', async () => {
    const s = await setup()
    const raw = `[${Array.from({ length: 200000 }, () => '1e20').join(',')}]`
    const expected = Buffer.from(
      `[${Array.from({ length: 200000 }, () => '100000000000000000000').join(',')}]`
    )
    expect(Buffer.byteLength(raw)).toBe(1000001)
    expect(expected.length).toBe(4400001)
    for (const side of ['reference', 'cvg'])
      await writeFile(path.join(s.root, `${side}/stdout.json`), raw)
    await s.seal()
    const report = await s.run()
    expect(report.evidence.normalized).toHaveLength(4)
    for (const side of ['reference', 'cvg']) {
      const descriptors = report.evidence.normalized.filter((item) =>
        path.basename(item.path).startsWith(`${side}.projection-`)
      )
      const chunks = []
      for (const item of descriptors) {
        expect(item.bytes).toBeLessThanOrEqual(4 * 1024 * 1024)
        const bytes = await readFile(path.join(s.root, item.path))
        expect(sha(bytes)).toBe(item.sha256)
        chunks.push(bytes)
      }
      expect(Buffer.concat(chunks).equals(expected)).toBe(true)
    }
  }, 15000)
  it.each(['UNKNOWN', 'DUPLICATE', 'MIXED_CLASS'])(
    'rejects altered requirement binding: %s',
    async (variant) => {
      const s = await setup()
      if (variant === 'UNKNOWN') s.rule.requirementIds = ['CC100-UNKNOWN']
      if (variant === 'DUPLICATE')
        s.rule.requirementIds.push(s.rule.requirementIds[0])
      if (variant === 'MIXED_CLASS') {
        const catalog = await s.read('catalog.json')
        s.rule.requirementIds.push(
          catalog.requirements.find(
            (req) => req.verification_class === 'CVG_CONTROL'
          ).id
        )
      }
      s.manifest.requirementIds = [...s.rule.requirementIds]
      await s.seal()
      await s.run('INVALID_INPUT')
    }
  )
  it.each(['COLLECTOR', 'ARTIFACT_SET', 'IDENTITY', 'RUN', 'SIDE'])(
    'rejects independently indexed capture metadata mismatch: %s',
    async (variant) => {
      const s = await setup()
      const entry = s.captures.entries[1]
      if (variant === 'COLLECTOR') entry.collectorId = 'other.collector'
      if (variant === 'ARTIFACT_SET') entry.artifactSetSha256 = 'a'.repeat(64)
      if (variant === 'IDENTITY') entry.identitySha256 = 'a'.repeat(64)
      if (variant === 'RUN') entry.runId = 'other.run'
      if (variant === 'SIDE') {
        entry.side = 'reference'
        entry.runId = 'other.run'
      }
      await s.flush()
      await s.run('UNTRUSTED_CAPTURE')
    }
  )
  it.each(['RULE', 'DECISION_REF'])(
    'rejects authority for another binding: %s',
    async (variant) => {
      const s = await setup()
      if (variant === 'RULE')
        s.authorities.entries[0].ruleSha256 = 'a'.repeat(64)
      else s.authorities.entries[0].decisionId = 'other.decision'
      await s.flush()
      await s.run('BLOCKED_CVG_SPEC')
    }
  )
  it.each(['synthetic-spec.json', 'synthetic-decision.json'])(
    'does not trust an authority artifact whose bytes drifted: %s',
    async (name) => {
      const s = await setup()
      await writeFile(path.join(s.root, name), 'SYNTHETIC_CHANGED')
      await s.run('INVALID_INPUT')
    }
  )
  it.each([
    ['manifest.json', 256 * 1024],
    ['catalog.json', 1024 * 1024],
    ['rule.json', 128 * 1024],
    ['capture-index.json', 1024 * 1024],
    ['authority-index.json', 1024 * 1024],
    ['cvg/receipt.json', 1024 * 1024],
    ['cvg/stdout.json', 4 * 1024 * 1024]
  ])(
    'refuses one byte above file cap before JSON parse: %s',
    async (name, limit) => {
      const s = await setup()
      await writeFile(path.join(s.root, name), Buffer.alloc(limit + 1, 32))
      await s.run('INVALID_INPUT')
    }
  )
  it('compares known-good complete JSON, preserves all inputs, binds hashes and remains pending review', async () => {
    const s = await setup()
    const before = sha(await readFile(path.join(s.root, 'catalog.json')))
    const result = await s.run()
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true)
    expect(await s.read('result/report.json')).toEqual(result)
    for (const [name, field] of [
      ['manifest.json', 'manifestSha256'],
      ['catalog.json', 'catalogSha256'],
      ['rule.json', 'ruleSha256'],
      ['capture-index.json', 'captureIndexSha256'],
      ['authority-index.json', 'authorityIndexSha256']
    ])
      expect(result.inputs[field]).toBe(
        sha(await readFile(path.join(s.root, name)))
      )
    const inventory = await s.read('result/input-snapshots.json')
    expect(inventory.some((item) => item.source === 'capture-index.json')).toBe(
      true
    )
    expect(
      inventory.some((item) => item.source === 'authority-index.json')
    ).toBe(true)
    for (const item of inventory)
      expect(sha(await readFile(path.join(s.root, item.copy)))).toBe(
        item.sha256
      )
    expect(sha(await readFile(path.join(s.root, 'catalog.json')))).toBe(before)
  })
  it('compares exact bytes without interpreting them as JSON', async () => {
    const s = await setup()
    s.rule.projection.kind = 'EXACT_BYTES'
    await writeFile(
      path.join(s.root, 'reference/stdout.json'),
      Buffer.from([0, 255, 13, 10])
    )
    await writeFile(
      path.join(s.root, 'cvg/stdout.json'),
      Buffer.from([0, 255, 13, 10])
    )
    await s.seal()
    await s.run()
  })
  it('does not erase a single whitespace byte in EXACT_BYTES', async () => {
    const s = await setup()
    s.rule.projection.kind = 'EXACT_BYTES'
    await writeFile(
      path.join(s.root, 'cvg/stdout.json'),
      '{"status":"synthetic-ok"} '
    )
    await s.seal()
    const result = await s.run('MISMATCH')
    expect(result.diffs).toHaveLength(1)
  })
  it.each([
    ['text', { text: 'expected' }, { text: 'other' }],
    [
      'extra event',
      [{ effect: 'write' }],
      [{ effect: 'write' }, { effect: 'write' }]
    ],
    [
      'event order',
      [{ operation: 'read' }, { operation: 'write' }],
      [{ operation: 'write' }, { operation: 'read' }]
    ],
    ['state', { state: 'waiting' }, { state: 'complete' }],
    ['tenant', { tenant: 'synthetic-A' }, { tenant: 'synthetic-B' }],
    [
      'approval',
      { approval: { decision: 'DENIED' } },
      { approval: { decision: 'APPROVED' } }
    ],
    ['error', { error: 'blocked' }, { error: null }],
    ['effect', { effect: { count: 0 } }, { effect: { count: 1 } }],
    ['cost', { cost: 1, budget: 2 }, { cost: 2, budget: 2 }],
    ['field omission', { result: null }, {}],
    ['type', { result: 1 }, { result: '1' }],
    ['Unicode', { text: 'é' }, { text: 'e\u0301' }]
  ])('rejects complete document divergence: %s', async (_name, a, b) => {
    const s = await setup()
    await s.document('reference', a)
    await s.document('cvg', b)
    await s.seal()
    const report = await s.run('MISMATCH')
    expect(report.diffs[0].referenceDigest).not.toBe(report.diffs[0].cvgDigest)
  })
  it('normalizes only declared envelope IDs while preserving their equivalence topology', async () => {
    const s = await setup()
    s.rule.normalizationPolicy = [
      { field: 'eventId', mode: 'id', namespace: 'event' },
      { field: 'correlationId', mode: 'id', namespace: 'event' }
    ]
    await s.document('reference', [
      {
        eventId: 'a',
        correlationId: 'a',
        tenant: 'synthetic',
        payload: { eventId: 'protected' }
      },
      { eventId: 'b', correlationId: 'a' }
    ])
    await s.document('cvg', [
      {
        eventId: 'x',
        correlationId: 'x',
        tenant: 'synthetic',
        payload: { eventId: 'protected' }
      },
      { eventId: 'y', correlationId: 'x' }
    ])
    await s.seal()
    await s.run()
  })
  it.each([
    [
      'topology',
      [
        {
          eventId: 'x',
          correlationId: 'y',
          tenant: 'synthetic',
          payload: { eventId: 'protected' }
        }
      ]
    ],
    [
      'nested ID',
      [
        {
          eventId: 'x',
          correlationId: 'x',
          tenant: 'synthetic',
          payload: { eventId: 'changed' }
        }
      ]
    ],
    [
      'tenant',
      [
        {
          eventId: 'x',
          correlationId: 'x',
          tenant: 'other',
          payload: { eventId: 'protected' }
        }
      ]
    ],
    [
      'extra event',
      [
        {
          eventId: 'x',
          correlationId: 'x',
          tenant: 'synthetic',
          payload: { eventId: 'protected' }
        },
        { eventId: 'y' }
      ]
    ]
  ])(
    'normalization preserves relevant difference: %s',
    async (_name, changed) => {
      const s = await setup()
      s.rule.normalizationPolicy = [
        { field: 'eventId', mode: 'id', namespace: 'ids' },
        { field: 'correlationId', mode: 'id', namespace: 'ids' }
      ]
      await s.document('reference', [
        {
          eventId: 'a',
          correlationId: 'a',
          tenant: 'synthetic',
          payload: { eventId: 'protected' }
        }
      ])
      await s.document('cvg', changed)
      await s.seal()
      await s.run('MISMATCH')
    }
  )
  it.each([
    'tenant',
    'effect',
    'approval',
    'error',
    'budget',
    'payload.eventId'
  ])('rejects forbidden normalization field %s', async (field) => {
    const s = await setup()
    s.rule.normalizationPolicy = [{ field, mode: 'id', namespace: 'ids' }]
    await s.seal()
    s.authorities.entries = []
    await s.flush()
    await s.run('INVALID_INPUT')
  })
  it('rejects normalization of a non-array before later missing authority', async () => {
    const s = await setup()
    s.rule.normalizationPolicy = [
      { field: 'eventId', mode: 'id', namespace: 'ids' }
    ]
    await s.seal()
    s.authorities.entries = []
    await s.flush()
    await s.run('INVALID_INPUT')
  })
  it.each([
    [
      'execution',
      (m) => {
        m.cvg.execution.endedAt = '2026-10-17T00:00:02.000Z'
      }
    ],
    [
      'timeout relabel',
      (m) => {
        m.cvg.execution.timeout = true
        m.cvg.execution.outcomeKind = 'INFRA_FAILURE'
      }
    ],
    [
      'fixture',
      (m) => {
        m.fixtureSha256 = '1'.repeat(64)
      }
    ],
    [
      'run',
      (m) => {
        m.runId = 'tampered.run'
      }
    ],
    [
      'identity',
      (m) => {
        m.cvg.identity.configSha256 = '1'.repeat(64)
      }
    ],
    [
      'attestation',
      (m) => {
        m.captureAttestations[1] = 'forged.capture'
      }
    ],
    [
      'attestation order',
      (m) => {
        m.captureAttestations.reverse()
      }
    ]
  ])('refuses manifest-only capture tampering: %s', async (_name, change) => {
    const s = await setup()
    change(s.manifest)
    await s.flush()
    const report = await s.run('UNTRUSTED_CAPTURE')
    expect(report.checks.find((check) => check.id === 'AUTHORITY').status).toBe(
      'NOT_RUN'
    )
  })
  it('rejects scenario rebinding even when manifest/rule/authority agree and receipts do not', async () => {
    const s = await setup()
    s.rule.scenarioId = 'other.scenario'
    s.manifest.scenarioId = 'other.scenario'
    await s.write('rule.json', s.rule)
    s.manifest.ruleSha256 = sha(await readFile(path.join(s.root, 'rule.json')))
    s.authorities.entries[0].scopeId = s.manifest.scenarioId
    s.authorities.entries[0].ruleSha256 = s.manifest.ruleSha256
    await s.flush()
    await s.run('UNTRUSTED_CAPTURE')
  })
  it('refuses receipt content changed without separately updating its trusted digest', async () => {
    const s = await setup()
    const receipt = await s.read('cvg/receipt.json')
    receipt.execution.endedAt = '2026-10-17T00:00:03.000Z'
    await s.write('cvg/receipt.json', receipt)
    await s.run('INVALID_INPUT')
  })
  it('keeps missing origin distinct from invalid integrity', async () => {
    const s = await setup()
    await unlink(path.join(s.root, 'cvg/receipt.json'))
    await s.run('UNTRUSTED_CAPTURE')
  })
  it('reports missing reference without manufacturing a capture', async () => {
    const s = await setup()
    s.manifest.reference = null
    s.manifest.captureAttestations = [s.manifest.captureAttestations[1]]
    await s.flush()
    await s.run('BLOCKED_REFERENCE')
  })
  it.each([
    'APPROVED_WRONG_SCOPE',
    'DENIED',
    'PENDING',
    'EXPIRED',
    'ABSENT',
    'MISSING_SPEC',
    'MISSING_DECISION'
  ])('requires exact current scenario authority: %s', async (variant) => {
    const s = await setup()
    const entry = s.authorities.entries[0]
    if (variant === 'APPROVED_WRONG_SCOPE') entry.scopeId = 'other.scenario'
    if (variant === 'DENIED' || variant === 'PENDING') entry.decision = variant
    if (variant === 'EXPIRED') entry.expiresAt = '2020-01-01T00:00:00.000Z'
    if (variant === 'ABSENT') s.authorities.entries = []
    if (variant === 'MISSING_SPEC')
      await unlink(path.join(s.root, entry.specPath))
    if (variant === 'MISSING_DECISION')
      await unlink(path.join(s.root, entry.decisionReceiptPath))
    await s.flush()
    await s.run('BLOCKED_CVG_SPEC')
  })
  it('does not promote authenticated timeout to a functional match', async () => {
    const s = await setup()
    s.manifest.cvg.execution = {
      ...s.manifest.cvg.execution,
      outcomeKind: 'INFRA_FAILURE',
      timeout: true,
      exitCode: null
    }
    await s.seal()
    await s.run('INFRA_FAILURE')
  })
  it('does not accept same-document results with the wrong execution outcome', async () => {
    const s = await setup()
    s.manifest.cvg.execution.outcomeKind = 'PRODUCT_FAILURE'
    s.manifest.cvg.execution.exitCode = 7
    await s.seal()
    await s.run('MISMATCH')
  })
  it('supports a frozen expected product failure, without permitting expected infra failure', async () => {
    const s = await setup()
    for (const side of ['reference', 'cvg']) {
      s.manifest[side].execution.outcomeKind = 'PRODUCT_FAILURE'
      s.manifest[side].execution.exitCode = 7
      s.rule.expectedExecution[side] = {
        outcomeKind: 'PRODUCT_FAILURE',
        exitCode: 7
      }
    }
    await s.seal()
    await s.run()
  })
  it.each(['VERSION', 'KIND'])(
    'reports unsupported rule honestly: %s',
    async (variant) => {
      const s = await setup()
      if (variant === 'VERSION') s.rule.version = 2
      else s.rule.projection.kind = 'SEMANTIC_GUESS'
      await s.seal()
      s.authorities.entries = []
      await s.flush()
      await s.run('UNSUPPORTED_RULE')
    }
  )
  it('gives integrity failure precedence over unsupported wire', async () => {
    const s = await setup()
    s.rule.version = 2
    await s.seal()
    await writeFile(path.join(s.root, 'cvg/stdout.json'), 'corrupt')
    await s.run('INVALID_INPUT')
  })
  it('gives capture trust precedence over denied authority and altered execution', async () => {
    const s = await setup()
    s.authorities.entries[0].decision = 'DENIED'
    s.manifest.cvg.execution.exitCode = 9
    s.manifest.cvg.execution.outcomeKind = 'PRODUCT_FAILURE'
    await s.flush()
    await s.run('UNTRUSTED_CAPTURE')
  })
  it('gives denied authority precedence over authenticated infra failure', async () => {
    const s = await setup()
    s.manifest.cvg.execution.outcomeKind = 'INFRA_FAILURE'
    s.manifest.cvg.execution.exitCode = null
    await s.seal()
    s.authorities.entries[0].decision = 'DENIED'
    await s.flush()
    await s.run('BLOCKED_CVG_SPEC')
  })
  it('does not overwrite an existing result, even an earlier successful one', async () => {
    const s = await setup()
    await s.run()
    const original = await readFile(path.join(s.root, 'result/report.json'))
    await s.run('INFRA_FAILURE')
    expect(await readFile(path.join(s.root, 'result/report.json'))).toEqual(
      original
    )
  })
  it.each([
    'capture-index.json',
    'authority-index.json',
    'manifest.json',
    'rule.json'
  ])('rejects duplicate keys in control input %s', async (name) => {
    const s = await setup()
    await writeFile(path.join(s.root, name), '{"version":1,"version":1}')
    await s.run('INVALID_INPUT')
  })
  it('rejects invalid UTF-8 before comparisons', async () => {
    const s = await setup()
    await writeFile(
      path.join(s.root, 'manifest.json'),
      Buffer.from([0xc3, 0x28])
    )
    await s.run('INVALID_INPUT')
  })
  it('implements controls against a separately pinned expected artifact, without a fake reference', async () => {
    const s = await setup()
    s.rule.verificationClass = 'CVG_CONTROL'
    const catalog = await s.read('catalog.json')
    s.rule.requirementIds = [
      catalog.requirements.find(
        (req) => req.verification_class === 'CVG_CONTROL'
      ).id
    ]
    s.manifest.requirementIds = [...s.rule.requirementIds]
    s.manifest.reference = null
    s.manifest.captureAttestations = [s.manifest.captureAttestations[1]]
    s.rule.projection.referenceRole = null
    s.rule.expectedExecution.reference = null
    await writeFile(
      path.join(s.root, 'expected-control.json'),
      await readFile(path.join(s.root, 'cvg/stdout.json'))
    )
    const bytes = await readFile(path.join(s.root, 'expected-control.json'))
    s.rule.expectedArtifact = {
      path: 'expected-control.json',
      sha256: sha(bytes),
      bytes: bytes.length
    }
    await s.seal()
    const report = await s.run()
    expect(report.identities.referenceSha256).toBeNull()
    expect(report.evidence.reference).toEqual([])
  })
  it('runs the actual CLI and emits the same pending result on stdout and disk', async () => {
    const s = await setup()
    const args = [
      '--manifest',
      'manifest.json',
      '--catalog',
      'catalog.json',
      '--rule',
      'rule.json',
      '--capture-index',
      'capture-index.json',
      '--authority-index',
      'authority-index.json',
      '--evidence-root',
      s.root,
      '--out',
      'result'
    ]
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      timeout: 10000
    })
    const report = JSON.parse(stdout)
    expect(report.status).toBe('MATCH_REQUIRES_REVIEW')
    expect(await s.read('result/report.json')).toEqual(report)
  })
  it.each([
    { args: [] },
    { args: ['positional'] },
    { args: ['--manifest', 'a'] },
    { args: ['--manifest', 'a', '--manifest', 'b'] },
    { args: ['--unknown', 'value'] }
  ])(
    'rejects invalid CLI use without creating files: $args',
    async ({ args }) => {
      const s = await setup()
      const before = await readdir(s.root)
      const result = spawnSync(process.execPath, [cli, ...args], {
        encoding: 'utf8',
        cwd: s.root,
        timeout: 10000
      })
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('INVALID_INPUT')
      expect(await readdir(s.root)).toEqual(before)
    }
  )
})
