// @vitest-environment node
// SPEC0253 P1/P2 (RELEASE-CI-0253-20261021): textual contract of
// .github/workflows/release-image.yml, split into jobs and steps by index,
// and the digest pins of the root Dockerfile.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_BUILD_FLAGS,
  ALLOWED_BUILD_LABELS,
  EVIDENCE_FILES,
  SBOM_PREDICATE,
  SIGNER_WORKFLOW,
  TRIVY_DB_REPOSITORY,
  TRIVY_IMAGE,
  UPLOAD_EVIDENCE_NAMES
} from '../scripts/release-image-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const workflowPath = '.github/workflows/release-image.yml'
const workflow = read(workflowPath)
const reviewedWorkflows =
  read('.github/workflows/verify.yml') + read('.github/workflows/security.yml')

function topLevelKeys(text) {
  return [...text.matchAll(/^([a-z][\w-]*):/gm)].map((match) => match[1])
}

function topLevel(text, key) {
  const start = text.search(new RegExp(`^${key}:`, 'm'))
  if (start < 0) return undefined
  const rest = text.slice(start)
  const next = rest.search(/\n[a-z][\w-]*:/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

function jobsOf(text) {
  const body = topLevel(text, 'jobs').split('\n').slice(1).join('\n')
  const jobs = {}
  for (const chunk of body.split(/\n(?=  [a-z][\w-]*:\n)/)) {
    const name = chunk.match(/^\s*([a-z][\w-]*):\n/)?.[1]
    if (name) jobs[name] = chunk.replace(/^\n+/, '')
  }
  return jobs
}

function block(lines, start, indent) {
  const out = []
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') {
      out.push('')
      continue
    }
    if (line.length - line.trimStart().length < indent) break
    out.push(line.slice(indent))
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

function mapping(lines) {
  const map = {}
  for (const line of lines) {
    const match = line.match(/^([\w-]+): ?(.*)$/)
    if (match) map[match[1]] = match[2]
  }
  return map
}

function jobHeader(jobText) {
  const head = jobText.split('\n    steps:\n')[0]
  const lines = head.split('\n')
  const value = (key) => {
    const index = lines.findIndex((line) => line.startsWith(`    ${key}:`))
    if (index < 0) return undefined
    const inline = lines[index].slice(`    ${key}:`.length).trim()
    if (inline && inline !== '>-') return inline
    return block(lines, index + 1, 6).join('\n')
  }
  return {
    text: head,
    if: value('if'),
    needs: value('needs'),
    runsOn: value('runs-on'),
    timeout: value('timeout-minutes'),
    permissions: mapping(
      (value('permissions') ?? '').split('\n').filter(Boolean)
    ),
    outputs: mapping((value('outputs') ?? '').split('\n').filter(Boolean)),
    env: mapping((value('env') ?? '').split('\n').filter(Boolean))
  }
}

function stepsOf(jobText) {
  const body = jobText.split('\n    steps:\n')[1] ?? ''
  return body
    .split(/\n(?=      - )/)
    .filter((chunk) => chunk.trim())
    .map((chunk, index) => {
      const lines = chunk.replace(/^\n+/, '').split('\n')
      const first = lines[0]
      const keys = {}
      const fields = ['  ' + first.slice(8), ...lines.slice(1)]
      for (let i = 0; i < fields.length; i += 1) {
        const match = fields[i].match(/^ {8}([\w-]+):(.*)$/)
        if (!match && i === 0) {
          const inline = first.match(/^ {6}- ([\w-]+):(.*)$/)
          if (inline) keys[inline[1]] = inline[2].trim()
          continue
        }
        if (!match) continue
        const [, key, rest] = match
        if (rest.trim() === '|' || rest.trim() === '') {
          keys[key] = block(fields, i + 1, 10).join('\n')
        } else {
          keys[key] = rest.trim()
        }
      }
      return {
        index,
        text: chunk,
        name: keys.name,
        id: keys.id,
        if: keys.if,
        uses: keys.uses,
        run: keys.run ?? '',
        env: mapping((keys.env ?? '').split('\n')),
        with: mapping((keys.with ?? '').split('\n')),
        keys
      }
    })
}

const jobs = jobsOf(workflow)
const gate = stepsOf(jobs.gate ?? '')
const release = stepsOf(jobs.release ?? '')
const verify = stepsOf(jobs['release-verify'] ?? '')
const allSteps = [...gate, ...release, ...verify]

function logical(run) {
  return run.replace(/\\\n\s*/g, ' ')
}

function stepIndex(steps, predicate, label) {
  const index = steps.findIndex(predicate)
  if (index < 0) throw new Error(`step not found: ${label}`)
  return index
}

const trivySteps = release.filter((step) => 'TRIVY_IMAGE' in step.env)

function trivyArray(run) {
  const match = logical(run).match(/TRIVY_RUN=\(([^)]*)\)/)
  return match ? match[1] : undefined
}

function trivyCalls(step) {
  const text = logical(step.run)
  const calls = []
  const array = trivyArray(step.run)
  for (const line of text.split('\n')) {
    if (line.includes('TRIVY_RUN=(')) continue
    if (line.includes('"${TRIVY_RUN[@]}"')) {
      calls.push({ command: `${array} ${line}`, line })
    } else if (/\bdocker run\b/.test(line) && line.includes('"$TRIVY_IMAGE"')) {
      calls.push({ command: line, line })
    }
  }
  return calls
}

function dockerRuns(step) {
  const text = logical(step.run)
  const runs = text.split('\n').filter((line) => /\bdocker run\b/.test(line))
  const array = trivyArray(step.run)
  return array
    ? [...runs.filter((l) => !l.includes('TRIVY_RUN=(')), array]
    : runs
}

describe('SPEC0253 P1: triggers, permissions and concurrency', () => {
  it('only runs on completed Verify/Security workflow_run events of main', () => {
    expect(topLevelKeys(workflow)).toEqual([
      'name',
      'on',
      'permissions',
      'concurrency',
      'jobs'
    ])
    expect(workflow).toMatch(/^name: Release image$/m)
    expect(topLevel(workflow, 'on')).toBe(
      'on:\n  workflow_run:\n    workflows: [Verify, Security]\n    types: [completed]\n    branches: [main]\n\n'
    )
  })

  it('grants nothing at the top and the exact permission set per job', () => {
    expect(topLevel(workflow, 'permissions')).toBe('permissions: {}\n\n')
    expect(Object.keys(jobs)).toEqual(['gate', 'release', 'release-verify'])
    expect(jobHeader(jobs.gate).permissions).toEqual({
      contents: 'read',
      actions: 'read',
      checks: 'read',
      'pull-requests': 'read',
      packages: 'read',
      attestations: 'read'
    })
    expect(jobHeader(jobs.release).permissions).toEqual({
      contents: 'read',
      packages: 'write',
      'id-token': 'write',
      attestations: 'write'
    })
    expect(jobHeader(jobs['release-verify']).permissions).toEqual({
      contents: 'read',
      packages: 'read',
      attestations: 'read'
    })
    expect(workflow.match(/: write$/gm)).toHaveLength(3)
    expect(workflow).not.toMatch(/write-all|read-all/)
  })

  it('serializes by head_sha without cancelling a publication', () => {
    expect(topLevel(workflow, 'concurrency')).toBe(
      'concurrency:\n  group: release-image-${{ github.event.workflow_run.head_sha }}\n  cancel-in-progress: false\n\n'
    )
  })

  it('gates the first job on the five payload conditions', () => {
    expect(jobHeader(jobs.gate).if).toBe(
      [
        "github.event.workflow_run.conclusion == 'success' &&",
        "github.event.workflow_run.event == 'push' &&",
        "github.event.workflow_run.head_branch == 'main' &&",
        'github.event.workflow_run.head_repository.full_name == github.repository &&',
        "github.ref == 'refs/heads/main'"
      ].join('\n')
    )
    expect(jobHeader(jobs.release)).toMatchObject({
      needs: 'gate',
      if: "needs.gate.outputs.publish == 'true'"
    })
    expect(jobHeader(jobs['release-verify']).needs).toBe('[gate, release]')
    for (const name of ['release', 'release-verify']) {
      expect(jobHeader(jobs[name]).if ?? '').not.toMatch(
        /always\(\)|cancelled\(\)|failure\(\)/
      )
    }
  })
})

describe('SPEC0253 P1: actions, host tooling and job rules', () => {
  it('uses only first-party actions pinned to the reviewed 40-hex SHAs', () => {
    const uses = [...workflow.matchAll(/uses: (\S+)@(\S+)(.*)/g)]
    expect(uses.length).toBeGreaterThan(0)
    expect(workflow.match(/uses:/g)).toHaveLength(uses.length)
    for (const [, action, ref, comment] of uses) {
      expect(action).toMatch(/^actions\/[a-z-]+$/)
      expect(ref).toMatch(/^[0-9a-f]{40}$/)
      expect(comment).toMatch(/^ # v\d+$/)
      const reviewed = reviewedWorkflows.match(
        new RegExp(`uses: ${action.replace('/', '\\/')}@([0-9a-f]{40})`)
      )?.[1]
      expect(reviewed, action).toBe(ref)
    }
    expect(workflow).not.toMatch(/uses:\s*(?:aquasecurity|docker)\//)
  })

  it('never caches nor installs or executes npm packages on the host', () => {
    expect(workflow).not.toMatch(/actions\/cache|^\s+cache:/m)
    expect(workflow).not.toMatch(/\bnpm (?:ci|install|i|exec)\b|\bnpx\b/)
  })

  it('applies the job rules to every job and step', () => {
    const timeouts = { gate: '15', release: '60', 'release-verify': '15' }
    for (const [name, text] of Object.entries(jobs)) {
      const header = jobHeader(text)
      expect(header.runsOn, name).toBe('ubuntu-24.04')
      expect(header.timeout, name).toBe(timeouts[name])
    }
    expect(workflow).not.toContain('continue-on-error')
    for (const step of allSteps) {
      expect(step.name, step.text).toBeTruthy()
      if (step.uses?.startsWith('actions/checkout@')) {
        expect(step.with['persist-credentials']).toBe('false')
      }
      if (step.uses?.startsWith('actions/setup-node@')) {
        expect(step.with).toEqual({ 'node-version-file': '.nvmrc' })
      }
      expect(step.run, step.name).not.toContain('${{')
    }
    expect(workflow).not.toMatch(
      /^\s+run: .*\$\{\{ github\.event\.workflow_run\./m
    )
  })

  it('allows step-level always() only on the three named cleanup steps', () => {
    const always = allSteps.filter((step) => /always\(\)/.test(step.if ?? ''))
    expect(always.map((step) => [step.name, step.if])).toEqual([
      ['Cleanup gate registry login', 'always()'],
      ['Cleanup release', 'always()'],
      ['Cleanup verify registry login', 'always()']
    ])
    expect(gate.some((s) => s.name === 'Cleanup gate registry login')).toBe(
      true
    )
    expect(release.at(-1).name).toBe('Cleanup release')
    expect(verify.at(-1).name).toBe('Cleanup verify registry login')
    expect(workflow.match(/always\(\)/g)).toHaveLength(3)
    expect(workflow).not.toMatch(/cancelled\(\)|failure\(\)/)
  })

  it('downloads exactly the artifact the release job named', () => {
    const downloads = allSteps.filter((step) =>
      step.uses?.startsWith('actions/download-artifact@')
    )
    expect(downloads).toHaveLength(1)
    expect(verify).toContain(downloads[0])
    expect(Object.keys(downloads[0].with).sort()).toEqual(['name', 'path'])
    expect(downloads[0].with.name).toBe(
      '${{ needs.release.outputs.artifact_name }}'
    )
    expect(jobHeader(jobs.release).outputs).toEqual({
      digest: '${{ steps.push.outputs.digest }}',
      artifact_name: '${{ steps.paths.outputs.artifact_name }}'
    })
  })

  it('declares no workflow or job env except the release Trivy volume name', () => {
    expect(jobHeader(jobs.gate).env).toEqual({})
    expect(jobHeader(jobs['release-verify']).env).toEqual({})
    expect(jobHeader(jobs.release).env).toEqual({
      TRIVY_VOLUME:
        'cvg-release-trivy-${{ github.run_id }}-${{ github.run_attempt }}'
    })
  })
})

describe('SPEC0253 P1: gate job', () => {
  const collect = stepIndex(
    gate,
    (s) => s.run.includes('release-image-gate.mjs collect'),
    'collect'
  )
  const probe = stepIndex(gate, (s) => s.id === 'probe', 'probe')
  const login = stepIndex(
    gate,
    (s) => s.run.includes('docker login ghcr.io'),
    'login'
  )
  const verifications = stepIndex(
    gate,
    (s) => s.run.includes('gh attestation verify'),
    'verify'
  )
  const anonymous = stepIndex(
    gate,
    (s) => s.run.includes('release-image-gate.mjs anonymous'),
    'anonymous'
  )
  const cleanup = stepIndex(
    gate,
    (s) => s.name === 'Cleanup gate registry login',
    'cleanup'
  )
  const decide = stepIndex(gate, (s) => s.id === 'decide', 'decide')
  const upload = stepIndex(
    gate,
    (s) => s.uses?.startsWith('actions/upload-artifact@'),
    'upload'
  )

  it('reads the API, probes, logs in read-only, verifies, cleans up and decides in order', () => {
    expect(gate[0].uses).toMatch(/^actions\/checkout@/)
    expect(gate[0].with.ref).toBe('${{ github.sha }}')
    expect([
      collect,
      probe,
      login,
      verifications,
      anonymous,
      cleanup,
      decide,
      upload
    ]).toEqual(
      [collect, probe, login, verifications, anonymous, cleanup, decide, upload]
        .slice()
        .sort((a, b) => a - b)
    )
    expect(new Set([login, verifications, anonymous]).size).toBe(3)
    expect(gate[collect].env.GH_TOKEN).toBe('${{ github.token }}')
    for (const key of [
      'RUN_HEAD_SHA',
      'RUN_EVENT',
      'RUN_HEAD_BRANCH',
      'RUN_HEAD_REPOSITORY',
      'RUN_CONCLUSION'
    ]) {
      expect(gate[collect].env[key]).toMatch(
        /^\$\{\{ github\.event\.workflow_run\.[a-z_.]+ \}\}$/
      )
    }
    expect(gate[probe].run).toBe(
      'node scripts/release-image-gate.mjs probe --dir "$RUNNER_TEMP/release-gate" --sha "$GITHUB_SHA"'
    )
    expect(gate[probe].env).toEqual({ PROBE_TOKEN: '${{ github.token }}' })
    expect(gate[decide].run).toBe(
      'node scripts/release-image-gate.mjs decide --dir "$RUNNER_TEMP/release-gate"'
    )
    expect(jobHeader(jobs.gate).outputs).toEqual({
      decision: '${{ steps.decide.outputs.decision }}',
      publish: '${{ steps.decide.outputs.publish }}',
      sha: '${{ steps.decide.outputs.sha }}',
      digest: '${{ steps.decide.outputs.digest }}',
      gate_record: '${{ steps.decide.outputs.gate_record }}'
    })
    expect(gate[upload].with.path).toBe(
      '${{ runner.temp }}/release-gate/release-gate.json'
    )
  })

  it('logs in with a temporary DOCKER_CONFIG before the first attestation verify', () => {
    for (const index of [login, verifications, cleanup]) {
      expect(gate[index].env.DOCKER_CONFIG).toBe(
        '${{ runner.temp }}/gate-docker'
      )
    }
    for (const index of [login, verifications, anonymous]) {
      expect(gate[index].if).toBe("steps.probe.outputs.tag == 'present'")
    }
    expect(gate[login].run).toContain('mkdir -m 0700 "$DOCKER_CONFIG"')
    expect(gate[login].run).toContain(
      `printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin`
    )
    expect(gate[login].env.REGISTRY_TOKEN).toBe('${{ github.token }}')
    expect(gate[cleanup].run).toContain('docker logout ghcr.io')
    expect(gate[cleanup].run).toContain('rm -rf "$DOCKER_CONFIG"')
  })

  it('runs the four verifications (default and cyclonedx, API and OCI)', () => {
    const run = logical(gate[verifications].run)
    expect(run).toContain(
      '--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/release-image.yml"'
    )
    expect(run).toContain('--source-digest "$GITHUB_SHA"')
    expect(run).toContain('--source-ref refs/heads/main')
    expect(run).toContain('--deny-self-hosted-runners')
    expectFourVerifications(run)
  })
})

function expectFourVerifications(run) {
  const outputs = {}
  for (const line of run.split('\n')) {
    const match = line.match(
      /"\$\{VERIFY\[@\]\}"(.*?) > "\$OUT\/([a-z-]+)\.json"/
    )
    if (match) outputs[match[2]] = match[1].trim()
  }
  expect(outputs).toEqual({
    'provenance-api': '',
    'provenance-oci': '--bundle-from-oci',
    'sbom-api': `--predicate-type ${SBOM_PREDICATE}`,
    'sbom-oci': `--predicate-type ${SBOM_PREDICATE} --bundle-from-oci`
  })
  for (const name of Object.keys(outputs)) {
    expect(run).toContain(`echo "$status" > "$OUT/${name}.exit"`)
  }
  const array = run.match(/VERIFY=\(([^)]*)\)/)?.[1] ?? ''
  for (const flag of [
    'gh attestation verify "$SUBJECT"',
    '--repo "$GITHUB_REPOSITORY"',
    `--signer-workflow "$GITHUB_REPOSITORY/${SIGNER_WORKFLOW}"`,
    '--source-ref refs/heads/main',
    '--deny-self-hosted-runners',
    '--format json'
  ]) {
    expect(array).toContain(flag)
  }
  expect(array).toMatch(/--source-digest "\$(?:GITHUB_SHA|S)"/)
  expect(run).toContain(
    'SUBJECT="oci://ghcr.io/${GITHUB_REPOSITORY,,}@${DIGEST}"'
  )
}

describe('SPEC0253 P1: release job', () => {
  const find = (predicate, label) => stepIndex(release, predicate, label)
  const build = find((s) => /\bdocker build\b/.test(s.run), 'build')
  const save = find((s) => /\bdocker save\b/.test(s.run), 'save')
  const anchors = find((s) => s.id === 'anchors', 'anchors')
  const pull = find((s) => s.run.includes('docker pull "$TRIVY_IMAGE"'), 'pull')
  const download = find(
    (s) => s.run.includes('--download-db-only'),
    'db download'
  )
  const record = find(
    (s) => s.run.includes('release-image-record.mjs build'),
    'build record'
  )
  const precondition = find(
    (s) => s.id === 'package-precondition',
    'precondition'
  )
  const login = find((s) => s.run.includes('docker login'), 'login')
  const push = find((s) => /\bdocker push\b/.test(s.run), 'push')
  const manifest = find(
    (s) => s.run.includes('release-image-record.mjs manifest'),
    'manifest'
  )
  const attests = release
    .filter((s) => s.uses?.startsWith('actions/attest@'))
    .map((s) => s.index)
  const logout = find((s) => s.run.trim() === 'docker logout ghcr.io', 'logout')
  const publish = find(
    (s) => s.run.includes('release-image-record.mjs publish'),
    'publish'
  )
  const upload = find(
    (s) => s.uses?.startsWith('actions/upload-artifact@'),
    'upload'
  )
  const trivyRunIndexes = trivySteps
    .filter((s) => s.index !== pull)
    .map((s) => s.index)

  it('checks out the gated SHA and confirms it', () => {
    expect(release[0].uses).toMatch(/^actions\/checkout@/)
    expect(release[0].with.ref).toBe('${{ needs.gate.outputs.sha }}')
    const confirm = release[1]
    expect(confirm.id).toBe('paths')
    expect(confirm.env.S).toBe('${{ needs.gate.outputs.sha }}')
    expect(confirm.run).toContain('test "$(git rev-parse HEAD)" = "$S"')
    expect(confirm.run).toContain('test "$S" = "$GITHUB_SHA"')
    expect(confirm.run).toContain(
      'echo "image=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"'
    )
  })

  it('keeps the contract order of the release steps', () => {
    expect(attests).toHaveLength(2)
    const order = [
      build,
      save,
      anchors,
      pull,
      download,
      ...trivyRunIndexes.filter((i) => i !== download),
      record,
      precondition,
      login,
      push,
      manifest,
      attests[0],
      attests[1],
      logout,
      publish,
      upload
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(order.length)
    expect(Math.min(...trivyRunIndexes)).toBe(download)
    expect(Math.max(...trivySteps.map((s) => s.index))).toBeLessThan(login)
  })

  it('builds with the gate image recipe plus only the allowed metadata flags', () => {
    const command = logical(release[build].run).trim()
    expect(command.split('\n')).toHaveLength(1)
    const tokens = command.match(/"[^"]*"|\S+/g)
    expect(tokens.slice(0, 2)).toEqual(['docker', 'build'])
    expect(tokens.at(-1)).toBe('.')
    const flags = tokens.slice(2, -1)
    const labels = []
    for (let i = 0; i < flags.length; i += 1) {
      const flag = flags[i]
      expect(flag.startsWith('--'), flag).toBe(true)
      expect(ALLOWED_BUILD_FLAGS, flag).toContain(flag)
      if (flag === '--target') expect(flags[++i]).toBe('runtime')
      else if (flag === '--tag') {
        expect(flags[++i]).toBe('"cvg-operational-harness:release-${S}"')
      } else if (flag === '--label') {
        labels.push(flags[++i].replace(/^"|"$/g, '').split('=')[0])
      }
    }
    expect(flags).toEqual(
      expect.arrayContaining([
        '--pull',
        '--target',
        '--provenance=false',
        '--sbom=false',
        '--tag'
      ])
    )
    expect(labels).toEqual([...ALLOWED_BUILD_LABELS])
    expect(command).toContain(
      '--label "org.opencontainers.image.source=https://github.com/${GITHUB_REPOSITORY}"'
    )
    expect(command).toContain(
      '--label "org.opencontainers.image.revision=${S}"'
    )
    expect(workflow).not.toMatch(
      /--build-arg|--secret|--ssh|--file\b|--platform|--cache-from|--cache-to|--network[= ]host/
    )
  })

  it('smokes the image with the gate image line', () => {
    expect(logical(release[build + 1].run).trim()).toBe(
      'docker run --rm --network none --read-only --tmpfs /tmp --cap-drop=ALL --security-opt no-new-privileges "cvg-operational-harness:release-${S}" node scripts/runtime-image-smoke.mjs'
    )
  })

  it('emits the anchors only in the anchors step, right after docker save', () => {
    expect(anchors).toBe(save + 1)
    expect(release[anchors].run).toBe(
      'node scripts/release-image-record.mjs anchors --tarball "$TARBALL"'
    )
    expect(release[save].run).toContain(
      'docker save --output "$TARBALL" "cvg-operational-harness:release-${S}"'
    )
    expect(release[save].run).toContain('chmod 0444 "$TARBALL"')
    expect(release[save].run).toContain('install -d -m 0700 "$EVIDENCE"')
    for (const step of allSteps) {
      if (step.index === anchors && step.text === release[anchors].text)
        continue
      expect(step.run).not.toMatch(/tarball_sha256=|config_digest=/)
      expect(step.run).not.toContain('release-image-record.mjs anchors')
    }
    for (const step of release.slice(anchors + 1)) {
      for (const [key, value] of Object.entries(step.env)) {
        if (/anchor/i.test(key)) {
          expect(value).toMatch(
            /^\$\{\{ steps\.anchors\.outputs\.(tarball_sha256|config_digest) \}\}$/
          )
        }
      }
    }
    const writesOutput = release.filter((s) => s.run.includes('$GITHUB_OUTPUT'))
    expect(writesOutput.map((s) => s.id).sort()).toEqual(['paths', 'push'])
  })

  it('blocks the push with the package precondition before any login', () => {
    const step = release[precondition]
    expect(step.if).toBeUndefined()
    expect(step.keys['continue-on-error']).toBeUndefined()
    expect(step.run).toBe(
      'node scripts/release-image-gate.mjs precondition --dir "$RELEASE_DIR/precondition" --sha "$S"'
    )
    expect(step.env).toEqual({
      S: '${{ needs.gate.outputs.sha }}',
      PROBE_TOKEN: '${{ github.token }}'
    })
    expect(precondition).toBe(login - 1)
    expect(precondition).toBeGreaterThan(record)
  })

  it('pushes only sha-${S} and checks the raw manifest before attesting', () => {
    expect(release[login].run).toBe(
      `printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin`
    )
    expect(release[login].env).toEqual({
      REGISTRY_TOKEN: '${{ github.token }}'
    })
    const run = release[push].run
    expect(release[push].id).toBe('push')
    expect(run).toContain('REF="${IMAGE}:sha-${S}"')
    expect(run.match(/docker push/g)).toHaveLength(1)
    expect(run).toContain('docker push "$REF"')
    expect(run.match(/docker tag/g)).toHaveLength(1)
    expect(run).toContain(
      'docker tag "cvg-operational-harness:release-${S}" "$REF"'
    )
    expect(workflow.match(/docker push/g)).toHaveLength(1)
    expect(workflow.match(/docker tag/g)).toHaveLength(1)
    expect(workflow).not.toMatch(/latest/)
    expect(release[manifest].run).toContain(
      'docker buildx imagetools inspect --raw "${IMAGE}@${DIGEST}" > "$RELEASE_DIR/registry/manifest.json"'
    )
    expect(release[manifest].env.ANCHOR_CONFIG_DIGEST).toBe(
      '${{ steps.anchors.outputs.config_digest }}'
    )
    expect(manifest).toBe(push + 1)
  })

  it('declares TRIVY_IMAGE only in the env of the Trivy steps', () => {
    expect(trivySteps.length).toBeGreaterThanOrEqual(4)
    for (const step of trivySteps) {
      expect(step.env.TRIVY_IMAGE).toBe(TRIVY_IMAGE)
      expect(step.id).toBeUndefined()
    }
    expect(workflow.match(/TRIVY_IMAGE:/g)).toHaveLength(trivySteps.length)
    expect(workflow).not.toMatch(/TRIVY_IMAGE=/)
    expect(TRIVY_IMAGE).toMatch(
      /^ghcr\.io\/aquasecurity\/trivy:0\.75\.0@sha256:[0-9a-f]{64}$/
    )
    expect(workflow).not.toContain('docker.io/aquasec')
    expect(workflow).not.toContain('mirror.gcr.io')
    expect(release[pull].run).toBe('docker pull "$TRIVY_IMAGE"')
  })

  it('runs every Trivy container isolated, offline except the DB download', () => {
    const calls = trivySteps.flatMap((step) =>
      trivyCalls(step).map((call) => ({ ...call, step }))
    )
    expect(calls.length).toBe(5)
    const online = calls.filter((c) => !c.command.includes('--network none'))
    expect(online).toHaveLength(1)
    expect(online[0].step.index).toBe(download)
    expect(online[0].command).toContain('--download-db-only')
    expect(online[0].command).toContain(
      `--db-repository ${TRIVY_DB_REPOSITORY}`
    )
    expect(online[0].command).not.toContain('/in')
    for (const { command } of calls) {
      for (const flag of [
        '--rm',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt no-new-privileges',
        '--tmpfs /tmp',
        '--pids-limit 512',
        '--memory 4g',
        '--mount type=volume,src="$TRIVY_VOLUME",dst=/cache',
        '--cache-dir /cache'
      ]) {
        expect(command, flag).toContain(flag)
      }
      expect(command).not.toMatch(
        /\s-v\s|--volume|docker\.sock|--privileged|--network[= ]host|\s-e\s|--env\b|--env-file|--output|--user/
      )
      const binds = command.match(/type=bind[^\s]*/g) ?? []
      expect(
        binds.every(
          (b) => b === 'type=bind,src="$TARBALL",dst=/in/image.tar,readonly'
        )
      ).toBe(true)
      const sub = command.match(/"\$TRIVY_IMAGE" (\w+)/)?.[1]
      if (sub === 'image') {
        expect(command).toContain('--skip-version-check')
        expect(command).toContain('--disable-telemetry')
      } else {
        expect(sub).toBe('version')
        expect(command).not.toMatch(/--skip-version-check|--disable-telemetry/)
      }
      if (command.includes('/in/image.tar')) {
        expect(command).toContain('--network none')
        expect(command).toContain('--offline-scan')
        expect(command).toContain('--skip-db-update')
      }
    }
    for (const step of trivySteps) {
      for (const docker of dockerRuns(step)) {
        expect(docker).toContain('"$TRIVY_IMAGE"')
      }
    }
  })

  it('writes Trivy output only through head -c with pipefail into $EVIDENCE/', () => {
    const limits = Object.fromEntries(
      EVIDENCE_FILES.map((entry) => [entry.name, entry.maxBytes])
    )
    const written = {}
    for (const step of trivySteps) {
      const writes = [
        ...logical(step.run).matchAll(
          /\| head -c "\$\(\((\w+) \+ 1\)\)" > "\$EVIDENCE\/([\w.-]+)"/g
        )
      ]
      if (writes.length > 0) {
        expect(step.run).toMatch(/set -euo pipefail|set -o pipefail/)
      }
      for (const [, variable, file] of writes) {
        expect(Number(step.env[variable]), variable).toBe(limits[file])
        written[file] = (written[file] ?? 0) + 1
      }
      for (const call of trivyCalls(step)) {
        if (!call.command.includes('--download-db-only')) {
          expect(call.line).toMatch(
            /\| head -c "\$\(\(\w+ \+ 1\)\)" > "\$EVIDENCE\//
          )
        }
      }
    }
    expect(written).toEqual({
      'trivy-version.json': 1,
      'trivy-gate.json': 1,
      'trivy-full.json': 1,
      'sbom.cdx.json': 1
    })
    const gateRun = logical(
      trivySteps.find((s) => s.run.includes('trivy-gate.json')).run
    )
    expect(gateRun).toContain(
      '--scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --format json'
    )
    expect(gateRun).toContain(
      '--scanners vuln --severity HIGH,CRITICAL --exit-code 0 --format json'
    )
    expect(gateRun).toMatch(/"\$\{TRIVY_RUN\[@\]\}" --format cyclonedx \|/)
    expect(gateRun).toContain(
      'node scripts/release-image-record.mjs trivy-summary --evidence "$EVIDENCE" >> "$GITHUB_STEP_SUMMARY"'
    )
  })

  it('never reads the Trivy volume from the host and creates it only for the DB download', () => {
    for (const step of allSteps) {
      expect(step.run).not.toMatch(/docker cp|docker volume inspect|Mountpoint/)
      if ('TRIVY_IMAGE' in step.env) continue
      const mentions = step.run
        .split('\n')
        .filter((line) => line.includes('TRIVY_VOLUME'))
      if (step.name === 'Cleanup release') {
        expect(mentions).toEqual([
          'docker volume rm --force "$TRIVY_VOLUME" || true'
        ])
      } else {
        expect(mentions, step.name).toEqual([])
      }
    }
    expect(release[download].run).toContain(
      'docker volume create "$TRIVY_VOLUME"'
    )
    expect(workflow.match(/docker volume create/g)).toHaveLength(1)
  })

  it('attests the pushed digest with provenance and the evidence SBOM', () => {
    const [provenance, sbom] = attests.map((i) => release[i])
    for (const step of [provenance, sbom]) {
      expect(step.with['subject-name']).toBe('${{ steps.paths.outputs.image }}')
      expect(step.with['subject-digest']).toBe(
        '${{ steps.push.outputs.digest }}'
      )
      expect(step.with['push-to-registry']).toBe('true')
      expect(step.with['create-storage-record']).toBe('false')
      expect(step.with).not.toHaveProperty('subject-path')
      expect(step.with).not.toHaveProperty('predicate')
    }
    expect(provenance.id).toBe('attest-provenance')
    expect(provenance.with).not.toHaveProperty('sbom-path')
    expect(sbom.id).toBe('attest-sbom')
    expect(sbom.with['sbom-path']).toBe(
      '${{ runner.temp }}/release/evidence/sbom.cdx.json'
    )
    expect(release[publish].env).toMatchObject({
      GATE_RECORD: '${{ needs.gate.outputs.gate_record }}',
      PROVENANCE_BUNDLE: '${{ steps.attest-provenance.outputs.bundle-path }}',
      SBOM_BUNDLE: '${{ steps.attest-sbom.outputs.bundle-path }}'
    })
  })

  it('uploads only the explicit evidence list, never the image', () => {
    const step = release[upload]
    expect(step.with.name).toBe('${{ steps.paths.outputs.artifact_name }}')
    expect(step.with['retention-days']).toBe('90')
    expect(step.with['if-no-files-found']).toBe('error')
    const listed = step.text
      .split('\n')
      .filter((line) => line.startsWith('            '))
      .map((line) => line.trim())
    expect(listed).toEqual(
      UPLOAD_EVIDENCE_NAMES.map(
        (name) => `\${{ runner.temp }}/release/evidence/${name}`
      )
    )
    expect(step.text).not.toMatch(/\*|image\.tar|release\/in|release\s*$/m)
  })

  it('cleans up login, volume and the release directory', () => {
    const cleanup = release.at(-1)
    expect(cleanup.if).toBe('always()')
    expect(cleanup.run.split('\n')).toEqual([
      'docker logout ghcr.io || true',
      'docker volume rm --force "$TRIVY_VOLUME" || true',
      'rm -rf "$RUNNER_TEMP/release"'
    ])
  })
})

describe('SPEC0253 P1: release-verify job', () => {
  const find = (predicate, label) => stepIndex(verify, predicate, label)
  const download = find(
    (s) => s.uses?.startsWith('actions/download-artifact@'),
    'download'
  )
  const login = find((s) => s.run.includes('docker login ghcr.io'), 'login')
  const verifications = find(
    (s) => s.run.includes('gh attestation verify'),
    'verify'
  )
  const anonymous = find(
    (s) => s.run.includes('release-image-gate.mjs anonymous'),
    'anonymous'
  )
  const record = find(
    (s) => s.run.includes('release-image-record.mjs verify'),
    'record'
  )
  const cleanup = find(
    (s) => s.name === 'Cleanup verify registry login',
    'cleanup'
  )

  it('pulls by digest with a temporary read-only login and verifies both predicates twice', () => {
    expect([
      download,
      login,
      verifications,
      anonymous,
      record,
      cleanup
    ]).toEqual(
      [download, login, verifications, anonymous, record, cleanup]
        .slice()
        .sort((a, b) => a - b)
    )
    for (const index of [login, verifications, cleanup]) {
      expect(verify[index].env.DOCKER_CONFIG).toBe(
        '${{ runner.temp }}/verify-docker'
      )
    }
    expect(verify[login].run).toContain('mkdir -m 0700 "$DOCKER_CONFIG"')
    expect(verify[login].run).toContain(
      'docker pull "ghcr.io/${GITHUB_REPOSITORY,,}@${DIGEST}"'
    )
    const run = logical(verify[verifications].run)
    expect(verify[verifications].env.S).toBe('${{ needs.gate.outputs.sha }}')
    expect(run).toContain('--source-digest "$S"')
    expectFourVerifications(run)
    expect(verify[record].env.DIGEST).toBe(
      '${{ needs.release.outputs.digest }}'
    )
    expect(verify[cleanup].run).toContain('rm -rf "$DOCKER_CONFIG"')
  })
})

describe('SPEC0253 P1: release scripts import only node: and local contracts', () => {
  it.each([
    'scripts/release-image-contract.mjs',
    'scripts/release-image-gate.mjs',
    'scripts/release-image-record.mjs'
  ])('%s', (file) => {
    const source = read(file)
    const specifiers = [
      ...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm),
      ...source.matchAll(/^\s*export\s[^'"]*\sfrom\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\(\s*['"]?([^'")]+)/g)
    ].map((match) => match[1])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(
        specifier.startsWith('node:') ||
          specifier === './release-image-contract.mjs' ||
          specifier === './runtime-image-contract.mjs',
        specifier
      ).toBe(true)
    }
    expect(source).not.toMatch(/\brequire\(/)
  })

  it('names the signer workflow file', () => {
    expect(SIGNER_WORKFLOW).toBe(workflowPath)
  })
})

describe('SPEC0253 P2: Dockerfile digest pins', () => {
  it('pins every FROM and the # syntax frontend by sha256', () => {
    const dockerfile = read('Dockerfile')
    const lines = dockerfile.split('\n')
    expect(lines[0]).toMatch(
      /^# syntax=docker\/dockerfile:1\.7@sha256:[0-9a-f]{64}$/
    )
    const froms = lines.filter((line) => /^FROM\s/i.test(line))
    expect(froms.length).toBe(4)
    for (const line of froms) {
      expect(line).toMatch(/^FROM \S+@sha256:[0-9a-f]{64} AS [a-z-]+$/)
    }
  })
})
