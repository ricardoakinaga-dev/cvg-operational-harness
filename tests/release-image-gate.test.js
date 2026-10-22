// @vitest-environment node
// SPEC0253 P3/L5 (RELEASE-CI-0253-20261021): release gate decision, package
// probe classification and the gate CLI, over fixtures in the exact layout
// the workflow writes to $RUNNER_TEMP/release-gate/.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROBE_ACCEPT,
  REQUIRED_CHECKS
} from '../scripts/release-image-contract.mjs'
import {
  classifyPackageProbe,
  evaluateReleaseGate,
  loadGateInputs
} from '../scripts/release-image-gate.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gateScript = path.join(root, 'scripts/release-image-gate.mjs')
const fixtureDir = path.join(root, 'tests/fixtures/release-image/gate-24cdb463')
const publishedOverlay = path.join(
  root,
  'tests/fixtures/release-image/gate-published-overlay'
)
const S = '24cdb463faa1010da5fd78b6d923950ac2741713'
const HEAD = 'b7519a384ea1b0195a53c4f5a03efda97314a4ce'
const REPO = 'ricardoakinaga-dev/cvg-operational-harness'
const VERIFY_SUITE = '107249000371'
const SECURITY_SUITE = '107249000486'
const PR_VERIFY_SUITE = '107209420265'
const PR_SECURITY_SUITE = '107209420311'
const PUBLISHED_DIGEST = `sha256:${'0253'.repeat(16)}`
const JOB_TOKEN = 'FAKE-JOB-TOKEN-0253'
const REGISTRY_TOKEN = 'FAKE-REGISTRY-TOKEN-0253'

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function tempDir(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporary.push(directory)
  return directory
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function rawProbe(overlay = false) {
  return readJson(
    path.join(overlay ? publishedOverlay : fixtureDir, 'probe.json')
  )
}

function classify(raw) {
  const { tag, ...rest } = raw
  return classifyPackageProbe({ tagName: tag, ...rest })
}

function base() {
  return structuredClone(loadGateInputs(fixtureDir))
}

function published() {
  const directory = tempDir('cvg-release-gate-published-')
  fs.cpSync(fixtureDir, directory, { recursive: true })
  fs.cpSync(publishedOverlay, directory, { recursive: true })
  return structuredClone(loadGateInputs(directory))
}

function withProbe(inputs, mutate) {
  const raw = rawProbe(inputs.probe.tag === 'present')
  mutate(raw)
  inputs.probe = classify(raw)
  return inputs
}

function decide(inputs) {
  return evaluateReleaseGate(inputs)
}

function checkRun(inputs, suite, name, map = 'mainSuiteCheckRuns') {
  const run = inputs[map][suite].find((entry) => entry.name === name)
  if (!run) throw new Error(`fixture check-run missing: ${suite}/${name}`)
  return run
}

function ownerSuite(context) {
  return REQUIRED_CHECKS.find((check) => check.context === context).workflow ===
    '.github/workflows/verify.yml'
    ? VERIFY_SUITE
    : SECURITY_SUITE
}

function prOwnerSuite(context) {
  return ownerSuite(context) === VERIFY_SUITE
    ? PR_VERIFY_SUITE
    : PR_SECURITY_SUITE
}

describe('SPEC0253 P3: real 24cdb463 fixture', () => {
  it('publishes the merged main SHA with the user-created private package and sha-S absent', () => {
    const inputs = base()
    expect(inputs.probe).toMatchObject({ package: 'ok', tag: 'absent' })
    const result = decide(inputs)
    expect(result.reasons).toEqual([])
    expect(result.decision).toBe('publish')
    expect(result.sha).toBe(S)
    expect(result.pr).toMatchObject({
      number: 13,
      headSha: HEAD,
      mergeCommitSha: S
    })
    expect(
      result.checks.main.map((check) => [check.context, check.appId]).sort()
    ).toEqual(
      REQUIRED_CHECKS.map((check) => [check.context, check.appId]).sort()
    )
    expect(result.checks.main.every((c) => c.conclusion === 'success')).toBe(
      true
    )
    expect(
      result.checks.pr
        .map((check) => check.checkSuiteId)
        .sort((left, right) => left - right)
    ).toEqual([
      Number(PR_VERIFY_SUITE),
      ...Array(4).fill(Number(PR_SECURITY_SUITE))
    ])
    expect(result.protection).toEqual(
      REQUIRED_CHECKS.map((check) => ({
        context: check.context,
        app_id: check.appId
      }))
    )
  })
})

describe('SPEC0253 P3: rule 1 payload and rule 2 current commit', () => {
  it.each([
    ['event pull_request', (i) => (i.workflowRun.event = 'pull_request')],
    [
      'fork repository',
      (i) => (i.workflowRun.head_repository.full_name = 'fork/cvg')
    ],
    ['other head branch', (i) => (i.workflowRun.head_branch = 'feature')],
    ['githubRef not main', (i) => (i.githubRef = 'refs/heads/feature')],
    ['failed triggering run', (i) => (i.workflowRun.conclusion = 'failure')]
  ])('refuses %s', (_label, mutate) => {
    const inputs = base()
    mutate(inputs)
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('is superseded when main moved past the run head_sha', () => {
    const inputs = base()
    inputs.workflowRun.head_sha = 'f'.repeat(40)
    expect(decide(inputs).decision).toBe('superseded')
  })
})

describe('SPEC0253 P3: rule 3 live protection', () => {
  it.each([
    [
      'extra context',
      (p) =>
        p.protection.required_status_checks.checks.push({
          context: 'extra',
          app_id: 15368
        })
    ],
    [
      'missing context',
      (p) => p.protection.required_status_checks.checks.pop()
    ],
    [
      'other app_id',
      (p) => (p.protection.required_status_checks.checks[1].app_id = 57789)
    ],
    ['protection disabled', (p) => (p.protection.enabled = false)],
    ['branch not protected', (p) => (p.protected = false)],
    [
      'enforcement not everyone',
      (p) =>
        (p.protection.required_status_checks.enforcement_level = 'non_admins')
    ]
  ])('refuses %s', (_label, mutate) => {
    const inputs = base()
    mutate(inputs.branchProtection)
    expect(decide(inputs).decision).toBe('refuse')
  })
})

describe('SPEC0253 P3: rules 4 and 5, push runs and required checks', () => {
  const contexts = REQUIRED_CHECKS.map((check) => check.context)
  const badConclusions = [
    'failure',
    'cancelled',
    'neutral',
    'skipped',
    'timed_out',
    'action_required'
  ]

  it.each(contexts)('refuses when %s is absent from its suite', (context) => {
    const inputs = base()
    const suite = ownerSuite(context)
    inputs.mainSuiteCheckRuns[suite] = inputs.mainSuiteCheckRuns[suite].filter(
      (run) => run.name !== context
    )
    expect(decide(inputs).decision).toBe('refuse')
  })

  it.each(
    contexts.flatMap((context) =>
      badConclusions.map((conclusion) => [context, conclusion])
    )
  )('refuses %s with conclusion %s', (context, conclusion) => {
    const inputs = base()
    checkRun(inputs, ownerSuite(context), context).conclusion = conclusion
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses a required check that is not completed', () => {
    const inputs = base()
    const run = checkRun(inputs, SECURITY_SUITE, 'image-scan')
    run.status = 'in_progress'
    run.conclusion = null
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('waits while Verify is still running after Security completed', () => {
    const inputs = base()
    const verify = inputs.pushRuns.find((run) => run.name === 'Verify')
    verify.status = 'in_progress'
    verify.conclusion = null
    expect(decide(inputs).decision).toBe('wait')
  })

  it('takes the newest attempt: newer failure over older success refuses', () => {
    const inputs = base()
    const old = checkRun(inputs, VERIFY_SUITE, 'REM21 CI bar (Node 22)')
    inputs.mainSuiteCheckRuns[VERIFY_SUITE].push({
      ...structuredClone(old),
      id: old.id + 1000,
      conclusion: 'failure'
    })
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('takes the newest attempt: newer success over older failure publishes', () => {
    const inputs = base()
    const old = checkRun(inputs, VERIFY_SUITE, 'REM21 CI bar (Node 22)')
    inputs.mainSuiteCheckRuns[VERIFY_SUITE].push({
      ...structuredClone(old),
      id: old.id + 1000
    })
    old.conclusion = 'failure'
    expect(decide(inputs).decision).toBe('publish')
  })

  it('does not let a schedule suite replace the push suite check', () => {
    const inputs = base()
    checkRun(inputs, SECURITY_SUITE, 'codeql').conclusion = 'failure'
    const security = inputs.pushRuns.find((run) => run.name === 'Security')
    inputs.pushRuns.push({
      ...structuredClone(security),
      id: security.id + 5,
      event: 'schedule',
      check_suite_id: 999000111
    })
    inputs.mainSuiteCheckRuns['999000111'] = [
      {
        ...structuredClone(checkRun(inputs, SECURITY_SUITE, 'codeql')),
        id: 999999999999,
        conclusion: 'success',
        check_suite: { id: 999000111 }
      }
    ]
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses when only CodeQL of app 57789 exists (exact name and app)', () => {
    const inputs = base()
    const codeql = checkRun(inputs, SECURITY_SUITE, 'codeql')
    codeql.name = 'CodeQL'
    codeql.app = { id: 57789, slug: 'github-advanced-security' }
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('matches the check name case-sensitively', () => {
    const inputs = base()
    checkRun(inputs, SECURITY_SUITE, 'codeql').name = 'CodeQL'
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('requires app id 15368 for the exact name', () => {
    const inputs = base()
    checkRun(inputs, SECURITY_SUITE, 'codeql').app = {
      id: 57789,
      slug: 'github-advanced-security'
    }
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses codeql of app 15368 found only in another suite', () => {
    const inputs = base()
    const codeql = checkRun(inputs, SECURITY_SUITE, 'codeql')
    inputs.mainSuiteCheckRuns[SECURITY_SUITE] = inputs.mainSuiteCheckRuns[
      SECURITY_SUITE
    ].filter((run) => run !== codeql)
    inputs.mainSuiteCheckRuns[VERIFY_SUITE].push({
      ...codeql,
      check_suite: { id: Number(VERIFY_SUITE) }
    })
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses a failed Verify run even when its check succeeded', () => {
    const inputs = base()
    inputs.pushRuns.find((run) => run.name === 'Verify').conclusion = 'failure'
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses two push runs of the same owner workflow', () => {
    const inputs = base()
    const security = inputs.pushRuns.find((run) => run.name === 'Security')
    inputs.pushRuns.push({ ...structuredClone(security), id: security.id + 1 })
    expect(decide(inputs).decision).toBe('refuse')
  })

  it.each([
    ['other path', (run) => (run.path = '.github/workflows/other.yml')],
    ['other branch', (run) => (run.head_branch = 'feature')],
    ['fork head repository', (run) => (run.head_repository.full_name = 'x/y')],
    ['other head sha', (run) => (run.head_sha = 'e'.repeat(40))]
  ])('refuses when the only owner push run has %s', (_label, mutate) => {
    const inputs = base()
    mutate(inputs.pushRuns.find((run) => run.name === 'Verify'))
    expect(decide(inputs).decision).toBe('refuse')
  })
})

describe('SPEC0253 P3: rules 6 and 7, merged PR and its head checks', () => {
  it.each([
    ['no PR', (pulls) => pulls.splice(0)],
    [
      'only an open PR',
      (pulls) => {
        pulls[0].merged_at = null
        pulls[0].state = 'open'
      }
    ],
    ['a closed unmerged PR', (pulls) => (pulls[0].merged_at = null)],
    ['base other than main', (pulls) => (pulls[0].base.ref = 'develop')],
    [
      'another merge commit',
      (pulls) => (pulls[0].merge_commit_sha = 'c'.repeat(40))
    ],
    [
      'head from a fork',
      (pulls) => (pulls[0].head.repo.full_name = 'fork/cvg')
    ],
    [
      'two valid merged PRs',
      (pulls) => pulls.push({ ...structuredClone(pulls[0]), number: 14 })
    ]
  ])('refuses %s', (_label, mutate) => {
    const inputs = base()
    mutate(inputs.pulls)
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('ignores an extra open PR that contains S (filter before count)', () => {
    const inputs = base()
    inputs.pulls.push({
      ...structuredClone(inputs.pulls[0]),
      number: 15,
      state: 'open',
      merged_at: null,
      merge_commit_sha: 'a'.repeat(40)
    })
    expect(decide(inputs).decision).toBe('publish')
  })

  it.each([
    [
      'missing',
      (runs) =>
        runs.splice(
          runs.findIndex((r) => r.name === 'Security'),
          1
        )
    ],
    [
      'failed',
      (runs) => (runs.find((r) => r.name === 'Verify').conclusion = 'failure')
    ],
    [
      'not completed',
      (runs) => (runs.find((r) => r.name === 'Verify').status = 'in_progress')
    ]
  ])('refuses a %s pull_request run on the PR head', (_label, mutate) => {
    const inputs = base()
    mutate(inputs.prRuns)
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('uses the newest pull_request run of each owner', () => {
    const inputs = base()
    const security = inputs.prRuns.find((run) => run.name === 'Security')
    inputs.prRuns.push({
      ...structuredClone(security),
      id: security.id + 10,
      conclusion: 'failure'
    })
    expect(decide(inputs).decision).toBe('refuse')
  })

  it.each(REQUIRED_CHECKS.map((check) => check.context))(
    'refuses when %s failed on the PR head suite',
    (context) => {
      const inputs = base()
      checkRun(
        inputs,
        prOwnerSuite(context),
        context,
        'prSuiteCheckRuns'
      ).conclusion = 'failure'
      expect(decide(inputs).decision).toBe('refuse')
    }
  )

  it('refuses when a required check is absent from the PR head suite', () => {
    const inputs = base()
    inputs.prSuiteCheckRuns[PR_SECURITY_SUITE] = inputs.prSuiteCheckRuns[
      PR_SECURITY_SUITE
    ].filter((run) => run.name !== 'secret-scan')
    expect(decide(inputs).decision).toBe('refuse')
  })
})

describe('SPEC0253 P3: rule 8 package and tag', () => {
  it.each([
    [
      'authenticated token DENIED',
      (p) =>
        (p.authToken = {
          status: 403,
          code: 'DENIED',
          tokenIssued: false,
          curlExit: 0
        })
    ],
    ['tags/list 401', (p) => Object.assign(p.tagsList, { status: 401 })],
    ['tags/list 403', (p) => Object.assign(p.tagsList, { status: 403 })],
    [
      'tags/list 404 NAME_UNKNOWN',
      (p) =>
        Object.assign(p.tagsList, {
          status: 404,
          code: 'NAME_UNKNOWN',
          tags: null
        })
    ],
    ['tags/list empty', (p) => (p.tagsList.tags = [])]
  ])(
    'refuses a missing or inaccessible package (%s), never publish',
    (_label, mutate) => {
      const inputs = withProbe(base(), mutate)
      expect(inputs.probe.package).toBe('missing_or_inaccessible')
      const result = decide(inputs)
      expect(result.decision).toBe('refuse')
      expect(result.reasons).toContain('package_missing_or_inaccessible')
    }
  )

  it('refuses the worst case: tags/list 404 even with manifest 404 MANIFEST_UNKNOWN', () => {
    const inputs = withProbe(base(), (p) => {
      p.tagsList = {
        status: 404,
        code: 'NAME_UNKNOWN',
        tags: null,
        pages: 1,
        curlExit: 0
      }
      p.manifest = {
        status: 404,
        code: 'MANIFEST_UNKNOWN',
        contentType: 'application/json',
        digest: null,
        curlExit: 0
      }
    })
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses a public package (anonymous token issued)', () => {
    const inputs = withProbe(base(), (p) => {
      p.anonymousToken = {
        status: 200,
        code: null,
        tokenIssued: true,
        curlExit: 0
      }
    })
    expect(inputs.probe.package).toBe('public')
    const result = decide(inputs)
    expect(result.decision).toBe('refuse')
    expect(result.reasons).toContain('package_public')
  })

  it.each(['authToken', 'tagsList', 'anonymousToken'])(
    'refuses 5xx on %s',
    (request) => {
      const inputs = withProbe(base(), (p) => {
        p[request] = {
          status: 503,
          code: null,
          tokenIssued: false,
          curlExit: 0
        }
      })
      expect(inputs.probe.package).toBe('error')
      expect(decide(inputs).decision).toBe('refuse')
    }
  )

  it.each(['authToken', 'tagsList', 'anonymousToken', 'manifest'])(
    'refuses a timeout on %s',
    (request) => {
      const inputs = withProbe(base(), (p) => {
        p[request].curlExit = 28
        p.timedOut = true
      })
      expect(decide(inputs).decision).toBe('refuse')
    }
  )

  it('refuses an anonymous answer that is neither a token nor DENIED', () => {
    const inputs = withProbe(base(), (p) => {
      p.anonymousToken = {
        status: 200,
        code: null,
        tokenIssued: false,
        curlExit: 0
      }
    })
    expect(inputs.probe.package).toBe('error')
    expect(decide(inputs).decision).toBe('refuse')
  })

  it.each([
    ['NAME_UNKNOWN', { status: 404, code: 'NAME_UNKNOWN' }],
    ['5xx', { status: 500, code: null }],
    ['401', { status: 401, code: 'UNAUTHORIZED' }],
    ['403', { status: 403, code: 'DENIED' }],
    ['406', { status: 406, code: 'MANIFEST_INVALID' }],
    ['unknown 404 code', { status: 404, code: 'BLOB_UNKNOWN' }],
    ['404 without code', { status: 404, code: null }]
  ])('classifies a %s manifest answer as tag error and refuses', (_l, m) => {
    const inputs = withProbe(base(), (p) => Object.assign(p.manifest, m))
    expect(inputs.probe).toMatchObject({ package: 'ok', tag: 'error' })
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('classifies sha-S listed in tags/list with manifest 404 as error', () => {
    const inputs = withProbe(base(), (p) => p.tagsList.tags.push(`sha-${S}`))
    expect(inputs.probe.tag).toBe('error')
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('classifies a manifest 200 with an index media type as present', () => {
    const probe = classify({
      ...rawProbe(),
      manifest: {
        status: 200,
        code: null,
        contentType: 'application/vnd.oci.image.index.v1+json',
        digest: PUBLISHED_DIGEST,
        curlExit: 0
      }
    })
    expect(probe).toMatchObject({
      package: 'ok',
      tag: 'present',
      digest: PUBLISHED_DIGEST
    })
  })

  it('refuses a present tag without a Docker-Content-Digest', () => {
    const inputs = withProbe(base(), (p) =>
      Object.assign(p.manifest, { status: 200, code: null, digest: null })
    )
    expect(inputs.probe.tag).toBe('error')
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('ignores placeholder and other sha tags when deciding on sha-S', () => {
    const inputs = withProbe(base(), (p) => {
      p.tagsList.tags = [
        'placeholder-20261022',
        `sha-${'1'.repeat(40)}`,
        `sha256-${'2'.repeat(64)}`
      ]
    })
    expect(decide(inputs).decision).toBe('publish')
  })

  it('refuses a probe for a tag other than sha-S', () => {
    const inputs = withProbe(base(), (p) => (p.tag = `sha-${'1'.repeat(40)}`))
    expect(decide(inputs).decision).toBe('refuse')
  })
})

describe('SPEC0253 P3: rule 8 post-condition (already_published)', () => {
  it('is already_published with the four verifications and anonymous DENIED', () => {
    const inputs = published()
    expect(inputs.probe).toMatchObject({ package: 'ok', tag: 'present' })
    const result = decide(inputs)
    expect(result.reasons).toEqual([])
    expect(result.decision).toBe('already_published')
    expect(result.digest).toBe(PUBLISHED_DIGEST)
  })

  it.each(['provenanceApi', 'provenanceOci', 'sbomApi', 'sbomOci'])(
    'refuses when %s exited non-zero',
    (name) => {
      const inputs = published()
      inputs.tag.verifications[name].exitCode = 1
      expect(decide(inputs).decision).toBe('refuse')
    }
  )

  it('refuses a tag with only the provenance verified', () => {
    const inputs = published()
    delete inputs.tag.verifications.sbomApi
    delete inputs.tag.verifications.sbomOci
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses a subject that is not the tag digest', () => {
    const inputs = published()
    inputs.tag.verifications.sbomOci.output[0].verificationResult.statement.subject[0].digest.sha256 =
      'e'.repeat(64)
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses a predicate type that does not match the verification', () => {
    const inputs = published()
    inputs.tag.verifications.sbomApi.output[0].verificationResult.statement.predicateType =
      'https://slsa.dev/provenance/v1'
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses an empty verification output', () => {
    const inputs = published()
    inputs.tag.verifications.provenanceOci.output = []
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses when the post-publication anonymous probe got a token', () => {
    const inputs = published()
    inputs.tag.anonymousPull = {
      status: 200,
      code: null,
      tokenIssued: true,
      curlExit: 0
    }
    expect(decide(inputs).decision).toBe('refuse')
  })

  it('refuses when the post-publication anonymous probe is missing', () => {
    const inputs = published()
    delete inputs.tag.anonymousPull
    expect(decide(inputs).decision).toBe('refuse')
  })
})

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [gateScript, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...env
    }
  })
}

function outputs(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1)
      ])
  )
}

function gateDir(...overlays) {
  const directory = tempDir('cvg-release-gate-cli-')
  const gate = path.join(directory, 'release-gate')
  fs.cpSync(fixtureDir, gate, { recursive: true })
  for (const overlay of overlays) {
    if (typeof overlay === 'string') {
      fs.cpSync(overlay, gate, { recursive: true })
    } else {
      overlay(gate)
    }
  }
  const githubOutput = path.join(directory, 'github-output')
  const summary = path.join(directory, 'step-summary')
  fs.writeFileSync(githubOutput, '')
  fs.writeFileSync(summary, '')
  return { directory, gate, githubOutput, summary }
}

describe('SPEC0253 L5: gate CLI end to end on the $RUNNER_TEMP/release-gate layout', () => {
  it('decides publish on the real fixture and exports the gate record', () => {
    const run = gateDir()
    const result = runCli(['decide', '--dir', run.gate], {
      GITHUB_OUTPUT: run.githubOutput,
      GITHUB_STEP_SUMMARY: run.summary
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    const out = outputs(run.githubOutput)
    expect(out).toMatchObject({ decision: 'publish', publish: 'true', sha: S })
    const record = JSON.parse(out.gate_record)
    expect(record.decision).toBe('publish')
    expect(record.checks.main).toHaveLength(5)
    expect(record.checks.pr).toHaveLength(5)
    const gateJson = readJson(path.join(run.gate, 'release-gate.json'))
    expect(gateJson.result.decision).toBe('publish')
    expect(JSON.stringify(gateJson)).not.toMatch(/"token"\s*:/i)
  })

  it('decides already_published with publish=false on the published overlay', () => {
    const run = gateDir(publishedOverlay)
    const result = runCli(['decide', '--dir', run.gate], {
      GITHUB_OUTPUT: run.githubOutput,
      GITHUB_STEP_SUMMARY: run.summary
    })
    expect(result.status).toBe(0)
    expect(outputs(run.githubOutput)).toMatchObject({
      decision: 'already_published',
      publish: 'false',
      digest: PUBLISHED_DIGEST
    })
    expect(fs.readFileSync(run.summary, 'utf8')).toContain(PUBLISHED_DIGEST)
  })

  it.each([
    [
      'one verification exit=1',
      (gate) =>
        fs.writeFileSync(path.join(gate, 'verifications/sbom-oci.exit'), '1\n')
    ],
    [
      'public package (anonymous token)',
      (gate) => {
        const file = path.join(gate, 'probe.json')
        const probe = readJson(file)
        probe.anonymousToken = {
          status: 200,
          code: null,
          tokenIssued: true,
          curlExit: 0
        }
        fs.writeFileSync(file, JSON.stringify(probe))
      }
    ]
  ])('refuses with exit 1 and no publish=true: %s', (_label, mutate) => {
    const run = gateDir(publishedOverlay, mutate)
    const result = runCli(['decide', '--dir', run.gate], {
      GITHUB_OUTPUT: run.githubOutput,
      GITHUB_STEP_SUMMARY: run.summary
    })
    expect(result.status).toBe(1)
    expect(fs.readFileSync(run.githubOutput, 'utf8')).not.toContain(
      'publish=true'
    )
  })

  it('refuses a missing package with the §9 prerequisite message', () => {
    const run = gateDir((gate) => {
      const file = path.join(gate, 'probe.json')
      const probe = readJson(file)
      probe.authToken = {
        status: 403,
        code: 'DENIED',
        tokenIssued: false,
        curlExit: 0
      }
      probe.tagsList = {
        status: 404,
        code: 'NAME_UNKNOWN',
        tags: null,
        pages: 1,
        curlExit: 0
      }
      fs.writeFileSync(file, JSON.stringify(probe))
    })
    const result = runCli(['decide', '--dir', run.gate], {
      GITHUB_OUTPUT: run.githubOutput,
      GITHUB_STEP_SUMMARY: run.summary
    })
    expect(result.status).toBe(1)
    expect(fs.readFileSync(run.githubOutput, 'utf8')).not.toContain(
      'publish=true'
    )
    expect(fs.readFileSync(run.summary, 'utf8')).toContain(
      'pacote ausente ou sem acesso do Actions; ver o pré-requisito da §9'
    )
  })

  it('refuses a symlink planted in the gate directory', () => {
    const run = gateDir((gate) => {
      const target = path.join(path.dirname(gate), 'outside.json')
      fs.copyFileSync(path.join(gate, 'pulls.json'), target)
      fs.rmSync(path.join(gate, 'pulls.json'))
      fs.symlinkSync(target, path.join(gate, 'pulls.json'))
    })
    const result = runCli(['decide', '--dir', run.gate], {
      GITHUB_OUTPUT: run.githubOutput,
      GITHUB_STEP_SUMMARY: run.summary
    })
    expect(result.status).toBe(1)
    expect(fs.readFileSync(run.githubOutput, 'utf8')).not.toContain(
      'publish=true'
    )
  })
})

const FAKE_CURL = String.raw`
const fs = require('node:fs')
const argv = process.argv.slice(2)
const scenario = JSON.parse(fs.readFileSync(process.env.FAKE_CURL_SCENARIO, 'utf8'))
const stdin = argv.includes('--config') ? fs.readFileSync(0, 'utf8') : ''
const url = argv.find((arg) => arg.startsWith('https://'))
fs.appendFileSync(process.env.FAKE_CURL_LOG, JSON.stringify({ argv, stdin, url }) + '\n')
let key
if (url.includes('/token?')) key = argv.includes('--config') ? 'auth' : 'anonymous'
else if (url.includes('/tags/list')) key = url.includes('last=') ? 'tags2' : 'tags'
else if (url.includes('/manifests/')) key = 'manifest'
const response = scenario[key]
if (!response) process.exit(7)
if (response.exit) process.exit(response.exit)
const headers = ['HTTP/2 ' + response.status]
for (const [name, value] of Object.entries(response.headers || {})) headers.push(name + ': ' + value)
const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body)
process.stdout.write(headers.join('\r\n') + '\r\n\r\n' + body)
`

const FAKE_GH = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const argv = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(argv) + '\n')
const dir = process.env.FAKE_GH_FIXTURES
const endpoint = argv[argv.length - 1]
const sha = process.env.FAKE_GH_SHA
const head = process.env.FAKE_GH_HEAD
const read = (file) => process.stdout.write(fs.readFileSync(path.join(dir, file)))
let match
if (endpoint.endsWith('/branches/main')) read('branch-main.json')
else if (endpoint.includes('/actions/runs?') && endpoint.includes('head_sha=' + sha) && endpoint.includes('event=push')) read('push-runs.json')
else if (endpoint.includes('/commits/' + sha + '/pulls')) read('pulls.json')
else if (endpoint.includes('/actions/runs?') && endpoint.includes('head_sha=' + head) && endpoint.includes('event=pull_request')) read('pr-runs/' + head + '.json')
else if ((match = endpoint.match(/check-suites\/(\d+)\/check-runs\?filter=all/))) {
  const main = path.join('main-suites', match[1] + '.json')
  const pr = path.join('pr-suites', match[1] + '.json')
  if (fs.existsSync(path.join(dir, main))) read(main)
  else if (fs.existsSync(path.join(dir, pr))) read(pr)
  else process.exit(4)
} else process.exit(3)
`

function fakeBin() {
  const directory = tempDir('cvg-release-fakebin-')
  const write = (name, source) => {
    const file = path.join(directory, name)
    fs.writeFileSync(file, `#!${process.execPath}\n${source}`)
    fs.chmodSync(file, 0o755)
  }
  write('curl', FAKE_CURL)
  write('gh', FAKE_GH)
  return directory
}

const AUTH_OK = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: { token: REGISTRY_TOKEN }
}
const ANON_DENIED = {
  status: 403,
  headers: { 'content-type': 'application/json' },
  body: { errors: [{ code: 'DENIED', message: 'requested access denied' }] }
}
const TAGS_ONE_PAGE = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: { name: REPO, tags: ['placeholder-20261022'] }
}
const MANIFEST_UNKNOWN = {
  status: 404,
  headers: { 'content-type': 'application/json' },
  body: { errors: [{ code: 'MANIFEST_UNKNOWN', message: 'manifest unknown' }] }
}

function probeRun(mode, scenario) {
  const directory = tempDir('cvg-release-probe-')
  const bin = fakeBin()
  const scenarioFile = path.join(directory, 'scenario.json')
  const log = path.join(directory, 'curl.log')
  const githubOutput = path.join(directory, 'github-output')
  const summary = path.join(directory, 'summary')
  const probeDir = path.join(directory, 'probe')
  fs.writeFileSync(scenarioFile, JSON.stringify(scenario))
  fs.writeFileSync(log, '')
  fs.writeFileSync(githubOutput, 'untouched=1\n')
  fs.writeFileSync(summary, '')
  const result = runCli([mode, '--dir', probeDir, '--sha', S], {
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_CURL_SCENARIO: scenarioFile,
    FAKE_CURL_LOG: log,
    GITHUB_ACTOR: 'ricardoakinaga-dev',
    GITHUB_REPOSITORY: REPO,
    PROBE_TOKEN: JOB_TOKEN,
    GITHUB_OUTPUT: githubOutput,
    GITHUB_STEP_SUMMARY: summary
  })
  const calls = fs
    .readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return { result, calls, probeDir, githubOutput, summary }
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
}

describe('SPEC0253 P1/O4/O6: package probe through curl --config -', () => {
  const okScenario = {
    auth: AUTH_OK,
    tags: TAGS_ONE_PAGE,
    anonymous: ANON_DENIED,
    manifest: MANIFEST_UNKNOWN
  }

  it('probes token, tags/list, anonymous token and manifest with tokens only on stdin', () => {
    const run = probeRun('probe', okScenario)
    expect(run.result.stderr).toBe('')
    expect(run.result.status).toBe(0)
    const kinds = run.calls.map((call) =>
      call.url.includes('/token?')
        ? call.argv.includes('--config')
          ? 'auth'
          : 'anonymous'
        : call.url.includes('/tags/list')
          ? 'tags'
          : 'manifest'
    )
    expect(kinds).toEqual(['auth', 'tags', 'anonymous', 'manifest'])
    for (const call of run.calls) {
      expect(call.url.startsWith('https://ghcr.io/')).toBe(true)
      const argv = call.argv.join(' ')
      expect(argv).not.toContain(JOB_TOKEN)
      expect(argv).not.toContain(REGISTRY_TOKEN)
      expect(call.argv).not.toContain('-u')
      expect(call.argv).not.toContain('--user')
      expect(argv).not.toMatch(/authorization/i)
    }
    const [auth, tags, anonymous, manifest] = run.calls
    expect(auth.url).toBe(
      `https://ghcr.io/token?scope=repository:${REPO}:pull&service=ghcr.io`
    )
    expect(auth.stdin).toBe(`user = "ricardoakinaga-dev:${JOB_TOKEN}"\n`)
    expect(tags.url).toBe(`https://ghcr.io/v2/${REPO}/tags/list?n=100`)
    expect(tags.stdin).toBe(
      `header = "Authorization: Bearer ${REGISTRY_TOKEN}"\n`
    )
    expect(anonymous.argv).not.toContain('--config')
    expect(anonymous.stdin).toBe('')
    expect(anonymous.url).toBe(auth.url)
    expect(manifest.url).toBe(`https://ghcr.io/v2/${REPO}/manifests/sha-${S}`)
    expect(manifest.stdin).toBe(tags.stdin)
    const accept = manifest.argv[manifest.argv.indexOf('-H') + 1]
    expect(accept.startsWith('Accept: ')).toBe(true)
    expect(accept.slice('Accept: '.length).split(', ').sort()).toEqual(
      [...PROBE_ACCEPT].sort()
    )
    expect(run.result.stdout).toContain(`::add-mask::${REGISTRY_TOKEN}`)
    expect(outputs(run.githubOutput)).toMatchObject({
      untouched: '1',
      package: 'ok',
      tag: 'absent'
    })
    const probe = readJson(path.join(run.probeDir, 'probe.json'))
    expect(probe.tag).toBe(`sha-${S}`)
    expect(probe.tagsList.tags).toEqual(['placeholder-20261022'])
    for (const file of filesUnder(run.probeDir)) {
      const text = fs.readFileSync(file, 'utf8')
      expect(text).not.toContain(JOB_TOKEN)
      expect(text).not.toContain(REGISTRY_TOKEN)
      expect(text).not.toMatch(/"token"\s*:/i)
    }
  })

  it('follows the tags/list Link pagination on ghcr.io only', () => {
    const run = probeRun('probe', {
      ...okScenario,
      tags: {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: `</v2/${REPO}/tags/list?last=placeholder-20261022&n=100>; rel="next"`
        },
        body: { name: REPO, tags: ['placeholder-20261022'] }
      },
      tags2: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { name: REPO, tags: [`sha-${S}`] }
      }
    })
    expect(run.result.status).toBe(0)
    const probe = readJson(path.join(run.probeDir, 'probe.json'))
    expect(probe.tagsList.tags).toEqual(['placeholder-20261022', `sha-${S}`])
    expect(probe.tagsList.pages).toBe(2)
    // sha-S listed with manifest 404 is an error, never "absent".
    expect(outputs(run.githubOutput).tag).toBe('error')
  })

  it('rejects a Link that leaves the package tags/list path', () => {
    const run = probeRun('probe', {
      ...okScenario,
      tags: {
        status: 200,
        headers: {
          link: '<https://evil.example/v2/x/tags/list?last=a>; rel="next"'
        },
        body: { name: REPO, tags: ['placeholder-20261022'] }
      }
    })
    expect(run.result.status).toBe(0)
    expect(outputs(run.githubOutput).package).toBe('error')
    expect(
      run.calls.every((call) => call.url.startsWith('https://ghcr.io/'))
    ).toBe(true)
  })

  it('passes the precondition only for a private package with sha-S absent', () => {
    const run = probeRun('precondition', okScenario)
    expect(run.result.status).toBe(0)
    expect(fs.readFileSync(run.githubOutput, 'utf8')).toBe('untouched=1\n')
  })

  it.each([
    [
      'missing package (authenticated token DENIED)',
      { ...okScenario, auth: ANON_DENIED }
    ],
    [
      'missing package (tags/list 404 NAME_UNKNOWN)',
      {
        ...okScenario,
        tags: {
          status: 404,
          body: { errors: [{ code: 'NAME_UNKNOWN' }] }
        }
      }
    ],
    [
      'public package (anonymous token)',
      { ...okScenario, anonymous: { status: 200, body: { token: 'anon' } } }
    ],
    [
      'registry error (manifest 500)',
      { ...okScenario, manifest: { status: 500, body: '' } }
    ],
    ['timeout (curl exit 28)', { ...okScenario, tags: { exit: 28 } }],
    [
      'tag already present',
      {
        ...okScenario,
        manifest: {
          status: 200,
          headers: {
            'content-type': 'application/vnd.oci.image.manifest.v1+json',
            'docker-content-digest': PUBLISHED_DIGEST
          },
          body: {}
        }
      }
    ]
  ])('fails the precondition with a non-zero exit: %s', (_label, scenario) => {
    const run = probeRun('precondition', scenario)
    expect(run.result.status).not.toBe(0)
    expect(fs.readFileSync(run.githubOutput, 'utf8')).toBe('untouched=1\n')
    expect(run.result.stderr).toMatch(/release_precondition_failed/)
  })

  it('records the anonymous probe without any token', () => {
    const directory = tempDir('cvg-release-anon-')
    const bin = fakeBin()
    const scenarioFile = path.join(directory, 'scenario.json')
    const log = path.join(directory, 'curl.log')
    fs.writeFileSync(
      scenarioFile,
      JSON.stringify({
        anonymous: { status: 200, body: { token: 'public-anon-token' } }
      })
    )
    fs.writeFileSync(log, '')
    const out = path.join(directory, 'anonymous-pull.json')
    const result = runCli(['anonymous', '--out', out], {
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_CURL_SCENARIO: scenarioFile,
      FAKE_CURL_LOG: log,
      GITHUB_REPOSITORY: REPO
    })
    expect(result.status).toBe(0)
    const recorded = readJson(out)
    expect(recorded).toEqual({
      status: 200,
      code: null,
      tokenIssued: true,
      curlExit: 0
    })
    expect(fs.readFileSync(out, 'utf8')).not.toContain('public-anon-token')
  })
})

describe('SPEC0253 §3.2 step 2: collect writes the gate layout with GET-only gh api', () => {
  it('reproduces the fixture files from the API answers', () => {
    const directory = tempDir('cvg-release-collect-')
    const bin = fakeBin()
    const log = path.join(directory, 'gh.log')
    fs.writeFileSync(log, '')
    const gate = path.join(directory, 'release-gate')
    const result = runCli(['collect', '--dir', gate], {
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_GH_FIXTURES: fixtureDir,
      FAKE_GH_LOG: log,
      FAKE_GH_SHA: S,
      FAKE_GH_HEAD: HEAD,
      GH_TOKEN: JOB_TOKEN,
      GITHUB_REPOSITORY: REPO,
      GITHUB_SHA: S,
      GITHUB_REF: 'refs/heads/main',
      RUN_HEAD_SHA: S,
      RUN_EVENT: 'push',
      RUN_HEAD_BRANCH: 'main',
      RUN_HEAD_REPOSITORY: REPO,
      RUN_CONCLUSION: 'success'
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    const expected = filesUnder(fixtureDir)
      .map((file) => path.relative(fixtureDir, file))
      .filter((file) => file !== 'probe.json')
      .sort()
    const actual = filesUnder(gate)
      .map((file) => path.relative(gate, file))
      .sort()
    expect(actual).toEqual(expected)
    for (const file of expected) {
      expect(readJson(path.join(gate, file))).toEqual(
        readJson(path.join(fixtureDir, file))
      )
    }
    const calls = fs
      .readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    expect(calls.length).toBeGreaterThan(0)
    for (const argv of calls) {
      expect(argv.slice(0, 3)).toEqual(['api', '--method', 'GET'])
      expect(argv.join(' ')).not.toContain(JOB_TOKEN)
    }
  })
})
