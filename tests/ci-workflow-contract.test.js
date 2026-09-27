import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflow = fs.readFileSync(
  path.join(rootDir, '.github/workflows/verify.yml'),
  'utf8'
)

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
    expect(workflow).toContain('node scripts/ci-bar.mjs gate coverage-web')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate coverage-postgres')
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
})
