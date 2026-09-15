import { createHash } from 'node:crypto'
import type {
  CapabilityDescriptor,
  CapabilityImplementation,
  CapabilityOrigin,
  CapabilityRegistration,
  CapabilityRegistry as CapabilityRegistryPort,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'

const CAPABILITY_ID_PATTERN = /^[A-Za-z0-9._:-]+$/
const MAX_ID_LENGTH = 120
const MAX_VERSION_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 4000
const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 20_000
const MAX_JSON_STRING_LENGTH = 16_384
const MAX_JSON_KEY_LENGTH = 512
const MAX_JSON_KEYS = 512
const MAX_JSON_ARRAY_LENGTH = 512
const MAX_JSON_BYTES = 256 * 1024
const UNSAFE_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const AUTHORITY_FIELDS = [
  'tenantId',
  'agentId',
  'correlationId',
  'traceId'
] as const
const ORIGINS: readonly CapabilityOrigin[] = [
  'core',
  'skill',
  'plugin',
  'knowledge',
  'mcp'
]

export type CapabilityRegistryErrorCode =
  | 'invalid_descriptor'
  | 'invalid_implementation'
  | 'duplicate_capability'

export class CapabilityRegistryError extends Error {
  public readonly code: CapabilityRegistryErrorCode

  public constructor(code: CapabilityRegistryErrorCode, message: string) {
    super(message)
    this.name = 'CapabilityRegistryError'
    this.code = code
  }
}

interface StoredRegistration {
  readonly descriptor: CapabilityDescriptor
  readonly implementation: CapabilityImplementation
}

const registrationsByRegistry = new WeakMap<
  object,
  readonly StoredRegistration[]
>()

/**
 * Explicit, immutable capability composition for the neutral harness.
 * Implementations are retained in a private module-owned store. The
 * executable adapter is only reachable from the composition root.
 */
export class CapabilityRegistry implements CapabilityRegistryPort {
  public constructor(registrations: readonly CapabilityRegistration[] = []) {
    const stored: StoredRegistration[] = []
    for (const registration of registrations) {
      const normalized = normalizeRegistration(registration)
      if (
        stored.some(
          (candidate) =>
            candidate.descriptor.id === normalized.descriptor.id &&
            candidate.descriptor.version === normalized.descriptor.version
        )
      ) {
        throw new CapabilityRegistryError(
          'duplicate_capability',
          `Capability already registered: ${normalized.descriptor.id}@${normalized.descriptor.version}`
        )
      }
      stored.push(normalized)
    }
    registrationsByRegistry.set(this, Object.freeze(stored))
  }

  public register(registration: CapabilityRegistration): CapabilityRegistry {
    const normalized = normalizeRegistration(registration)
    if (
      getRegistrations(this).some(
        (candidate) =>
          candidate.descriptor.id === normalized.descriptor.id &&
          candidate.descriptor.version === normalized.descriptor.version
      )
    ) {
      throw new CapabilityRegistryError(
        'duplicate_capability',
        `Capability already registered: ${normalized.descriptor.id}@${normalized.descriptor.version}`
      )
    }

    return CapabilityRegistry.fromStored([
      ...getRegistrations(this),
      normalized
    ])
  }

  public listDescriptors(): readonly CapabilityDescriptor[] {
    return sorted(getRegistrations(this)).map(({ descriptor }) =>
      cloneDescriptor(descriptor)
    )
  }

  public resolveDescriptor(
    capabilityId: string,
    version: string
  ): CapabilityDescriptor | undefined {
    if (!isBoundedIdentifier(capabilityId, MAX_ID_LENGTH)) return undefined
    if (!isBoundedVersion(version)) return undefined
    const registration = getRegistrations(this).find(
      (candidate) =>
        candidate.descriptor.id === capabilityId &&
        candidate.descriptor.version === version
    )
    return registration ? cloneDescriptor(registration.descriptor) : undefined
  }

  public compositionFingerprint(): string {
    const descriptors = sorted(getRegistrations(this)).map(
      ({ descriptor }) => descriptor
    )
    return createHash('sha256')
      .update(
        stableSerialize({
          schemaVersion: 'capability-composition-v1',
          descriptors
        })
      )
      .digest('hex')
  }

  private static fromStored(
    registrations: readonly StoredRegistration[]
  ): CapabilityRegistry {
    const registry = Object.create(
      CapabilityRegistry.prototype
    ) as CapabilityRegistry
    registrationsByRegistry.set(registry, Object.freeze([...registrations]))
    return registry
  }
}

/** Creates an empty registry without requiring callers to know the class. */
export function createCapabilityRegistry(
  registrations: readonly CapabilityRegistration[] = []
): CapabilityRegistry {
  return new CapabilityRegistry(registrations)
}

export interface CapabilityComposition {
  readonly registry: CapabilityRegistry
  readonly fingerprint: string
}

export function composeCapabilities(
  registrations: readonly CapabilityRegistration[] = []
): CapabilityComposition {
  const registry = createCapabilityRegistry(registrations)
  return {
    registry,
    fingerprint: registry.compositionFingerprint()
  }
}

/**
 * Internal executable bridge for the public harness composition root. This is
 * deliberately not re-exported from the package entrypoint.
 */
export function createCapabilityToolRegistry(
  registry: CapabilityRegistryPort
): ToolRegistry {
  const snapshot = sorted(getRegistrations(registry))
  return {
    list: () => snapshot.map((registration) => toTool(registration)),
    resolve: (capabilityId, version) => {
      if (
        !isBoundedIdentifier(capabilityId, MAX_ID_LENGTH) ||
        !isBoundedVersion(version)
      ) {
        return undefined
      }
      const registration = snapshot.find(
        (candidate) =>
          candidate.descriptor.id === capabilityId &&
          candidate.descriptor.version === version
      )
      return registration ? toTool(registration) : undefined
    }
  }
}

function normalizeDescriptor(value: unknown): CapabilityDescriptor {
  if (!isPlainRecord(value)) {
    throw new CapabilityRegistryError(
      'invalid_descriptor',
      'Capability descriptor must be a plain object'
    )
  }

  const descriptor = value as Record<string, unknown>
  if (!isBoundedIdentifier(descriptor.id, MAX_ID_LENGTH)) {
    throw invalidDescriptor('Capability id is invalid')
  }
  if (!isBoundedVersion(descriptor.version)) {
    throw invalidDescriptor('Capability version must be exact and bounded')
  }
  if (
    typeof descriptor.description !== 'string' ||
    descriptor.description.trim().length === 0 ||
    descriptor.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw invalidDescriptor('Capability description is invalid')
  }
  if (!ORIGINS.includes(descriptor.origin as CapabilityOrigin)) {
    throw invalidDescriptor('Capability origin is invalid')
  }
  if (!isBoundedIdentifier(descriptor.providerId, MAX_ID_LENGTH)) {
    throw invalidDescriptor('Capability provider id is invalid')
  }
  if (!isBoundedVersion(descriptor.providerVersion)) {
    throw invalidDescriptor('Capability provider version is invalid')
  }
  if (
    !isRisk(descriptor.risk) ||
    !isSideEffect(descriptor.sideEffect) ||
    typeof descriptor.idempotent !== 'boolean' ||
    typeof descriptor.requiresApproval !== 'boolean'
  ) {
    throw invalidDescriptor('Capability governance metadata is invalid')
  }

  const inputSchema = cloneJsonValue(descriptor.inputSchema)
  const outputSchema = cloneJsonValue(descriptor.outputSchema)
  return deepFreeze({
    id: descriptor.id,
    version: descriptor.version,
    description: descriptor.description.trim(),
    inputSchema,
    outputSchema,
    risk: descriptor.risk,
    sideEffect: descriptor.sideEffect,
    idempotent: descriptor.idempotent,
    requiresApproval: descriptor.requiresApproval,
    origin: descriptor.origin,
    providerId: descriptor.providerId,
    providerVersion: descriptor.providerVersion
  }) as CapabilityDescriptor
}

function normalizeRegistration(value: unknown): StoredRegistration {
  try {
    if (!isPlainRecord(value)) {
      throw new CapabilityRegistryError(
        'invalid_descriptor',
        'Capability registration must be a plain object'
      )
    }
    const registration = value as Record<string, unknown>
    return {
      descriptor: normalizeDescriptor(registration.descriptor),
      implementation: normalizeImplementation(registration.implementation)
    }
  } catch (error) {
    if (error instanceof CapabilityRegistryError) throw error
    throw new CapabilityRegistryError(
      'invalid_descriptor',
      'Capability registration contains unsupported data'
    )
  }
}

function getRegistrations(
  registry: CapabilityRegistryPort
): readonly StoredRegistration[] {
  const registrations = registrationsByRegistry.get(registry as object)
  if (!registrations) {
    throw new CapabilityRegistryError(
      'invalid_descriptor',
      'Capability registry was not created by the neutral registry factory'
    )
  }
  return registrations
}

function normalizeImplementation(value: unknown): CapabilityImplementation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CapabilityRegistryError(
      'invalid_implementation',
      'Capability implementation requires input validation, execution, and output validation'
    )
  }

  let validateInput: CapabilityImplementation['validateInput']
  let execute: CapabilityImplementation['execute']
  let validateOutput: CapabilityImplementation['validateOutput']
  try {
    const implementation = value as Record<string, unknown>
    if (
      typeof implementation.validateInput !== 'function' ||
      typeof implementation.execute !== 'function' ||
      typeof implementation.validateOutput !== 'function'
    ) {
      throw new Error('missing implementation method')
    }
    validateInput = (
      implementation.validateInput as CapabilityImplementation['validateInput']
    ).bind(value)
    execute = (
      implementation.execute as CapabilityImplementation['execute']
    ).bind(value)
    validateOutput = (
      implementation.validateOutput as CapabilityImplementation['validateOutput']
    ).bind(value)
  } catch {
    throw new CapabilityRegistryError(
      'invalid_implementation',
      'Capability implementation requires input validation, execution, and output validation'
    )
  }
  return Object.freeze({
    validateInput,
    execute,
    validateOutput
  }) as CapabilityImplementation
}

