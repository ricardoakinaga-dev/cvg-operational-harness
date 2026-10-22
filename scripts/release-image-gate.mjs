#!/usr/bin/env node
// SPEC0253 §3.2 (RELEASE-CI-0253-20261021): release gate of the harness image.
//
//   collect      GET-only `gh api` reads saved to $RUNNER_TEMP/release-gate/
//   probe        package/tag probe through curl (tokens only on curl's stdin
//                config, never in argv); writes probe.json and step outputs
//   precondition the same probe; exits non-zero unless the package exists, is
//                private and sha-S is absent (release step 14)
//   anonymous    anonymous registry token request, recorded without any token
//   decide       evaluateReleaseGate over the files above
//
// Only node: modules and the local release contract are imported.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  DIGEST_PATTERN,
  OWNER_WORKFLOWS,
  PACKAGE_MISSING_CODES,
  PROBE_ACCEPT,
  RELEASE_IMAGE_CONTRACT,
  REQUIRED_CHECKS,
  SHA_PATTERN,
  SOURCE_REF,
  TAG_ABSENT_CODES,
  TAG_PATTERN,
  VERIFICATIONS,
  anonymousPullState,
  assertRealDirectory,
  parseJson,
  readRegularFile,
  releaseImageRef,
  sameRequiredChecks,
  summarizeVerification,
  VERIFICATION_OUTPUT_MAX
} from './release-image-contract.mjs'

const MiB = 1024 * 1024
const MAX_API_FILE = 32 * MiB
const MAX_SMALL_FILE = 1 * MiB
const MAX_TAG_PAGES = 100
const MAX_SUITES = 20
const MAX_PR_HEADS = 10
const CURL_TIMEOUT_SECONDS = '30'
const PACKAGE_MISSING_SUMMARY =
  'pacote ausente ou sem acesso do Actions; ver o pré-requisito da §9 da SPEC0253'

function requestFailed(request) {
  return (
    !request ||
    typeof request !== 'object' ||
    request.curlExit !== 0 ||
    !Number.isInteger(request.status) ||
    request.status >= 500 ||
    request.unreadable === true
  )
}

export function classifyPackageProbe(probe = {}) {
  const { tagName, authToken, tagsList, anonymousToken, manifest, timedOut } =
    probe
  const reasons = []
  const result = (pkg, tag, extra = {}) => ({
    package: pkg,
    tag,
    tagName: typeof tagName === 'string' ? tagName : null,
    reasons,
    ...extra
  })
  if (timedOut !== false) {
    reasons.push('probe_timeout_or_curl_error')
    return result('error', 'not_checked')
  }
  if (requestFailed(authToken)) {
    reasons.push('auth_token_error')
    return result('error', 'not_checked')
  }
  if (
    PACKAGE_MISSING_CODES.authToken.includes(authToken.code) ||
    [401, 403, 404].includes(authToken.status)
  ) {
    reasons.push(`auth_token_${authToken.status}_${authToken.code ?? 'none'}`)
    return result('missing_or_inaccessible', 'not_checked')
  }
  if (authToken.status !== 200 || authToken.tokenIssued !== true) {
    reasons.push(`auth_token_unexpected_${authToken.status}`)
    return result('error', 'not_checked')
  }
  if (requestFailed(tagsList)) {
    reasons.push('tags_list_error')
    return result('error', 'not_checked')
  }
  if (
    PACKAGE_MISSING_CODES.tagsList.includes(tagsList.code) ||
    PACKAGE_MISSING_CODES.tagsListStatus.includes(tagsList.status)
  ) {
    reasons.push(`tags_list_${tagsList.status}_${tagsList.code ?? 'none'}`)
    return result('missing_or_inaccessible', 'not_checked')
  }
  if (
    tagsList.status !== 200 ||
    !Array.isArray(tagsList.tags) ||
    !tagsList.tags.every((tag) => typeof tag === 'string')
  ) {
    reasons.push(`tags_list_unexpected_${tagsList.status}`)
    return result('error', 'not_checked')
  }
  // O5: an existing package always lists at least the user's placeholder tag.
  if (tagsList.tags.length === 0) {
    reasons.push('package_tags_empty')
    return result('missing_or_inaccessible', 'not_checked')
  }
  const anonymous = anonymousPullState(anonymousToken)
  if (anonymous === 'TOKEN') {
    reasons.push('anonymous_token_issued')
    return result('public', 'not_checked')
  }
  if (anonymous !== 'DENIED') {
    reasons.push('anonymous_token_error')
    return result('error', 'not_checked')
  }
  if (typeof tagName !== 'string' || !TAG_PATTERN.test(tagName)) {
    reasons.push('tag_name_invalid')
    return result('ok', 'error')
  }
  const listed = tagsList.tags.includes(tagName)
  if (requestFailed(manifest)) {
    reasons.push('manifest_error')
    return result('ok', 'error')
  }
  if (manifest.status === 200) {
    if (DIGEST_PATTERN.test(manifest.digest ?? '')) {
      return result('ok', 'present', {
        digest: manifest.digest,
        contentType: manifest.contentType ?? null
      })
    }
    reasons.push('manifest_without_digest')
    return result('ok', 'error')
  }
  if (
    manifest.status === 404 &&
    TAG_ABSENT_CODES.includes(manifest.code) &&
    !listed
  ) {
    return result('ok', 'absent')
  }
  reasons.push(
    listed && manifest.status === 404
      ? 'tag_listed_without_manifest'
      : `manifest_${manifest.status}_${manifest.code ?? 'none'}`
  )
  return result('ok', 'error')
}

