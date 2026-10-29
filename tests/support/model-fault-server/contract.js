import {
  canonicalJson,
  createSuiteManifest,
  jsonDigest
} from '../governed-test-kit/index.js'

export const SCENARIOS = Object.freeze([
  'ok-json',
  'rate-limit',
  'timeout',
  'disconnect',
  'invalid-json',
  'chunked-json',
  'synthetic-sse'
])
export const CREDENTIAL_NAMES = Object.freeze([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_AD_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'MODEL_PROVIDER_TOKEN',
  'MODEL_PROVIDER_COOKIE'
])
export const LIMITS = Object.freeze({
  requests: 32,
  requestBytes: 64 * 1024,
  responseBytes: 256 * 1024,
  chunks: 32,
  stringBytes: 4096,
  chunkDelayMs: 100,
  lifetimeMs: 5000
})

export function fail(code) {
  throw new Error(`synthetic fault server: ${code}`)
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

// Q03 alone owns descriptor-safe JSON traversal and canonical semantics.
export function snapshot(value) {
  return freeze(JSON.parse(canonicalJson(value)))
}

export function closed(value, fields, required = fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    fail('closed schema')
}

function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('cap')
}

function id(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  )
    fail('identifier')
}

export function validatePlan(input) {
  const plan = snapshot(input)
  // SPEC 0232b (F06b): `governedSystem` is the only optional field. Absent, the
  // plan and every digest derived from it are the frozen ones.
  closed(
    plan,
    [
      'version',
      'suiteId',
      'caseId',
      'scenario',
      'maxRequests',
      'chunkDelayMs',
      'governedSystem'
    ],
    ['version', 'suiteId', 'caseId', 'scenario', 'maxRequests', 'chunkDelayMs']
  )
  if (plan.version !== 1 || !SCENARIOS.includes(plan.scenario)) fail('plan')
  if (Object.hasOwn(plan, 'governedSystem') && plan.governedSystem !== true)
    fail('plan')
  id(plan.suiteId)
  id(plan.caseId)
  integer(plan.maxRequests, 1, LIMITS.requests)
  integer(plan.chunkDelayMs, 0, LIMITS.chunkDelayMs)
  createSuiteManifest({
    formatVersion: 1,
    id: plan.suiteId,
    version: '1.0.0',
    synthetic: true,
    cases: [{ id: plan.caseId, family: plan.scenario }]
  })
  return plan
}

/** SPEC 0232b: the approved instruction the governed gateway renders as `system`. */
export function governedInstruction(caseId) {
  return `CVG_SYNTHETIC_INSTRUCTION:${caseId}`
}

export function expectedSyntheticRequest(input) {
  const plan = validatePlan(input)
  // Native OpenAI adapter insertion order, deliberately distinct from canonical JSON.
  return snapshot({
    model: 'cvg-synthetic-model-v1',
    messages: [
      ...(plan.governedSystem === true
        ? [{ role: 'system', content: governedInstruction(plan.caseId) }]
        : []),
      { role: 'user', content: `CVG_SYNTHETIC_REQUEST:${plan.caseId}` }
    ],
    temperature: 0,
    max_tokens: 32,
    stream: false
  })
}

export function expectedRequestBytes(plan) {
  const request = expectedSyntheticRequest(plan)
  return Buffer.from(
    JSON.stringify({
      model: request.model,
      messages: request.messages.map(({ role, content }) => ({
        role,
        content
      })),
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: request.stream
    })
  )
}

export function recipe(plan) {
  const good = Buffer.from(
    JSON.stringify({
      choices: [
        { message: { content: 'CVG_SYNTHETIC_OK_á' }, finish_reason: 'stop' }
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2 }
    })
  )
  let bytes = [good]
  let termination = 'complete'
  let status = 200
  let contentType = 'application/json'
  if (plan.scenario === 'rate-limit') {
    status = 429
    bytes = [Buffer.from('{"error":"CVG_SYNTHETIC_RATE_LIMIT"}')]
  } else if (plan.scenario === 'timeout') {
    bytes = []
    termination = 'timeout'
  } else if (
    plan.scenario === 'disconnect' ||
    plan.scenario === 'invalid-json'
  ) {
    bytes = [good.subarray(0, 24)]
    if (plan.scenario === 'disconnect') termination = 'disconnect'
  } else if (plan.scenario === 'chunked-json') {
    const split = good.indexOf(Buffer.from('á')) + 1
    bytes = [good.subarray(0, split), good.subarray(split)]
  } else if (plan.scenario === 'synthetic-sse') {
    contentType = 'text/event-stream'
    bytes = [
      Buffer.from('data: {"synthetic":"CVG_SYNTHETIC_EVENT_1"}\n\n'),
      Buffer.from('data: [DONE]\n\n')
    ]
  }
  const chunks = bytes.map((chunk, ordinal) => ({
    ordinal,
    delayMs: plan.chunkDelayMs,
    base64: chunk.toString('base64')
  }))
  // Validate concrete recipe caps before opening resources, even though recipes are fixed.
  if (
    chunks.length > LIMITS.chunks ||
    bytes.reduce((n, b) => n + b.length, 0) > LIMITS.responseBytes ||
    chunks.some((chunk) => Buffer.byteLength(chunk.base64) > LIMITS.stringBytes)
  )
    fail('recipe cap')
  return snapshot({
    version: 1,
    suiteId: plan.suiteId,
    caseId: plan.caseId,
    synthetic: true,
    planSha256: jsonDigest(plan),
    requestSha256: jsonDigest(expectedSyntheticRequest(plan)),
    status,
    headers: { 'content-type': contentType },
    chunks,
    termination
  })
}

