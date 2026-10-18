import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { CI_BAR_SCOPE } from '../scripts/ci-bar-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidence = path.join(root, 'docs/04_audit/evidence/PR009-20260927-r2')
const proof = JSON.parse(fs.readFileSync(path.join(evidence, 'proof.json')))
const gate = JSON.parse(
  fs.readFileSync(path.join(evidence, 'e2e-gate-entry.json'))
)

function finalizeWith(
  hashes,
  {
    corruptXml = false,
    corruptLog = false,
    replaceExecutionId,
    extraGates = [],
    scope
  } = {}
) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cvg-ci-e2e-finalizer-')
  )
  try {
    fs.mkdirSync(path.join(directory, 'gates'), { recursive: true })
    const log = gunzipSync(fs.readFileSync(path.join(evidence, 'e2e.log.gz')))
    fs.writeFileSync(
      path.join(directory, 'gates/e2e.log'),
      corruptLog ? Buffer.concat([log, Buffer.from('\n')]) : log
    )
    const artifactSha256 = { ...hashes }
    for (const [name, relativePath] of [
      ['e2e-test-report.json', 'certification/e2e-test-report.json'],
      ['playwright-results.xml', 'playwright-results.xml']
    ]) {
      const target = path.join(directory, 'gate-outputs/e2e', relativePath)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      let bytes = fs.readFileSync(path.join(evidence, name))
      if (replaceExecutionId) {
        bytes = Buffer.from(
          bytes
            .toString('utf8')
            .replaceAll(proof.executionId, replaceExecutionId)
        )
        artifactSha256[relativePath] = createHash('sha256')
          .update(bytes)
          .digest('hex')
      }
      fs.writeFileSync(
        target,
        corruptXml && name === 'playwright-results.xml'
          ? Buffer.concat([bytes, Buffer.from('\n')])
          : bytes
      )
    }
    fs.writeFileSync(
      path.join(directory, 'ci-bar-state.json'),
      JSON.stringify({
        scope,
        runId: proof.runId,
        candidateId: proof.candidateId,
        nodeVersion: '22.23.2',
        npmVersion: '10',
        startedAt: new Date().toISOString(),
        candidateFiles: [],
        gates: [
          {
            ...gate,
            executionId: replaceExecutionId ?? gate.executionId,
            artifactSha256
          },
          ...extraGates
        ]
      })
    )
    const observed = spawnSync(
      process.execPath,
      ['scripts/ci-bar.mjs', 'finalize'],
      {
        cwd: root,
        env: { ...process.env, CI_ARTIFACT_DIR: directory },
        encoding: 'utf8'
      }
    )
    expect(observed.status).toBe(1) // The other CI gates are absent in this fixture.
    return JSON.parse(observed.stdout).failures
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

describe('ci-bar E2E snapshot finalization', () => {
  it('checks both required snapshot hashes', () => {
    const failures = finalizeWith(gate.artifactSha256)
    expect(failures).not.toContain('e2e_snapshot_binding_missing')
    expect(
      failures.some((item) => item.startsWith('e2e_snapshot_hash_mismatch:'))
    ).toBe(false)
    const corrupt = finalizeWith(gate.artifactSha256, { corruptXml: true })
    expect(corrupt).toContain(
      'e2e_snapshot_hash_mismatch:playwright-results.xml'
    )
  })

  it('rejects empty, incomplete and extra E2E hash maps', () => {
    const maps = [
      {},
      {
        'certification/e2e-test-report.json':
          gate.artifactSha256['certification/e2e-test-report.json']
      },
      { ...gate.artifactSha256, unexpected: 'a'.repeat(64) }
    ]
    for (const hashes of maps) {
      const failures = finalizeWith(hashes)
      expect(failures).toContain('e2e_snapshot_binding_missing')
    }
  })

  it('rejects log tampering and a coherent replacement of both report UUIDs', () => {
    expect(finalizeWith(gate.artifactSha256, { corruptLog: true })).toContain(
      'e2e_log_hash_mismatch'
    )
    const failures = finalizeWith(gate.artifactSha256, {
      replaceExecutionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    })
    expect(failures).toContain(
      'e2e_final_binding_invalid:gate log/report/state execution mismatch'
    )
    expect(failures).not.toContain('e2e_snapshot_binding_missing')
    expect(
      failures.some((item) => item.startsWith('e2e_snapshot_hash_mismatch:'))
    ).toBe(false)
  })

  it('rejects a run state that does not carry the core-only harness scope', () => {
    expect(finalizeWith(gate.artifactSha256)).toContain('scope_mismatch')
    expect(
      finalizeWith(gate.artifactSha256, {
        scope: { ...CI_BAR_SCOPE, testScope: 'all' }
      })
    ).toContain('scope_mismatch')
    expect(
      finalizeWith(gate.artifactSha256, { scope: CI_BAR_SCOPE })
    ).not.toContain('scope_mismatch')
  })

  it('rejects a PASS gate copied from a different run', () => {
    const failures = finalizeWith(gate.artifactSha256, {
      extraGates: [
        {
          id: 'typecheck',
          status: 'PASS',
          exitCode: 0,
          runId: 'stale-run',
          candidateId: proof.candidateId,
          nodeVersion: '22.23.2',
          outputFailures: []
        }
      ]
    })
    expect(failures).toContain('gate_run_binding_mismatch:typecheck')
  })
})
