import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import {
  normalizeOrigin,
  normalizeTrustedProxyAddresses
} from '../http-security.ts'

const allowedOrigin = 'https://console.example.test'

describe('HTTP security edge branches', () => {
  it('rejects origin fragments and validates proxy address literals', () => {
    expect(() =>
      normalizeOrigin('https://console.example.test/#fragment')
    ).toThrow(/origin/i)
    expect(() => normalizeTrustedProxyAddresses(['::ffff:0:0'])).toThrow(
      /trusted proxy address/i
    )
    expect(() =>
      normalizeTrustedProxyAddresses([42 as unknown as string])
    ).toThrow(/trusted proxy address/i)
    expect(
      normalizeTrustedProxyAddresses([
        '::ffff:127.0.0.1',
        '  ::1  ',
        '::ffff:127.0.0.1'
      ])
    ).toEqual(['::ffff:127.0.0.1', '::1'])
  })

  it('canonicalizes IPv4-mapped and expanded IPv6 proxy addresses for HSTS', async () => {
    const mappedApp = buildServer({
      httpSecurity: {
        allowedOrigins: [allowedOrigin],
        enforceHttps: true,
        trustedProxyAddresses: ['::ffff:127.0.0.1']
      }
    })
    const mapped = await mappedApp.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' }
    })
    await mappedApp.close()

    const expandedApp = buildServer({
      httpSecurity: {
        allowedOrigins: [allowedOrigin],
        enforceHttps: true,
        trustedProxyAddresses: ['0:0:0:0:0:0:0:1']
      }
    })
    const expanded = await expandedApp.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '::1',
      headers: { 'x-forwarded-proto': 'https' }
    })
    await expandedApp.close()

    expect(mapped.statusCode).toBe(200)
    expect(mapped.headers['strict-transport-security']).toBe('max-age=31536000')
    expect(expanded.statusCode).toBe(200)
    expect(expanded.headers['strict-transport-security']).toBe(
      'max-age=31536000'
    )
  })

  it('rejects forwarded HTTPS from an untrusted remote peer', async () => {
    const app = buildServer({
      httpSecurity: {
        allowedOrigins: [allowedOrigin],
        enforceHttps: true,
        trustedProxyAddresses: ['::ffff:127.0.0.1']
      }
    })
    const untrusted = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '198.51.100.24',
      headers: { 'x-forwarded-proto': 'https' }
    })
    const insecureForwarded = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'http' }
    })
    await app.close()

    expect(untrusted.statusCode).toBe(426)
    expect(insecureForwarded.statusCode).toBe(426)
  })

  it('accepts a lowercase preflight method from an allowed origin', async () => {
    const app = buildServer({
      httpSecurity: { allowedOrigins: [allowedOrigin] }
    })
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: allowedOrigin,
        'access-control-request-method': 'post',
        'access-control-request-headers': 'Content-Type, X-Operator-Id'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin)
  })
})
