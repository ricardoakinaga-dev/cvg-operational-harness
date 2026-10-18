import { createCorrelationId } from '@cvg/shared'
import { createHash } from 'node:crypto'
import type { CapabilityDescriptor } from '@cvg/harness-contracts'
import type {
  CapabilityExecutionInput,
  CapabilityExecutionResult,
  CapabilityGateway,
  CapabilityApproval,
  CapabilityGatewayOptions,
  PlannedCapabilityTool,
  RegisteredPlugin,
  PluginHandler,
  PluginToolInputValidator,
  PluginToolOutputValidator
} from './plugin-gateway.ts'
import type { AgentConfig, PluginTool } from './contracts.ts'
import {
  canonicalizeCapabilityInput,
  createCapabilityInputHash
} from './approval-authority.ts'
import {
  cloneBoundedValue,
  normalizePluginHandlerResult,
  parseToolInput
} from './tool-invocation-boundary.ts'

interface Attestation {
  manifest: string
  handler: PluginHandler
  input: PluginToolInputValidator
  output: PluginToolOutputValidator
  inputParse: PluginToolInputValidator['safeParse']
  outputParse: PluginToolOutputValidator['safeParse']
  descriptor: CapabilityDescriptor
}
const attestations = new WeakMap<RegisteredPlugin, Attestation>()

/** Internal trusted-code entry point; never exported by platform/index. */
export function attestReviewedPlugin(
  plugin: RegisteredPlugin,
  descriptor: CapabilityDescriptor
): void {
  const handler = plugin.handlers[descriptor.id]!
  const input = plugin.inputValidators![descriptor.id]!
  const output = plugin.outputValidators![descriptor.id]!
  attestations.set(plugin, {
    manifest: canonicalizeCapabilityInput(plugin.manifest),
    handler,
    input,
    output,
    inputParse: input.safeParse,
    outputParse: output.safeParse,
    descriptor: Object.freeze({ ...descriptor })
  })
}

function attestation(plugin: RegisteredPlugin): Attestation | undefined {
  const a = attestations.get(plugin)
  if (!a) return undefined
  try {
    return a.manifest === canonicalizeCapabilityInput(plugin.manifest) &&
      plugin.handlers[a.descriptor.id] === a.handler &&
      plugin.inputValidators?.[a.descriptor.id] === a.input &&
      plugin.outputValidators?.[a.descriptor.id] === a.output &&
      Object.getOwnPropertyDescriptor(a.input, 'safeParse')?.value ===
        a.inputParse &&
      Object.getOwnPropertyDescriptor(a.output, 'safeParse')?.value ===
        a.outputParse
      ? a
      : undefined
  } catch {
    return undefined
  }
}

export function propagatePluginAttestation(
  source: RegisteredPlugin,
  clone: RegisteredPlugin
): RegisteredPlugin {
  const a = attestation(source)
  if (a) {
    attestations.set(clone, a)
    if (!attestation(clone)) attestations.delete(clone)
  }
  return clone
}

export interface ResolvedPluginCommand {
  plugin: RegisteredPlugin
  tool: PluginTool
  handler: PluginHandler
  inputValidator: PluginToolInputValidator
  outputValidator: PluginToolOutputValidator
}
export interface GatewayCore {
  options: CapabilityGatewayOptions
  now: () => Date
  parseApproval(value: unknown): CapabilityApproval | null
  catalog(config: AgentConfig, intent: string): PlannedCapabilityTool[]
  resolve(config: AgentConfig, name: string): ResolvedPluginCommand | null
  authorize(
    input: CapabilityExecutionInput,
    permission: string
  ): Promise<string[] | null>
}
const gateways = new WeakMap<CapabilityGateway, GatewayCore>()
export function registerGatewayCore(
  gateway: CapabilityGateway,
  core: GatewayCore
): void {
  gateways.set(gateway, core)
}
export function gatewayCore(
  gateway: CapabilityGateway | undefined
): GatewayCore | undefined {
  return gateway && gateways.get(gateway)
}

export function reviewedDescriptor(
  resolved: ResolvedPluginCommand
): CapabilityDescriptor | undefined {
  const a = attestation(resolved.plugin)
  return a &&
    a.handler === resolved.handler &&
    a.input === resolved.inputValidator &&
    a.output === resolved.outputValidator
    ? a.descriptor
    : undefined
}

