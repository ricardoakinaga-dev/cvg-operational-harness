import { createServer } from 'node:http'
import {
  envelope,
  expectedRequestBytes,
  fail,
  guardCurrentEnvironment,
  LIMITS,
  recipe,
  snapshot,
  validateOptions,
  validatePlan,
  validateRecording
} from './contract.js'
export {
  assertSyntheticEnvironment,
  CREDENTIAL_NAMES,
  expectedSyntheticRequest,
  governedInstruction,
  LIMITS,
  SCENARIOS
} from './contract.js'
export { persistSyntheticRecording } from './persistence.js'

/** Keep both failures without disguising a primary failure as a cleanup failure. */
export function preservePrimaryError(primary, cleanup) {
  if (primary && cleanup)
    return new AggregateError(
      [primary, cleanup],
      'synthetic primary and cleanup failures',
      { cause: primary }
    )
  return primary ?? cleanup ?? null
}

function allowedHeaders(request) {
  const sentinels = {
    authorization: 'Bearer cvg-synthetic-token-v1',
    'x-api-key': 'cvg-synthetic-token-v1',
    cookie: 'cvg_synthetic=1'
  }
  const seen = new Set()
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i].toLowerCase()
    const value = request.rawHeaders[i + 1]
    if (name === 'proxy-authorization') return false
    if (Object.hasOwn(sentinels, name)) {
      if (seen.has(name) || value !== sentinels[name]) return false
      seen.add(name)
    } else if (/auth|token|cookie|api[-_]?key|credential/i.test(name))
      return false
  }
  return request.headers['content-type'] === 'application/json'
}

