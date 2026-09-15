#!/usr/bin/env node
/**
 * PROD-20260913 M1 — writes per-task evidence manifests with sha256 of source,
 * tests and evidence files plus the recorded gate results. Implementations stay
 * IMPLEMENTED/REVIEW; no self-approval.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = '/home/ricardo/cvg-agent-secretary-v2'
const evidenceRoot = path.join(root, 'docs/04_audit/evidence/PROD-20260913')

async function sha256(relative) {
  const bytes = await readFile(path.join(root, relative))
  return createHash('sha256').update(bytes).digest('hex')
}

async function hashes(files) {
  const result = {}
  for (const file of files) result[file] = await sha256(file)
  return result
}

const commonGates = [
  {
    command: 'npm run typecheck',
    result: 'PASS',
    exitCode: 0,
    note:
      're-run on the final bytes after the fake-pool test type fix; earlier P1 finding F1 resolved'
  },
  {
    command: 'npx eslint (changed files)',
    result: 'PASS',
    exitCode: 0
  },
  {
    command: 'npm test',
    result:
      'PASS: Test Files 234 passed | 7 skipped (241); Tests 1625 passed | 83 skipped (1708)',
    exitCode: 0,
    note: 'full suite executed during this session after the M1 changes'
  }
]

const manifests = {
  'PROD-02': {
    task: 'PROD-02',
    title: 'Tornar mutação SQL de jornada e auditoria atômicas',
    status: 'IMPLEMENTED_PENDING_INDEPENDENT_REVIEW',
    origin: ['D13-01', 'Q-A11-01'],
    contract: 'docs/02_spec/prod20260913_m1_corrections_contract.md',
    negativeReproduced: {
      probe: 'docs/04_audit/evidence/PROD-20260913/PROD-01/sql-atomicity-probe.before.json',
      verdict: 'FAIL_PARTIAL_STATE',
      observed: {
        firstError: 'synthetic audit failure',
        draftsAfterFailedMutation: 1,
        auditAfterFailedMutation: 0,
        replayStatus: 'draft',
        auditRowsAfterReplay: 0
      }
    },
    positiveVerified: {
      probe:
        'docs/04_audit/evidence/PROD-20260913/PROD-02/sql-atomicity-probe.after.json',
      verdict: 'PASS_ATOMIC',
      observed: JSON.parse(
        await readFile(
          path.join(evidenceRoot, 'PROD-02/sql-atomicity-probe.after.json'),
          'utf8'
        )
      )
    },
    source: [
      'packages/persistence/src/tenant-scoped-postgres.ts',
      'packages/persistence/src/journeys-postgres.ts',
      'packages/persistence/src/__tests__/journeys-postgres.test.ts',
      'apps/api/src/__tests__/journeys-api-postgres.test.ts'
    ],
    evidence: [
      'docs/04_audit/evidence/PROD-20260913/PROD-02/sql-atomicity-probe.after.json',
      'docs/04_audit/evidence/PROD-20260913/PROD-02/tests.log',
      'docs/04_audit/evidence/PROD-20260913/PROD-05/test-postgres.log'
    ],
    gates: [
      ...commonGates,
      {
        command:
          'TEST_DATABASE_URL=… npx vitest run journeys-postgres.test.ts journeys-api-postgres.test.ts',
        result: 'PASS: 2 files / 32 tests, 0 skipped',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/PROD-02/tests.log'
      },
      {
        command: 'TEST_DATABASE_URL=… npm run test:postgres',
        result: 'PASS: 18 files / 151 tests, 0 skipped',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/PROD-05/test-postgres.log'
      }
    ],
    limitations: [
      'does not prove physical fsync durability; disposable cluster used',
      'no production data or real confirmation path touched'
    ]
  },
  'PROD-03': {
    task: 'PROD-03',
    title: 'Impedir continuação UI de identidade/sessão obsoleta',
    status: 'IMPLEMENTED_PENDING_INDEPENDENT_REVIEW',
    origin: ['D13-02', 'Q-A17-02'],
    contract: 'docs/02_spec/prod20260913_m1_corrections_contract.md',
    negativeReproduced: {
      evidence: [
        'docs/04_audit/evidence/AUD-20260913-DOCS/ui/race.cjs',
        'docs/04_audit/evidence/AUD-20260913-DOCS/ui/race.log'
      ],
      redDemonstration:
        'docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.red.json',
      verdict: 'FAIL_STALE_VISIBLE'
    },
    positiveVerified: {
      probe: 'docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.cjs',
      verdict: 'PASS_STALE_DISCARDED',
      observed: { tenant: 'tenant_B', staleTenantCandidateVisible: false },
      artifacts: [
        'docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.json',
        'docs/04_audit/evidence/PROD-20260913/PROD-03/tenant-race.png'
      ]
    },
    source: [
      'apps/web/src/features/journeys/index.tsx',
      'apps/web/src/api/client.ts',
      'apps/web/src/__tests__/journeys-identity-race.test.tsx'
    ],
    evidence: [
      'docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.cjs',
      'docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.json',
      'docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.red.json',
      'docs/04_audit/evidence/PROD-20260913/PROD-03/tenant-race.png',
      'docs/04_audit/evidence/PROD-20260913/PROD-03/tenant-race.red.png',
      'docs/04_audit/evidence/PROD-20260913/PROD-03/tests.log'
    ],
    gates: [
      ...commonGates,
      {
        command: 'npx vitest run apps/web/.../journeys-identity-race.test.tsx',
        result: 'PASS: 1 file / 3 tests (RED without fix: 2 failed)',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/PROD-03/tests.log'
      },
      {
        command: 'playwright chromium ui-race-probe.cjs',
        result: 'PASS_STALE_DISCARDED',
        exitCode: 0
      },
      {
        command: 'npm run build:web',
        result: 'PASS (build executed by npm test chain and session build)',
        exitCode: 0
      }
    ],
    limitations: [
      'probe uses intercepted synthetic API responses; not a real tenant',
      'backend authorization unchanged and not re-qualified here'
    ]
  },
  'PROD-05': {
    task: 'PROD-05',
    title: 'Validar papel SQL e RLS no bootstrap do worker',
    status: 'IMPLEMENTED_PENDING_INDEPENDENT_REVIEW',
    origin: ['D13-06', 'Q-A06-03'],
    contract: 'docs/02_spec/prod20260913_m1_corrections_contract.md',
    negativeReproduced: {
      evidence: 'audit static finding apps/worker/src/postgres-controlled.ts:85 (flag-only check)',
      verdict: 'FAIL_FLAG_ONLY'
    },
    positiveVerified: {
      probe: 'apps/worker/src/__tests__/postgres-role-preflight.test.ts',
      verdict:
        'PASS: 10/10 (superuser, BYPASSRLS, membership, owner, DDL, missing schema and broad privileges rejected; minimal role consumes an event; same-pool cleanup verified; destroy-on-cleanup-failure verified)'
    },
    source: [
      'apps/worker/src/postgres-role-preflight.ts',
      'apps/worker/src/main.ts',
      'apps/worker/src/__tests__/postgres-role-preflight.test.ts',
      'package.json'
    ],
    evidence: [
      'docs/04_audit/evidence/PROD-20260913/PROD-05/tests.log',
      'docs/04_audit/evidence/PROD-20260913/PROD-05/test-postgres.log'
    ],
    gates: [
      ...commonGates,
      {
        command:
          'TEST_DATABASE_URL=… npx vitest run postgres-role-preflight.test.ts',
        result: 'PASS: 1 file / 10 tests, 0 skipped',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/PROD-05/tests.log'
      },
      {
        command: 'npm run test:worker:startup',
        result: 'PASS',
        exitCode: 0
      },
      {
        command: 'npm run test:postgres',
        result:
          'PASS: 18 files / 151 tests, 0 skipped (inventory now includes continuous-worker-postgres and attendance-approval-postgres)',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/PROD-05/test-postgres.log'
      }
    ],
    limitations: [
      'preflight is wired into the worker bootstrap; the continuous consumer composition remains AAA-19/AAA-21/D01 dependent',
      'no production role or credential used'
    ]
  },
  'PROD-06': {
    task: 'PROD-06',
    title: 'Preservar ator e correlação na auditoria da jornada',
    status: 'IMPLEMENTED_PENDING_INDEPENDENT_REVIEW',
    origin: ['D13-06', 'Q-A14-01'],
    contract: 'docs/02_spec/prod20260913_m1_corrections_contract.md',
    negativeReproduced: {
      evidence: 'audit 0560 D13-06: actor System/journey-r3 and correlation derived from resource',
      verdict: 'FAIL_SYSTEM_ACTOR'
    },
    positiveVerified: {
      probe: 'parity contract test + HTTP PostgreSQL test',
      verdict:
        'PASS: operator actor/correlation persisted; body-injected actor ignored; missing context falls back to explicit system actor'
    },
    source: [
      'packages/persistence/src/journeys.ts',
      'packages/persistence/src/journeys-postgres.ts',
      'apps/api/src/server.ts',
      'packages/persistence/src/__tests__/journeys-postgres.test.ts',
      'apps/api/src/__tests__/journeys-api-postgres.test.ts'
    ],
    evidence: ['docs/04_audit/evidence/PROD-20260913/PROD-02/tests.log'],
    gates: [
      ...commonGates,
      {
        command:
          'TEST_DATABASE_URL=… npx vitest run journeys-postgres.test.ts journeys-api-postgres.test.ts',
        result: 'PASS: 2 files / 32 tests, 0 skipped (includes actor/body-injection cases)',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/PROD-02/tests.log'
      }
    ],
    limitations: [
      'recordHandoff has no public HTTP route yet; propagation proven at repository and journey route level',
      'timeline query by correlation uses the existing audit evidence APIs; no new endpoint added'
    ]
  },
  'AAA-22': {
    task: 'AAA-22',
    title: 'Implementar readiness com probes reais e limitados (correção D13-04)',
    status: 'IMPLEMENTED_PARTIAL_PENDING_AAA21_D01',
    origin: ['D13-04'],
    contract: 'docs/02_spec/prod20260913_m1_corrections_contract.md',
    negativeReproduced: {
      probe: 'docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.ts',
      verdict: 'FAIL_NO_PROBE',
      observed: { queries: 0, ready: 200 }
    },
    positiveVerified: {
      probe: 'same probe after the fix',
      verdict: 'PASS_PROBED',
      observed: { queries: 1, ready: 503, live: 200 },
      evidence:
        'docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.after.json'
    },
    source: [
      'apps/api/src/readiness.ts',
      'apps/api/src/server.ts',
      'apps/api/src/__tests__/readiness.test.ts'
    ],
    evidence: [
      'docs/04_audit/evidence/PROD-20260913/AAA-22/tests.log',
      'docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.after.json'
    ],
    gates: [
      ...commonGates,
      {
        command: 'npx vitest run readiness.test.ts',
        result: 'PASS: 1 file / 8 tests (DB failure 503, live 200, no connection accumulation, consumer probe)',
        exitCode: 0,
        log: 'docs/04_audit/evidence/PROD-20260913/AAA-22/tests.log'
      }
    ],
    limitations: [
      'consumer probe is injectable but not yet wired to the continuous worker composition (AAA-19/AAA-21, D01 pending)',
      'no production database observed'
    ]
  }
}

async function main() {
  for (const [task, manifest] of Object.entries(manifests)) {
    const sourceHashes = await hashes(manifest.source)
    const evidenceHashes = await hashes(manifest.evidence)
    const contractHash = await sha256(manifest.contract)
    const record = {
      ...manifest,
      observedAt: new Date().toISOString(),
      contractSha256: contractHash,
      sourceSha256: sourceHashes,
      evidenceSha256: evidenceHashes,
      independence: 'builder output; independent review required before VERIFIED/DONE'
    }
    if (task === 'PROD-05') {
      record.reviewFindingsAddressed = [
        {
          finding:
            'P2: tenant-context cleanup test was vacuous (invalid role never sets context)',
          fix:
            'replaced by a same-pool rejection case (CREATE privilege) and a fake-client cleanup-failure case that asserts release(error) destruction; 10/10 tests pass'
        },
        {
          finding: 'P1 (independent verifier F1): npm run typecheck failed on the fake-pool test client type',
          fix:
            'fake pool typed via Parameters<typeof assertPostgresWorkerPreflight>[0]; typecheck PASS on final bytes'
        },
        {
          finding: 'P3 (F4): manifest positive verdict still said 8/8 while the run was 10/10',
          fix: 'verdict corrected to 10/10'
        },
        {
          finding:
            'P3 (F6): contract said the preflight runs its queries through withTenantContext',
          fix:
            'contract text corrected to the explicit same-connection tenant context with verified cleanup'
        }
      ]
    }
    if (task === 'PROD-02') {
      record.reviewFindingsAddressed = [
        {
          finding: 'P3: no post-fix artifact for the D13-01 probe',
          fix:
            'sql-atomicity-probe.after.json added and hashed; probe re-run on the corrected tree'
        },
        {
          finding:
            'P3 (F5): cleanup failure after COMMIT gave the caller an error for a committed mutation',
          fix:
            'tenant-context reset and verification now happen inside the transaction before COMMIT; a reset failure rolls back, so an error never follows a committed mutation'
        }
      ]
    }
    if (task === 'AAA-22') {
      record.reviewFindingsAddressed = [
        {
          finding: 'P3: readiness probe verdict accepted any query attempt',
          fix:
            'verdict now requires queries>=1, /ready 503 and /live 200; readiness-probe.after.json regenerated'
        },
        {
          finding:
            'P3 (F3): PROD-01 input hash of readiness-probe.ts was stale after the verdict tightening',
          fix: 'PROD-01 manifest regenerated after all bytes froze'
        }
      ]
    }
    const dir = path.join(evidenceRoot, task)
    await writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify(record, null, 2) + '\n'
    )
    console.log(task, Object.keys(sourceHashes).length, 'source hashes')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