function runSummary(run) {
  return {
    workflow: run.path,
    id: run.id,
    event: run.event,
    headSha: run.head_sha,
    checkSuiteId: run.check_suite_id,
    status: run.status,
    conclusion: run.conclusion
  }
}

function pickCheck(suites, run, required, headSha) {
  const list = suites?.[String(run.check_suite_id)]
  if (!Array.isArray(list)) return { reason: 'suite_missing' }
  const candidates = list.filter(
    (check) =>
      check?.name === required.context &&
      check?.app?.id === required.appId &&
      check?.check_suite?.id === run.check_suite_id &&
      check?.head_sha === headSha &&
      Number.isSafeInteger(check?.id)
  )
  if (candidates.length === 0) return { reason: 'absent' }
  const newest = candidates.reduce((left, right) =>
    right.id > left.id ? right : left
  )
  const summary = {
    context: required.context,
    appId: newest.app.id,
    workflow: required.workflow,
    checkRunId: newest.id,
    checkSuiteId: run.check_suite_id,
    runId: run.id,
    status: newest.status,
    conclusion: newest.conclusion
  }
  if (newest.status !== 'completed' || newest.conclusion !== 'success') {
    return { reason: `${newest.status}_${newest.conclusion}`, summary }
  }
  return { summary }
}

