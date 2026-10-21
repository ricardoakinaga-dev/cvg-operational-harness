import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import { grantCase } from './case-authorization-fixtures.ts'

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

interface ConversationListItem {
  id: string
  channel: string
  senderRef: string
  status: string
  openSessionId: string | null
  lastMessageBody: string | null
  lastMessageAt: string | null
}

interface ConversationPage {
  items: ConversationListItem[]
  pageInfo: {
    limit: number
    offset: number
    total: number
    hasNextPage: boolean
  }
}

const operatorHeaders = {
  'x-operator-id': 'operator.conversation-list',
  'x-operator-role': 'Operator'
}

async function postInbound(
  app: ReturnType<typeof buildServer>,
  externalMessageId: string,
  senderRef: string,
  body: string
) {
  return app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId,
      senderRef,
      body,
      receivedAt: '2026-04-29T10:00:00-03:00'
    }
  })
}

describe('conversation list API', () => {
  it('returns paginated conversations from runtime persistence without requiring controlled bootstrap ids', async () => {
    const app = buildServer()
    const first = await postInbound(
      app,
      'list-msg-1',
      '+551100000001',
      'Primeira conversa ficticia'
    )
    const second = await postInbound(
      app,
      'list-msg-2',
      '+551100000002',
      'Segunda conversa ficticia'
    )
    // AUD-0621 F01 / SPEC0176: an Operator lists only assigned case roots;
    // both conversations are granted through the public registry first.
    for (const [index, inbound] of [first, second].entries()) {
      await grantCase(app, {
        kind: 'core_conversation',
        resourceId: inbound.json().data.conversationId,
        operatorId: 'operator.conversation-list',
        provision: index === 0
      })
    }

    const response = await app.inject({
      method: 'GET',
      url: '/v1/conversations?limit=1&offset=0',
      headers: operatorHeaders
    })
    const body = response.json() as Envelope<ConversationPage>
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.items).toHaveLength(1)
    expect(body.data?.pageInfo).toEqual({
      limit: 1,
      offset: 0,
      total: 2,
      hasNextPage: true
    })
    expect(body.data?.items[0]).toMatchObject({
      channel: 'whatsapp',
      senderRef: '[redacted-phone]',
      status: 'active',
      lastMessageBody: 'Segunda conversa ficticia'
    })
    expect(body.data?.items[0]?.id).toMatch(/^conv_/)
    expect(body.data?.items[0]?.openSessionId).toMatch(/^sess_/)
    // SPEC0176 §7 allowlist: correlationId is no longer part of the item DTO.
    expect(body.data?.items[0]).not.toHaveProperty('correlationId')
    expect(body.data?.items[0]?.lastMessageAt).toEqual(expect.any(String))
  })

  it('rejects invalid pagination parameters with a safe API envelope', async () => {
    const app = buildServer()
    const response = await app.inject({
      method: 'GET',
      url: '/v1/conversations?limit=0&offset=-1',
      headers: operatorHeaders
    })
    const body = response.json() as Envelope<never>
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('invalid_pagination')
  })
})
