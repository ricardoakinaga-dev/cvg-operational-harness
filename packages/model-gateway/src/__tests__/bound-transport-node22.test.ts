// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchWithResolvedAddress as modelTransport } from '../providers/ssrf-node.ts'
import { fetchWithResolvedAddress as channelTransport } from '../../../channel-gateway/src/adapters/ssrf-node.ts'

// SPEC 0174: the pinned transports must work with Node 22+ default
// connect lookup (options.all) and build bodyless responses correctly.
// The hostname is unresolvable on purpose: only the pinned address may be used.
const HOST = 'provider.invalid'

interface Seen {
  method: string
  host: string
  path: string
  body: string
}

let server: Server
let port = 0
const seen: Seen[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        host: req.headers.host ?? '',
        path: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8')
      })
      const status = Number(
        new URL(req.url ?? '/', 'http://x').searchParams.get('status') ?? '200'
      )
      res.writeHead(status, { 'x-probe': 'yes' })
      res.end(status === 200 ? 'ok' : undefined)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe.each([
  ['model-gateway', modelTransport],
  ['channel-gateway', channelTransport]
])('%s bound transport (SPEC 0174)', (_name, transport) => {
  const url = (query = '') => `http://${HOST}:${port}/probe${query}`

  it('reaches the pinned address with the original authority for GET and POST', async () => {
    const before = seen.length
    const get = await transport(url('?status=200'), { method: 'GET' }, [
      '127.0.0.1'
    ])
    expect(get.status).toBe(200)
    expect(await get.text()).toBe('ok')

    const post = await transport(
      url(),
      {
        method: 'POST',
        body: '{"a":1}',
        headers: { 'content-type': 'application/json', host: 'evil.example' }
      },
      ['127.0.0.1']
    )
    expect(post.status).toBe(200)
    const requests = seen.slice(before)
    expect(requests).toHaveLength(2)
    expect(requests.at(0)).toMatchObject({
      method: 'GET',
      host: `${HOST}:${port}`,
      path: '/probe?status=200'
    })
    expect(requests.at(1)).toMatchObject({
      method: 'POST',
      host: `${HOST}:${port}`,
      body: '{"a":1}'
    })
  })

  it.each([204, 205, 304])(
    'returns a null body for status %i',
    async (status) => {
      const response = await transport(
        url(`?status=${status}`),
        { method: 'GET' },
        ['127.0.0.1']
      )
      expect(response.status).toBe(status)
      expect(response.body).toBeNull()
      expect(await response.text()).toBe('')
      expect(response.ok).toBe(status !== 304)
      expect(response.headers.get('x-probe')).toBe('yes')
    }
  )

  it.each(['HEAD', 'head'])('returns a null body for %s', async (method) => {
    const response = await transport(url('?status=200'), { method }, [
      '127.0.0.1'
    ])
    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
  })

  it('still rejects a resolved value that is not an IP literal', async () => {
    await expect(
      transport(url(), { method: 'GET' }, ['not-an-ip'])
    ).rejects.toThrow('Resolved address is not an IP literal')
  })
})
