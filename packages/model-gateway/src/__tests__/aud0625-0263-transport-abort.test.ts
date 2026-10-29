/**
 * SPEC 0263 D16: the Node transport never creates a request once the signal
 * is aborted, including while a Blob body is still being encoded. Counting
 * request creation (not what a server saw) is the evidence.
 */
import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchWithResolvedAddress } from '../providers/ssrf-node.ts'

// Node publishes this channel synchronously when a ClientRequest (http or
// https) is constructed; module mocking does not reach the transport import.
const created = { http: 0 }
const onCreated = () => {
  created.http += 1
}
beforeEach(() => subscribe('http.client.request.created', onCreated))

const servers: Server[] = []
afterEach(async () => {
  unsubscribe('http.client.request.created', onCreated)
  created.http = 0
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  )
})

function blobWithPendingBytes() {
  let release!: (bytes: ArrayBuffer) => void
  const bytes = new Promise<ArrayBuffer>((resolve) => {
    release = resolve
  })
  const blob = new Blob(['synthetic'])
  Object.defineProperty(blob, 'arrayBuffer', { value: () => bytes })
  return { blob, release }
}

describe('SPEC 0263 D16 (model-gateway transport)', () => {
  it('abort while the Blob body encodes: zero requests created after release', async () => {
    const controller = new AbortController()
    const { blob, release } = blobWithPendingBytes()
    const operation = fetchWithResolvedAddress(
      'http://127.0.0.1:9/synthetic',
      { method: 'POST', body: blob, signal: controller.signal },
      ['127.0.0.1']
    )
    controller.abort()
    release(new TextEncoder().encode('synthetic').buffer as ArrayBuffer)
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(created.http).toBe(0)
  })

  it('pre-aborted with an Error reason: the reason is kept and nothing is created', async () => {
    const controller = new AbortController()
    const reason = new Error('synthetic timeout')
    reason.name = 'TimeoutError'
    controller.abort(reason)
    await expect(
      fetchWithResolvedAddress(
        'http://127.0.0.1:9/synthetic',
        { method: 'GET', signal: controller.signal },
        ['127.0.0.1']
      )
    ).rejects.toBe(reason)
    expect(created.http).toBe(0)
  })

  it('control: without abort the Blob body is sent over a real loopback socket', async () => {
    const server = createServer((request, response) => {
      request.resume()
      request.on('end', () => response.end('ok'))
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const { blob, release } = blobWithPendingBytes()
    const operation = fetchWithResolvedAddress(
      `http://127.0.0.1:${port}/synthetic`,
      {
        method: 'POST',
        body: blob,
        signal: new AbortController().signal,
        maxResponseBytes: 1024
      },
      ['127.0.0.1']
    )
    release(new TextEncoder().encode('synthetic').buffer as ArrayBuffer)
    const response = await operation
    expect(response.status).toBe(200)
    expect(created.http).toBe(1)
  })
})