function toTool(registration: StoredRegistration): ToolDefinition {
  const descriptor = cloneDescriptor(registration.descriptor)
  return {
    ...descriptor,
    execute: (input: unknown, context: ToolExecutionContext) =>
      executeBound(registration.implementation, input, context)
  }
}

async function executeBound(
  implementation: CapabilityImplementation,
  input: unknown,
  context: ToolExecutionContext
): Promise<ToolResult> {
  let safeInput: unknown
  try {
    safeInput = cloneJsonValue(input)
    if (!inputMatchesExecutionContext(safeInput, context)) {
      return { status: 'REJECTED', error: 'capability_input_invalid' }
    }
    if (implementation.validateInput(safeInput) !== true) {
      return { status: 'REJECTED', error: 'capability_input_invalid' }
    }
  } catch {
    return { status: 'REJECTED', error: 'capability_input_invalid' }
  }

  let result: ToolResult
  try {
    const safeContext = Object.freeze({ ...context }) as ToolExecutionContext
    const rawResult = await implementation.execute(safeInput, safeContext)
    const normalizedResult = normalizeToolResult(rawResult)
    if (!normalizedResult) {
      return { status: 'REJECTED', error: 'capability_result_invalid' }
    }
    result = normalizedResult
  } catch {
    return { status: 'FAILED', error: 'capability_execution_failed' }
  }

  if (result.status === 'SUCCEEDED') {
    try {
      if (implementation.validateOutput(result.output) !== true) {
        return { status: 'REJECTED', error: 'capability_output_invalid' }
      }
    } catch {
      return { status: 'REJECTED', error: 'capability_output_invalid' }
    }
  }

  try {
    return {
      status: result.status,
      ...(result.output !== undefined
        ? { output: cloneJsonValue(result.output) }
        : {}),
      ...(result.error !== undefined ? { error: result.error } : {})
    }
  } catch {
    return { status: 'REJECTED', error: 'capability_result_invalid' }
  }
}