export function evaluateReleaseGate(inputs = {}) {
  const reasons = []
  const githubSha = inputs.githubSha
  const out = {
    decision: 'refuse',
    reasons,
    sha: SHA_PATTERN.test(githubSha ?? '') ? githubSha : null,
    pr: null,
    runs: { main: [], pr: [] },
    checks: { main: [], pr: [] },
    protection: [],
    package: inputs.probe ?? null
  }
  const done = (decision) => {
    out.decision = decision
    return out
  }
  const repository = inputs.repository
  const workflowRun = inputs.workflowRun ?? {}

  // 1. Payload (redundant with the job if:).
  if (!out.sha) reasons.push('github_sha_invalid')
  if (typeof repository !== 'string' || repository.length === 0) {
    reasons.push('repository_missing')
  }
  if (workflowRun.event !== 'push') reasons.push('payload_event')
  if (workflowRun.head_branch !== 'main') reasons.push('payload_branch')
  if (workflowRun.head_repository?.full_name !== repository) {
    reasons.push('payload_repository')
  }
  if (workflowRun.conclusion !== 'success') reasons.push('payload_conclusion')
  if (inputs.githubRef !== SOURCE_REF) reasons.push('payload_ref')
  if (reasons.length > 0) return done('refuse')

  // 2. Current commit: main moved, the newer SHA gets its own release.
  if (workflowRun.head_sha !== githubSha) {
    reasons.push('main_moved_past_run_head')
    return done('superseded')
  }

  // 3. Live protection equals REQUIRED_CHECKS.
  const protection = inputs.branchProtection
  const live = protection?.protection?.required_status_checks
  const liveChecks = Array.isArray(live?.checks) ? live.checks : []
  out.protection = liveChecks.map((check) => ({
    context: check?.context,
    app_id: check?.app_id
  }))
  if (protection?.protected !== true) reasons.push('protection_not_protected')
  if (protection?.protection?.enabled !== true) {
    reasons.push('protection_not_enabled')
  }
  if (live?.enforcement_level !== 'everyone') {
    reasons.push('protection_enforcement_level')
  }
  if (
    !Array.isArray(live?.checks) ||
    !sameRequiredChecks(out.protection.map((c) => [c.context, c.app_id]))
  ) {
    reasons.push('protection_checks_differ_from_required_checks')
  }
  if (reasons.length > 0) return done('refuse')

  // 4. Exactly one push run per owner workflow.
  const pushRuns = Array.isArray(inputs.pushRuns) ? inputs.pushRuns : []
  const ownerRuns = new Map()
  let waiting = false
  for (const workflow of OWNER_WORKFLOWS) {
    const matches = pushRuns.filter(
      (run) =>
        run?.event === 'push' &&
        run.head_sha === githubSha &&
        run.head_branch === 'main' &&
        run.path === workflow &&
        run.head_repository?.full_name === repository
    )
    if (matches.length !== 1) {
      reasons.push(`push_runs_${matches.length}:${workflow}`)
      continue
    }
    const run = matches[0]
    out.runs.main.push(runSummary(run))
    if (run.status !== 'completed') {
      waiting = true
      continue
    }
    if (run.conclusion !== 'success') {
      reasons.push(`push_run_${run.conclusion}:${workflow}`)
      continue
    }
    ownerRuns.set(workflow, run)
  }
  if (reasons.length > 0) return done('refuse')
  if (waiting) {
    reasons.push('owner_push_run_in_progress')
    return done('wait')
  }

  // 5. Required checks in the suite of the owner push run.
  for (const required of REQUIRED_CHECKS) {
    const run = ownerRuns.get(required.workflow)
    const pick = pickCheck(inputs.mainSuiteCheckRuns, run, required, githubSha)
    if (pick.summary) out.checks.main.push(pick.summary)
    if (pick.reason)
      reasons.push(`main_check_${pick.reason}:${required.context}`)
  }
  if (reasons.length > 0) return done('refuse')

  // 6. Filter first, then count: exactly one merged PR whose merge commit is S.
  const merged = (Array.isArray(inputs.pulls) ? inputs.pulls : []).filter(
    (pr) =>
      Boolean(pr?.merged_at) &&
      pr.base?.ref === 'main' &&
      pr.merge_commit_sha === githubSha &&
      pr.head?.repo?.full_name === repository
  )
  if (merged.length !== 1) {
    reasons.push(`merged_pulls_${merged.length}`)
    return done('refuse')
  }
  const pr = merged[0]
  const headSha = pr.head?.sha
  out.pr = {
    number: pr.number,
    headSha,
    mergeCommitSha: pr.merge_commit_sha,
    mergedAt: pr.merged_at
  }
  if (!SHA_PATTERN.test(headSha ?? '')) {
    reasons.push('pr_head_sha_invalid')
    return done('refuse')
  }

  // 7. Newest pull_request run of each owner on the PR head, and its checks.
  const prRuns = Array.isArray(inputs.prRuns) ? inputs.prRuns : []
  const prOwnerRuns = new Map()
  for (const workflow of OWNER_WORKFLOWS) {
    const candidates = prRuns.filter(
      (run) =>
        run?.event === 'pull_request' &&
        run.head_sha === headSha &&
        run.path === workflow &&
        run.head_repository?.full_name === repository &&
        Number.isSafeInteger(run.id)
    )
    if (candidates.length === 0) {
      reasons.push(`pr_run_missing:${workflow}`)
      continue
    }
    const run = candidates.reduce((left, right) =>
      right.id > left.id ? right : left
    )
    out.runs.pr.push(runSummary(run))
    if (run.status !== 'completed' || run.conclusion !== 'success') {
      reasons.push(`pr_run_${run.status}_${run.conclusion}:${workflow}`)
      continue
    }
    prOwnerRuns.set(workflow, run)
  }
  if (reasons.length > 0) return done('refuse')
  for (const required of REQUIRED_CHECKS) {
    const run = prOwnerRuns.get(required.workflow)
    const pick = pickCheck(inputs.prSuiteCheckRuns, run, required, headSha)
    if (pick.summary) out.checks.pr.push(pick.summary)
    if (pick.reason) reasons.push(`pr_check_${pick.reason}:${required.context}`)
  }
  if (reasons.length > 0) return done('refuse')

  // 8. Package and tag; the release never creates the package.
  const probe = inputs.probe
  if (!probe || probe.tagName !== `sha-${githubSha}`) {
    reasons.push('probe_missing_or_for_another_tag')
    return done('refuse')
  }
  if (probe.package === 'missing_or_inaccessible') {
    reasons.push('package_missing_or_inaccessible')
    return done('refuse')
  }
  if (probe.package === 'public') {
    reasons.push('package_public')
    return done('refuse')
  }
  if (probe.package !== 'ok') {
    reasons.push(`package_${probe.package}`)
    return done('refuse')
  }
  if (probe.tag === 'absent') return done('publish')
  if (probe.tag !== 'present') {
    reasons.push(`tag_${probe.tag}`)
    return done('refuse')
  }
  out.digest = probe.digest
  const verifications = inputs.tag?.verifications ?? {}
  const postcondition = {}
  for (const verification of VERIFICATIONS) {
    const summary = summarizeVerification({
      ...verifications[verification.key],
      digest: probe.digest,
      predicateType: verification.predicateType
    })
    postcondition[verification.key] = {
      ok: summary.ok,
      reasons: summary.reasons,
      count: summary.count
    }
    if (!summary.ok) {
      reasons.push(
        `postcondition_${verification.key}:${summary.reasons.join('+')}`
      )
    }
  }
  postcondition.anonymousPull = anonymousPullState(inputs.tag?.anonymousPull)
  if (postcondition.anonymousPull !== 'DENIED') {
    reasons.push(`postcondition_anonymous_${postcondition.anonymousPull}`)
  }
  out.postcondition = postcondition
  return done(reasons.length > 0 ? 'refuse' : 'already_published')
}