export function envelope(data) {
  return snapshot({ ...data, digest: jsonDigest(data) })
}

export function validateRecording(input, suppliedPlan) {
  const value = snapshot(input)
  closed(value, [
    'version',
    'suiteId',
    'caseId',
    'synthetic',
    'planSha256',
    'requestSha256',
    'status',
    'headers',
    'chunks',
    'termination',
    'digest'
  ])
  if (value.version !== 1 || value.synthetic !== true)
    fail('synthetic recording required')
  id(value.suiteId)
  id(value.caseId)
  for (const hash of [value.planSha256, value.requestSha256, value.digest]) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) fail('digest')
  }
  closed(value.headers, ['content-type'])
  if (
    !['application/json', 'text/event-stream'].includes(
      value.headers['content-type']
    ) ||
    ![200, 429].includes(value.status) ||
    !['complete', 'disconnect', 'timeout'].includes(value.termination) ||
    !Array.isArray(value.chunks) ||
    value.chunks.length > LIMITS.chunks
  )
    fail('recording shape')
  let total = 0
  for (const [ordinal, chunk] of value.chunks.entries()) {
    closed(chunk, ['ordinal', 'delayMs', 'base64'])
    if (chunk.ordinal !== ordinal) fail('ordinal')
    integer(chunk.delayMs, 0, LIMITS.chunkDelayMs)
    if (
      typeof chunk.base64 !== 'string' ||
      chunk.base64.length === 0 ||
      Buffer.byteLength(chunk.base64) > LIMITS.stringBytes ||
      Buffer.from(chunk.base64, 'base64').toString('base64') !== chunk.base64
    )
      fail('base64')
    total += Buffer.from(chunk.base64, 'base64').length
  }
  if (
    total > LIMITS.responseBytes ||
    (value.termination === 'timeout'
      ? value.chunks.length !== 0
      : value.chunks.length === 0)
  )
    fail('recording cap')
  const { digest, ...data } = value
  if (jsonDigest(data) !== digest) fail('digest mismatch')
  if (suppliedPlan) {
    if (canonicalJson(envelope(recipe(suppliedPlan))) !== canonicalJson(value))
      fail('recipe mismatch')
  } else {
    // Persistence has no plan argument. Recover only from the finite factory plans,
    // binding their complete digest; no traffic import or self-attested envelope.
    let match = false
    for (const scenario of SCENARIOS) {
      for (let chunkDelayMs = 0; chunkDelayMs <= 100; chunkDelayMs++) {
        const plan = {
          version: 1,
          suiteId: value.suiteId,
          caseId: value.caseId,
          scenario,
          maxRequests: 1,
          chunkDelayMs
        }
        if (jsonDigest(plan) === value.planSha256) {
          match = canonicalJson(envelope(recipe(plan))) === canonicalJson(value)
          break
        }
      }
      if (match) break
    }
    if (!match) fail('unknown recipe')
  }
  return value
}

export function assertSyntheticEnvironment(input) {
  const env = snapshot(input)
  closed(env, CREDENTIAL_NAMES, [])
  for (const name of CREDENTIAL_NAMES) {
    if (
      Object.hasOwn(env, name) &&
      (typeof env[name] !== 'string' || env[name] !== '')
    )
      fail('credential environment blocked')
  }
}

export function guardCurrentEnvironment() {
  const env = {}
  for (const name of CREDENTIAL_NAMES) {
    if (process.env[name] !== undefined) env[name] = process.env[name]
  }
  assertSyntheticEnvironment(env)
}

export function validateOptions(input, plan) {
  const options = snapshot(input)
  closed(options, ['mode', 'recording'], [])
  const mode = options.mode ?? 'replay'
  if (!['replay', 'record', 'refresh'].includes(mode)) fail('mode')
  if (mode !== 'replay' && plan.maxRequests !== 1)
    fail('record requires single exchange')
  const recording =
    options.recording === undefined || options.recording === null
      ? null
      : validateRecording(options.recording, plan)
  if (mode !== 'replay' && recording !== null)
    fail('record requires live exchange')
  return { mode, recording }
}
