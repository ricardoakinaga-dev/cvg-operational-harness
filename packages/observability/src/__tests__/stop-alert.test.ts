import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createStopAlertMonitor,
  createWebhookStopAlertDelivery,
  evaluateStopAlerts,
  type StopAlertNotification,
  type StopAlertStatus
} from '../stop-alert.ts'

const NOW = new Date('2026-10-06T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)

function status(overrides: Partial<StopAlertStatus> = {}): StopAlertStatus {
  return {
    observedAt: NOW,
    workers: [
      { workerId: 'w1', lastBeatAt: ago(5_000), lastProgressAt: ago(5_000) }
    ],
    queue: { ready: 0, oldestReadyAgeMs: null, expiredLeases: 0 },
    pause: { paused: false },
    ...overrides
  }
}

describe('evaluateStopAlerts (barra 0373, condição 9)', () => {
  it('stays quiet while a worker beats and the queue moves', () => {
    expect(evaluateStopAlerts(status())).toEqual([])
  })

  it('fires worker_down when the last heartbeat is stale or no worker ever beat', () => {
    const stale = status({
      workers: [
        { workerId: 'w1', lastBeatAt: ago(600_000), lastProgressAt: null }
      ]
    })
    expect(evaluateStopAlerts(stale).map((c) => c.code)).toEqual([
      'worker_down'
    ])
    expect(
      evaluateStopAlerts(status({ workers: [] })).map((c) => c.code)
    ).toEqual(['worker_down'])
  })

  it('fires queue_stalled on old ready work or an expired lease, not while paused', () => {
    const stalled = status({
      queue: { ready: 3, oldestReadyAgeMs: 900_000, expiredLeases: 0 }
    })
    expect(evaluateStopAlerts(stalled).map((c) => c.code)).toEqual([
      'queue_stalled'
    ])
    const leaked = status({
      queue: { ready: 0, oldestReadyAgeMs: null, expiredLeases: 1 }
    })
    expect(evaluateStopAlerts(leaked).map((c) => c.code)).toEqual([
      'queue_stalled'
    ])
    expect(evaluateStopAlerts({ ...stalled, pause: { paused: true } })).toEqual(
      []
    )
  })
})

describe('createStopAlertMonitor', () => {
  it('notifies once per incident, resolves it, and retries a failed delivery', async () => {
    let current = status({ workers: [] })
    const sent: StopAlertNotification[] = []
    let failNext = true
    const monitor = createStopAlertMonitor({
      tenantId: 'tenant_synthetic',
      read: async () => current,
      deliver: async (notification) => {
        if (failNext) {
          failNext = false
          throw new Error('receiver down')
        }
        sent.push(notification)
      }
    })
    expect(await monitor.check()).toEqual([])
    expect(monitor.open()).toEqual([])
    await monitor.check()
    await monitor.check()
    expect(sent.map((n) => `${n.code}:${n.state}`)).toEqual([
      'worker_down:firing'
    ])
    current = status()
    await monitor.check()
    expect(sent.map((n) => `${n.code}:${n.state}`)).toEqual([
      'worker_down:firing',
      'worker_down:resolved'
    ])
    expect(monitor.open()).toEqual([])
  })

  it('treats an unreadable status as no worker alive', async () => {
    const sent: StopAlertNotification[] = []
    const monitor = createStopAlertMonitor({
      tenantId: 'tenant_synthetic',
      read: async () => {
        throw new Error('database down')
      },
      deliver: async (notification) => {
        sent.push(notification)
      }
    })
    await monitor.check()
    expect(sent.map((n) => n.code)).toEqual(['worker_down'])
  })
})

describe('createWebhookStopAlertDelivery', () => {
  it('signs the body with HMAC-SHA256 over timestamp and body', async () => {
    const secret = 's'.repeat(32)
    let request: { headers: Record<string, string>; body: string } | undefined
    const deliver = createWebhookStopAlertDelivery({
      url: 'https://alerts.example.test/hook',
      secret,
      clock: () => NOW,
      fetch: (async (_url: URL, init: RequestInit) => {
        request = {
          headers: init.headers as Record<string, string>,
          body: String(init.body)
        }
        return new Response(null, { status: 204 })
      }) as typeof fetch
    })
    await deliver({
      code: 'worker_down',
      state: 'firing',
      tenantId: 'tenant_synthetic',
      observedAt: NOW.toISOString(),
      detail: {}
    })
    const timestamp = request!.headers['x-cvg-alert-timestamp']!
    expect(request!.headers['x-cvg-alert-signature']).toBe(
      createHmac('sha256', secret)
        .update(`${timestamp}.${request!.body}`)
        .digest('hex')
    )
  })

  it('rejects a short secret and treats a non-2xx answer as failure', async () => {
    expect(() =>
      createWebhookStopAlertDelivery({ url: 'https://x.test', secret: 'short' })
    ).toThrow(/32/)
    const deliver = createWebhookStopAlertDelivery({
      url: 'https://alerts.example.test/hook',
      secret: 's'.repeat(32),
      fetch: (async () => new Response(null, { status: 500 })) as typeof fetch
    })
    await expect(
      deliver({
        code: 'queue_stalled',
        state: 'firing',
        tenantId: 't',
        observedAt: NOW.toISOString(),
        detail: {}
      })
    ).rejects.toThrow(/500/)
  })
})
