import type { Readable, Writable } from 'node:stream'
import { SdkClientError, type SdkTransport } from './client.ts'
import type { JsonRpcRequest, JsonRpcResponse } from './protocol.ts'
import type { SdkServer } from './server.ts'
import {
  isRequest,
  validIdentifier,
  validParams,
  validateCorrelatedResponse
} from './validators.ts'

export const SDK_TRANSPORT_ERROR_CODES = {
  frame: -32080,
  response_too_large: -32081,
  timeout: -32082,
  transport: -32083,
  limit: -32084,
  invalid_response: -32085
} as const

export type SdkWireErrorKind =
  | 'frame'
  | 'timeout'
  | 'transport'
  | 'closed'
  | 'limit'
  | 'invalid_response'
  | 'remote_error'

export class SdkWireError extends SdkClientError {
  readonly retrySafe: boolean
  constructor(
    readonly kind: SdkWireErrorKind,
    readonly requestId: string | number,
    readonly method: string,
    readonly outcome: 'not_dispatched' | 'unknown',
    code: number,
    message: string,
    data?: unknown
  ) {
    super(code, message, data)
    this.name = 'SdkWireError'
    this.retrySafe = outcome === 'not_dispatched'
  }
}

export interface StdioTransportOptions {
  readonly input: Readable
  readonly output: Writable
  readonly maxFrameBytes?: number
  readonly maxPendingRequests?: number
  readonly requestTimeoutMs?: number
  readonly expectedTenantId: string
  readonly maxLifetimeRequests?: number
  readonly maxBufferedBytes?: number
}

export interface StdioSdkTransport extends SdkTransport {
  close(): Promise<void>
}

export interface StdioServerOptions {
  readonly input: Readable
  readonly output: Writable
  readonly server: SdkServer
  readonly maxFrameBytes?: number
  readonly maxQueuedRequests?: number
  readonly maxLifetimeRequests?: number
  readonly maxBufferedBytes?: number
  readonly closeTimeoutMs?: number
  readonly onError?: (failure: {
    readonly kind: 'frame' | 'transport' | 'limit' | 'invalid_response'
    readonly code: number
  }) => void
}

export interface StdioSdkServer {
  readonly closed: Promise<void>
  close(): Promise<void>
}

type LocalKind = Exclude<SdkWireErrorKind, 'remote_error'>
const codeFor = (kind: LocalKind) =>
  SDK_TRANSPORT_ERROR_CODES[kind === 'closed' ? 'transport' : kind]
const messageFor = (kind: LocalKind) => `SDK stdio ${kind}`
const keyFor = (id: string | number) => JSON.stringify([typeof id, id])

function bound(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const n = value ?? fallback
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error('Invalid SDK stdio limit')
  return n
}

function limits(options: StdioTransportOptions | StdioServerOptions) {
  const frame = bound(options.maxFrameBytes, 1024 * 1024, 128, 4 * 1024 * 1024)
  return {
    frame,
    bytes: bound(
      options.maxBufferedBytes,
      4 * 1024 * 1024,
      frame,
      16 * 1024 * 1024
    ),
    lifetime: bound(options.maxLifetimeRequests, 4096, 1, 65536)
  }
}

/** Measure integral UTF-8/LF before allocating an active wire buffer. */
function boundedFrame(value: unknown, max: number): Buffer | undefined {
  const text = JSON.stringify(value)
  if (typeof text !== 'string') throw new Error('Invalid SDK stdio frame')
  if (Buffer.byteLength(text) + 1 > max) return undefined
  return Buffer.from(text + '\n')
}