// O2: the gate record that the release job copies into release-image.json.
export function gateRecordFrom(result) {
  return {
    decision: result.decision,
    sha: result.sha,
    pr: result.pr,
    runs: result.runs,
    checks: result.checks,
    protection: result.protection
  }
}

function readJsonFile(directory, relative, maxBytes = MAX_API_FILE) {
  return parseJson(
    readRegularFile(path.join(directory, relative), maxBytes, relative),
    relative
  )
}

function flattenPages(value, key, label) {
  const pages = Array.isArray(value) ? value : [value]
  return pages.flatMap((page) => {
    if (key === null && Array.isArray(page)) return page
    if (key !== null && Array.isArray(page?.[key])) return page[key]
    throw new Error(`release_gate_pages_invalid:${label}`)
  })
}

function listDirectory(directory, pattern, label) {
  if (!fs.existsSync(directory)) return []
  assertRealDirectory(directory)
  return fs.readdirSync(directory).map((name) => {
    const match = name.match(pattern)
    if (!match) throw new Error(`release_gate_unexpected_file:${label}/${name}`)
    return match
  })
}

export function loadGateInputs(directory) {
  assertRealDirectory(directory)
  const context = readJsonFile(directory, 'context.json', MAX_SMALL_FILE)
  const suites = (sub) => {
    const map = {}
    for (const [name, id] of listDirectory(
      path.join(directory, sub),
      /^(\d+)\.json$/,
      sub
    )) {
      map[id] = flattenPages(
        readJsonFile(directory, `${sub}/${name}`),
        'check_runs',
        `${sub}/${name}`
      )
    }
    return map
  }
  const prRuns = listDirectory(
    path.join(directory, 'pr-runs'),
    /^[0-9a-f]{40}\.json$/,
    'pr-runs'
  ).flatMap(([name]) =>
    flattenPages(
      readJsonFile(directory, `pr-runs/${name}`),
      'workflow_runs',
      `pr-runs/${name}`
    )
  )
  const raw = readJsonFile(directory, 'probe.json', MAX_SMALL_FILE)
  const { tag: tagName, ...requests } = raw ?? {}
  const probe = classifyPackageProbe({ tagName, ...requests })
  const tag = { digest: probe.digest }
  const verificationDir = path.join(directory, 'verifications')
  if (fs.existsSync(verificationDir)) {
    listDirectory(
      verificationDir,
      /^(provenance|sbom)-(api|oci)\.(json|exit)$/,
      'verifications'
    )
    tag.verifications = {}
    for (const verification of VERIFICATIONS) {
      const base = path.join(verificationDir, verification.name)
      const entry = {}
      if (fs.existsSync(`${base}.exit`)) {
        const text = readRegularFile(
          `${base}.exit`,
          64,
          `${verification.name}.exit`
        )
          .toString('utf8')
          .trim()
        entry.exitCode = /^\d+$/.test(text) ? Number(text) : undefined
      }
      if (fs.existsSync(`${base}.json`)) {
        const bytes = readRegularFile(
          `${base}.json`,
          VERIFICATION_OUTPUT_MAX,
          `${verification.name}.json`
        )
        try {
          entry.output = JSON.parse(bytes.toString('utf8'))
        } catch {
          entry.output = null
        }
      }
      tag.verifications[verification.key] = entry
    }
  }
  if (fs.existsSync(path.join(directory, 'anonymous-pull.json'))) {
    tag.anonymousPull = readJsonFile(
      directory,
      'anonymous-pull.json',
      MAX_SMALL_FILE
    )
  }
  return {
    repository: context.repository,
    githubSha: context.githubSha,
    githubRef: context.githubRef,
    workflowRun: context.workflowRun,
    branchProtection: readJsonFile(directory, 'branch-main.json'),
    pushRuns: flattenPages(
      readJsonFile(directory, 'push-runs.json'),
      'workflow_runs',
      'push-runs.json'
    ),
    mainSuiteCheckRuns: suites('main-suites'),
    pulls: flattenPages(
      readJsonFile(directory, 'pulls.json'),
      null,
      'pulls.json'
    ),
    prRuns,
    prSuiteCheckRuns: suites('pr-suites'),
    probe,
    tag
  }
}

