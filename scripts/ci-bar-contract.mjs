export const CI_BAR_VERSION = 'rem21-014-v1'

const npm = (...args) => ['npm', args]
const shell = (command) => ['sh', ['-c', command]]
export const CI_BAR_GATES = [
  { id: 'runtime', marker: 'node scripts/ci-bar.mjs init', command: null },
  {
    id: 'install',
    marker: 'node scripts/ci-bar.mjs gate install',
    command: npm('ci', '--ignore-scripts')
  },
  {
    id: 'readiness',
    marker: 'node scripts/ci-bar.mjs gate readiness',
    command: npm('run', 'readiness')
  },
  {
    id: 'format',
    marker: 'node scripts/ci-bar.mjs gate format',
    command: npm('run', 'format:check')
  },
  {
    id: 'typecheck',
    marker: 'node scripts/ci-bar.mjs gate typecheck',
    command: npm('run', 'typecheck')
  },
  {
    id: 'lint',
    marker: 'node scripts/ci-bar.mjs gate lint',
    command: npm('run', 'lint')
  },
  {
    id: 'build',
    marker: 'node scripts/ci-bar.mjs gate build',
    command: npm('run', 'build')
  },
  {
    id: 'unit',
    marker: 'node scripts/ci-bar.mjs gate unit',
    command: npm(
      'test',
      '--',
      '--reporter=default',
      '--reporter=json',
      '--outputFile=certification/unit-test-report.json'
    ),
    artifacts: ['certification/unit-test-report.json']
  },
  {
    id: 'coverage',
    marker: 'node scripts/ci-bar.mjs gate coverage',
    command: npm('run', 'test:coverage'),
    artifacts: ['coverage/coverage-summary.json']
  },
  {
    id: 'coverage-critical',
    marker: 'node scripts/ci-bar.mjs gate coverage-critical',
    command: npm('run', 'coverage:critical'),
    artifacts: ['certification/critical-coverage.json']
  },
  {
    id: 'mutation',
    marker: 'node scripts/ci-bar.mjs gate mutation',
    command: npm('run', 'mutation:guard'),
    artifacts: ['certification/mutation-guard.json']
  },
  {
    id: 'skip',
    marker: 'node scripts/ci-bar.mjs gate skip',
    command: npm('run', 'skip:governance'),
    artifacts: ['certification/skip-inventory.json']
  },
  {
    id: 'worker-startup',
    marker: 'node scripts/ci-bar.mjs gate worker-startup',
    command: npm('run', 'test:worker:startup')
  },
  {
    id: 'postgres',
    marker: 'node scripts/ci-bar.mjs gate postgres',
    command: npm(
      'run',
      'test:postgres',
      '--',
      '--reporter=default',
      '--reporter=json',
      '--outputFile=certification/postgres-test-report.json'
    ),
    artifacts: ['certification/postgres-test-report.json'],
    skipPolicy: 'none'
  },
  {
    id: 'postgres-proof',
    marker: 'node scripts/ci-bar.mjs gate postgres-proof',
    command: npm('run', 'test:postgres:proof'),
    artifacts: ['certification/rem21-010-postgres-proof.json'],
    skipPolicy: 'none'
  },
  {
    id: 'observability-proof',
    marker: 'node scripts/ci-bar.mjs gate observability-proof',
    command: npm('run', 'test:observability:proof'),
    artifacts: ['certification/rem21-011-observability-proof.json'],
    skipPolicy: 'none'
  },
  {
    id: 'phase2',
    marker: 'node scripts/ci-bar.mjs gate phase2',
    command: npm('run', 'verify:phase2')
  },
  {
    id: 'phase3',
    marker: 'node scripts/ci-bar.mjs gate phase3',
    command: npm('run', 'verify:phase3')
  },
  {
    id: 'phase4a',
    marker: 'node scripts/ci-bar.mjs gate phase4a',
    command: npm('run', 'test:phase4a')
  },
  {
    id: 'phase4a-identity',
    marker: 'node scripts/ci-bar.mjs gate phase4a-identity',
    command: npm('run', 'verify:phase4a:identity')
  },
  {
    id: 'chaos',
    marker: 'node scripts/ci-bar.mjs gate chaos',
    command: npm(
      'run',
      'test:chaos',
      '--',
      '--reporter=default',
      '--reporter=json',
      '--outputFile=certification/chaos-report.json'
    ),
    artifacts: ['certification/chaos-report.json'],
    skipPolicy: 'none'
  },
  {
    id: 'evals',
    marker: 'node scripts/ci-bar.mjs gate evals',
    command: npm('run', 'evals:bar'),
    artifacts: ['certification/agent-eval-report.json']
  },
  {
    id: 'load',
    marker: 'node scripts/ci-bar.mjs gate load',
    command: npm('run', 'test:load'),
    artifacts: ['certification/load-report.json']
  },
  {
    id: 'restore',
    marker: 'node scripts/ci-bar.mjs gate restore',
    command: npm('run', 'test:restore'),
    artifacts: ['certification/restore-report.json']
  },
  {
    id: 'docs',
    marker: 'node scripts/ci-bar.mjs gate docs',
    command: npm('run', 'docs:check-links')
  },
  {
    id: 'e2e',
    marker: 'node scripts/ci-bar.mjs gate e2e',
    command: shell('node scripts/run-e2e-evidence.mjs'),
    artifacts: ['certification/e2e-test-report.json', 'playwright-results.xml'],
    skipPolicy: 'none'
  },
  {
    id: 'browser-proof',
    marker: 'node scripts/ci-bar.mjs gate browser-proof',
    command: npm('run', 'test:e2e:rem21-014'),
    artifacts: ['certification/rem21-014-browser-proof.json'],
    skipPolicy: 'none'
  },
  {
    id: 'image',
    marker: 'node scripts/ci-bar.mjs gate image',
    command: ['docker', ['build']],
    artifacts: ['certification/runtime-image.json']
  },
  {
    id: 'sbom',
    marker: 'node scripts/ci-bar.mjs gate sbom',
    command: npm('run', 'sbom'),
    artifacts: ['certification/sbom.cyclonedx.json']
  },
  {
    id: 'licenses',
    marker: 'node scripts/ci-bar.mjs gate licenses',
    command: npm('run', 'licenses:check'),
    artifacts: ['certification/license-report.json']
  },
  {
    id: 'security',
    marker: 'node scripts/ci-bar.mjs gate security',
    command: npm('run', 'audit:security')
  },
  {
    id: 'certify',
    marker: 'node scripts/ci-bar.mjs gate certify',
    command: npm('run', 'certify'),
    artifacts: [
      'certification/phase10-result.json',
      'certification/manifest.json',
      'certification/candidate-manifest.json'
    ]
  },
  {
    id: 'certification-verify',
    marker: 'node scripts/ci-bar.mjs gate certification-verify',
    command: npm('run', 'certification:verify')
  },
  {
    id: 'diff',
    marker: 'node scripts/ci-bar.mjs gate diff',
    command: npm('run', 'diff:check')
  },
  {
    id: 'artifacts',
    marker: 'node scripts/ci-bar.mjs gate artifacts',
    command: null
  }
]

