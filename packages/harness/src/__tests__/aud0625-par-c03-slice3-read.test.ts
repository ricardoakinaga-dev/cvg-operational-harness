import { describe, expect, it } from 'vitest'
import type {
  SpillPutInput,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import {
  InMemorySpillStore,
  SPILL_READ_TOOL_ID,
  SpillCancelled,
  SpillQuotaExceeded,
  SpillStorageUnavailable,
  createSpillReadTool,
  isSpillReadTool,
  prepareToolOutput,
  resolveSpillPolicy,
  type SpillReadToolOptions
} from '../spill/index.ts'

/** PAR-C03 / SPEC 0293 slice 3: the house read, quota, erasure on request, expiry in the block. Synthetic data only. */

const put = (over: Partial<SpillPutInput> = {}): SpillPutInput => ({
  tenantId: 'tenant_a',
  sessionId: 'session_a',
  executionId: 'exec_a',
  operationKey: 'op_a',
  sourceId: 'tool.x',
  classification: 'CONFIDENTIAL',
  mediaType: 'text/plain',
  content: 'conteúdo sintético',
  ...over
})

const context = (
  over: Partial<ToolExecutionContext> = {}
): ToolExecutionContext =>
  ({
    tenantId: 'tenant_a',
    agentId: 'agent',
    correlationId: 'corr',
    traceId: 'trace',
    sessionId: 'session_a',
    ...over
  }) as ToolExecutionContext

const small = {
  thresholdBytes: 4_000,
  previewHeadBytes: 100,
  previewTailBytes: 100
}

describe('createSpillReadTool: the house read', () => {
  const build = (over: Partial<SpillReadToolOptions> = {}) => {
    const store = over.store ?? new InMemorySpillStore()
    return { store, tool: createSpillReadTool({ store, ...over }) }
  }

  it('is a governed, read-only capability with a reserved name', () => {
    const { tool } = build()
    expect(tool.id).toBe(SPILL_READ_TOOL_ID)
    expect(tool.id).toBe('spill.read')
    expect(tool).toMatchObject({
      risk: 'LOW',
      sideEffect: 'READ',
      idempotent: true,
      requiresApproval: false
    })
    expect(tool.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['locator']
    })
  })

  it('reads a slice of a stored object bound to the tenant and session of the turn', async () => {
    const { store, tool } = build()
    const { locator } = await store.put(put({ content: 'abcdefghij' }))
    const result = await tool.execute(
      { locator, offset: 2, length: 4 },
      context()
    )
    expect(result).toEqual({
      status: 'SUCCEEDED',
      output: {
        status: 'OK',
        text: 'cdef',
        offset: 2,
        skippedBytes: 0,
        bytesRead: 4,
        totalBytes: 10,
        eof: false
      }
    })
    // defaults: from the start, up to the read limit
    const whole = await tool.execute({ locator }, context())
    expect(whole).toMatchObject({ output: { text: 'abcdefghij', eof: true } })
  })

  it('answers NOT_FOUND for another tenant, another session or an unknown locator', async () => {
    const { store, tool } = build()
    const { locator } = await store.put(put())
    for (const over of [{ tenantId: 'tenant_b' }, { sessionId: 'session_b' }]) {
      expect(await tool.execute({ locator }, context(over as never))).toEqual({
        status: 'SUCCEEDED',
        output: { status: 'NOT_FOUND' }
      })
    }
    expect(await tool.execute({ locator: 'spill_nope' }, context())).toEqual({
      status: 'SUCCEEDED',
      output: { status: 'NOT_FOUND' }
    })
  })

  it('says EXPIRED when the object is past its validity', async () => {
    let now = new Date('2026-10-30T00:00:00.000Z')
    const store = new InMemorySpillStore({ clock: () => now })
    const { tool } = build({ store })
    const { locator } = await store.put(put())
    now = new Date('2026-10-31T00:00:00.000Z')
    expect(await tool.execute({ locator }, context())).toEqual({
      status: 'SUCCEEDED',
      output: { status: 'EXPIRED' }
    })
  })

  it('rejects malformed input before touching the store', async () => {
    const reads: unknown[] = []
    const store = new InMemorySpillStore()
    const spy = {
      ...store,
      durability: store.durability,
      put: store.put.bind(store),
      read: async (i: unknown) => {
        reads.push(i)
        throw new Error('no')
      }
    }
    const { tool } = build({ store: spy as never })
    const bad: unknown[] = [
      null,
      'x',
      [],
      {},
      { locator: '' },
      { locator: 1 },
      { locator: 'x'.repeat(201) },
      { locator: 'spill_x', extra: 1 },
      { locator: 'spill_x', offset: -1 },
      { locator: 'spill_x', offset: 1.5 },
      { locator: 'spill_x', length: 0 },
      { locator: 'spill_x', length: 1.5 },
      { locator: 'spill_x', length: 32_769 }
    ]
    for (const input of bad) {
      expect(await tool.execute(input, context())).toMatchObject({
        status: 'REJECTED',
        error: 'spill.read input is invalid'
      })
    }
    expect(reads).toHaveLength(0)
  })

  it('needs the session of the turn', async () => {
    const { tool } = build()
    const noSession = { ...context() } as { sessionId?: string }
    delete noSession.sessionId
    expect(
      await tool.execute({ locator: 'spill_x' }, noSession as never)
    ).toMatchObject({
      status: 'REJECTED'
    })
  })

  it('shortens a read to the context the host can give, and refuses when there is none', async () => {
    let available = 4
    const { store, tool } = build({ availableBytes: () => available })
    const { locator } = await store.put(put({ content: 'abcdefghij' }))
    expect(await tool.execute({ locator, length: 8 }, context())).toMatchObject(
      {
        output: { text: 'abcd', bytesRead: 4 }
      }
    )
    expect(await tool.execute({ locator }, context())).toMatchObject({
      output: { bytesRead: 4 }
    })
    for (const none of [0, -1, Number.NaN, 1.5]) {
      available = none
      expect(await tool.execute({ locator }, context())).toMatchObject({
        status: 'REJECTED',
        error: 'no context left for this read'
      })
    }
  })

  it('caps a read at its own read limit', async () => {
    const { store, tool } = build({ policy: { readMaxBytes: 5 } })
    const { locator } = await store.put(put({ content: 'abcdefghij' }))
    expect(await tool.execute({ locator }, context())).toMatchObject({
      output: { bytesRead: 5 }
    })
    expect(await tool.execute({ locator, length: 6 }, context())).toMatchObject(
      { status: 'REJECTED' }
    )
  })

  it('reports a store failure without its detail, and passes the signal on', async () => {
    const seen: (AbortSignal | undefined)[] = []
    const store = {
      durability: 'shared' as const,
      put: async () => {
        throw new Error('unused')
      },
      read: async (input: { signal?: AbortSignal }) => {
        seen.push(input.signal)
        throw new SpillStorageUnavailable('dsn://user:secret@host')
      }
    }
    const tool = createSpillReadTool({ store: store as never })
    const controller = new AbortController()
    const failed = await tool.execute(
      { locator: 'spill_x' },
      context({ signal: controller.signal })
    )
    expect(failed).toEqual({
      status: 'FAILED',
      error: 'spill.read is unavailable'
    })
    expect(JSON.stringify(failed)).not.toContain('secret')
    expect(seen[0]).toBe(controller.signal)
    const cancelling = createSpillReadTool({
      store: {
        ...store,
        read: async () => {
          throw new SpillCancelled('x')
        }
      } as never
    })
    expect(await cancelling.execute({ locator: 'spill_x' }, context())).toEqual(
      {
        status: 'FAILED',
        error: 'spill.read was cancelled'
      }
    )
  })

  it('is recognised only when made by the factory', () => {
    const { tool } = build()
    expect(isSpillReadTool(tool)).toBe(true)
    expect(isSpillReadTool({ ...tool })).toBe(false)
    expect(
      isSpillReadTool({
        id: 'spill.read',
        version: 'v1',
        execute: async () => ({ status: 'SUCCEEDED' })
      })
    ).toBe(false)
  })
})