// ---------------------------------------------------------------- probe ---

function curlConfigValue(value, label) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value)) {
    throw new Error(`release_probe_value_invalid:${label}`)
  }
  if (value.includes('"') || value.includes('\\')) {
    throw new Error(`release_probe_value_invalid:${label}`)
  }
  return value
}

function curl(url, { config, accept } = {}) {
  const argv = [
    '--silent',
    '--show-error',
    '--max-time',
    CURL_TIMEOUT_SECONDS,
    '--dump-header',
    '-'
  ]
  if (config !== undefined) argv.push('--config', '-')
  if (accept) argv.push('-H', `Accept: ${accept.join(', ')}`)
  argv.push(url)
  const run = spawnSync('curl', argv, {
    input: config ?? '',
    maxBuffer: 64 * MiB
  })
  if (run.error || run.status !== 0) {
    return { curlExit: run.status ?? -1 }
  }
  let rest = run.stdout.toString('latin1')
  let head = ''
  do {
    const end = rest.indexOf('\r\n\r\n')
    if (end < 0) return { curlExit: 0, unreadable: true }
    head = rest.slice(0, end)
    rest = rest.slice(end + 4)
  } while (/^HTTP\/\S+ 1\d\d\b/.test(head) && rest.startsWith('HTTP/'))
  const status = Number(head.match(/^HTTP\/\S+ (\d{3})\b/)?.[1])
  if (!Number.isInteger(status)) return { curlExit: 0, unreadable: true }
  const headers = {}
  for (const line of head.split('\r\n').slice(1)) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      headers[line.slice(0, colon).trim().toLowerCase()] = line
        .slice(colon + 1)
        .trim()
    }
  }
  return {
    curlExit: 0,
    status,
    headers,
    body: Buffer.from(rest, 'latin1').toString('utf8')
  }
}

function jsonBody(response) {
  try {
    return JSON.parse(response.body)
  } catch {
    return undefined
  }
}

function errorCode(body) {
  const code = body?.errors?.[0]?.code
  return typeof code === 'string' ? code : null
}

function tokenUrl(name) {
  return `https://ghcr.io/token?scope=repository:${name}:pull&service=ghcr.io`
}

export function probeAnonymous(name) {
  const response = curl(tokenUrl(name))
  if (response.curlExit !== 0 || response.unreadable) {
    return {
      status: response.status ?? null,
      code: null,
      tokenIssued: false,
      curlExit: response.curlExit,
      ...(response.unreadable ? { unreadable: true } : {})
    }
  }
  const body = jsonBody(response)
  return {
    status: response.status,
    code: errorCode(body),
    tokenIssued: typeof body?.token === 'string' && body.token.length > 0,
    curlExit: 0
  }
}

