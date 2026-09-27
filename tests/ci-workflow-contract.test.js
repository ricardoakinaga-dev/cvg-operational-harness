import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CI_BAR_GATES } from '../scripts/ci-bar-contract.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflow = fs.readFileSync(
  path.join(rootDir, '.github/workflows/verify.yml'),
  'utf8'
)

function independentInventoryScript() {
  const job = workflow
    .split('  provenance-verify:')[1]
    ?.split('  provenance-policy:')[0]
  const block = job?.match(
    /          python3 - <<'PY'\n([\s\S]*?)          PY\n/
  )
  if (!block) throw new Error('independent inventory verifier is missing')
  return block[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
}

describe('controlled CI workflow contract', () => {
  it('declares least-privilege and stale-run protection', () => {
    expect(workflow).toContain('permissions:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('concurrency:')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('persist-credentials: false')
    // PR-010: the runner context is invalid in job-level env and made GitHub
    // reject the whole workflow before any gate ran.
    const jobEnv = workflow.split('\n    services:')[0]
    expect(jobEnv).not.toContain('runner.')
    expect(workflow).toContain('CI_ARTIFACT_DIR=${RUNNER_TEMP}/cvg-ci/')
  })

  it('calls every available construction gate explicitly', () => {
    expect(workflow).toContain('node-version-file: .nvmrc')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate install')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate readiness')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate postgres')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate e2e')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate worker-startup')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate coverage-critical')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate mutation')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate skip')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate load')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate restore')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate image')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate certify')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate diff')
    expect(workflow).toContain('actions/upload-artifact')
    expect(workflow).toContain('if-no-files-found: error')
  })

  it('binds every gate to a runner step output and verifies the attested manifest in another job', () => {
    for (const gate of CI_BAR_GATES) {
      if (gate.id === 'artifacts') continue
      expect(workflow).toContain(`id: gate_${gate.id.replaceAll('-', '_')}`)
    }
    expect(
      workflow.match(/CI_BAR_STEPS_JSON: \$\{\{ toJSON\(steps\) \}\}/g)
    ).toHaveLength(2)
    expect(workflow).toContain('id: finalize')
    expect(workflow).toContain(
      'manifest_sha256: ${{ steps.finalize.outputs.manifest_sha256 }}'
    )
    expect(workflow).toContain('needs: verify')
    expect(workflow).toContain('needs: [verify, attest]')
    expect(workflow).toContain(
      'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'
    )
    expect(workflow).toContain(
      '--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/verify.yml"'
    )
    expect(workflow).toContain('--source-digest "$GITHUB_SHA"')
    const independentVerifier = workflow
      .split('      - name: Verify subject, signer and source commit')[1]
      ?.split('        run: |')[0]
    expect(independentVerifier).toContain('GH_TOKEN: ${{ github.token }}')
    expect(workflow).toContain('retention-days: 90')
    expect(workflow).toContain('include-hidden-files: true')
    expect(workflow).toContain("actual_files == manifest['artifactHashes']")
    expect(workflow).toContain("actual != manifest['artifactHashes']")
    expect(workflow).toContain('provenance-policy:')
    expect(workflow).toContain('name: Provenance policy')
    expect(workflow).toContain('needs: [verify, attest, provenance-verify]')
    expect(workflow).toContain('if: always()')
    expect(workflow).toContain(
      'github.event.pull_request.head.repo.full_name != github.repository'
    )
    expect(workflow).toContain('Sealed provenance is incomplete or failed.')
    const approved = workflow.match(
      /approved_gates = set\('([^']+)'\.split\(\)\)/
    )?.[1]
    expect(approved?.split(' ').sort()).toEqual(
      CI_BAR_GATES.filter((gate) => gate.id !== 'artifacts')
        .map((gate) => gate.id)
        .sort()
    )
  })

  it('runs the independent artifact inventory verifier against changed bytes and extra files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-ci-download-'))
    try {
      const artifactDir = path.join(directory, 'ci-artifacts')
      fs.mkdirSync(artifactDir)
      const evidence = Buffer.from('synthetic CI log')
      fs.writeFileSync(path.join(artifactDir, 'runtime.txt'), evidence)
      fs.writeFileSync(
        path.join(artifactDir, 'ci-bar-manifest.json'),
        JSON.stringify({
          artifactFiles: ['runtime.txt'],
          artifactHashes: [
            {
              path: 'runtime.txt',
              sha256: createHash('sha256').update(evidence).digest('hex'),
              size: evidence.length
            }
          ]
        })
      )
      const run = () =>
        spawnSync('python3', ['-c', independentInventoryScript()], {
          cwd: directory,
          encoding: 'utf8'
        })
      expect(run().status).toBe(0)
      fs.appendFileSync(path.join(artifactDir, 'runtime.txt'), 'changed')
      expect(run().status).toBe(1)
      fs.writeFileSync(path.join(artifactDir, 'runtime.txt'), evidence)
      fs.writeFileSync(path.join(artifactDir, 'extra.txt'), 'unexpected')
      expect(run().status).toBe(1)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
