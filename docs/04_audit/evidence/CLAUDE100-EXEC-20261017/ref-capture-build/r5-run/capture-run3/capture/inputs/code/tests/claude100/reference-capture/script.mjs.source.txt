import { parseStrictJson } from '../qualification/strict-json.mjs'
import {
  CASES,
  LIMITS,
  MODEL,
  STDIN_MARKERS,
  canonical,
  fault,
  sha256
} from './constants.mjs'

// Fixed deterministic scripts. No DSL, callback or file chooses any byte here.
export const TURNS = Object.freeze({ TEXT: 1, READ: 2, WRITE_DENIED: 2 })
export const TOOL_USES = Object.freeze({
  READ: Object.freeze({
    id: 'toolu_cvg_read_1',
    name: 'Read',
    input: Object.freeze({ file_path: '/workspace/input.txt' })
  }),
  // SPEC0238 rev.2: under --bare the client never offers Write, so the denied
  // file write is an Edit creating a new file (empty old_string), with
  // replace_all literal so a schema default cannot change tool_input.
  WRITE_DENIED: Object.freeze({
    id: 'toolu_cvg_write_1',
    name: 'Edit',
    input: Object.freeze({
      file_path: '/workspace/denied.txt',
      old_string: '',
      new_string: 'CVG_CAPTURE_MUST_NOT_WRITE_V1',
      replace_all: false
    })
  })
})
export const FINAL_TEXT = Object.freeze({
  TEXT: 'CVG_CAPTURE_TEXT_OK_V1',
  READ: 'CVG_CAPTURE_READ_DONE_V1',
  WRITE_DENIED: 'CVG_CAPTURE_WRITE_DENIED_DONE_V1'
})
export const MESSAGE_IDS = Object.freeze({
  TEXT: Object.freeze(['msg_cvg_TEXT_1']),
  READ: Object.freeze(['msg_cvg_READ_1', 'msg_cvg_READ_2']),
  WRITE_DENIED: Object.freeze([
    'msg_cvg_WRITE_DENIED_1',
    'msg_cvg_WRITE_DENIED_2'
  ])
})
const TEXT_DELTAS = Object.freeze(['CVG_CAPTURE_', 'TEXT_OK_V1'])
const ASCII = /^[\x20-\x7e]*$/

/** `event: <type>` LF `data: C(doc)` LF LF, UTF-8, data.type equal to the event name. */
export function sseEvent(document) {
  const data = canonical(document)
  if (typeof document.type !== 'string' || /[\r\n]/.test(data))
    throw fault('PROTOCOL')
  return Buffer.from(`event: ${document.type}\ndata: ${data}\n\n`)
}
function halves(text) {
  if (!ASCII.test(text)) throw fault('PROTOCOL')
  const bytes = Buffer.from(text)
  const half = Math.floor(bytes.length / 2)
  return [
    bytes.subarray(0, half).toString('ascii'),
    bytes.subarray(half).toString('ascii')
  ]
}
function usageStart() {
  return {
    input_tokens: 1,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0
  }
}
function headersFor(status, body) {
  return status === 200
    ? {
        'content-type': 'text/event-stream',
        'content-length': String(body.length),
        connection: 'close'
      }
    : {
        'content-type': 'application/json',
        'content-length': String(body.length),
        connection: 'close'
      }
}
function finalize(name, caseId, turn, status, segments) {
  const body = Buffer.concat(segments)
  if (body.length > LIMITS.responseBytes) throw fault('CAP')
  const headers = headersFor(status, body)
  return Object.freeze({
    name,
    caseId,
    turn,
    status,
    headers: Object.freeze(headers),
    headersBytes: Buffer.from(canonical(headers)),
    segments: Object.freeze(segments.map((s) => Buffer.from(s))),
    body
  })
}