function cloneDescriptor(
  descriptor: CapabilityDescriptor
): CapabilityDescriptor {
  return deepFreeze({
    ...descriptor,
    inputSchema: cloneJsonValue(descriptor.inputSchema),
    outputSchema: cloneJsonValue(descriptor.outputSchema)
  }) as CapabilityDescriptor
}

function sorted(
  registrations: readonly StoredRegistration[]
): readonly StoredRegistration[] {
  return [...registrations].sort((left, right) => {
    const idOrder = compareCodeUnits(left.descriptor.id, right.descriptor.id)
    if (idOrder !== 0) return idOrder
    const versionOrder = compareCodeUnits(
      left.descriptor.version,
      right.descriptor.version
    )
    if (versionOrder !== 0) return versionOrder
    return compareCodeUnits(
      left.descriptor.providerId,
      right.descriptor.providerId
    )
  })
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function inputMatchesExecutionContext(
  value: unknown,
  context: ToolExecutionContext
): boolean {
  if (Array.isArray(value)) {
    return value.every((child) => inputMatchesExecutionContext(child, context))
  }
  if (!isPlainRecord(value)) return true

  for (const [key, child] of Object.entries(value)) {
    if (
      (AUTHORITY_FIELDS as readonly string[]).includes(key) &&
      child !== context[key as (typeof AUTHORITY_FIELDS)[number]]
    ) {
      return false
    }
    if (!inputMatchesExecutionContext(child, context)) return false
  }
  return true
}

function invalidDescriptor(message: string): CapabilityRegistryError {
  return new CapabilityRegistryError('invalid_descriptor', message)
}

function isBoundedIdentifier(
  value: unknown,
  maxLength: number
): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength &&
    CAPABILITY_ID_PATTERN.test(value)
  )
}

