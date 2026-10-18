// @vitest-environment node
import { it, expect } from 'vitest'
import { RunState } from './run-state.mjs'
import { probeError } from './schema.mjs'

it('detaches an intent at observation time instead of rewriting it with later IDs', () => {
  const state = new RunState(),
    intent = { id: null, labels: { role: 'observer' } }
  state.record('HOST', 'CREATE_INTENT', intent)
  intent.id = 'later'
  intent.labels.role = 'client'
  expect(state.records[0].data).toEqual({
    id: null,
    labels: { role: 'observer' }
  })
})
it('retains primary/additional error identity without serializing their messages', () => {
  const state = new RunState(),
    primary = probeError('PRIVACY', new Error('invented-sensitive-detail'))
  const cleanup = probeError('CLEANUP')
  state.failure(primary, 'OBSERVER')
  state.failure(cleanup)
  state.failure(primary)
  expect(state.cause().errors).toEqual([primary, cleanup])
  expect(state.cause().cause).toBe(primary)
  expect(JSON.stringify(state.records)).not.toContain(
    'invented-sensitive-detail'
  )
  expect(state.failures.map((f) => f.order)).toEqual([0, 1])
})
it('does not wait past its fixed deadline or hide an existing failure', async () => {
  const state = new RunState()
  await expect(
    state.wait(() => false, { deadline: state.now() - 1 })
  ).rejects.toHaveProperty('code', 'TIMEOUT')
  const primary = probeError('IO')
  state.failure(primary)
  await expect(state.wait(() => true)).rejects.toBe(primary)
})
