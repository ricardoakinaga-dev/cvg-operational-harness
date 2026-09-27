import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CI_BAR_GATES, CI_BAR_VERSION } from './ci-bar-contract.mjs'

const SEAL_KIND = 'cvg-ci-gate-seal-v1'
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function requiredString(value, field, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`ci_bar_provenance_invalid_${field}`)
  }
  return value
}

export function runnerIdentity(env) {
  const runId = requiredString(env.GITHUB_RUN_ID, 'run_id', /^[0-9]+$/)
  const attempt = requiredString(env.GITHUB_RUN_ATTEMPT, 'attempt', /^[0-9]+$/)
  const sha = requiredString(env.GITHUB_SHA, 'sha', /^[0-9a-f]{40}$/i)
  const repository = requiredString(
    env.GITHUB_REPOSITORY,
    'repository',
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
  )
  const workflow = requiredString(
    env.GITHUB_WORKFLOW,
    'workflow',
    /^[A-Za-z0-9_. -]{1,120}$/
  )
  return { runId, attempt, sha: sha.toLowerCase(), repository, workflow }
}

export function gateStepId(id) {
  if (!CI_BAR_GATES.some((gate) => gate.id === id && id !== 'artifacts')) {
    throw new Error(`ci_bar_provenance_unknown_gate:${id}`)
  }
  return `gate_${id.replaceAll('-', '_')}`
}

function gateContract(id) {
  const gate = CI_BAR_GATES.find((item) => item.id === id)
  if (!gate || id === 'artifacts') {
    throw new Error(`ci_bar_provenance_unknown_gate:${id}`)
  }
  return gate
}

function checkedFileSha256(filePath, expectedHash, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`ci_bar_provenance_missing_${label}`)
  }
  const digest = sha256(fs.readFileSync(filePath))
  if (expectedHash !== undefined && digest !== expectedHash) {
    throw new Error(`ci_bar_provenance_hash_mismatch_${label}`)
  }
  return digest
}

export function createGateSeal({ id, state, artifactDir, github }) {
  const gate = gateContract(id)
  const entry = state.gates?.find((item) => item.id === id)
  if (!entry || entry.status !== 'PASS' || entry.exitCode !== 0) {
    throw new Error(`ci_bar_provenance_gate_not_pass:${id}`)
  }
  if (
    id !== 'runtime' &&
    (entry.runId !== state.runId ||
      entry.candidateId !== state.candidateId ||
      entry.nodeVersion !== state.nodeVersion ||
      !Array.isArray(entry.outputFailures) ||
      entry.outputFailures.length !== 0)
  ) {
    throw new Error(`ci_bar_provenance_gate_binding_invalid:${id}`)
  }
  if (state.runId !== `run-${github.runId}-${github.attempt}`) {
    throw new Error('ci_bar_provenance_runner_run_mismatch')
  }
  const logPath = `gates/${id}.log`
  const logSha256 =
    id === 'runtime'
      ? null
      : checkedFileSha256(
          path.join(artifactDir, logPath),
          requiredString(entry.logSha256, 'log_hash', DIGEST_PATTERN),
          `log:${id}`
        )
  if (id !== 'runtime' && entry.log !== logPath) {
    throw new Error(`ci_bar_provenance_log_path_invalid:${id}`)
  }
  const initialization =
    id === 'runtime'
      ? (() => {
          const initialState = { ...state }
          delete initialState.gates
          return {
            stateSha256: sha256(canonicalJson(initialState)),
            runtimeSha256: checkedFileSha256(
              path.join(artifactDir, 'runtime.txt'),
              undefined,
              'runtime'
            )
          }
        })()
      : undefined
  const snapshotSha256 = {}
  for (const relativePath of gate.artifacts ?? []) {
    snapshotSha256[relativePath] = checkedFileSha256(
      path.join(artifactDir, 'gate-outputs', id, relativePath),
      id === 'e2e' ? entry.artifactSha256?.[relativePath] : undefined,
      `snapshot:${id}:${relativePath}`
    )
  }
  if (
    id === 'e2e' &&
    (!entry.executionId ||
      !Number.isSafeInteger(entry.testCount) ||
      entry.testCount <= 0 ||
      !DIGEST_PATTERN.test(entry.testInventorySha256 ?? '') ||
      Object.keys(entry.artifactSha256 ?? {}).length !==
        (gate.artifacts ?? []).length)
  ) {
    throw new Error('ci_bar_provenance_e2e_binding_invalid')
  }
  return {
    kind: SEAL_KIND,
    contract: CI_BAR_VERSION,
    gateId: id,
    status: entry.status,
    exitCode: entry.exitCode,
    github,
    runId: state.runId,
    candidateId: state.candidateId,
    nodeVersion: state.nodeVersion,
    entrySha256: sha256(canonicalJson(entry)),
    logSha256,
    snapshotSha256,
    ...(initialization ? { initialization } : {}),
    ...(id === 'e2e'
      ? {
          executionId: entry.executionId,
          testCount: entry.testCount,
          testInventorySha256: entry.testInventorySha256
        }
      : {})
  }
}

