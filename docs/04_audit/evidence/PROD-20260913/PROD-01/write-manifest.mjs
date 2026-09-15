#!/usr/bin/env node
/**
 * PROD-01 — writes the task manifest with sha256 of inputs, outputs and
 * environment observed. No product file is modified.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = '/home/ricardo/cvg-agent-secretary-v2'
const evidenceDir = path.join(
  root,
  'docs/04_audit/evidence/PROD-20260913/PROD-01'
)

const files = [
  'docs/04_audit/0560_docs_implementation_audit_2026-09-13.md',
  'docs/04_audit/evidence/AUD-20260913-DOCS/evidence-manifest.json',
  'docs/04_audit/evidence/AUD-20260913-DOCS/manifest.json',
  'docs/PLANO_EXECUTIVO_PRODUCAO.md',
  'docs/ROADMAP_PRODUCAO.md',
  'docs/BACKLOG_PRODUCAO.md',
  'docs/01_prd/aaa_decision_brief.md',
  'docs/02_spec/prod20260913_m1_corrections_contract.md',
  'docs/02_spec/aaa_quality_contract.md',
  'docs/03_build/tracking/aaa_program_backlog.json',
  'docs/03_build/tracking/production_delta_backlog.json',
  'docs/03_build/tracking/production_quality_traceability.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/baseline-drift.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/requirements-map.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/sql-atomicity-probe.before.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.before.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.after.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-02/sql-atomicity-probe.after.json',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/npm-test-final.log',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/write-m1-manifests.mjs',
  'docs/04_audit/evidence/PROD-20260913/independent-review/REVIEW.md',
  'docs/04_audit/evidence/PROD-20260913/independent-review/RESPONSE.md',
  'docs/04_audit/evidence/PROD-20260913/independent-review/revalidation.md',
  'docs/04_audit/evidence/PROD-20260913/areas-status-2026-09-13.md',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/sql-atomicity-probe.ts',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.ts',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/recompute-manifest-hashes.mjs',
  'docs/04_audit/evidence/PROD-20260913/PROD-01/build-requirements-map.mjs'
]

async function sha256(relative) {
  const bytes = await readFile(path.join(root, relative))
  return createHash('sha256').update(bytes).digest('hex')
}

async function main() {
  const hashes = {}
  for (const file of files) hashes[file] = await sha256(file)
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
    .toString()
    .trim()
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root })
    .toString()
    .trim()
  const manifest = {
    task: 'PROD-01',
    title: 'Revalidar baseline e fechar mapa de requisitos/contratos',
    status: 'IMPLEMENTED_PENDING_INDEPENDENT_REVIEW',
    program: 'PROD-20260913',
    observedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      commit,
      candidateNote:
        'working tree preserved; no product bytes changed by PROD-01 (see baseline-drift.json)'
    },
    authorization:
      'user request authorizes reversible local implementation, synthetic data and disposable databases; no real data, external effects or production',
    inputs: hashes,
    probeResults: {
      'D13-01-before': JSON.parse(
        await readFile(path.join(evidenceDir, 'sql-atomicity-probe.before.json'), 'utf8')
      ),
      'D13-01-after': JSON.parse(
        await readFile(
          path.join(evidenceDir, '../PROD-02/sql-atomicity-probe.after.json'),
          'utf8'
        )
      ),
      'D13-04-before': JSON.parse(
        await readFile(path.join(evidenceDir, 'readiness-probe.before.json'), 'utf8')
      ),
      'D13-04-after': JSON.parse(
        await readFile(path.join(evidenceDir, 'readiness-probe.after.json'), 'utf8')
      )
    },
    baselineDrift: JSON.parse(
      await readFile(path.join(evidenceDir, 'baseline-drift.json'), 'utf8')
    ),
    requirementMapSummary: JSON.parse(
      await readFile(path.join(evidenceDir, 'requirements-map.json'), 'utf8')
    ).coverage,
    frozenContracts: {
      m1: 'docs/02_spec/prod20260913_m1_corrections_contract.md'
    },
    decisionBriefCorrections: [
      'D13-03 factual claim corrected in docs/01_prd/aaa_decision_brief.md section 2 and comparison table; alternatives A/B/C preserved'
    ],
    workingTreeDirty: status.length > 0,
    limitations: [
      'evidence reuse limited to files byte-identical to the audit manifest (2525/2531; 6 registry docs changed by the planning publication, 0 product files)',
      'UI race negative not re-executed by PROD-01; preserved audit evidence and its regression conversion planned in PROD-03',
      'no self-approval: independent review required before VERIFIED/DONE'
    ]
  }
  await writeFile(
    path.join(evidenceDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  )
  console.log(
    JSON.stringify(
      { files: files.length, contract: hashes['docs/02_spec/prod20260913_m1_corrections_contract.md'] },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