export async function createModelFaultServer(input, inputOptions = {}) {
  const plan = validatePlan(input)
  const { mode, recording: replay } = validateOptions(inputOptions, plan)
  const expected = expectedRequestBytes(plan)
  const template = replay ?? envelope(recipe(plan))
  if (mode !== 'replay') guardCurrentEnvironment()
  const timers = new Map()
  const sockets = new Set()
  const active = new Set()
  const history = []
  let requests = 0
  let rejected = false
  let recorded = null
  let primary = null
  let closing = null
  let closed = false
  let stopping = false
  const rememberFailure = (code, cause) => {
    primary ??= new Error(
      `synthetic fault server: ${code}`,
      cause === undefined ? undefined : { cause }
    )
  }
  function schedule(fn, ms, cancel = () => {}) {
    const handle = setTimeout(() => {
      timers.delete(handle)
      fn()
    }, ms)
    timers.set(handle, cancel)
    return handle
  }
  const delay = (ms) =>
    new Promise((resolve) => {
      schedule(
        () => resolve(!stopping),
        ms,
        () => resolve(false)
      )
    })
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const work = handle(request, response).catch((cause) => {
      rememberFailure('handler failed', cause)
      request.destroy()
      response.destroy()
    })
    active.add(work)
    void work.finally(() => active.delete(work))
  })
  server.maxConnections = LIMITS.requests
  server.maxHeadersCount = 32
  server.requestTimeout = LIMITS.lifetimeMs
  server.headersTimeout = LIMITS.lifetimeMs
  server.keepAliveTimeout = 1
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('error', () => {}) // protocol/client aborts are observed on response close
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('clientError', (_error, socket) => {
    rejected = true
    socket.destroy()
  })
  server.on('error', (cause) => rememberFailure('server failed', cause))

  async function handle(request, response) {
    const ordinal = requests++
    let complete = false
    let completedRead = false
    let finishExchange
    const exchange = new Promise((resolve) => {
      finishExchange = resolve
    })
    const chunks = []
    const settle = (termination) => {
      if (complete) return
      complete = true
      history.push(
        snapshot({
          ordinal,
          requestSha256: template.requestSha256,
          status: template.status,
          termination
        })
      )
      if (mode !== 'replay' && !rejected) {
        const data = { ...template }
        delete data.digest
        try {
          // Only observed writes + real finish/close can authorize this exchange.
          recorded = validateRecording(
            envelope({ ...data, chunks, termination }),
            plan
          )
        } catch (cause) {
          rememberFailure('incomplete exchange', cause)
        }
      }
      finishExchange()
    }
    const reject = (status) => {
      rejected = true
      response.writeHead(status, {
        'content-type': 'application/json',
        connection: 'close'
      })
      response.end('{"error":"CVG_SYNTHETIC_REJECTED"}')
      request.resume()
    }
    if (stopping || ordinal >= plan.maxRequests) return reject(429)
    if (
      request.method !== 'POST' ||
      request.url !== '/chat/completions' ||
      !allowedHeaders(request)
    )
      return reject(400)
    const declared = request.headers['content-length']
    if (
      declared !== undefined &&
      (!/^\d+$/.test(declared) || Number(declared) > LIMITS.requestBytes)
    )
      return reject(413)
    const buffers = []
    let size = 0
    let over = false
    await new Promise((resolve) => {
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > LIMITS.requestBytes) {
          buffers.length = 0
          if (!over) {
            over = true
            reject(413)
            resolve()
          }
        } else if (!over) buffers.push(chunk)
      })
      request.once('end', () => {
        completedRead = true
        resolve()
      })
      request.once('error', () => {
        rejected = true
        resolve()
      })
      request.once('close', () => {
        if (!completedRead) {
          rejected = true
          resolve()
        }
      })
    })
    if (over || !completedRead || request.aborted) return
    const body = Buffer.concat(buffers)
    buffers.length = 0
    // Byte equality rejects duplicate keys (including hidden arbitrary prompts),
    // whitespace variants and invalid UTF-8, without ever parsing hostile JSON.
    if (!body.equals(expected)) return reject(400)
    response.once('finish', () => settle('complete'))
    response.once('close', () => {
      if (complete) return
      if (template.termination === 'timeout') settle('timeout')
      else if (
        template.termination === 'disconnect' &&
        chunks.length === template.chunks.length
      )
        settle('disconnect')
      else {
        rejected = true
        rememberFailure('exchange interrupted')
        finishExchange()
      }
    })
    response.on('error', (cause) => {
      rejected = true
      rememberFailure('response failed', cause)
      finishExchange()
    })
    if (template.termination === 'timeout') {
      await exchange
      return
    }
    const headers = { ...template.headers, connection: 'close' }
    if (template.termination === 'disconnect') headers['content-length'] = '256'
    response.writeHead(template.status, headers)
    for (const chunk of template.chunks) {
      if (!(await delay(chunk.delayMs)) || response.destroyed) return
      const written = await new Promise((resolve) => {
        response.write(Buffer.from(chunk.base64, 'base64'), (error) => {
          if (error) rememberFailure('response write failed', error)
          resolve(!error)
        })
      })
      if (!written) return
      chunks.push(snapshot(chunk))
    }
    if (template.termination === 'disconnect') response.destroy()
    else response.end()
    await exchange
  }

  function close() {
    if (closing) return closing
    stopping = true
    closing = (async () => {
      for (const [timer, cancel] of timers) {
        clearTimeout(timer)
        cancel()
      }
      timers.clear()
      let cleanup = null
      let deadline
      try {
        await Promise.race([
          new Promise((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error('synthetic cleanup deadline')),
              LIMITS.lifetimeMs
            )
          }),
          (async () => {
            const socketClosures = [...sockets].map(
              (socket) =>
                new Promise((resolve) => socket.once('close', resolve))
            )
            await new Promise((resolve, reject) => {
              server.close((error) => {
                if (error && error.code !== 'ERR_SERVER_NOT_RUNNING')
                  reject(
                    new Error('synthetic cleanup failed', { cause: error })
                  )
                else resolve()
              })
              for (const socket of sockets) socket.destroy()
            })
            await Promise.all(socketClosures)
            await Promise.all(active)
          })()
        ])
      } catch (error) {
        cleanup = error
      } finally {
        clearTimeout(deadline)
      }
      closed = !server.listening && sockets.size === 0
      const error = preservePrimaryError(primary, cleanup)
      if (error) throw error
    })()
    return closing
  }
  schedule(() => {
    void close().catch(() => {})
  }, LIMITS.lifetimeMs)
  try {
    await new Promise((resolve, reject) => {
      const onError = (cause) =>
        reject(new Error('synthetic listen failed', { cause }))
      server.once('error', onError)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', onError)
        resolve()
      })
    })
  } catch (error) {
    primary = error
    await close()
    throw error
  }
  const address = server.address()
  return Object.freeze({
    url: `http://127.0.0.1:${address.port}`,
    requestHistory: () => snapshot(history),
    recording: () => {
      if (rejected || primary || history.length === 0)
        fail('no completed recording')
      if (mode !== 'replay') {
        if (!recorded) fail('no completed recording')
        return snapshot(recorded)
      }
      return snapshot(template)
    },
    state: () =>
      snapshot({
        mode,
        listening: server.listening,
        closed,
        sockets: sockets.size,
        timers: timers.size,
        active: active.size,
        requests,
        rejected,
        failure: primary ? primary.message : null
      }),
    close
  })
}