/** Response1/final response of a case, exactly as tabled in SPEC0238. */
export function turnScript(caseId, turn) {
  if (!CASES.includes(caseId) || !Number.isSafeInteger(turn))
    throw fault('PROTOCOL')
  if (turn < 1 || turn > TURNS[caseId]) throw fault('PROTOCOL')
  const messageId = MESSAGE_IDS[caseId][turn - 1]
  const toolUse = turn === 1 && caseId !== 'TEXT' ? TOOL_USES[caseId] : null
  const start = {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: MODEL,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: usageStart()
    }
  }
  const block = toolUse
    ? { type: 'tool_use', id: toolUse.id, name: toolUse.name, input: {} }
    : { type: 'text', text: '' }
  const deltas = toolUse
    ? halves(canonical(toolUse.input)).map((partial) => ({
        type: 'input_json_delta',
        partial_json: partial
      }))
    : (caseId === 'TEXT' ? TEXT_DELTAS : halves(FINAL_TEXT[caseId])).map(
        (text) => ({ type: 'text_delta', text })
      )
  const segments = [
    sseEvent(start),
    sseEvent({ type: 'content_block_start', index: 0, content_block: block }),
    ...deltas.map((delta) =>
      sseEvent({ type: 'content_block_delta', index: 0, delta })
    ),
    sseEvent({ type: 'content_block_stop', index: 0 }),
    sseEvent({
      type: 'message_delta',
      delta: {
        stop_reason: toolUse ? 'tool_use' : 'end_turn',
        stop_sequence: null
      },
      usage: { output_tokens: 1 }
    }),
    sseEvent({ type: 'message_stop' })
  ]
  return finalize(`${caseId}-${turn}`, caseId, turn, 200, segments)
}

/** Fixed 400 for routes outside the eligible exchange and for divergent POSTs. */
export const REJECT_SCRIPT = finalize('REJECTED', null, null, 400, [
  Buffer.from(
    canonical({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'CVG_CAPTURE_REJECTED_V1'
      }
    })
  )
])

export function plannedScripts() {
  const scripts = []
  for (const caseId of CASES)
    for (let turn = 1; turn <= TURNS[caseId]; turn++)
      scripts.push(turnScript(caseId, turn))
  scripts.push(REJECT_SCRIPT)
  return scripts
}

export function classifyContentType(value) {
  if (value === undefined) return 'ABSENT'
  return /^application\/json(?:\s*;.*)?$/i.test(value) ? 'JSON' : 'OTHER'
}
export function classifyEncoding(value) {
  if (value === undefined) return 'ABSENT'
  return value.trim().toLowerCase() === 'identity' ? 'IDENTITY' : 'OTHER'
}

const blocksOf = (message) =>
  Array.isArray(message?.content)
    ? message.content.filter((b) => b && typeof b === 'object')
    : []
function hasMarker(body, marker) {
  return body.messages.some(
    (m) =>
      m?.role === 'user' &&
      (m.content === marker ||
        blocksOf(m).some((b) => b.type === 'text' && b.text === marker))
  )
}

/**
 * Structural guards only: model/stream/marker/tool inventory/turn and the
 * tool_use/tool_result pairing. Free text and tool_result content never
 * decide success; nothing here corrects or completes a request.
 */