describe('the quota (SPEC 0293 I5)', () => {
  const policy = { ...small, maxObjectsPerSession: 2, maxBytesPerTenant: 100 }
  const text = (n: number, c = 'x') => c.repeat(n)

  it('refuses the object past the per-session count, while a repeat of an existing one still answers', async () => {
    const store = new InMemorySpillStore({ policy })
    const one = await store.put(
      put({ operationKey: 'o1', content: text(10, 'a') })
    )
    await store.put(put({ operationKey: 'o2', content: text(10, 'b') }))
    await expect(
      store.put(put({ operationKey: 'o3', content: text(10, 'c') }))
    ).rejects.toBeInstanceOf(SpillQuotaExceeded)
    expect(
      (await store.put(put({ operationKey: 'o1', content: text(10, 'a') })))
        .locator
    ).toBe(one.locator)
    // another session has its own count
    await expect(
      store.put(
        put({
          sessionId: 'session_b',
          operationKey: 'o3',
          content: text(10, 'c')
        })
      )
    ).resolves.toBeDefined()
  })

  it('refuses what would pass the per-tenant bytes, to the byte', async () => {
    const store = new InMemorySpillStore({
      policy: { ...policy, maxObjectsPerSession: 50 }
    })
    await store.put(put({ operationKey: 'o1', content: text(60) }))
    await expect(
      store.put(
        put({ sessionId: 'session_b', operationKey: 'o2', content: text(41) })
      )
    ).rejects.toBeInstanceOf(SpillQuotaExceeded)
    await expect(
      store.put(
        put({ sessionId: 'session_b', operationKey: 'o3', content: text(40) })
      )
    ).resolves.toBeDefined()
    // another tenant is not counted
    await expect(
      store.put(
        put({ tenantId: 'tenant_b', operationKey: 'o4', content: text(100) })
      )
    ).resolves.toBeDefined()
  })

  it('does not count an expired object, and replaces an expired repeat instead of reviving it', async () => {
    let now = new Date('2026-10-30T00:00:00.000Z')
    const store = new InMemorySpillStore({ policy, clock: () => now })
    const first = await store.put(
      put({ operationKey: 'o1', content: text(10, 'a') })
    )
    await store.put(put({ operationKey: 'o2', content: text(10, 'b') }))
    now = new Date('2026-10-31T00:00:00.000Z')
    const again = await store.put(
      put({ operationKey: 'o1', content: text(10, 'a') })
    )
    expect(Date.parse(again.expiresAt)).toBeGreaterThan(
      Date.parse(first.expiresAt)
    )
    await expect(
      store.put(put({ operationKey: 'o3', content: text(10, 'c') }))
    ).resolves.toBeDefined()
  })

  it('turns a quota refusal into armazenado=não after a single attempt', async () => {
    let attempts = 0
    const store = {
      durability: 'shared' as const,
      put: async () => {
        attempts += 1
        throw new SpillQuotaExceeded('full')
      },
      read: async () => {
        throw new Error('unused')
      }
    }
    const prepared = await prepareToolOutput({
      tenantId: 'tenant_a',
      sessionId: 'session_a',
      executionId: 'exec_a',
      operationKey: 'op_a',
      toolId: 'tool.x',
      classification: 'CONFIDENTIAL',
      output: 'z'.repeat(20_000),
      policy: resolveSpillPolicy(),
      store: store as never,
      storedSoFar: 0
    })
    expect(attempts).toBe(1)
    expect(prepared.rendering.stored).toBe(false)
    expect(prepared.rendering.text).toContain('armazenado=não')
  })
})