const REQUIRED_PACKAGE_SCRIPTS = [
  'format:check',
  'typecheck',
  'lint',
  'build',
  'test',
  'test:coverage',
  'coverage:critical',
  'mutation:guard',
  'skip:governance',
  'test:worker:startup',
  'test:postgres',
  'test:postgres:proof',
  'test:observability:proof',
  'verify:phase2',
  'verify:phase3',
  'test:phase4a',
  'verify:phase4a',
  'verify:phase4a:identity',
  'test:chaos',
  'test:evals',
  'evals:report',
  'evals:bar',
  'test:load',
  'test:restore',
  'diff:check',
  'docs:check-links',
  'test:e2e',
  'test:e2e:rem21-014',
  'audit:security',
  'sbom',
  'licenses:check',
  'certify',
  'certification:verify'
]

function addFailure(failures, value) {
  if (!failures.includes(value)) failures.push(value)
}

function workflowHasMarker(workflow, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?:^|\\n)\\s*(?:run:\\s*)?${escaped}(?:\\s*(?:#.*)?)?\\s*(?:\\n|$)`
  ).test(workflow)
}

export function validateCiBarContract({
  workflow,
  nvmrc,
  packageJson,
  dockerfile
}) {
  const failures = []
  const nodeVersion = nvmrc.trim()

  if (!/^22\.\d+\.\d+$/.test(nodeVersion)) {
    addFailure(failures, 'runtime_not_node22')
  }
  if (packageJson?.engines?.node !== '>=22 <23') {
    addFailure(failures, 'package_engine_not_node22')
  }
  if (!workflow.includes('node-version-file: .nvmrc')) {
    addFailure(failures, 'workflow_not_using_nvmrc')
  }
  if (!workflow.includes('node --version')) {
    addFailure(failures, 'runtime_version_not_recorded')
  }
  if (!/FROM node:22(?:[.\w-]+)?@sha256:[0-9a-f]{64}/m.test(dockerfile)) {
    addFailure(failures, 'docker_runtime_not_node22')
  }
  if (!/FROM node:22(?:[.\w-]+)?@sha256:[0-9a-f]{64}/m.test(dockerfile)) {
    addFailure(failures, 'docker_runtime_not_pinned')
  }

  for (const gate of CI_BAR_GATES) {
    if (!workflowHasMarker(workflow, gate.marker)) {
      addFailure(failures, `missing_gate:${gate.id}`)
    }
  }

  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    if (typeof packageJson?.scripts?.[script] !== 'string') {
      addFailure(failures, `missing_package_script:${script}`)
    }
  }

  if (
    workflow.includes('npm run verify') &&
    workflow.match(/node scripts\/ci-bar\.mjs gate /g)?.length !==
      CI_BAR_GATES.length
  ) {
    addFailure(failures, 'aggregator_only')
  }
  if (!workflow.includes('CI_RUN_ID')) {
    addFailure(failures, 'run_id_not_bound')
  } else if (!workflow.includes('CI_RUN_ID: run-')) {
    addFailure(failures, 'run_id_not_certifiable')
  }
  if (!workflow.includes('CI_ARTIFACT_DIR')) {
    addFailure(failures, 'artifact_directory_not_bound')
  }
  if (!workflow.includes('actions/upload-artifact')) {
    addFailure(failures, 'artifact_upload_missing')
  }
  if (!workflow.includes('if-no-files-found: error')) {
    addFailure(failures, 'artifacts_not_fail_closed')
  }
  if (!workflow.includes('if: always()')) {
    addFailure(failures, 'artifact_collection_not_unconditional')
  }
  if (workflow.includes('continue-on-error: true')) {
    addFailure(failures, 'blocking_gate_allows_continue')
  }
  if (!workflow.includes('services:')) {
    addFailure(failures, 'postgres_service_missing')
  }
  if (!workflow.includes('persist-credentials: false')) {
    addFailure(failures, 'checkout_credentials_persisted')
  }

  return { pass: failures.length === 0, failures }
}