export function artifactInventory(artifactDir, relativePaths) {
  return relativePaths.map((relativePath) => {
    if (
      path.isAbsolute(relativePath) ||
      relativePath.split('/').some((part) => part === '..' || part === '')
    ) {
      throw new Error(`ci_bar_provenance_unsafe_artifact_path:${relativePath}`)
    }
    const filePath = path.join(artifactDir, relativePath)
    const stat = fs.lstatSync(filePath)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`ci_bar_provenance_unsafe_artifact:${relativePath}`)
    }
    return {
      path: relativePath,
      sha256: sha256(fs.readFileSync(filePath)),
      size: stat.size
    }
  })
}

export function verifyArtifactInventory(artifactDir, inventory, relativePaths) {
  try {
    if (
      !Array.isArray(inventory) ||
      inventory.length !== relativePaths.length ||
      inventory.some((item, index) => item.path !== relativePaths[index])
    ) {
      return false
    }
    return (
      canonicalJson(artifactInventory(artifactDir, relativePaths)) ===
      canonicalJson(inventory)
    )
  } catch {
    return false
  }
}

export function encodeGateSeal(seal) {
  return Buffer.from(canonicalJson(seal), 'utf8').toString('base64url')
}

export function decodeGateSeal(encoded) {
  if (
    typeof encoded !== 'string' ||
    encoded.length === 0 ||
    encoded.length > 32_000 ||
    !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    throw new Error('ci_bar_provenance_seal_encoding_invalid')
  }
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
  const seal = JSON.parse(decoded)
  if (
    !seal ||
    typeof seal !== 'object' ||
    Array.isArray(seal) ||
    seal.kind !== SEAL_KIND ||
    encodeGateSeal(seal) !== encoded
  ) {
    throw new Error('ci_bar_provenance_seal_invalid')
  }
  return seal
}

export function verifyGateSeals({ state, artifactDir, steps, github }) {
  const failures = []
  const verified = []
  const expectedIds = CI_BAR_GATES.filter(
    (gate) => gate.id !== 'artifacts'
  ).map((gate) => gate.id)
  const observedIds = Array.isArray(state.gates)
    ? state.gates.map((gate) => gate.id)
    : []
  if (
    observedIds.length !== expectedIds.length ||
    new Set(observedIds).size !== expectedIds.length ||
    expectedIds.some((id) => !observedIds.includes(id))
  ) {
    failures.push('provenance_gate_inventory_mismatch')
  }
  for (const gate of CI_BAR_GATES) {
    if (gate.id === 'artifacts') continue
    const stepId = gateStepId(gate.id)
    const step = steps?.[stepId]
    if (
      !step ||
      step.outcome !== 'success' ||
      step.conclusion !== 'success' ||
      typeof step.outputs?.seal !== 'string'
    ) {
      failures.push(`provenance_step_missing_or_failed:${gate.id}`)
      continue
    }
    try {
      const observed = decodeGateSeal(step.outputs.seal)
      const expected = createGateSeal({
        id: gate.id,
        state,
        artifactDir,
        github
      })
      if (canonicalJson(observed) !== canonicalJson(expected)) {
        failures.push(`provenance_seal_mismatch:${gate.id}`)
        continue
      }
      verified.push({
        gateId: gate.id,
        sealSha256: sha256(step.outputs.seal),
        seal: observed
      })
    } catch (error) {
      failures.push(
        `provenance_seal_invalid:${gate.id}:${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return {
    mode: 'GITHUB_STEP_OUTPUT_SEALED',
    github,
    verifiedGateCount: verified.length,
    sealSetSha256: sha256(canonicalJson(verified)),
    gateSeals: verified,
    failures
  }
}
