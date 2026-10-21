/**
 * AUD0621 F23 (SPEC0250 P5, memory adapter) — task and approval listings are
 * bounded, validated, filterable by status and carry page metadata while
 * `data` stays an array. Adapted from the auditor probe `unbounded-task-list`.
 */
import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import type { RateLimiterPort } from '../rate-limit.ts'

const tenant = 'tenant_00000000-0000-4000-8000-000000000623'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000624'
const unlimited: RateLimiterPort = {
  check: () => ({ allowed: true, retryAfterSeconds: 0 })
}

function headers(role: string, tenantId = tenant) {
  return {
    'x-operator-id': `${role.toLowerCase()}.aud0621.pages`,
    'x-operator-role': role,
    'x-tenant-id': tenantId
  }
}

type App = ReturnType<typeof buildServer>

interface PageInfo {
  limit: number
  offset: number
  total: number
  hasNextPage: boolean
}

async function seed(app: App, tenantId: string, tasks: number, approvals = 0) {
  const { session } = await app.persistence.conversations.createWithSession({
    tenantId: tenantId as never,
    channel: 'internal',
    senderRef: `aud0621-pages-${tenantId}`,
    externalMessageId: crypto.randomUUID(),
    body: 'Synthetic AUD0621 pagination fixture'
  })
  const taskIds: string[] = []
  for (let index = 0; index < tasks; index += 1) {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        sessionId: session.id,
        title: `Synthetic task ${index}`,
        description: 'Synthetic pagination task',
        priority: 'low',
        source: 'aud0621-pages',
        idempotencyKey: `aud0621-pages-${index}`
      }
    })
    expect(created.statusCode).toBe(200)
    taskIds.push(created.json().data.id as string)
  }
  const approvalIds: string[] = []
  for (let index = 0; index < approvals; index += 1) {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        sessionId: session.id,
        proposedAction: 'synthetic_review',
        summary: `Synthetic approval ${index}`,
        riskLevel: 'low'
      }
    })
    expect(created.statusCode).toBe(200)
    approvalIds.push(created.json().data.id as string)
  }
  return { taskIds, approvalIds }
}

async function list(app: App, url: string, role = 'Supervisor') {
  const response = await app.inject({
    method: 'GET',
    url,
    headers: headers(role)
  })
  return {
    status: response.statusCode,
    body: response.json() as {
      success: boolean
      data: Array<{ id: string; status: string }> | null
      error: { code: string } | null
      meta: { correlationId: string; pageInfo?: PageInfo }
    }
  }
}

describe('bounded task and approval listings (AUD0621 F23, SPEC0250)', () => {
  it('P5: pages 101 tasks and approvals with metadata, filters and validation', async () => {
    const app = buildServer({ rateLimiter: unlimited })
    try {
      const { taskIds, approvalIds } = await seed(app, tenant, 101, 101)
      await seed(app, otherTenant, 1, 1)
      for (const [index, id] of approvalIds.slice(0, 51).entries()) {
        const decided = await app.inject({
          method: 'POST',
          url: `/v1/approvals/${id}/decision`,
          headers: headers('Approver'),
          payload: { decision: index % 2 === 0 ? 'approved' : 'rejected' }
        })
        expect(decided.statusCode).toBe(200)
      }
      for (const id of taskIds.slice(0, 10)) {
        const done = await app.inject({
          method: 'PATCH',
          url: `/v1/tasks/${id}/status`,
          headers: headers('Operator'),
          payload: { status: 'done' }
        })
        expect(done.statusCode).toBe(200)
      }

      const last = await list(app, '/v1/tasks?limit=1&offset=100')
      expect(last.status).toBe(200)
      expect(last.body.data).toHaveLength(1)
      expect(last.body.data![0]!.id).toBe(taskIds[100])
      expect(last.body.meta.pageInfo).toEqual({
        limit: 1,
        offset: 100,
        total: 101,
        hasNextPage: false
      })

      const first = await list(app, '/v1/tasks')
      expect(first.body.data).toHaveLength(25)
      expect(first.body.meta.pageInfo).toEqual({
        limit: 25,
        offset: 0,
        total: 101,
        hasNextPage: true
      })

      const pages = await Promise.all(
        [0, 50, 100].map((offset) =>
          list(app, `/v1/tasks?limit=50&offset=${offset}`)
        )
      )
      expect(pages.flatMap((page) => page.body.data!.map((t) => t.id))).toEqual(
        taskIds
      )

      const beyond = await list(app, '/v1/tasks?offset=101')
      expect(beyond.body.data).toEqual([])
      expect(beyond.body.meta.pageInfo).toEqual({
        limit: 25,
        offset: 101,
        total: 101,
        hasNextPage: false
      })

      const active = await list(app, '/v1/tasks?status=open,in_progress')
      expect(active.body.meta.pageInfo?.total).toBe(91)
      expect(active.body.data!.every((task) => task.status === 'open')).toBe(
        true
      )
      const finished = await list(app, '/v1/tasks?status=done&limit=100')
      expect(finished.body.data).toHaveLength(10)
      expect(finished.body.meta.pageInfo?.total).toBe(10)

      const queue = await list(app, '/v1/approvals?status=pending&limit=100')
      expect(queue.body.data).toHaveLength(50)
      expect(queue.body.data!.every((a) => a.status === 'pending')).toBe(true)
      expect(queue.body.meta.pageInfo).toEqual({
        limit: 100,
        offset: 0,
        total: 50,
        hasNextPage: false
      })
      const decided = await list(app, '/v1/approvals?status=approved,rejected')
      expect(decided.body.meta.pageInfo?.total).toBe(51)
      const approvalTail = await list(app, '/v1/approvals?limit=1&offset=100')
      expect(approvalTail.body.data).toHaveLength(1)
      expect(approvalTail.body.data![0]!.id).toBe(approvalIds[100])
      expect(approvalTail.body.meta.pageInfo?.total).toBe(101)

      for (const url of [
        '/v1/tasks?limit=101',
        '/v1/tasks?limit=0',
        '/v1/tasks?offset=-1',
        '/v1/tasks?offset=10001',
        '/v1/approvals?limit=1.5'
      ]) {
        const invalid = await list(app, url)
        expect(invalid.status, url).toBe(400)
        expect(invalid.body.error?.code, url).toBe('invalid_pagination')
      }
      for (const url of [
        '/v1/tasks?status=bogus',
        '/v1/tasks?status=',
        '/v1/tasks?status=open,open',
        '/v1/tasks?status=open&status=done',
        '/v1/tasks?status=pending',
        '/v1/approvals?status=open'
      ]) {
        const invalid = await list(app, url)
        expect(invalid.status, url).toBe(400)
        expect(invalid.body.error?.code, url).toBe('validation_failed')
      }
    } finally {
      await app.close()
    }
  })
})