export function probePackage({ name, tagName, actor, token, mask }) {
  const user = `${curlConfigValue(actor, 'actor')}:${curlConfigValue(token, 'token')}`
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/.test(actor)) {
    throw new Error('release_probe_value_invalid:actor')
  }
  const probe = { tag: tagName }
  const auth = curl(tokenUrl(name), { config: `user = "${user}"\n` })
  let registryToken = null
  if (auth.curlExit !== 0 || auth.unreadable) {
    probe.authToken = {
      status: auth.status ?? null,
      code: null,
      tokenIssued: false,
      curlExit: auth.curlExit,
      ...(auth.unreadable ? { unreadable: true } : {})
    }
  } else {
    const body = jsonBody(auth)
    const issued = typeof body?.token === 'string' ? body.token : null
    let valid = false
    if (issued) {
      mask(issued)
      try {
        curlConfigValue(issued, 'registry_token')
        valid = true
      } catch {
        valid = false
      }
    }
    if (valid && auth.status === 200) registryToken = issued
    probe.authToken = {
      status: auth.status,
      code: errorCode(body),
      tokenIssued: Boolean(issued) && valid,
      curlExit: 0,
      ...(body === undefined ? { unreadable: true } : {})
    }
  }
  const bearer = registryToken
    ? `header = "Authorization: Bearer ${registryToken}"\n`
    : undefined
  if (bearer) {
    const tags = []
    let pages = 0
    let next = `/v2/${name}/tags/list?n=100`
    while (next) {
      pages += 1
      if (pages > MAX_TAG_PAGES) {
        probe.tagsList = {
          status: 200,
          code: 'TOO_MANY_PAGES',
          tags: null,
          pages,
          curlExit: 0,
          unreadable: true
        }
        break
      }
      const response = curl(`https://ghcr.io${next}`, { config: bearer })
      next = null
      if (response.curlExit !== 0 || response.unreadable) {
        probe.tagsList = {
          status: response.status ?? null,
          code: null,
          tags: null,
          pages,
          curlExit: response.curlExit,
          ...(response.unreadable ? { unreadable: true } : {})
        }
        break
      }
      const body = jsonBody(response)
      if (response.status !== 200) {
        probe.tagsList = {
          status: response.status,
          code: errorCode(body),
          tags: null,
          pages,
          curlExit: 0
        }
        break
      }
      const pageTags = body?.tags ?? []
      if (!Array.isArray(pageTags)) {
        probe.tagsList = {
          status: 200,
          code: null,
          tags: null,
          pages,
          curlExit: 0,
          unreadable: true
        }
        break
      }
      tags.push(...pageTags)
      const link = response.headers.link
      if (link) {
        const match = link.match(/<([^>]+)>\s*;\s*rel="?next"?/)
        if (!match || !match[1].startsWith(`/v2/${name}/tags/list?`)) {
          probe.tagsList = {
            status: 200,
            code: 'LINK_INVALID',
            tags: null,
            pages,
            curlExit: 0,
            unreadable: true
          }
          break
        }
        next = match[1]
      } else {
        probe.tagsList = { status: 200, code: null, tags, pages, curlExit: 0 }
      }
    }
  }
  probe.anonymousToken = probeAnonymous(name)
  if (bearer) {
    const response = curl(`https://ghcr.io/v2/${name}/manifests/${tagName}`, {
      config: bearer,
      accept: PROBE_ACCEPT
    })
    if (response.curlExit !== 0 || response.unreadable) {
      probe.manifest = {
        status: response.status ?? null,
        code: null,
        contentType: null,
        digest: null,
        curlExit: response.curlExit,
        ...(response.unreadable ? { unreadable: true } : {})
      }
    } else {
      probe.manifest = {
        status: response.status,
        code: response.status === 200 ? null : errorCode(jsonBody(response)),
        contentType: response.headers['content-type'] ?? null,
        digest: response.headers['docker-content-digest'] ?? null,
        curlExit: 0
      }
    }
  }
  probe.timedOut = [
    probe.authToken,
    probe.tagsList,
    probe.anonymousToken,
    probe.manifest
  ].some((request) => request && request.curlExit !== 0)
  return probe
}

