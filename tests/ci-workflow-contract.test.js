import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CI_BAR_GATES, CI_BAR_SCOPE } from '../scripts/ci-bar-contract.mjs'

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
    const approvedScope = workflow.match(
      /approved_scope = json\.loads\('([^']+)'\)/
    )?.[1]
    expect(JSON.parse(approvedScope ?? 'null')).toEqual(CI_BAR_SCOPE)
    expect(workflow).toContain("'scope_mismatch'")
  })

  it('keeps the required check name and never builds or tests the product (HISO-010)', () => {
    expect(workflow).toContain('    name: REM21 CI bar (Node 22)\n')
    expect(workflow).not.toMatch(
      /(?:test|build):shift-assistant|@cvg\/shift-assistant|vitest run\s+products\//
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

const productWorkflowPath = '.github/workflows/product-shift-assistant.yml'
const productWorkflow = fs.readFileSync(
  path.join(rootDir, productWorkflowPath),
  'utf8'
)

function workspaceDirectories() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
  )
  const byName = new Map()
  for (const pattern of manifest.workspaces) {
    const parent = path.join(rootDir, pattern.replace(/\/\*$/, ''))
    if (!fs.existsSync(parent)) continue
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      const file = path.join(parent, entry.name, 'package.json')
      if (!entry.isDirectory() || !fs.existsSync(file)) continue
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      byName.set(pkg.name, {
        directory: path.relative(rootDir, path.dirname(file)),
        dependencies: Object.keys(pkg.dependencies ?? {})
      })
    }
  }
  return byName
}

function productDependencyClosure(productName) {
  const workspaces = workspaceDirectories()
  const seen = new Set()
  const visit = (name) => {
    const workspace = workspaces.get(name)
    if (!workspace || seen.has(workspace.directory)) return
    seen.add(workspace.directory)
    for (const dependency of workspace.dependencies) visit(dependency)
  }
  visit(productName)
  return [...seen].sort()
}

function triggerPaths(event) {
  const block = productWorkflow
    .split(/\n(?=\S)/)
    .find((section) => section.startsWith('on:'))
    ?.split(new RegExp(`\\n  ${event}:\\n`))[1]
    ?.split(/\n  \S/)[0]
  const list = block?.split('    paths:\n')[1] ?? ''
  return [...list.matchAll(/^      - '([^']+)'$/gm)].map((match) => match[1])
}

describe('product workflow contract (HISO-010)', () => {
  it('declares least privilege, stale-run cancellation and pinned actions', () => {
    expect(productWorkflow).toMatch(/^permissions:\n  contents: read\n/m)
    expect(productWorkflow).not.toMatch(/:\s*write\b/)
    expect(productWorkflow).not.toContain('id-token')
    expect(productWorkflow).not.toContain('secrets.')
    expect(productWorkflow).toMatch(
      /^concurrency:\n  group: product-shift-assistant-.+\n  cancel-in-progress: true\n/m
    )
    expect(productWorkflow).not.toContain('continue-on-error')
    const uses = [...productWorkflow.matchAll(/uses: (\S+)@(\S+)(.*)/g)]
    expect(uses.length).toBeGreaterThan(0)
    for (const [, action, ref, comment] of uses) {
      expect(ref).toMatch(/^[0-9a-f]{40}$/)
      expect(comment).toMatch(/^ # v\d+/)
      // Same reviewed pin as the harness workflow for every shared action.
      const harnessPin = workflow.match(
        new RegExp(`uses: ${action.replace('/', '\\/')}@([0-9a-f]{40})`)
      )?.[1]
      if (harnessPin) expect(ref).toBe(harnessPin)
    }
    const checkouts = productWorkflow.match(/uses: actions\/checkout@/g) ?? []
    expect(
      productWorkflow.match(/persist-credentials: false/g) ?? []
    ).toHaveLength(checkouts.length)
    expect(productWorkflow).toContain('node-version-file: .nvmrc')
    expect(productWorkflow).toMatch(/timeout-minutes: \d+/)
    for (const job of productWorkflow
      .split('\njobs:\n')[1]
      .split(/\n(?=  [a-z][\w-]*:\n)/)) {
      expect(job).toMatch(/\n    timeout-minutes: \d+\n/)
    }
  })

  it('triggers on the product, its workspace closure and dependency manifests', () => {
    const pullRequest = triggerPaths('pull_request')
    const push = triggerPaths('push')
    expect(pullRequest.length).toBeGreaterThan(0)
    expect(push).toEqual(pullRequest)
    expect(productWorkflow).toMatch(
      /\n  push:\n    branches:\n      - main\n      - master\n/
    )
    const closure = productDependencyClosure('@cvg/shift-assistant')
    expect(closure).toContain('products/shift-assistant')
    expect(closure).toContain('packages/model-gateway')
    for (const directory of closure) {
      expect(pullRequest).toContain(`${directory}/**`)
    }
    for (const required of [
      productWorkflowPath,
      'package.json',
      'package-lock.json',
      '.nvmrc',
      'vitest.config.mts',
      'tsconfig.base.json',
      'scripts/build-public-workspace.mjs'
    ]) {
      expect(pullRequest).toContain(required)
    }
  })

  it('builds and tests only the product, with its own report, and runs no harness gate', () => {
    const npmRuns = [...productWorkflow.matchAll(/npm run ([\w:-]+)/g)].map(
      (match) => match[1]
    )
    expect([...new Set(npmRuns)].sort()).toEqual([
      'build:shift-assistant',
      'test:shift-assistant'
    ])
    expect(productWorkflow).toContain('run: npm ci --ignore-scripts')
    expect(productWorkflow).not.toMatch(/\bnpm test\b/)
    expect(productWorkflow).not.toContain('scripts/ci-bar.mjs')
    expect(productWorkflow).not.toMatch(
      /test:core|test:coverage|certify|test:postgres|test:e2e|CVG_TEST_SCOPE/
    )
    expect(productWorkflow).toContain(
      'npx prettier --check products/shift-assistant'
    )
    expect(productWorkflow).toContain('npx eslint products/shift-assistant')
    expect(productWorkflow).toContain(
      '--outputFile="$RUNNER_TEMP/shift-assistant/test-report.json"'
    )
    expect(productWorkflow).toContain("owner: 'shift-assistant'")
    expect(productWorkflow).toContain(
      "!file.startsWith('products/shift-assistant/')"
    )
    expect(productWorkflow).toContain('if-no-files-found: error')
    expect(productWorkflow).toContain(
      '--file products/shift-assistant/deploy/Dockerfile'
    )
    expect(productWorkflow).not.toMatch(/docker (?:push|login)/)
  })
})
