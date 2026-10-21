import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'

/**
 * AUD-0621 F01 / SPEC0176 AUTH01. Reproduction of the auditor probe
 * `integration-probes.json#trusted-unassigned-case`: an Operator with no
 * case assignment must not read the list, timeline or session audit of a
 * case in the same tenant, and the synthetic private marker must not leave
 * the API. The assertions are deliberately the post-fix contract so the same
 * test fails on the vulnerable base and passes after SPEC0176.
 */
const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const MARKER = 'AUDIT_PRIVATE_CASE_F01'
const SIGNING_KEY = 'f01-synthetic-signing-key-abcdefghijklmnopqrstuvwxyz'

type App = ReturnType<typeof buildServer>

async function seedCase(app: App) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': TENANT },
    payload: {
      externalMessageId: `f01-${Math.random()}`,
      senderRef: '+5511900000099',
      body: `Synthetic case marker ${MARKER}`,
      receivedAt: '2026-10-20T12:00:00.000Z'
    }
  })
  expect(inbound.statusCode).toBe(200)
  const data = inbound.json().data as {
    conversationId: string
    sessionId: string
  }
  return data
}

async function readAll(
  app: App,
  headers: Record<string, string>,
  seeded: { conversationId: string; sessionId: string }
) {
  const urls = [
    '/v1/conversations',
    `/v1/conversations/${seeded.conversationId}/timeline`,
    `/v1/audit/sessions/${seeded.sessionId}`
  ]
  const responses = []
  for (const url of urls) {
    const response = await app.inject({ method: 'GET', url, headers })
    responses.push({ url, status: response.statusCode, body: response.body })
  }
  return responses
}

describe('AUD-0621 F01 — unassigned Operator case reads', () => {
  it('simulation Operator without assignment receives no case content', async () => {
    const app = buildServer({ identityMode: 'simulation' })
    try {
      const seeded = await seedCase(app)
      const responses = await readAll(
        app,
        {
          'x-operator-id': 'audit.unassigned',
          'x-operator-role': 'Operator',
          'x-tenant-id': TENANT
        },
        seeded
      )
      expect(JSON.stringify(responses)).not.toContain(MARKER)
      expect(responses[0]?.status).toBe(200)
      expect(JSON.parse(responses[0]!.body).data.items).toEqual([])
      expect(JSON.parse(responses[0]!.body).data.pageInfo.total).toBe(0)
      expect(responses[1]?.status).toBe(404)
      expect(responses[2]?.status).toBe(404)
      for (const response of responses.slice(1)) {
        expect(JSON.parse(response.body).error).toEqual({
          code: 'not_found',
          message: 'Resource not found'
        })
      }
    } finally {
      await app.close()
    }
  })

  it('trusted Operator session without assignment never receives 200 case content', async () => {
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: createTrustedOperatorIdentityResolver({
        secret: SIGNING_KEY
      }),
      operatorSessionStore: createInMemoryOperatorSessionStore(),
      requireAuthenticatedMutations: false
    })
    try {
      const token = createTrustedOperatorIdentityToken(
        { operatorId: 'audit.unassigned', role: 'Operator', tenantId: TENANT },
        SIGNING_KEY,
        Date.now,
        120
      )
      const login = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { 'x-cvg-operator-token': token }
      })
      expect(login.statusCode).toBe(200)
      const cookie = String(login.headers['set-cookie']).split(';')[0]!
      const seeded = await seedCase(app)
      const responses = await readAll(app, { cookie }, seeded)
      expect(JSON.stringify(responses)).not.toContain(MARKER)
      // Without a configured trusted principal authority every case read
      // fails closed (503); the configured path is covered by the matrix.
      expect(responses.map((response) => response.status)).toEqual([
        503, 503, 503
      ])
    } finally {
      await app.close()
    }
  })
})