// ------------------------------------------------------------------- CLI ---

function argument(args, flag) {
  const index = args.indexOf(flag)
  const value = index >= 0 ? args[index + 1] : undefined
  if (!value) throw new Error(`release_gate_argument_missing:${flag}`)
  return value
}

function writeNewFile(file, data) {
  fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 })
}

function appendOutput(lines) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
  }
}

function appendSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
  }
}

function packageName() {
  return releaseImageRef(process.env.GITHUB_REPOSITORY).slice('ghcr.io/'.length)
}

function ghApi(endpoint, paginate) {
  const args = ['api', '--method', 'GET']
  if (paginate) args.push('--paginate', '--slurp')
  args.push(endpoint)
  const run = spawnSync('gh', args, { maxBuffer: 256 * MiB })
  if (run.error || run.status !== 0) {
    throw new Error(
      `release_gate_gh_api_failed:${endpoint}:${run.status}:${String(run.stderr ?? '').trim()}`
    )
  }
  return { bytes: run.stdout, value: parseJson(run.stdout, endpoint) }
}

function collect(args) {
  const directory = argument(args, '--dir')
  const env = process.env
  const repository = env.GITHUB_REPOSITORY
  const sha = env.GITHUB_SHA
  releaseImageRef(repository)
  if (!SHA_PATTERN.test(sha ?? '')) throw new Error('release_gate_github_sha')
  fs.mkdirSync(directory, { mode: 0o700 })
  writeNewFile(
    path.join(directory, 'context.json'),
    `${JSON.stringify(
      {
        repository,
        githubSha: sha,
        githubRef: env.GITHUB_REF,
        workflowRun: {
          head_sha: env.RUN_HEAD_SHA,
          event: env.RUN_EVENT,
          head_branch: env.RUN_HEAD_BRANCH,
          head_repository: { full_name: env.RUN_HEAD_REPOSITORY },
          conclusion: env.RUN_CONCLUSION
        }
      },
      null,
      2
    )}\n`
  )
  const save = (relative, result) =>
    writeNewFile(path.join(directory, relative), result.bytes)
  const fetchSuites = (sub, runs, headSha) => {
    const ids = [
      ...new Set(
        runs
          .filter(
            (run) =>
              OWNER_WORKFLOWS.includes(run?.path) && run.head_sha === headSha
          )
          .map((run) => run.check_suite_id)
      )
    ]
    if (ids.length > MAX_SUITES || !ids.every(Number.isSafeInteger)) {
      throw new Error(`release_gate_suites_unexpected:${sub}`)
    }
    fs.mkdirSync(path.join(directory, sub), { recursive: true, mode: 0o700 })
    for (const id of ids) {
      save(
        `${sub}/${id}.json`,
        ghApi(
          `repos/${repository}/check-suites/${id}/check-runs?filter=all&per_page=100`,
          true
        )
      )
    }
  }
  save('branch-main.json', ghApi(`repos/${repository}/branches/main`, false))
  const pushRuns = ghApi(
    `repos/${repository}/actions/runs?head_sha=${sha}&event=push&per_page=100`,
    true
  )
  save('push-runs.json', pushRuns)
  fetchSuites(
    'main-suites',
    flattenPages(pushRuns.value, 'workflow_runs', 'push-runs'),
    sha
  )
  const pulls = ghApi(
    `repos/${repository}/commits/${sha}/pulls?per_page=100`,
    true
  )
  save('pulls.json', pulls)
  const heads = [
    ...new Set(
      flattenPages(pulls.value, null, 'pulls')
        .map((pr) => pr?.head?.sha)
        .filter((head) => SHA_PATTERN.test(head ?? ''))
    )
  ]
  if (heads.length > MAX_PR_HEADS) throw new Error('release_gate_pr_heads')
  fs.mkdirSync(path.join(directory, 'pr-runs'), { mode: 0o700 })
  for (const head of heads) {
    const runs = ghApi(
      `repos/${repository}/actions/runs?head_sha=${head}&event=pull_request&per_page=100`,
      true
    )
    save(`pr-runs/${head}.json`, runs)
    fetchSuites(
      'pr-suites',
      flattenPages(runs.value, 'workflow_runs', `pr-runs/${head}`),
      head
    )
  }
}

