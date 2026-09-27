import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  clearOidcLoginCookie,
  readOidcLoginCallback,
  startOidcLogin,
  type OidcLoginTransactionOptions
} from '../oidc-login-transaction.ts'

const now = 1_800_000_000_000
const states = new Map<string, number>()
const options: OidcLoginTransactionOptions = {
  issuer: 'http://127.0.0.1:8087/realms/cvg-local',
  authorizationEndpoint:
    'http://127.0.0.1:8087/realms/cvg-local/protocol/openid-connect/auth',
  clientId: 'cvg-local-operator',
  redirectUri: 'http://127.0.0.1:3000/v1/auth/oidc/callback',
  cookieKey: Buffer.alloc(32, 7),
  stateStore: {
    async reserve(digest, expiresAt) {
      if (states.has(digest)) return false
      states.set(digest, expiresAt)
      return true
    },
    async consume(digest) {
      const expiresAt = states.get(digest)
      states.delete(digest)
      return expiresAt !== undefined && expiresAt > now
    }
  },
  now: () => now
}

function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0]!
}

describe('OIDC browser login transaction', () => {
  it('binds state and nonce to a sealed callback cookie and an S256 challenge', async () => {
    const started = await startOidcLogin(options)
    const url = new URL(started.authorizationUrl)
    const state = url.searchParams.get('state')!
    const nonce = url.searchParams.get('nonce')!
    const callback = await readOidcLoginCallback(
      cookieValue(started.setCookie),
      state,
      options
    )

    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('response_mode')).toBe('query')
    expect(url.searchParams.get('scope')).toBe('openid')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256')
        .update(callback.codeVerifier, 'ascii')
        .digest('base64url')
    )
    expect(callback.nonce).toBe(nonce)
    expect(started.setCookie).toContain('HttpOnly; SameSite=Lax; Max-Age=300')
    expect(started.setCookie).not.toContain(callback.codeVerifier)
    expect(started.setCookie).not.toContain(nonce)
    expect(clearOidcLoginCookie(options)).toContain('Max-Age=0')
  })

  it('rejects state substitution, tampering, duplicate cookies and a different binding', async () => {
    const started = await startOidcLogin(options)
    const state = new URL(started.authorizationUrl).searchParams.get('state')!
    const cookie = cookieValue(started.setCookie)
    const last = cookie.at(-1)!
    const tampered = `${cookie.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
    await expect(
      readOidcLoginCallback(cookie, 'A'.repeat(43), options)
    ).rejects.toThrow()
    await expect(
      readOidcLoginCallback(tampered, state, options)
    ).rejects.toThrow()
    await expect(
      readOidcLoginCallback(`${cookie}; ${cookie}`, state, options)
    ).rejects.toThrow()
    await expect(
      readOidcLoginCallback(cookie, state, {
        ...options,
        clientId: 'other-client'
      })
    ).rejects.toThrow()
    await expect(
      readOidcLoginCallback(cookie, state, {
        ...options,
        redirectUri: 'http://127.0.0.1:3001/v1/auth/oidc/callback'
      })
    ).rejects.toThrow()
  })

  it('consumes state once, including concurrent callbacks', async () => {
    const started = await startOidcLogin(options)
    const state = new URL(started.authorizationUrl).searchParams.get('state')!
    const cookie = cookieValue(started.setCookie)
    const attempts = await Promise.allSettled([
      readOidcLoginCallback(cookie, state, options),
      readOidcLoginCallback(cookie, state, options)
    ])
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
      'fulfilled',
      'rejected'
    ])
    await expect(
      readOidcLoginCallback(cookie, state, options)
    ).rejects.toThrow()
  })

  it('expires after five minutes and rejects a future-issued transaction', async () => {
    const started = await startOidcLogin(options)
    const state = new URL(started.authorizationUrl).searchParams.get('state')!
    const cookie = cookieValue(started.setCookie)
    await expect(
      readOidcLoginCallback(cookie, state, {
        ...options,
        now: () => now + 300_000
      })
    ).rejects.toThrow()
    await expect(
      readOidcLoginCallback(cookie, state, { ...options, now: () => now - 1 })
    ).rejects.toThrow()
  })

  it('rejects an unsafe authorization endpoint and a weak cookie key', async () => {
    await expect(
      startOidcLogin({
        ...options,
        authorizationEndpoint: 'http://evil.example/authorize'
      })
    ).rejects.toThrow()
    await expect(
      startOidcLogin({ ...options, cookieKey: Buffer.alloc(16) })
    ).rejects.toThrow()
    await expect(
      startOidcLogin({ ...options, redirectUri: 'http://example.com/callback' })
    ).rejects.toThrow()
  })

  it('marks the callback cookie Secure under HTTPS', async () => {
    const httpsOptions = {
      ...options,
      issuer: 'https://idp.example.test/realm',
      authorizationEndpoint: 'https://idp.example.test/realm/authorize',
      redirectUri: 'https://api.example.test/v1/auth/oidc/callback'
    }
    expect((await startOidcLogin(httpsOptions)).setCookie).toContain('; Secure')
    expect(clearOidcLoginCookie(httpsOptions)).toContain('; Secure')
  })
})