export function inspectRequestBody(bytes, context) {
  const { caseId, turn, contentType, contentEncoding } = context
  const verdict = { markerVerified: false, scriptAccepted: false }
  if (!CASES.includes(caseId) || ![1, 2].includes(turn)) return verdict
  if (contentType !== 'JSON' || contentEncoding !== 'ABSENT') return verdict
  let body
  try {
    body = parseStrictJson(bytes, {
      maxBytes: LIMITS.bodyBytes,
      maxDepth: LIMITS.jsonDepth,
      maxStringBytes: LIMITS.jsonString
    })
  } catch {
    return verdict
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Array.isArray(body.messages)
  )
    return verdict
  verdict.markerVerified = hasMarker(body, STDIN_MARKERS[caseId])
  if (
    !verdict.markerVerified ||
    turn > TURNS[caseId] ||
    body.model !== MODEL ||
    body.stream !== true ||
    !Array.isArray(body.tools)
  )
    return verdict
  const names = body.tools.map((t) =>
    t && typeof t === 'object' && !Array.isArray(t) ? t.name : undefined
  )
  if (caseId === 'TEXT' ? names.length !== 0 : names.length !== 2)
    return verdict
  if (
    caseId !== 'TEXT' &&
    (new Set(names).size !== 2 ||
      !names.includes('Read') ||
      !names.includes('Edit'))
  )
    return verdict
  const uses = [],
    results = []
  body.messages.forEach((message, index) => {
    for (const block of blocksOf(message)) {
      if (block.type === 'tool_use') uses.push({ block, message, index })
      if (block.type === 'tool_result') results.push({ block, message, index })
    }
  })
  if (turn === 1) {
    verdict.scriptAccepted = uses.length === 0 && results.length === 0
    return verdict
  }
  const expected = TOOL_USES[caseId]
  if (uses.length !== 1 || results.length !== 1) return verdict
  const [use] = uses,
    [result] = results
  if (
    use.message.role !== 'assistant' ||
    use.block.id !== expected.id ||
    use.block.name !== expected.name ||
    canonicalOrNull(use.block.input) !== canonical(expected.input) ||
    result.message.role !== 'user' ||
    result.index <= use.index ||
    result.block.tool_use_id !== expected.id
  )
    return verdict
  verdict.scriptAccepted =
    caseId === 'READ'
      ? result.block.is_error === undefined || result.block.is_error === false
      : result.block.is_error === true
  return verdict
}
function canonicalOrNull(value) {
  try {
    return canonical(value)
  } catch {
    return null
  }
}

/**
 * Required complete native result: one strict JSON document with type=result,
 * subtype=success, is_error=false and the exact final scripted text. For
 * WRITE_DENIED the client must itself expose one Edit permission denial bound
 * to the scripted tool_use id and input (compared under canonical(), so key
 * order is irrelevant). Unknown data fields are preserved.
 */
export function inspectNativeResult(bytes, caseId) {
  let document
  try {
    document = parseStrictJson(bytes, {
      maxBytes: LIMITS.nativeStreamBytes,
      maxDepth: LIMITS.jsonDepth,
      maxStringBytes: LIMITS.jsonString
    })
  } catch {
    return { accepted: false, reason: 'JSON' }
  }
  if (!document || typeof document !== 'object' || Array.isArray(document))
    return { accepted: false, reason: 'SHAPE' }
  if (
    document.type !== 'result' ||
    document.subtype !== 'success' ||
    document.is_error !== false
  )
    return { accepted: false, reason: 'RESULT_STATUS' }
  if (document.result !== FINAL_TEXT[caseId])
    return { accepted: false, reason: 'RESULT_TEXT' }
  // SPEC0238 rev.2 R3: a READ with any recorded denial (or a non-array value)
  // is incompatible; only an absent or empty permission_denials passes.
  if (caseId === 'READ') {
    const denials = document.permission_denials
    if (
      denials !== undefined &&
      !(Array.isArray(denials) && denials.length === 0)
    )
      return { accepted: false, reason: 'PERMISSION_DENIAL' }
  }
  if (caseId === 'WRITE_DENIED') {
    const denials = document.permission_denials
    const expected = TOOL_USES.WRITE_DENIED
    if (
      !Array.isArray(denials) ||
      denials.length !== 1 ||
      !denials[0] ||
      typeof denials[0] !== 'object' ||
      denials[0].tool_name !== 'Edit' ||
      denials[0].tool_use_id !== expected.id ||
      canonicalOrNull(denials[0].tool_input) !== canonical(expected.input)
    )
      return { accepted: false, reason: 'PERMISSION_DENIAL' }
  }
  return { accepted: true, reason: null }
}

export const scriptDigest = (script) => ({
  headersSha256: sha256(script.headersBytes),
  bodySha256: sha256(script.body),
  segmentSha256: script.segments.map((s) => sha256(s))
})