export interface PreparedCapabilityCommand {
  readonly execution: CapabilityExecutionInput
  readonly resolved: ResolvedPluginCommand
  readonly canonical: string
  readonly inputHash: string
  readonly correlationId: CapabilityExecutionResult['correlationId']
  output?: Omit<CapabilityExecutionResult, 'correlationId'>
}
export function prepareCapabilityCommand(
  execution: CapabilityExecutionInput,
  resolved: ResolvedPluginCommand,
  freeze = false,
  correlationId?: CapabilityExecutionResult['correlationId']
): PreparedCapabilityCommand | null {
  const parsed = parseToolInput(resolved.inputValidator, execution.input)
  if (!parsed.success) return null
  const safe = {
    ...execution,
    input: freeze ? freezeValue(parsed.data) : parsed.data
  }
  return {
    execution: safe,
    resolved,
    canonical: canonicalizeCapabilityInput(parsed.data),
    inputHash: createCapabilityInputHash(safe),
    correlationId: correlationId ?? createCorrelationId()
  }
}
export function matchesPreparedInput(
  command: PreparedCapabilityCommand,
  value: unknown
): boolean {
  try {
    return (
      canonicalizeCapabilityInput(cloneBoundedValue(value)) ===
      command.canonical
    )
  } catch {
    return false
  }
}

/** Rebind canonical data to currently attested functions; never rerun safeParse. */
export function rehydratePreparedCapabilityCommand(
  saved: import('./controlled-kernel-continuation.ts').ControlledCanonicalCommand,
  config: AgentConfig,
  core: GatewayCore
): PreparedCapabilityCommand | null {
  try {
    const resolved = core.resolve(config, saved.execution.toolName)
    const descriptor = resolved && reviewedDescriptor(resolved)
    if (!resolved || !descriptor) return null
    const execution = {
      ...saved.execution,
      config,
      input: freezeValue(cloneBoundedValue(saved.execution.input))
    }
    if (
      saved.canonical !== canonicalizeCapabilityInput(execution.input) ||
      saved.inputHash !== createCapabilityInputHash(execution)
    )
      return null
    // Descriptor digest is a structural binding, never a substitute for WeakMap attestation.
    if (
      saved.descriptorFingerprint !==
      `sha256-${createHash('sha256').update(canonicalizeCapabilityInput(descriptor)).digest('hex')}`
    )
      return null
    const output =
      saved.output === undefined
        ? undefined
        : (cloneBoundedValue(
            saved.output
          ) as PreparedCapabilityCommand['output'])
    if (output && !['succeeded', 'blocked', 'failed'].includes(output.status))
      return null
    return {
      execution,
      resolved,
      canonical: saved.canonical,
      inputHash: saved.inputHash,
      correlationId: saved.correlationId,
      ...(output ? { output } : {})
    }
  } catch {
    return null
  }
}
export function matchesPreparedOutput(
  command: PreparedCapabilityCommand,
  value: unknown
): boolean {
  try {
    return (
      command.output?.status === 'succeeded' &&
      (command.output.data === undefined
        ? value === undefined
        : canonicalizeCapabilityInput(cloneBoundedValue(value)) ===
          canonicalizeCapabilityInput(command.output.data))
    )
  } catch {
    return false
  }
}
/** The admission callback and captured handler call share one synchronous turn. */
export async function executeAuthorizedPreparedCommand(
  command: PreparedCapabilityCommand,
  admit: () => boolean,
  requireReviewed = false
): Promise<Omit<CapabilityExecutionResult, 'correlationId'>> {
  const { execution, resolved } = command
  if (!admit())
    return { status: 'blocked', reason: 'terminal_admission_closed' }
  try {
    const raw = resolved.handler(execution.input, {
      tenantId: execution.tenantId,
      agentId: execution.agentId,
      versionId: execution.versionId,
      toolName: execution.toolName,
      dryRun: execution.dryRun
    })
    const rawResult = await raw
    const result =
      requireReviewed && !reviewedDescriptor(resolved)
        ? null
        : normalizePluginHandlerResult(rawResult, resolved.outputValidator)
    command.output = result ?? {
      status: 'failed',
      reason: 'tool_result_invalid'
    }
  } catch {
    command.output = { status: 'failed', reason: 'tool_execution_failed' }
  }
  return command.output
}
function freezeValue<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeValue)
    Object.freeze(value)
  }
  return value
}