function runProbe(args) {
  const directory = argument(args, '--dir')
  const sha = argument(args, '--sha')
  if (!SHA_PATTERN.test(sha)) throw new Error('release_gate_sha_invalid')
  const raw = probePackage({
    name: packageName(),
    tagName: `sha-${sha}`,
    actor: process.env.GITHUB_ACTOR,
    token: process.env.PROBE_TOKEN,
    mask: (value) => process.stdout.write(`::add-mask::${value}\n`)
  })
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeNewFile(
    path.join(directory, 'probe.json'),
    `${JSON.stringify(raw, null, 2)}\n`
  )
  const { tag: tagName, ...requests } = raw
  return classifyPackageProbe({ tagName, ...requests })
}

function probeCommand(args) {
  const probe = runProbe(args)
  appendOutput([
    `package=${probe.package}`,
    `tag=${probe.tag}`,
    ...(probe.digest ? [`digest=${probe.digest}`] : [])
  ])
  process.stdout.write(`${JSON.stringify(probe)}\n`)
}

function preconditionCommand(args) {
  const probe = runProbe(args)
  process.stdout.write(`${JSON.stringify(probe)}\n`)
  if (probe.package === 'ok' && probe.tag === 'absent') return 0
  const message = `release_precondition_failed:package=${probe.package}:tag=${probe.tag}:${probe.reasons.join('+')}`
  process.stderr.write(`${message}\n`)
  appendSummary([
    '### Release precondition failed (no login, no push)',
    '',
    `- ${message}`,
    ...(probe.package === 'missing_or_inaccessible'
      ? [`- ${PACKAGE_MISSING_SUMMARY}`]
      : [])
  ])
  return 1
}

function anonymousCommand(args) {
  const out = argument(args, '--out')
  const answer = probeAnonymous(packageName())
  writeNewFile(out, `${JSON.stringify(answer, null, 2)}\n`)
  process.stdout.write(`anonymous=${anonymousPullState(answer)}\n`)
}

function decideCommand(args) {
  const directory = argument(args, '--dir')
  let result
  try {
    result = evaluateReleaseGate(loadGateInputs(directory))
  } catch (error) {
    result = {
      decision: 'refuse',
      reasons: [
        `gate_input_invalid:${error instanceof Error ? error.message : String(error)}`
      ],
      sha: null
    }
  }
  const record = {
    schemaVersion: 1,
    kind: 'cvg-release-gate',
    contract: RELEASE_IMAGE_CONTRACT,
    generatedAt: new Date().toISOString(),
    result
  }
  try {
    writeNewFile(
      path.join(directory, 'release-gate.json'),
      `${JSON.stringify(record, null, 2)}\n`
    )
  } catch (error) {
    result.decision = 'refuse'
    result.reasons.push(
      `gate_record_write_failed:${error instanceof Error ? error.message : String(error)}`
    )
  }
  const publish = result.decision === 'publish'
  appendOutput([
    `decision=${result.decision}`,
    `publish=${publish ? 'true' : 'false'}`,
    ...(result.sha ? [`sha=${result.sha}`] : []),
    ...(result.digest ? [`digest=${result.digest}`] : []),
    ...(publish
      ? [`gate_record=${JSON.stringify(gateRecordFrom(result))}`]
      : [])
  ])
  appendSummary([
    `### Release gate: \`${result.decision}\``,
    '',
    ...(result.sha ? [`- commit: \`${result.sha}\``] : []),
    ...(result.digest ? [`- digest: \`${result.digest}\``] : []),
    ...(result.reasons.includes('package_missing_or_inaccessible')
      ? [`- ${PACKAGE_MISSING_SUMMARY}`]
      : []),
    ...result.reasons.map((reason) => `- ${reason}`)
  ])
  process.stdout.write(
    `${JSON.stringify({ decision: result.decision, reasons: result.reasons })}\n`
  )
  if (result.decision === 'refuse') {
    process.stderr.write(`release_gate_refused:${result.reasons.join(',')}\n`)
    return 1
  }
  return 0
}

const COMMANDS = {
  collect,
  probe: probeCommand,
  precondition: preconditionCommand,
  anonymous: anonymousCommand,
  decide: decideCommand
}

function main(argv) {
  const [command, ...args] = argv
  const handler = COMMANDS[command]
  if (!handler) throw new Error(`release_gate_unknown_command:${command}`)
  return handler(args) ?? 0
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 1
  }
}
