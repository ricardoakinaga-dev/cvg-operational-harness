/**
 * SPEC 0263 D15: the default resolver imports node:dns/promises lazily. An
 * abort observed while that import is still loading must never start the
 * native lookup. The test runner controls the module load; no public seam.
 */
import { describe, expect, it, vi } from 'vitest'

const dns = vi.hoisted(() => {
  let release!: () => void
  const loaded = new Promise<void>((resolve) => {
    release = resolve
  })
  const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
  return { loaded, release, lookup }
})

vi.mock('node:dns/promises', async () => {
  await dns.loaded
  return { lookup: dns.lookup, default: { lookup: dns.lookup } }
})

import { resolveAndGuardOutboundUrl } from '../ssrf.ts'

const OPTIONS = { allowedHosts: ['public.example'] }

describe('SPEC 0263 D15: abort at the DNS module barrier', () => {
  it('abort while the module loads: zero native lookups after release', async () => {
    const controller = new AbortController()
    const operation = resolveAndGuardOutboundUrl(
      'https://public.example/',
      OPTIONS,
      { signal: controller.signal }
    )
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    dns.release()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(dns.lookup).not.toHaveBeenCalled()
  })

  it('control: without abort the loaded module resolves once', async () => {
    const guarded = await resolveAndGuardOutboundUrl(
      'https://public.example/',
      OPTIONS,
      { signal: new AbortController().signal }
    )
    expect(guarded.resolvedAddresses).toEqual(['93.184.216.34'])
    expect(dns.lookup).toHaveBeenCalledTimes(1)
  })
})