function validWorkflowFixture() {
  return [
    'node-version-file: .nvmrc',
    'node --version',
    'CI_RUN_ID: run-${{ github.run_id }}-${{ github.run_attempt }}',
    'CI_ARTIFACT_DIR',
    'services:',
    'persist-credentials: false',
    'if: always()',
    'if-no-files-found: error',
    'actions/upload-artifact',
    ...CI_BAR_GATES.map((gate) => gate.marker)
  ].join('\n')
}

function validPackageFixture() {
  return {
    engines: { node: '>=22 <23' },
    scripts: Object.fromEntries(
      REQUIRED_PACKAGE_SCRIPTS.map((name) => [name, 'fixture'])
    )
  }
}

export function runCiBarContractSelfTest() {
  const base = {
    workflow: validWorkflowFixture(),
    nvmrc: '22.23.2\n',
    packageJson: validPackageFixture(),
    dockerfile: `FROM node:22.23.2-bookworm-slim@sha256:${'a'.repeat(64)}\n`
  }
  const cases = CI_BAR_GATES.map((gate) => ({
    id: `missing-gate-${gate.id}`,
    expected: `missing_gate:${gate.id}`,
    input: {
      ...base,
      workflow: base.workflow.replace(gate.marker, `${gate.marker}-disabled`)
    }
  }))
  cases.push(
    {
      id: 'wrong-runtime',
      expected: 'runtime_not_node22',
      input: { ...base, nvmrc: '24.0.0\n' }
    },
    {
      id: 'unbound-artifacts',
      expected: 'artifacts_not_fail_closed',
      input: {
        ...base,
        workflow: base.workflow.replace(
          'if-no-files-found: error',
          'if-no-files-found: warn'
        )
      }
    },
    {
      id: 'opaque-aggregator',
      expected: 'aggregator_only',
      input: {
        ...base,
        workflow: `${base.workflow.replaceAll(/node scripts\/ci-bar\.mjs gate [^\n]+/g, 'npm run verify')}\nnpm run verify`
      }
    }
  )
  const checks = cases.map((entry) => {
    const result = validateCiBarContract(entry.input)
    const rejected = result.failures.includes(entry.expected)
    return {
      id: entry.id,
      expected: entry.expected,
      observed: rejected ? 'REJECTED' : 'NOT_REJECTED',
      verdict: rejected ? 'PASS' : 'FAIL',
      failures: result.failures
    }
  })
  return {
    schemaVersion: 1,
    kind: 'rem21-008-ci-bar-contract-self-test',
    checks,
    verdict: checks.every((check) => check.verdict === 'PASS') ? 'PASS' : 'FAIL'
  }
}