describe('erasure on request: purgeSession', () => {
  it('removes every object of one session of one tenant and nothing else', async () => {
    const store = new InMemorySpillStore()
    const a1 = await store.put(put({ operationKey: 'o1' }))
    const a2 = await store.put(put({ operationKey: 'o2', content: 'dois' }))
    const b = await store.put(
      put({ sessionId: 'session_b', operationKey: 'o1' })
    )
    const other = await store.put(
      put({ tenantId: 'tenant_b', operationKey: 'o1' })
    )
    expect(
      await store.purgeSession({ tenantId: 'tenant_a', sessionId: 'session_a' })
    ).toBe(2)
    expect(
      await store.purgeSession({ tenantId: 'tenant_a', sessionId: 'session_a' })
    ).toBe(0)
    const read = (locator: string, over = {}) =>
      store.read({
        tenantId: 'tenant_a',
        sessionId: 'session_a',
        locator,
        offset: 0,
        length: 10,
        ...over
      })
    await expect(read(a1.locator)).rejects.toThrow('not found')
    await expect(read(a2.locator)).rejects.toThrow('not found')
    await expect(
      read(b.locator, { sessionId: 'session_b' })
    ).resolves.toBeDefined()
    await expect(
      read(other.locator, { tenantId: 'tenant_b' })
    ).resolves.toBeDefined()
    // the same output can be stored again afterwards
    expect((await store.put(put({ operationKey: 'o1' }))).locator).not.toBe(
      a1.locator
    )
  })
})

describe('the expiry is part of the block the model reads', () => {
  it('shows expiraEm for a stored object and omits it for one that was not stored', async () => {
    const store = {
      durability: 'shared' as const,
      put: async (input: SpillPutInput) => ({
        locator: 'spill_scripted',
        bytes: input.content.length,
        sha256: 'a'.repeat(64),
        createdAt: '2026-10-30T00:00:00.000Z',
        expiresAt: '2026-10-31T00:00:00.000Z'
      }),
      read: async () => {
        throw new Error('unused')
      }
    }
    const base = {
      tenantId: 'tenant_a',
      sessionId: 'session_a',
      executionId: 'exec_a',
      operationKey: 'op_a',
      toolId: 'tool.x',
      classification: 'CONFIDENTIAL',
      output: 'z'.repeat(20_000),
      policy: resolveSpillPolicy(),
      storedSoFar: 0
    }
    const stored = await prepareToolOutput({ ...base, store: store as never })
    expect(stored.rendering.text).toContain('expiraEm=2026-10-31T00:00:00.000Z')
    expect(stored.rendering.expiresAt).toBe('2026-10-31T00:00:00.000Z')
    const notStored = await prepareToolOutput(base)
    expect(notStored.rendering.text).not.toContain('expiraEm')
    expect(notStored.rendering.expiresAt).toBeUndefined()
  })

  it('shows the house read result whole even above the threshold, never as a preview', async () => {
    const prepared = await prepareToolOutput({
      tenantId: 'tenant_a',
      sessionId: 'session_a',
      executionId: 'exec_a',
      operationKey: 'op_a',
      toolId: 'spill.read',
      classification: 'CONFIDENTIAL',
      output: 'r'.repeat(40_000),
      policy: resolveSpillPolicy(),
      storedSoFar: 0,
      inlineAlways: true
    })
    expect(prepared.rendering.form).toBe('inline')
    expect(prepared.rendering.text).toContain('r'.repeat(40_000))
    expect(prepared.wrote).toBe(false)
  })
})
