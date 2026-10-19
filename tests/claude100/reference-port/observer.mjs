import { createServer } from 'node:http'
import {
  LIMITS,
  RESPONSE_BODY,
  RESPONSE_HEADERS,
  canonical,
  sha256,
  fault,
  preflight,
  wrapperArguments,
  isDirectMain,
  controlWriter,
  hostCommands,
  encodeRawFrames,
  writeBytes,
  inspectRequest,
  markerVerified,
  phaseGate,
  orderedTurns
} from './protocol.mjs'

export async function main() {
  const { runId, hostMarkerPath } = wrapperArguments(process.argv.slice(2))
  const send = controlWriter(process.stdout, 'observer', runId)
  const gate = phaseGate('observer')
  const takeTurn = orderedTurns()
  const failures = [],
    sockets = new Set(),
    tasks = new Set(),
    timers = new Set()
  let armed = false,
    armedOnce = false,
    stopping = false,
    count = 0,
    totalBytes = 0
  let rawChain = Promise.resolve(),
    eventChain = Promise.resolve(),
    cancelCommands
  const cancelled = new Promise((resolve) => {
    cancelCommands = resolve
  })
  function fail(error) {
    failures.push(error)
    cancelCommands()
  }
  function timer(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  function event(type, payload) {
    eventChain = eventChain.then(() => send(type, payload))
    eventChain.catch(fail)
    return eventChain
  }
  function track(promise) {
    tasks.add(promise)
    promise.finally(() => tasks.delete(promise)).catch(fail)
  }
  const cancel = () => fail(fault('SIGNAL'))
  const ioError = (error) => fail(fault('IO', error))
  process.on('SIGINT', cancel)
  process.on('SIGTERM', cancel)
  process.stdin.on('error', ioError)
  process.stdout.on('error', ioError)
  process.stderr.on('error', ioError)
  timer(() => fail(fault('TIMEOUT')), LIMITS.controllerMs)

  const server = createServer({
    maxHeaderSize: LIMITS.headerBytes,
    insecureHTTPParser: false,
    requestTimeout: LIMITS.nativeMs,
    headersTimeout: LIMITS.nativeMs,
    keepAliveTimeout: 1,
    connectionsCheckingInterval: 1000
  })
  server.maxHeadersCount = 0 // Never silently drop excess headers; maxHeaderSize rejects.
  server.maxRequestsPerSocket = 1
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', (error) => {
      if (!stopping) fail(fault('IO', error))
    })
    socket.setTimeout(LIMITS.nativeMs, () => {
      fail(fault('TIMEOUT'))
      socket.destroy()
    })
    if (sockets.size > LIMITS.requests) {
      // No HTTP request/ordinal exists yet; never invent a REJECTED ordinal.
      fail(fault('CAP'))
      socket.destroy()
    }
  })
  server.on('error', ioError)
  function reject(reason, ordinal) {
    event('REJECTED', { reason, ordinal })
    if (['CAP', 'FORBIDDEN_AUTH', 'EARLY_PHASE'].includes(reason))
      fail(
        fault(
          reason === 'FORBIDDEN_AUTH'
            ? 'PRIVACY'
            : reason === 'CAP'
              ? 'CAP'
              : 'PROTOCOL'
        )
      )
  }
  function fixedResponse(response) {
    response.sendDate = false
    response.writeHead(503, RESPONSE_HEADERS)
    response.end(RESPONSE_BODY)
  }
  async function request(request, response, unsupported, turn) {
    const ordinal = count++
    if (ordinal >= LIMITS.requests) {
      // SPEC clarification required: REJECTED has only ordinals0..3, so an
      // over-limit attempt cannot be represented without inventing an ordinal.
      // Fail CAP and exit nonzero; never emit a false ordinal or fifth proof.
      fail(fault('CAP'))
      request.destroy()
      return
    }
    const result = inspectRequest(
      request.method,
      request.url,
      request.rawHeaders,
      armed
    )
    const reason = result.reason || (unsupported ? 'UNSUPPORTED_ROUTE' : null)
    let responseDone = false,
      responseFailed = false,
      completedBody = false,
      responseReported = false
    const eligible = !reason
    let settleResponse
    const responseSettled = new Promise((resolve) => {
      settleResponse = resolve
    })
    async function reportResponse() {
      if (!eligible || !completedBody || !responseDone || responseReported)
        return
      responseReported = true
      await event('RESPONSE', {
        phase: 'port',
        ordinal,
        status: 503,
        headersSha256: sha256(canonical(RESPONSE_HEADERS)),
        bodySha256: sha256(RESPONSE_BODY),
        outcome: responseFailed ? 'FAILED' : 'FINISHED'
      })
    }
    function broken(error) {
      responseFailed = true
      responseDone = true
      fail(fault('IO', error))
      settleResponse()
      reportResponse().catch(fail)
    }
    response.once('error', broken)
    response.once('close', () => {
      if (!response.writableFinished) broken(fault('IO'))
    })
    response.once('finish', () => {
      responseDone = true
      settleResponse()
      reportResponse().catch(fail)
    })
    request.once('aborted', () => broken(fault('IO')))
    request.once('error', broken)
    if (reason) {
      reject(reason, ordinal)
      // Credentials, URL and rejected body are never placed into evidence or raw pipes.
      let rejectedBytes = 0
      request.on('data', (chunk) => {
        rejectedBytes += chunk.length
        totalBytes += chunk.length
        if (
          rejectedBytes > LIMITS.bodyBytes ||
          totalBytes > LIMITS.totalBodyBytes
        ) {
          reject('CAP', ordinal)
          request.destroy()
        }
      })
      fixedResponse(response)
      request.resume()
      await responseSettled
      return
    }
    const chunks = []
    let bytes = 0
    try {
      for await (const chunk of request) {
        bytes += chunk.length
        totalBytes += chunk.length
        if (bytes > LIMITS.bodyBytes || totalBytes > LIMITS.totalBodyBytes) {
          reject('CAP', ordinal)
          responseFailed = true
          request.destroy()
          return
        }
        chunks.push(Buffer.from(chunk))
      }
      if (request.rawTrailers.length !== 0) {
        reject('FORBIDDEN_AUTH', ordinal)
        fixedResponse(response)
        await responseSettled
        return
      }
      if (stopping || failures.length) throw fault('PROTOCOL')
      const body = Buffer.concat(chunks, bytes)
      // Concurrent body completion never reorders the protected ordinal trace.
      await turn.wait
      if (stopping || failures.length) throw fault('PROTOCOL')
      rawChain = rawChain.then(async () => {
        if (ordinal <= lastRawOrdinal) throw fault('PROTOCOL')
        lastRawOrdinal = ordinal
        for (const frame of encodeRawFrames(body, 'observer', ordinal))
          await writeBytes(process.stderr, frame)
        // For an empty body encodeRawFrames already emits its sole terminal.
        if (body.length !== 0)
          await writeBytes(
            process.stderr,
            encodeRawFrames(Buffer.alloc(0), 'observer', ordinal)[0]
          )
      })
      await rawChain
      await event('REQUEST', {
        phase: 'port',
        ordinal,
        method: 'POST',
        path: '/v1/messages',
        bodySha256: sha256(body),
        bytes,
        markerVerified: markerVerified(body, result),
        ...result
      })
      completedBody = true
      fixedResponse(response)
      await responseSettled
      await reportResponse()
    } catch (error) {
      broken(error)
      response.destroy()
    }
  }
  let lastRawOrdinal = -1
  function dispatch(req, res, unsupported = false) {
    const turn = takeTurn()
    track(request(req, res, unsupported, turn).finally(turn.release))
  }
  server.on('request', (req, res) => dispatch(req, res))
  // Never send implicit100/417 or let default parser diagnostics include rawPacket.
  server.on('checkContinue', (req, res) => dispatch(req, res, true))
  server.on('checkExpectation', (req, res) => dispatch(req, res, true))
  server.on('connect', (req, socket) => {
    const ordinal = count++
    if (ordinal >= LIMITS.requests) {
      fail(fault('CAP'))
      socket.destroy()
      return
    }
    const decision = inspectRequest(req.method, req.url, req.rawHeaders, armed)
    reject(decision.reason || 'UNSUPPORTED_ROUTE', ordinal)
    socket.end(fixedWireResponse())
  })
  server.on('upgrade', (req, socket) => {
    const ordinal = count++
    if (ordinal >= LIMITS.requests) {
      fail(fault('CAP'))
      socket.destroy()
      return
    }
    const decision = inspectRequest(req.method, req.url, req.rawHeaders, armed)
    reject(decision.reason || 'UNSUPPORTED_ROUTE', ordinal)
    socket.end(fixedWireResponse())
  })
  server.on('clientError', (error, socket) => {
    // Keep the actual Error cause privately; never inspect/copy/persist rawPacket.
    const ordinal = count++
    if (ordinal < LIMITS.requests)
      reject(
        error.code === 'HPE_HEADER_OVERFLOW' ? 'CAP' : 'UNSUPPORTED_ROUTE',
        ordinal
      )
    else fail(fault('CAP'))
    fail(
      fault(error.code === 'HPE_HEADER_OVERFLOW' ? 'CAP' : 'PROTOCOL', error)
    )
    if (socket.writable) socket.end(fixedWireResponse())
    else socket.destroy()
  })
  function fixedWireResponse() {
    return Buffer.concat([
      Buffer.from(
        'HTTP/1.1 503 Service Unavailable\r\ncontent-type: application/json\r\ncontent-length: 82\r\nconnection: close\r\n\r\n'
      ),
      RESPONSE_BODY
    ])
  }

  try {
    const observed = await preflight(hostMarkerPath)
    await new Promise((resolve, reject) => {
      const error = (cause) => {
        server.off('listening', listening)
        reject(fault('IO', cause))
      }
      const listening = () => {
        server.off('error', error)
        resolve()
      }
      server.once('error', error)
      server.once('listening', listening)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true })
    })
    const port = server.address().port
    await event('READY', { ...observed, port })
    const commands = hostCommands(process.stdin, 'observer', runId)[
      Symbol.asyncIterator
    ]()
    while (!stopping) {
      const step = await Promise.race([
        commands.next(),
        cancelled.then(() => ({ cancelled: true }))
      ])
      if (step.cancelled) break
      gate.command(step.value.type)
      if (step.value.type === 'STOP') {
        stopping = true
        break
      }
      if (step.value.type !== 'ARM_PORT' || armedOnce || failures.length)
        throw fault('PROTOCOL')
      armedOnce = true
      armed = true
      await event('ARMED', { phase: 'port', port })
    }
  } catch (error) {
    fail(error)
  }

  stopping = true
  armed = false
  if (tasks.size) failures.push(fault('PROTOCOL'))
  try {
    await Promise.race([
      (async () => {
        const closed = new Promise((resolve, reject) => {
          server.close((error) =>
            error && error.code !== 'ERR_SERVER_NOT_RUNNING'
              ? reject(fault('CLEANUP', error))
              : resolve()
          )
        })
        for (const socket of sockets) socket.destroy()
        server.closeAllConnections()
        await closed
        await Promise.all([...tasks])
        await rawChain
        await eventChain
        if (sockets.size) throw fault('CLEANUP')
        if (!failures.length) await send('CLOSED')
      })(),
      new Promise((_, reject) =>
        timer(() => reject(fault('CLEANUP')), LIMITS.cleanupMs)
      )
    ])
  } catch (error) {
    failures.push(fault('CLEANUP', error))
  }
  for (const id of timers) clearTimeout(id)
  process.stdin.destroy()
  process.off('SIGINT', cancel)
  process.off('SIGTERM', cancel)
  process.stdin.off('error', ioError)
  process.stdout.off('error', ioError)
  process.stderr.off('error', ioError)
  if (failures.length)
    throw new AggregateError(failures, 'Reference port observer failed', {
      cause: failures[0]
    })
}

if (isDirectMain(import.meta.url)) {
  main().catch(() => {
    process.exit(1)
  })
}