/** One bounded tail; never decode incomplete UTF-8 or recover a malformed tail. */
function readFrames(
  input: Readable,
  max: number,
  onFrame: (value: unknown, bytes: number) => void | boolean,
  fail: (kind: 'frame' | 'transport') => void
) {
  let tail = Buffer.alloc(0)
  let stopped = false
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  function data(chunk: unknown) {
    if (stopped) return
    if (!(chunk instanceof Uint8Array)) {
      fail('frame')
      return
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    let offset = 0
    while (!stopped && offset < buffer.length) {
      const lf = buffer.indexOf(10, offset)
      const end = lf === -1 ? buffer.length : lf + 1
      const segment = buffer.subarray(offset, end)
      const length = tail.length + segment.length
      if (length > max || (lf === -1 && length >= max)) {
        fail('frame')
        return
      }
      const frame = tail.length
        ? Buffer.concat([tail, segment], length)
        : segment
      if (lf === -1) {
        tail = Buffer.from(frame)
        return
      }
      tail = Buffer.alloc(0)
      let value: unknown
      try {
        value = JSON.parse(decoder.decode(frame))
      } catch {
        fail('frame')
        return
      }
      if (onFrame(value, length) === false) {
        // Admission may stop while accepted requests drain. Input lifecycle
        // faults must remain observed until the adapter's final cleanup.
        stopped = true
        tail = Buffer.alloc(0)
        input.off('data', data)
      }
      offset = end
    }
  }
  const end = () => fail(tail.length ? 'frame' : 'transport')
  const error = () => fail('transport')
  input.on('data', data)
  input.on('end', end)
  input.on('close', end)
  input.on('error', error)
  return () => {
    stopped = true
    tail = Buffer.alloc(0)
    input
      .off('data', data)
      .off('end', end)
      .off('close', end)
      .off('error', error)
  }
}

/** Only one active write, completed by BOTH callback and drain when required. */
function writer(output: Writable) {
  let cancel: (() => void) | undefined
  return {
    cancel: () => cancel?.(),
    write(frame: Buffer): Promise<void> {
      return new Promise((resolve, reject) => {
        let returned = false
        let callback = false
        let drained = false
        let done = false
        const clean = () => {
          output.off('drain', drain)
          cancel = undefined
        }
        const finish = (error?: unknown) => {
          if (done) return
          if (error !== undefined) {
            done = true
            clean()
            reject(new Error('SDK stdio write failed'))
            return
          }
          if (returned && callback && drained) {
            done = true
            clean()
            resolve()
          }
        }
        const drain = () => {
          drained = true
          finish()
        }
        cancel = () => finish(new Error('SDK stdio write closed'))
        output.on('drain', drain)
        try {
          const accepted = output.write(frame, (error) => {
            if (error) finish(error)
            else {
              callback = true
              finish()
            }
          })
          returned = true
          if (accepted) drained = true
          finish()
        } catch (error) {
          finish(error)
        }
      })
    }
  }
}

function outputEvents(output: Writable, fail: () => void) {
  output.on('error', fail).on('close', fail).on('finish', fail)
  return () => {
    output.off('error', fail).off('close', fail).off('finish', fail)
  }
}

interface Pending {
  readonly request: JsonRpcRequest
  frame: Buffer | undefined
  readonly bytes: number
  state: 'QUEUED' | 'WRITTEN'
  readonly timer: ReturnType<typeof setTimeout>
  readonly resolve: (response: JsonRpcResponse) => void
  readonly reject: (error: SdkWireError) => void
}

export function createStdioSdkTransport(
  options: StdioTransportOptions
): StdioSdkTransport {
  const cap = limits(options)
  const maxPending = bound(options.maxPendingRequests, 64, 1, 1024)
  const timeout = bound(options.requestTimeoutMs, 30000, 1, 300000)
  if (!validIdentifier(options.expectedTenantId))
    throw new Error('Invalid SDK stdio tenant')
  let state: 'OPEN' | 'CLOSING' | 'CLOSED' = 'OPEN'
  const pending = new Map<string, Pending>()
  const seen = new Set<string>()
  const queue: Pending[] = []
  let bytes = 0
  let pumping = false
  const writes = writer(options.output)
  let detachInput = () => {}
  let detachOutput = () => {}
  function local(kind: LocalKind, request: JsonRpcRequest, written = false) {
    return new SdkWireError(
      kind,
      request.id,
      request.method,
      written ? 'unknown' : 'not_dispatched',
      codeFor(kind),
      messageFor(kind)
    )
  }
  function closeWith(kind: LocalKind) {
    if (state !== 'OPEN') return
    state = 'CLOSING'
    detachInput()
    detachOutput()
    writes.cancel()
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.frame = undefined
      entry.reject(local(kind, entry.request, entry.state === 'WRITTEN'))
    }
    pending.clear()
    queue.length = 0
    seen.clear()
    bytes = 0
    state = 'CLOSED'
  }
  async function pump() {
    if (pumping || state !== 'OPEN') return
    pumping = true
    try {
      while (state === 'OPEN' && queue.length) {
        const entry = queue.shift()!
        // A validated response cannot settle an entry that has not been written.
        const frame = entry.frame!
        entry.frame = undefined
        entry.state = 'WRITTEN'
        await writes.write(frame)
      }
    } catch {
      closeWith('transport')
    } finally {
      pumping = false
    }
  }
  detachInput = readFrames(
    options.input,
    cap.frame,
    (response) => {
      const r = response as { id?: unknown } | null
      const id = r !== null && typeof r === 'object' ? r.id : undefined
      const entry =
        typeof id === 'string' || typeof id === 'number'
          ? pending.get(keyFor(id))
          : undefined
      if (!entry || entry.state !== 'WRITTEN') {
        closeWith('invalid_response')
        return
      }
      try {
        validateCorrelatedResponse(
          entry.request,
          response,
          options.expectedTenantId
        )
      } catch {
        closeWith('invalid_response')
        return
      }
      pending.delete(keyFor(entry.request.id))
      bytes -= entry.bytes
      clearTimeout(entry.timer)
      if ('error' in response)
        entry.reject(
          new SdkWireError(
            'remote_error',
            entry.request.id,
            entry.request.method,
            'unknown',
            response.error.code,
            response.error.message,
            response.error.data
          )
        )
      else entry.resolve(response)
    },
    closeWith
  )
  detachOutput = outputEvents(options.output, () => closeWith('transport'))
  if (
    options.input.destroyed ||
    options.input.readableEnded ||
    options.output.destroyed ||
    options.output.writableEnded
  )
    closeWith('transport')
  return {
    request(request) {
      if (state !== 'OPEN') return Promise.reject(local('closed', request))
      if (!isRequest(request) || !validParams(request))
        return Promise.reject(local('frame', request))
      let frame: Buffer
      let snapshot: JsonRpcRequest
      try {
        const encoded = boundedFrame(request, cap.frame)
        if (!encoded) return Promise.reject(local('limit', request))
        frame = encoded
        snapshot = JSON.parse(frame.toString('utf8')) as JsonRpcRequest
        if (!isRequest(snapshot) || !validParams(snapshot))
          return Promise.reject(local('frame', request))
      } catch {
        return Promise.reject(local('frame', request))
      }
      const key = keyFor(snapshot.id)
      if (
        frame.length > cap.frame ||
        seen.has(key) ||
        seen.size >= cap.lifetime ||
        pending.size >= maxPending ||
        bytes + frame.length > cap.bytes
      )
        return Promise.reject(local('limit', snapshot))
      seen.add(key)
      bytes += frame.length
      const result = new Promise<JsonRpcResponse>((resolve, reject) => {
        const entry: Pending = {
          request: snapshot,
          frame,
          bytes: frame.length,
          state: 'QUEUED',
          timer: setTimeout(() => closeWith('timeout'), timeout),
          resolve,
          reject
        }
        pending.set(key, entry)
        queue.push(entry)
      })
      void pump()
      return result
    },
    async close() {
      closeWith('closed')
    }
  }
}

