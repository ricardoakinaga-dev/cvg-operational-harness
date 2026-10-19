import { createHash } from 'node:crypto'

// This deliberately retains the replay's lossy JSON clone semantics. It is
// neither the strict JSON validator below nor a log normalizer.
export function replayJsonClone(value) {
  return JSON.parse(JSON.stringify(value))
}

const hostileKeys = new Set(['__proto__', 'prototype', 'constructor'])

// Inspect descriptors before reading values: getters/toJSON must never run.
// Shared subtrees are valid JSON; cycles, sparse arrays and hidden data are not.
function jsonSnapshot(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object') throw new TypeError('invalid JSON value')
  if (ancestors.has(value)) throw new TypeError('cyclic JSON value')
  const array = Array.isArray(value)
  const proto = Object.getPrototypeOf(value)
  if (
    array
      ? proto !== Array.prototype
      : proto !== Object.prototype && proto !== null
  )
    throw new TypeError('JSON requires plain objects/arrays')
  const keys = Reflect.ownKeys(value)
  if (array && keys.length !== value.length + 1)
    throw new TypeError('sparse or extended JSON array')
  const result = array ? [] : {}
  ancestors.add(value)
  try {
    for (const key of keys) {
      if (array && key === 'length') continue
      if (typeof key !== 'string' || hostileKeys.has(key))
        throw new TypeError('hostile JSON key')
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
        throw new TypeError('extended JSON array')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        throw new TypeError('JSON requires enumerable data properties')
      result[key] = jsonSnapshot(descriptor.value, ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
  return result
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`
}

export function canonicalJson(value) {
  return canonical(jsonSnapshot(value))
}

export function jsonDigest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function closedObject(value, fields, required = fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('expected object')
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new TypeError('unknown field')
  if (required.some((key) => !Object.hasOwn(value, key)))
    throw new TypeError('missing field')
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value))
    throw new TypeError('invalid identifier')
}

function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new TypeError('expected ISO UTC timestamp')
}

function normalizationPolicy(input) {
  const rules = jsonSnapshot(input)
  if (!Array.isArray(rules)) throw new TypeError('expected policy array')
  const seen = new Set()
  for (const rule of rules) {
    if (rule?.mode === 'id') {
      closedObject(rule, ['field', 'mode', 'namespace'])
      if (!['eventId', 'correlationId', 'traceId'].includes(rule.field))
        throw new TypeError('field is not ID envelope metadata')
      identifier(rule.namespace)
    } else if (rule?.mode === 'timestamp') {
      closedObject(rule, ['field', 'mode', 'value'])
      if (rule.field !== 'occurredAt')
        throw new TypeError('field is not timestamp envelope metadata')
      timestamp(rule.value)
    } else throw new TypeError('invalid normalization mode')
    if (seen.has(rule.field))
      throw new TypeError('repeated normalization field')
    seen.add(rule.field)
  }
  return rules
}

/** Explicit, top-level envelope metadata only; never recurse into payloads. */
export function normalizeLog(events, policy = []) {
  const raw = jsonSnapshot(events)
  if (
    !Array.isArray(raw) ||
    raw.some(
      (event) =>
        event === null || typeof event !== 'object' || Array.isArray(event)
    )
  )
    throw new TypeError('expected log of event objects')
  const rules = normalizationPolicy(policy)
  const projection = jsonSnapshot(raw)
  const namespaces = new Map()
  for (const event of projection) {
    for (const rule of rules) {
      if (!Object.hasOwn(event, rule.field)) continue
      const value = event[rule.field]
      if (rule.mode === 'timestamp') {
        timestamp(value)
        event[rule.field] = rule.value
      } else {
        if (typeof value !== 'string' || value.length === 0)
          throw new TypeError('expected nonempty metadata ID')
        let ids = namespaces.get(rule.namespace)
        if (!ids) namespaces.set(rule.namespace, (ids = new Map()))
        if (!ids.has(value))
          ids.set(value, `id:${rule.namespace}:${ids.size + 1}`)
        event[rule.field] = ids.get(value)
      }
    }
  }
  return freeze({
    raw,
    policy: rules,
    projection,
    policyDigest: jsonDigest(rules),
    projectionDigest: jsonDigest(projection)
  })
}

/** An inventory, never a result or an authority/parity assertion. */
export function createSuiteManifest(input) {
  const manifest = jsonSnapshot(input)
  closedObject(manifest, [
    'formatVersion',
    'id',
    'version',
    'synthetic',
    'cases'
  ])
  identifier(manifest.id)
  if (
    manifest.formatVersion !== 1 ||
    typeof manifest.version !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)
  )
    throw new TypeError('unsupported manifest version')
  if (manifest.synthetic !== true)
    throw new TypeError('manifest must be synthetic')
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0)
    throw new TypeError('manifest requires cases')
  const ids = new Set()
  for (const entry of manifest.cases) {
    closedObject(entry, ['id', 'family'])
    identifier(entry.id)
    identifier(entry.family)
    if (ids.has(entry.id)) throw new TypeError('duplicate case ID')
    ids.add(entry.id)
  }
  return freeze({ manifest, digest: jsonDigest(manifest) })
}

// Recording defaults to the old conformance semantics (retain event reference).
// Replay explicitly opts into its historical JSON clone and timeline hooks.
export class RecordingAudit {
  events = []
  constructor({ copy = (event) => event, onAppend = () => {} } = {}) {
    this.copy = copy
    this.onAppend = onAppend
  }
  async append(event) {
    this.events.push(this.copy(event))
    this.onAppend(event)
  }
}

export class RecordingTelemetry {
  events = []
  constructor({ copy = (event) => event, onRecord = () => {} } = {}) {
    this.copy = copy
    this.onRecord = onRecord
  }
  record(event) {
    this.events.push(this.copy(event))
    this.onRecord(event)
  }
}

export function fixedClock(instant) {
  timestamp(instant)
  return () => new Date(instant)
}

export function sequenceIds(prefix, start = 0) {
  if (
    typeof prefix !== 'string' ||
    prefix.length === 0 ||
    !Number.isSafeInteger(start) ||
    start < 0
  )
    throw new TypeError('invalid ID sequence')
  let next = start
  return () => {
    if (!Number.isSafeInteger(next + 1))
      throw new RangeError('ID sequence exhausted')
    return `${prefix}${++next}`
  }
}