function isBoundedVersion(value: unknown): value is string {
  return (
    isBoundedIdentifier(value, MAX_VERSION_LENGTH) &&
    value.toLowerCase() !== 'latest'
  )
}

function isRisk(value: unknown): boolean {
  return (
    value === 'LOW' ||
    value === 'MEDIUM' ||
    value === 'HIGH' ||
    value === 'CRITICAL'
  )
}

function isSideEffect(value: unknown): boolean {
  return (
    value === 'NONE' ||
    value === 'READ' ||
    value === 'WRITE' ||
    value === 'EXTERNAL'
  )
}

function normalizeToolResult(value: unknown): ToolResult | undefined {
  try {
    const safeValue = cloneJsonValue(value)
    if (!isPlainRecord(safeValue)) return undefined
    const status = safeValue.status
    if (!isToolStatus(status)) return undefined
    const error = safeValue.error
    if (
      error !== undefined &&
      (typeof error !== 'string' || error.length > 240)
    ) {
      return undefined
    }
    const output = safeValue.output
    return {
      status,
      ...(output !== undefined ? { output } : {}),
      ...(error !== undefined ? { error } : {})
    }
  } catch {
    return undefined
  }
}

function isToolStatus(value: unknown): value is ToolResult['status'] {
  return value === 'SUCCEEDED' || value === 'FAILED' || value === 'REJECTED'
}

function cloneJsonValue(value: unknown): unknown {
  return JSON.parse(stableSerialize(value)) as unknown
}

interface SerializationState {
  readonly seen: WeakSet<object>
  nodes: number
}

function stableSerialize(
  value: unknown,
  state: SerializationState = { seen: new WeakSet<object>(), nodes: 0 },
  depth = 0
): string {
  state.nodes += 1
  if (state.nodes > MAX_JSON_NODES) {
    throw new Error('JSON node budget exceeded')
  }
  if (depth > MAX_JSON_DEPTH) {
    throw new Error('JSON depth budget exceeded')
  }

  if (value === null) return 'null'
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_STRING_LENGTH) {
      throw new Error('JSON string budget exceeded')
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite value')
    return JSON.stringify(value)
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new Error('Value is not JSON serializable')
  }
  if (state.seen.has(value)) throw new Error('Value contains a cycle')
  state.seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_JSON_ARRAY_LENGTH) {
        throw new Error('JSON array budget exceeded')
      }
      const items: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new Error('Sparse arrays are not supported')
        }
        items.push(stableSerialize(value[index], state, depth + 1))
      }
      return boundedSerialized(`[${items.join(',')}]`)
    }
    if (!isPlainRecord(value)) throw new Error('Value is not a plain object')
    const keys = Object.keys(value)
    if (
      keys.length > MAX_JSON_KEYS ||
      Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== keys.length
    ) {
      throw new Error('JSON object budget or shape exceeded')
    }
    const parts: string[] = []
    for (const key of keys.sort()) {
      if (key.length > MAX_JSON_KEY_LENGTH || UNSAFE_JSON_KEYS.has(key)) {
        throw new Error('Unsafe JSON object key')
      }
      const property = Object.getOwnPropertyDescriptor(value, key)
      if (!property || !('value' in property)) {
        throw new Error('Accessor properties are not supported')
      }
      parts.push(
        `${JSON.stringify(key)}:${stableSerialize(property.value, state, depth + 1)}`
      )
    }
    return boundedSerialized(`{${parts.join(',')}}`)
  } finally {
    state.seen.delete(value)
  }
}

function boundedSerialized(value: string): string {
  if (value.length > MAX_JSON_BYTES) {
    throw new Error('JSON byte budget exceeded')
  }
  return value
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}
