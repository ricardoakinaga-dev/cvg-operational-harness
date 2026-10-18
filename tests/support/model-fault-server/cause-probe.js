// Static private regression child: native filesystem/HTTP failures, synthetic data.
import assert from 'node:assert/strict'
import http from 'node:http'
import fsp from 'node:fs/promises'
import { closeSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const realOpen = fsp.open
let invalidateOutput = false
const nativeFdErrors = []
fsp.open = async (...args) => {
  const handle = await realOpen(...args)
  if (invalidateOutput && String(args[0]).endsWith('/dual.json')) {
    // Invalidate only this newly created, owned FD. The errors below come from
    // the real Node write/close syscalls, not fabricated replacement errors.
    closeSync(handle.fd)
    for (const name of ['writeFile', 'close']) {
      const native = handle[name].bind(handle)
      handle[name] = async (...values) => {
        try {
          return await native(...values)
        } catch (error) {
          nativeFdErrors.push(error)
          throw error
        }
      }
    }
  }
  return handle
}
syncBuiltinESMExports()
const api = await import('./index.js')
const { expectedRequestBytes } = await import('./contract.js')
const plan = {
  version: 1,
  suiteId: 'cause-regression',
  caseId: 'synthetic-cause',
  scenario: 'ok-json',
  maxRequests: 1,
  chunkDelayMs: 0
}
function contains(error, target) {
  return (
    error === target ||
    Boolean(error?.cause && contains(error.cause, target)) ||
    Boolean(
      error?.errors &&
      [...error.errors].some((child) => contains(child, target))
    )
  )
}
async function exchange(server) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      `${server.url}/chat/completions`,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (response) => {
        response.resume()
        response.once('end', resolve)
        response.once('error', reject)
      }
    )
    request.once('error', reject)
    request.setTimeout(1000, () =>
      request.destroy(new Error('synthetic client deadline'))
    )
    request.end(expectedRequestBytes(plan))
  })
}
async function idle(server) {
  const deadline = Date.now() + 1000
  while (server.state().active && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(server.state().active, 0)
}

const root = await fsp.mkdtemp(join(tmpdir(), 'mf-native-causes-'))
const good = await api.createModelFaultServer(plan, { mode: 'record' })
let recording
try {
  await exchange(good)
  await idle(good)
  recording = good.recording()
} finally {
  await good.close()
}

try {
  await api.persistSyntheticRecording(recording, {
    evidenceRoot: root,
    path: 'collision.json',
    mode: 'record',
    previousDigest: null
  })
  let collision
  try {
    await api.persistSyntheticRecording(recording, {
      evidenceRoot: root,
      path: 'collision.json',
      mode: 'record',
      previousDigest: null
    })
  } catch (error) {
    collision = error
  }
  assert.equal(collision?.cause?.code, 'EEXIST')
  assert.equal(collision?.cause?.syscall, 'open')

  invalidateOutput = true
  let returned
  try {
    await api.persistSyntheticRecording(recording, {
      evidenceRoot: root,
      path: 'dual.json',
      mode: 'record',
      previousDigest: null
    })
  } catch (error) {
    returned = error
  } finally {
    invalidateOutput = false
    fsp.open = realOpen
    syncBuiltinESMExports()
  }
  assert.deepEqual(
    nativeFdErrors.map((error) => error.code),
    ['EBADF', 'EBADF']
  )
  assert(returned instanceof AggregateError)
  assert.equal(returned.cause, returned.errors[0])
  assert(contains(returned.errors[0], nativeFdErrors[0]))
  assert(contains(returned.errors[1], nativeFdErrors[1]))

  const httpCodes = []
  for (const injectCleanup of [false, true]) {
    const faulty = await api.createModelFaultServer(plan)
    const realHead = http.ServerResponse.prototype.writeHead
    const realClose = http.Server.prototype.close
    const cleanup = new Error(
      'synthetic callback after successful native close'
    )
    let nativeHandlerError
    let nativeClosed = false
    http.ServerResponse.prototype.writeHead = function (_status, ...args) {
      try {
        return realHead.call(this, -1, ...args)
      } catch (error) {
        nativeHandlerError = error
        throw error
      }
    }
    if (injectCleanup)
      http.Server.prototype.close = function (callback) {
        return realClose.call(this, (error) => {
          if (error) callback(error)
          else {
            nativeClosed = true
            callback(cleanup)
          }
        })
      }
    let closedError
    try {
      await exchange(faulty).catch(() => undefined)
      await idle(faulty)
      try {
        await faulty.close()
      } catch (error) {
        closedError = error
      }
    } finally {
      http.ServerResponse.prototype.writeHead = realHead
      http.Server.prototype.close = realClose
      await faulty.close().catch(() => undefined)
    }
    assert.equal(nativeHandlerError?.code, 'ERR_HTTP_INVALID_STATUS_CODE')
    assert(contains(closedError, nativeHandlerError))
    if (injectCleanup) {
      assert(nativeClosed)
      assert(closedError instanceof AggregateError)
      assert(contains(closedError.errors[0], nativeHandlerError))
      assert(contains(closedError.errors[1], cleanup))
    }
    assert.deepEqual(faulty.state(), {
      ...faulty.state(),
      listening: false,
      closed: true,
      sockets: 0,
      timers: 0,
      active: 0
    })
    httpCodes.push(nativeHandlerError.code)
  }
  process.stdout.write(
    JSON.stringify({
      status: 'observed',
      nativeFdCodes: nativeFdErrors.map((error) => error.code),
      httpCodes,
      collisionCause: 'EEXIST',
      nativePrimaryAndClosePreserved: true,
      syntheticCleanupAfterNativeClosePreserved: true
    }) + '\n'
  )
} finally {
  fsp.open = realOpen
  syncBuiltinESMExports()
  await fsp.rm(root, { recursive: true, force: true })
}