interface QueuedRequest {
  readonly request: JsonRpcRequest
  readonly bytes: number
}

export function serveStdioSdk(options: StdioServerOptions): StdioSdkServer {
  const cap = limits(options)
  const maxQueue = bound(options.maxQueuedRequests, 64, 1, 1024)
  const closeTimeout = bound(options.closeTimeoutMs, 1000, 1, 5000)
  let state: 'OPEN' | 'CLOSING' | 'CLOSED' = 'OPEN'
  let exhausted = false
  let active = false
  let bytes = 0
  const queue: QueuedRequest[] = []
  const seen = new Set<string>()
  const writes = writer(options.output)
  let resolveClosed!: () => void
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })
  let deadline: ReturnType<typeof setTimeout> | undefined
  let detachInput = () => {}
  let detachOutput = () => {}
  function report(kind: 'frame' | 'transport' | 'limit' | 'invalid_response') {
    try {
      options.onError?.({ kind, code: codeFor(kind) })
    } catch {
      /* host callback cannot prevent cleanup */
    }
  }
  function finish() {
    if (state === 'CLOSED') return
    state = 'CLOSED'
    if (deadline !== undefined) clearTimeout(deadline)
    detachInput()
    detachOutput()
    writes.cancel()
    queue.length = 0
    seen.clear()
    bytes = 0
    resolveClosed()
  }
  function closing() {
    if (state !== 'OPEN') return
    state = 'CLOSING'
    detachInput()
    queue.length = 0
    bytes = 0
    if (deadline !== undefined) clearTimeout(deadline)
    if (!active) finish()
    else deadline = setTimeout(finish, closeTimeout)
  }
  function fail(kind: 'frame' | 'transport' | 'limit' | 'invalid_response') {
    if (state === 'CLOSED') return
    report(kind)
    closing()
    // I/O failure cannot drain; active completion is still observed by pump.
    if (kind === 'transport') finish()
  }
  function finishClosing() {
    if (state === 'CLOSING' || exhausted) finish()
  }
  async function pump() {
    if (active || state !== 'OPEN') return
    active = true
    try {
      while (state === 'OPEN' && queue.length) {
        const entry = queue.shift()!
        const response = await options.server.dispatch(entry.request)
        if (state !== 'OPEN') break
        try {
          validateCorrelatedResponse(entry.request, response)
        } catch {
          fail('invalid_response')
          break
        }
        let frame = boundedFrame(response, cap.frame)
        if (!frame) {
          frame = boundedFrame(
            {
              jsonrpc: '2.0',
              id: entry.request.id,
              error: {
                code: SDK_TRANSPORT_ERROR_CODES.response_too_large,
                message: 'response_too_large'
              }
            },
            cap.frame
          )
          if (!frame) {
            fail('limit')
            break
          }
        }
        await writes.write(frame)
        if (state === 'OPEN') bytes -= entry.bytes
      }
    } catch {
      fail('transport')
    } finally {
      active = false
      finishClosing()
    }
  }
  detachInput = readFrames(
    options.input,
    cap.frame,
    (value, length) => {
      if (!isRequest(value) || !validParams(value)) {
        fail('frame')
        return
      }
      const key = keyFor(value.id)
      if (seen.has(key)) {
        fail('limit')
        return
      }
      if (seen.size >= cap.lifetime) {
        // Stop frame admission, preserving accepted work AND I/O observation.
        exhausted = true
        report('limit')
        if (state !== 'OPEN') return false
        if (!active && !queue.length) finish()
        return false
      }
      if (queue.length >= maxQueue || bytes + length > cap.bytes) {
        fail('limit')
        return
      }
      seen.add(key)
      bytes += length
      queue.push({ request: value, bytes: length })
      void pump()
    },
    fail
  )
  detachOutput = outputEvents(options.output, () => fail('transport'))
  if (
    options.input.destroyed ||
    options.input.readableEnded ||
    options.output.destroyed ||
    options.output.writableEnded
  )
    fail('transport')
  return {
    closed,
    async close() {
      closing()
      await closed
    }
  }
}
