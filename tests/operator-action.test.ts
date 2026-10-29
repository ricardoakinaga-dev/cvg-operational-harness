/**
 * SPEC 0262 §6.1 / R14 — parser, bindings and refusals of
 * scripts/revoke-operator-sessions.ts with SYNTHETIC fixtures. A UID injected
 * here is NOT OS proof: the positive root launch and the real datastore
 * profile stay NOT_RUN until the T4 environment.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  OPERATOR_ACTION_POLICY_PATH,
  datastoreProfileSha256,
  parseArguments,
  runOperatorAction,
  type DatastoreSession,
  type FileStat,
  type OperatorActionDependencies,
  type OperatorActionFileSystem
} from '../scripts/lib/operator-action.ts'

const tenant = 'tenant_00000000-0000-4000-8000-000000000262'
const operatorId = 'operator.target.synthetic'
const decisionId = '2f6a9e0c-7c7b-4b57-9a54-0d6f4d3b1a11'
const DECISIONS = '/srv/cvg-decisions'
const PROOF = `${DECISIONS}/${decisionId}.json`
const CONNECTION = '/etc/cvg/data-connection'
const ARTIFACT = 'a'.repeat(64)
const NOW = new Date('2026-10-29T12:00:00.000Z')
const profile = {
  host: 'db.internal.synthetic',
  port: 5432,
  database: 'cvg_synthetic',
  user: 'cvg_invalidator'
}

type InvalidateInput = Parameters<DatastoreSession['invalidate']>[0]

interface Node {
  stat: Partial<FileStat> & { kind: 'file' | 'dir' | 'link' }
  content?: Buffer
}

function fixture(
  overrides: {
    policy?: Record<string, unknown>
    proof?: Record<string, unknown>
    proofRaw?: string
    nodes?: Record<string, Node>
  } = {}
) {
  const policy = {
    v: 1,
    operation: 'invalidate_operator_sessions',
    approvedDecisionsDir: DECISIONS,
    installedArtifactSha256: ARTIFACT,
    datastoreProfile: profile,
    connectionFile: CONNECTION,
    ...overrides.policy
  }
  const proof = {
    v: 1,
    decisionId,
    operation: 'invalidate_operator_sessions',
    state: 'APPROVED_FOR_EXECUTION',
    tenantId: tenant,
    operatorId,
    expectedRevision: 4,
    authority: 'local_operator_attestation_v1',
    operator: 'local.admin',
    decisionRef: 'decision-ref-synthetic-0001',
    issuedAt: '2026-10-29T11:50:00.000Z',
    expiresAt: '2026-10-29T12:10:00.000Z',
    reason: 'synthetic rehearsal',
    installedArtifactSha256: ARTIFACT,
    datastoreProfileSha256: datastoreProfileSha256(profile),
    ...overrides.proof
  }
  const nodes: Record<string, Node> = {
    '/': { stat: { kind: 'dir', uid: 0, mode: 0o755 } },
    '/etc': { stat: { kind: 'dir', uid: 0, mode: 0o755 } },
    '/etc/cvg': { stat: { kind: 'dir', uid: 0, mode: 0o755 } },
    '/srv': { stat: { kind: 'dir', uid: 0, mode: 0o755 } },
    [DECISIONS]: { stat: { kind: 'dir', uid: 0, mode: 0o700 } },
    [OPERATOR_ACTION_POLICY_PATH]: {
      stat: { kind: 'file', uid: 0, mode: 0o600 },
      content: Buffer.from(JSON.stringify(policy))
    },
    [PROOF]: {
      stat: { kind: 'file', uid: 0, mode: 0o600 },
      content: Buffer.from(overrides.proofRaw ?? JSON.stringify(proof))
    },
    [CONNECTION]: {
      stat: { kind: 'file', uid: 0, mode: 0o600 },
      content: Buffer.from(
        'postgres://cvg_invalidator:synthetic-secret@db.internal.synthetic:5432/cvg_synthetic\n'
      )
    },
    ...overrides.nodes
  }
  const fs: OperatorActionFileSystem = {
    lstat(file): FileStat | null {
      const node = nodes[file]
      if (!node) return null
      return {
        isFile: node.stat.kind === 'file',
        isDirectory: node.stat.kind === 'dir',
        isSymlink: node.stat.kind === 'link',
        uid: node.stat.uid ?? 0,
        mode: node.stat.mode ?? 0o600,
        size: node.content?.length ?? 0
      }
    },
    readFile(file) {
      const node = nodes[file]
      if (!node?.content) throw new Error('ENOENT')
      return node.content
    }
  }
  const session = {
    identity: vi.fn(async () => ({
      database: profile.database,
      user: profile.user
    })),
    invalidate: vi.fn<
      (input: InvalidateInput) => Promise<{ revision: number }>
    >(async () => ({ revision: 5 })),
    close: vi.fn(async () => undefined)
  }
  const connect = vi.fn(async () => session as DatastoreSession)
  const dependencies: OperatorActionDependencies = {
    fs,
    euid: 0,
    now: () => NOW,
    installedArtifactSha256: () => ARTIFACT,
    connect
  }
  return { dependencies, session, connect, nodes }
}

const argv = (extra: string[] = []) => [
  '--tenant',
  tenant,
  '--operator-id',
  operatorId,
  '--expected-revision',
  '4',
  '--proof',
  PROOF,
  ...extra
]

describe('argument parser', () => {
  it('accepts the exact flags and defaults to dry-run', () => {
    expect(parseArguments(argv())).toMatchObject({
      tenantId: tenant,
      operatorId,
      expectedRevision: 4,
      apply: false
    })
    expect(parseArguments(argv(['--apply'])).apply).toBe(true)
  })
  for (const [name, bad] of [
    ['unknown option', [...argv(), '--force']],
    ['--test', [...argv(), '--test']],
    ['duplicate flag', [...argv(), '--tenant', tenant]],
    ['duplicate --apply', argv(['--apply', '--apply'])],
    ['missing value', ['--tenant']],
    ['missing proof', argv().slice(0, 6)],
    ['relative proof', argv().map((v) => (v === PROOF ? 'proof.json' : v))],
    ['zero revision', argv().map((v) => (v === '4' ? '0' : v))],
    [
      'unsafe revision',
      argv().map((v) => (v === '4' ? '9007199254740993' : v))
    ],
    ['bad tenant', argv().map((v) => (v === tenant ? 'tenant_x' : v))]
  ] as Array<[string, string[]]>) {
    it(`refuses ${name}`, () => {
      expect(() => parseArguments(bad)).toThrow()
    })
  }
})

describe('runOperatorAction', () => {
  it('dry-run validates everything and never connects', async () => {
    const f = fixture()
    const result = await runOperatorAction(f.dependencies, argv())
    expect(result.outcome).toBe('DRY_RUN')
    expect(f.connect).not.toHaveBeenCalled()
  })

  it('--apply invalidates once, with digests only, and prints no secret or raw reference', async () => {
    const f = fixture()
    const result = await runOperatorAction(f.dependencies, argv(['--apply']))
    expect(result.outcome).toBe('APPLIED')
    expect(result.revision).toBe(5)
    expect(f.session.invalidate).toHaveBeenCalledTimes(1)
    const call = f.session.invalidate.mock.calls[0]![0]
    expect(call).toMatchObject({
      tenantId: tenant,
      operatorId,
      expectedRevision: 4,
      localOperator: 'local.admin'
    })
    expect(call.proofDigest).toMatch(/^[0-9a-f]{64}$/)
    const printed = JSON.stringify(result)
    expect(printed).not.toContain('synthetic-secret')
    expect(printed).not.toContain('decision-ref-synthetic')
    expect(f.session.close).toHaveBeenCalled()
  })

  it('a non-root launch is refused before reading anything', async () => {
    const f = fixture()
    const readFile = vi.spyOn(f.dependencies.fs, 'readFile')
    const result = await runOperatorAction(
      { ...f.dependencies, euid: 1000 },
      argv(['--apply'])
    )
    expect(result.outcome).toBe('REFUSED')
    expect(readFile).not.toHaveBeenCalled()
    expect(f.connect).not.toHaveBeenCalled()
  })

  const proofTampers: Array<[string, Record<string, unknown>]> = [
    ['plain HANDOFF', { state: 'HANDOFF' }],
    ['PENDING', { state: 'PENDING' }],
    ['REJECTED', { state: 'REJECTED' }],
    ['DRAFT', { state: 'DRAFT' }],
    ['other operation', { operation: 'deactivate_operator' }],
    [
      'other tenant',
      { tenantId: 'tenant_00000000-0000-4000-8000-000000000999' }
    ],
    ['other operator', { operatorId: 'operator.other.synthetic' }],
    ['other revision', { expectedRevision: 3 }],
    ['other authority', { authority: 'human_signature_v1' }],
    ['expired', { expiresAt: '2026-10-29T11:59:59.000Z' }],
    [
      'not yet valid',
      {
        issuedAt: '2026-10-29T12:00:01.000Z',
        expiresAt: '2026-10-29T12:20:00.000Z'
      }
    ],
    [
      'window over 30 min',
      {
        issuedAt: '2026-10-29T11:00:00.000Z',
        expiresAt: '2026-10-29T12:30:01.000Z'
      }
    ],
    ['artifact digest differs', { installedArtifactSha256: 'b'.repeat(64) }],
    ['datastore digest differs', { datastoreProfileSha256: 'c'.repeat(64) }],
    ['empty reason', { reason: '' }],
    ['long reason', { reason: 'x'.repeat(501) }],
    ['extra field', { extra: true }],
    ['other decisionId', { decisionId: '2f6a9e0c-7c7b-4b57-9a54-0d6f4d3b1a99' }]
  ]
  for (const [name, change] of proofTampers) {
    it(`refuses a proof with ${name}`, async () => {
      const f = fixture({ proof: change })
      const result = await runOperatorAction(f.dependencies, argv(['--apply']))
      expect(result.outcome).toBe('REFUSED')
      expect(f.connect).not.toHaveBeenCalled()
      expect(f.session.invalidate).not.toHaveBeenCalled()
    })
  }

  const fileTampers: Array<[string, Record<string, Node>]> = [
    [
      'proof owned by another user',
      {
        [PROOF]: {
          stat: { kind: 'file', uid: 1000, mode: 0o600 },
          content: Buffer.from('{}')
        }
      }
    ],
    [
      'proof mode 0644',
      {
        [PROOF]: {
          stat: { kind: 'file', uid: 0, mode: 0o644 },
          content: Buffer.from('{}')
        }
      }
    ],
    [
      'proof as symlink',
      {
        [PROOF]: {
          stat: { kind: 'link', uid: 0, mode: 0o600 },
          content: Buffer.from('{}')
        }
      }
    ],
    [
      'decisions dir mode 0755',
      { [DECISIONS]: { stat: { kind: 'dir', uid: 0, mode: 0o755 } } }
    ],
    [
      'decisions dir not root',
      { [DECISIONS]: { stat: { kind: 'dir', uid: 1000, mode: 0o700 } } }
    ],
    [
      'writable parent of the proof',
      { '/srv': { stat: { kind: 'dir', uid: 0, mode: 0o777 } } }
    ],
    [
      'symlinked parent',
      { '/srv': { stat: { kind: 'link', uid: 0, mode: 0o755 } } }
    ],
    [
      'policy mode 0640',
      {
        [OPERATOR_ACTION_POLICY_PATH]: {
          stat: { kind: 'file', uid: 0, mode: 0o640 },
          content: Buffer.from('{}')
        }
      }
    ],
    [
      'policy owned by another user',
      {
        [OPERATOR_ACTION_POLICY_PATH]: {
          stat: { kind: 'file', uid: 1000, mode: 0o600 },
          content: Buffer.from('{}')
        }
      }
    ],
    [
      'policy parent writable',
      { '/etc/cvg': { stat: { kind: 'dir', uid: 0, mode: 0o775 } } }
    ],
    [
      'connection file mode 0644',
      {
        [CONNECTION]: {
          stat: { kind: 'file', uid: 0, mode: 0o644 },
          content: Buffer.from('x')
        }
      }
    ]
  ]
  for (const [name, nodes] of fileTampers) {
    it(`refuses: ${name}`, async () => {
      const f = fixture({ nodes })
      const result = await runOperatorAction(f.dependencies, argv(['--apply']))
      expect(result.outcome).toBe('REFUSED')
      expect(f.session.invalidate).not.toHaveBeenCalled()
    })
  }

  it('refuses a proof outside the approved decisions directory, an oversize proof and a wrong file name', async () => {
    const outside = '/srv/elsewhere'
    const moved = fixture({
      nodes: {
        [outside]: { stat: { kind: 'dir', uid: 0, mode: 0o700 } },
        [`${outside}/${decisionId}.json`]: {
          stat: { kind: 'file', uid: 0, mode: 0o600 },
          content: Buffer.from('{}')
        }
      }
    })
    const a = await runOperatorAction(
      moved.dependencies,
      argv(['--apply']).map((v) =>
        v === PROOF ? `${outside}/${decisionId}.json` : v
      )
    )
    expect(a.outcome).toBe('REFUSED')
    const big = fixture({ proofRaw: ' '.repeat(5000) })
    expect((await runOperatorAction(big.dependencies, argv())).outcome).toBe(
      'REFUSED'
    )
    const renamed = fixture()
    const other = `${DECISIONS}/not-the-id.json`
    renamed.nodes[other] = renamed.nodes[PROOF]!
    const b = await runOperatorAction(
      renamed.dependencies,
      argv().map((v) => (v === PROOF ? other : v))
    )
    expect(b.outcome).toBe('REFUSED')
  })

  it('refuses a policy whose artifact digest differs from the executing artifact', async () => {
    const f = fixture({ policy: { installedArtifactSha256: 'd'.repeat(64) } })
    expect(
      (await runOperatorAction(f.dependencies, argv(['--apply']))).outcome
    ).toBe('REFUSED')
    const g = fixture()
    const result = await runOperatorAction(
      { ...g.dependencies, installedArtifactSha256: () => 'e'.repeat(64) },
      argv(['--apply'])
    )
    expect(result.outcome).toBe('REFUSED')
    expect(g.connect).not.toHaveBeenCalled()
  })

  it('denies before the write when the live datastore identity differs', async () => {
    const f = fixture()
    f.session.identity.mockResolvedValue({
      database: 'another_database',
      user: profile.user
    })
    const result = await runOperatorAction(f.dependencies, argv(['--apply']))
    expect(result.outcome).toBe('REFUSED')
    expect(f.session.invalidate).not.toHaveBeenCalled()
    expect(f.session.close).toHaveBeenCalled()
  })

  it('reports a stale revision as REFUSED and an uncertain commit as UNKNOWN without retrying', async () => {
    const stale = fixture()
    stale.session.invalidate.mockRejectedValue(
      Object.assign(new Error('stale'), { code: 'principal_conflict' })
    )
    expect(
      (await runOperatorAction(stale.dependencies, argv(['--apply']))).outcome
    ).toBe('REFUSED')
    const lost = fixture()
    lost.session.invalidate.mockRejectedValue(new Error('connection lost'))
    const result = await runOperatorAction(lost.dependencies, argv(['--apply']))
    expect(result.outcome).toBe('UNKNOWN')
    expect(lost.session.invalidate).toHaveBeenCalledTimes(1)
  })

  it('binds the proof digest to the exact proof bytes', async () => {
    const f = fixture()
    await runOperatorAction(f.dependencies, argv(['--apply']))
    const digest = f.session.invalidate.mock.calls[0]![0].proofDigest
    expect(digest).toBe(
      createHash('sha256').update(f.nodes[PROOF]!.content!).digest('hex')
    )
  })
})
