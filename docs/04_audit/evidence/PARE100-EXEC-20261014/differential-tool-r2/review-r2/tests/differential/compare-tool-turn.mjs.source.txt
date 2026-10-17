import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readReferenceInventory } from './reference-inventory.mjs'
import { validateToolCase, TOOL_NAME } from './tool-case.mjs'
import { normalizeToolTransport } from './tool-transport.mjs'

// Test runner's trusted repository cwd; the bytes are hash-bound before use.
// import.meta.url is an HTTP virtual module URL under Vitest's browser env.
const witnessBytes = fs.readFileSync(
  path.resolve('tests/differential/tool-native-witnesses.json')
)
if (
  crypto.createHash('sha256').update(witnessBytes).digest('hex') !==
  'ab335918817382be434cde8bed8bc9a96dd310b64be7eba24eeca061dc4a6b55'
)
  throw new Error('invalid native tool witness integrity')
const witnesses = JSON.parse(witnessBytes.toString('utf8')).cases
const invalid = () => {
  throw new Error('invalid native tool observation')
}

function snapshot(value) {
  let nodes = 0
  const ancestors = new Set()
  const visit = (v, depth) => {
    if (++nodes > 20000 || depth > 64) invalid()
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0)) invalid()
      return
    }
    if (!v || typeof v !== 'object' || ancestors.has(v)) invalid()
    const descriptors = Object.getOwnPropertyDescriptors(v)
    if (Reflect.ownKeys(v).some((key) => typeof key !== 'string')) invalid()
    if (Array.isArray(v)) {
      if (
        Object.getPrototypeOf(v) !== Array.prototype ||
        Object.keys(descriptors).length !== v.length + 1
      )
        invalid()
      for (let i = 0; i < v.length; i++) {
        const d = descriptors[String(i)]
        if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) invalid()
      }
    } else if (Object.getPrototypeOf(v) !== Object.prototype) invalid()
    ancestors.add(v)
    for (const [key, d] of Object.entries(descriptors)) {
      if (Array.isArray(v) && key === 'length') continue
      if (!Object.hasOwn(d, 'value') || !d.enumerable) invalid()
      visit(d.value, depth + 1)
    }
    ancestors.delete(v)
  }
  visit(value, 0)
  const encoded = JSON.stringify(value)
  if (Buffer.byteLength(encoded) > 512 * 1024) invalid()
  return JSON.parse(encoded)
}

/** Complete native regression witness matching with a narrow, enumerated
 * transport projection. Observed witnesses are not a full parity oracle. */
export function measureToolTurn(reference, cvg, input) {
  const fixture = validateToolCase(input)
  const witness = witnesses.find((entry) => entry.fixture.id === fixture.id)
  if (!witness || !isDeepStrictEqual(witness.fixture, fixture)) invalid()
  const raw = snapshot({ reference, cvg })
  const actualToolSchema = {
    name: TOOL_NAME,
    description: 'Pure synthetic echo; no external capabilities',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false
    }
  }
  if (
    !Array.isArray(raw.reference.native.requests) ||
    raw.reference.native.requests.length !== 2 ||
    raw.reference.native.requests.some(
      ({ request, signal }) =>
        request.provider !== 'pare100-synthetic' ||
        request.model !== 'keyless-v1' ||
        request.maxTokens !== 128 ||
        request.sessionId !== `pare100-${fixture.id}` ||
        !isDeepStrictEqual(request.tools, [actualToolSchema]) ||
        !isDeepStrictEqual(request.toolHistory.tools, request.tools) ||
        signal.kind !== 'AbortSignal' ||
        signal.aborted !== false
    )
  )
    invalid()
  const results = raw.cvg.native.modelResults
  const decisions = raw.cvg.native.decisionTurns
  if (
    !Array.isArray(results) ||
    results.length !== 2 ||
    !Array.isArray(decisions) ||
    decisions.length !== 2
  )
    invalid()
  results.forEach((result, index) => {
    if (
      result.provider !== 'pare100-synthetic' ||
      result.model !== 'keyless-v1' ||
      result.inputTokens !== 1 ||
      result.outputTokens !== 2 ||
      result.costUsd !== 0 ||
      result.text !== raw.cvg.native.responses[index] ||
      !isDeepStrictEqual(JSON.parse(result.text), decisions[index].decision) ||
      !isDeepStrictEqual(decisions[index].usage, {
        modelCalls: 1,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd
      })
    )
      invalid()
  })
  if (
    !isDeepStrictEqual(
      raw.reference?.reference?.artifacts,
      readReferenceInventory()
    )
  )
    invalid()
  const normalized = normalizeToolTransport(raw)
  if (
    !isDeepStrictEqual(normalized, {
      value: witness.value,
      normalizedPaths: witness.normalizedPaths
    })
  )
    invalid()
  const expected = [
    { name: TOOL_NAME, input: { text: fixture.text }, output: fixture.text }
  ]
  if (
    !isDeepStrictEqual(raw.reference.native.toolBodies, expected) ||
    !isDeepStrictEqual(raw.cvg.native.toolBodies, expected) ||
    raw.reference.native.finalText !== fixture.text ||
    raw.cvg.native.turn.response !== fixture.text
  )
    invalid()
  return {
    status: 'MEASURED_BOUNDED_NATIVE_TOOL_TURN',
    fullParity: 'NOT_VERIFIED',
    sdkJourney: 'NOT_COVERED_SINGLE_PASS_GAP_RETAINED',
    commonProjection: { text: fixture.text, toolInvocations: expected },
    nativeDifferences: {
      entrypoints: ['reference.AgentLoop', 'CVG.publicIterativeHarness'],
      referenceEvents: raw.reference.native.events.map((event) => event.type),
      cvgEvents: raw.cvg.native.events.map((event) => event.type),
      cvgStepSideEffecting: raw.cvg.native.steps[0].sideEffecting,
      cvgDescriptorSideEffect:
        raw.cvg.native.policyDecisions[0].request.tool.sideEffect
    },
    normalizedPaths: normalized.normalizedPaths,
    witnessStatus: 'OBSERVED_NATIVE_REGRESSION_WITNESS_NOT_FULL_PARITY_ORACLE'
  }
}
