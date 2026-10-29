import { describe, expect, it } from 'vitest'
import {
  hookState,
  reconcileOutcome,
  reconcileTurn,
  waterfall
} from '../kernel/hook-authority.ts'
import type { ToolOutcome } from '../kernel/types.ts'
import type { RuntimeResult } from '@cvg/harness-contracts'

const plain = { kind: 'capability', plugin: 'p', fn: () => undefined }
const ok = (result: unknown): ToolOutcome =>
  ({
    kind: 'succeeded',
    result: { status: 'SUCCEEDED', output: result },
    durationMs: 7
  }) as ToolOutcome
const turnState = () => ({
  input: { subject: 'x' },
  startedAt: 1,
  signal: new AbortController().signal,
  budget: { remainingMs: () => 5 },
  metadata: {}
})

describe('F18 hook authority branch behavior', () => {
  it('gives a non-core hook a detached view of a model-call state without the signal', () => {
    const turn = turnState()
    const view = hookState(plain, {
      turn,
      request: { prompt: 'p', signal: turn.signal }
    }) as { request: Record<string, unknown>; turn: { signal: unknown } }
    expect(view.request).toEqual({ prompt: 'p' })
    expect(view.turn.signal).toEqual({ aborted: false })
    expect(Object.isFrozen(view)).toBe(true)
  })

  it('degrades a tool call whose tool is not a data object to an opaque marker', () => {
    const view = hookState(plain, {
      turn: turnState(),
      tool: null,
      invocation: {},
      needsApproval: false
    }) as { tool: unknown }
    expect(view.tool).toEqual({ opaque: true })
  })

  it('keeps the execution reference and policy decision visible in a tool-call view', () => {
    const view = hookState(plain, {
      turn: turnState(),
      tool: { id: 't', execute: () => 1 },
      invocation: {},
      needsApproval: true,
      policyDecision: { allowed: true },
      executionRef: 'ref-1'
    }) as Record<string, unknown>
    expect(view.executionRef).toBe('ref-1')
    expect(view.policyDecision).toEqual({ allowed: true })
    expect(view.tool).toEqual({ id: 't' })
  })

  it('projects a state that is not an object as plain data', () => {
    expect(hookState(plain, null)).toBeNull()
    expect(hookState(plain, 'text')).toBe('text')
  })

  it('reduces a bare turn state to a turn view', () => {
    const view = hookState(plain, turnState()) as { startedAt: number }
    expect(view.startedAt).toBe(1)
  })

  describe('reconcileOutcome', () => {
    const before = ok('physical')
    it('refuses a missing proposal after a successful effect', () => {
      expect(reconcileOutcome(before, null, ok('exposed'))).toMatchObject({
        kind: 'confirm_failed',
        error: 'Invalid internal outcome transformation.',
        durationMs: 7
      })
    })
    it('maps a claimed failure to an uncertain effect with the given text', () => {
      expect(
        reconcileOutcome(before, {
          kind: 'failed',
          result: { status: 'FAILED', error: 'boom' },
          durationMs: 1
        })
      ).toEqual({ kind: 'threw', error: 'unknown_effect: boom', durationMs: 7 })
    })
    it('maps a claimed failure without text to the generic uncertain effect', () => {
      expect(
        reconcileOutcome(before, {
          kind: 'failed',
          result: { status: 'REJECTED' },
          durationMs: 1
        })
      ).toMatchObject({
        kind: 'threw',
        error: expect.stringContaining('unknown_effect')
      })
    })
    it.each(['deadline', 'cancelled'] as const)(
      'accepts %s but keeps the physical duration',
      (kind) => {
        expect(reconcileOutcome(before, { kind, durationMs: 999 })).toEqual({
          kind,
          durationMs: 7
        })
      }
    )
    it('refuses an unknown kind after a successful effect', () => {
      expect(reconcileOutcome(before, { kind: 'bogus' })).toMatchObject({
        kind: 'confirm_failed'
      })
    })
  })

  describe('reconcileTurn', () => {
    const done = {
      stopReason: 'COMPLETED',
      response: 'ok',
      toolResult: undefined
    } as unknown as RuntimeResult
    const stopped = {
      stopReason: 'TOOL_FAILURE',
      response: 'bad'
    } as unknown as RuntimeResult
    it('turns a missing proposal into an insufficient-evidence result', () => {
      expect(reconcileTurn(done, null, undefined)).toMatchObject({
        stopReason: 'INSUFFICIENT_EVIDENCE',
        response: 'Invalid internal turn result.'
      })
    })
    it('turns a proposal with an unknown stop reason into insufficient evidence', () => {
      expect(
        reconcileTurn(done, { stopReason: 'NOPE', response: 'x' })
      ).toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
    })
    it('keeps an already stopped turn when a core hook proposes the same reason', () => {
      expect(
        reconcileTurn(
          stopped,
          { stopReason: 'TOOL_FAILURE', response: 'other' },
          undefined,
          true
        )
      ).toBe(stopped)
    })
    it('keeps an already stopped turn when a core hook proposes a normal stop', () => {
      expect(
        reconcileTurn(
          stopped,
          { stopReason: 'COMPLETED', response: 'other' },
          undefined,
          true
        )
      ).toBe(stopped)
    })
    it('annotates an already stopped turn when a core hook reports insufficient evidence', () => {
      expect(
        reconcileTurn(
          stopped,
          { stopReason: 'INSUFFICIENT_EVIDENCE', response: 'late' },
          undefined,
          true
        )
      ).toMatchObject({
        stopReason: 'INSUFFICIENT_EVIDENCE',
        response: 'late The turn had already stopped (TOOL_FAILURE): bad'
      })
    })
  })

  describe('waterfall', () => {
    const failure = (reason: string) => `F:${reason}`
    const reconcile = (before: string | undefined, proposed: unknown): string =>
      before ?? String(proposed)
    it('reports a downstream rejection as a failure with its message', async () => {
      const entry = {
        ...plain,
        fn: async (_s: unknown, next: () => Promise<string>) => next()
      }
      await expect(
        waterfall(
          entry,
          {},
          () => Promise.reject(new Error('down')),
          failure,
          reconcile,
          () => true
        )
      ).resolves.toBe('F:down')
    })
    it('reports a non-Error downstream rejection as an unknown failure', async () => {
      const entry = {
        ...plain,
        fn: async (_s: unknown, next: () => Promise<string>) => {
          void next().catch(() => undefined)
          return 'x'
        }
      }
      await expect(
        waterfall(
          entry,
          {},
          () => Promise.reject('plain string'),
          failure,
          reconcile,
          () => true
        )
      ).resolves.toBe('F:unknown failure')
    })
    it('reports a hook that throws a non-Error as an unknown failure', async () => {
      const entry = {
        ...plain,
        fn: async () => {
          throw 'plain string'
        }
      }
      await expect(
        waterfall(
          entry,
          {},
          async () => 'down',
          failure,
          (_before, proposed) => String(proposed),
          () => true
        )
      ).resolves.toBe('F:unknown failure')
    })
  })
})
