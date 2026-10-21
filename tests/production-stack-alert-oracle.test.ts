// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  alertBaseline,
  findWorkerDownAfterStop,
  parseAlertReceiverLog
} from '../scripts/production-stack-smoke.ts'

// SPEC0249 AC14 (AUD-0621 F26): the stop alert counts only when a new,
// signed worker_down firing for the tenant arrives after the stop instant;
// the history recorded before the stop never satisfies the oracle.
const SECRET = 'synthetic-0249-alert-secret-0123456789abcdef'
const TENANT = 'tenant_00000000-0000-4000-8000-000000000573'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000574'
const STOPPED_AT = Date.parse('2026-10-20T10:55:00.000Z')

function delivery(
  body: Record<string, unknown>,
  options: { timestamp?: string; receivedAt?: string; secret?: string } = {}
): string {
  const text = JSON.stringify(body)
  const timestamp = options.timestamp ?? String(body.observedAt)
  const signature = createHmac('sha256', options.secret ?? SECRET)
    .update(`${timestamp}.${text}`)
    .digest('hex')
  return JSON.stringify({
    signature,
    timestamp,
    body: text,
    receivedAt: options.receivedAt ?? timestamp
  })
}

function alert(
  state: 'firing' | 'resolved',
  observedAt: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    code: 'worker_down',
    state,
    tenantId: TENANT,
    observedAt,
    detail: { knownWorkers: 1 },
    ...overrides
  }
}

// The alert deliveries recorded by the 20/10 smoke before the final stop
// (production-stack.json, check alert.worker_down_delivered_signed).
const HISTORY = [
  alert('firing', '2026-10-20T10:54:33.336Z', { detail: { knownWorkers: 0 } }),
  alert('resolved', '2026-10-20T10:54:35.329Z'),
  alert('firing', '2026-10-20T10:54:38.331Z'),
  alert('firing', '2026-10-20T10:54:50.237Z'),
  alert('firing', '2026-10-20T10:54:54.232Z', { code: 'queue_stalled' }),
  alert('resolved', '2026-10-20T10:54:55.232Z'),
  alert('resolved', '2026-10-20T10:54:55.232Z', { code: 'queue_stalled' })
].map((body) => delivery(body))

function check(lines: readonly string[], offset = HISTORY.length) {
  return findWorkerDownAfterStop(parseAlertReceiverLog(lines.join('\n')), {
    offset,
    stoppedAt: STOPPED_AT,
    tenantId: TENANT,
    secret: SECRET
  })
}

describe('SPEC0249 production stack stop-alert oracle', () => {
  it('parses receiver lines and ignores non-JSON output', () => {
    const alerts = parseAlertReceiverLog(
      ['listening on 8080', ...HISTORY, ''].join('\n')
    )
    expect(alerts).toHaveLength(HISTORY.length)
    expect(alerts[0]).toMatchObject({
      timestamp: '2026-10-20T10:54:33.336Z',
      receivedAt: '2026-10-20T10:54:33.336Z'
    })
  })

  it('takes the baseline offset and the last worker_down state of the tenant', () => {
    expect(
      alertBaseline(parseAlertReceiverLog(HISTORY.join('\n')), TENANT)
    ).toEqual({ offset: HISTORY.length, lastWorkerDownState: 'resolved' })
    expect(
      alertBaseline(parseAlertReceiverLog(HISTORY.join('\n')), OTHER_TENANT)
    ).toEqual({ offset: HISTORY.length, lastWorkerDownState: null })
  })

  it('known negative: the recorded history without a new delivery fails', () => {
    expect(check(HISTORY)).toEqual({
      ok: false,
      reason: 'no_delivery_after_stop'
    })
    // Reading the whole log again (offset 0) still finds nothing after the
    // stop: every historical firing predates it.
    expect(check(HISTORY, 0)).toEqual({
      ok: false,
      reason: 'no_worker_down_firing_after_stop'
    })
  })

  it('accepts a new signed firing correlated with the stop', () => {
    const fresh = delivery(alert('firing', '2026-10-20T10:55:16.000Z'), {
      receivedAt: '2026-10-20T10:55:16.020Z'
    })
    const result = check([...HISTORY, fresh])
    expect(result).toMatchObject({
      ok: true,
      alert: { code: 'worker_down', state: 'firing', tenantId: TENANT }
    })
  })

  it('rejects deliveries that are not a new firing of this tenant after the stop', () => {
    const cases: Array<[string, string]> = [
      [
        'resolved after the stop',
        delivery(alert('resolved', '2026-10-20T10:55:16.000Z'))
      ],
      [
        'firing observed before the stop',
        delivery(alert('firing', '2026-10-20T10:54:59.000Z'), {
          timestamp: '2026-10-20T10:55:16.000Z',
          receivedAt: '2026-10-20T10:55:16.000Z'
        })
      ],
      [
        'firing sent before the stop',
        delivery(alert('firing', '2026-10-20T10:55:16.000Z'), {
          timestamp: '2026-10-20T10:54:59.000Z',
          receivedAt: '2026-10-20T10:55:16.000Z'
        })
      ],
      [
        'firing received before the stop',
        delivery(alert('firing', '2026-10-20T10:55:16.000Z'), {
          receivedAt: '2026-10-20T10:54:59.000Z'
        })
      ],
      [
        'firing of another tenant',
        delivery(
          alert('firing', '2026-10-20T10:55:16.000Z', {
            tenantId: OTHER_TENANT
          })
        )
      ],
      [
        'queue_stalled instead of worker_down',
        delivery(
          alert('firing', '2026-10-20T10:55:16.000Z', {
            code: 'queue_stalled'
          })
        )
      ]
    ]
    for (const [label, line] of cases) {
      expect({ label, result: check([...HISTORY, line]) }).toEqual({
        label,
        result: { ok: false, reason: 'no_worker_down_firing_after_stop' }
      })
    }
  })

  it('rejects an unsigned or wrongly signed delivery after the stop', () => {
    const forged = delivery(alert('firing', '2026-10-20T10:55:16.000Z'), {
      secret: 'another-secret-0123456789abcdef-0123456789'
    })
    expect(check([...HISTORY, forged])).toEqual({
      ok: false,
      reason: 'unsigned_delivery_after_stop'
    })
    const missingReceivedAt = JSON.stringify({
      ...JSON.parse(delivery(alert('firing', '2026-10-20T10:55:16.000Z'))),
      receivedAt: undefined
    })
    expect(check([...HISTORY, missingReceivedAt])).toEqual({
      ok: false,
      reason: 'no_worker_down_firing_after_stop'
    })
  })
})
