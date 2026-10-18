// @vitest-environment node
import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { fetchWithResolvedAddress } from '../adapters/ssrf-node.ts'

describe('PDSH-016 DNS-bound response byte cap', () => {
  it('bounds buffering in the actual Node transport before constructing Response', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200)
      res.end('12345')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('missing test listener')
    try {
      const url = `http://synthetic.invalid:${address.port}/`
      await expect(
        fetchWithResolvedAddress(url, { maxResponseBytes: 4 }, ['127.0.0.1'])
      ).rejects.toThrow('maxResponseBytes')
      const response = await fetchWithResolvedAddress(
        url,
        { maxResponseBytes: 5 },
        ['127.0.0.1']
      )
      expect(await response.text()).toBe('12345')
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })
})
