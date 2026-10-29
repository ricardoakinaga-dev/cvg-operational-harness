import { describe, expect, it } from 'vitest'
import {
  SESSION_HEADER_MAX_BYTES,
  SessionAlreadyExistsError,
  SessionCommitUnknownError,
  SessionHeaderValidationError,
  SessionPersistenceError,
  validateSessionHeader
} from '../session/index.ts'

const base = {
  version: 1,
  id: 's-1',
  createdAt: 1_700_000_000_000,
  isSeeded: false
}
const rejects = (raw: unknown, cut?: number): void =>
  expect(() => validateSessionHeader(raw, cut)).toThrow(
    SessionHeaderValidationError
  )

describe('PAR-S01 slice 1: session header (SPEC 0221 §3/§4)', () => {
  it('accepts the minimal header, detached from the caller', () => {
    const input = {
      ...base,
      cwd: '/work',
      origin: 'subagent',
      delegationDepth: 2
    }
    const out = validateSessionHeader(input)
    expect(out.header).toEqual(input)
    expect(out.inheritedEventCount).toBe(0)
    expect(out.header).not.toBe(input)
    input.cwd = '/other'
    expect(out.header.cwd).toBe('/work')
  })
  it('keeps unknown lossless metadata without letting it authorize', () => {
    const out = validateSessionHeader({
      ...base,
      tags: ['a', { b: 1.5 }],
      note: 'x\u0000y'
    })
    expect(out.header['tags']).toEqual(['a', { b: 1.5 }])
    expect(out.header['note']).toBe('x\u0000y')
  })
  it.each([
    ['version 2', { ...base, version: 2 }],
    ['empty id', { ...base, id: '' }],
    ['long id', { ...base, id: 'x'.repeat(201) }],
    ['negative createdAt', { ...base, createdAt: -1 }],
    ['fractional createdAt', { ...base, createdAt: 1.5 }],
    ['unsafe createdAt', { ...base, createdAt: 2 ** 53 }],
    ['-0 createdAt', { ...base, createdAt: -0 }],
    ['non-boolean isSeeded', { ...base, isSeeded: 1 }],
    ['relative cwd', { ...base, cwd: 'work' }],
    ['empty parent', { ...base, parentSession: '' }],
    ['empty preset', { ...base, agentPreset: '' }],
    ['bad origin', { ...base, origin: 'user' }],
    ['negative depth', { ...base, delegationDepth: -1 }],
    ['array header', []],
    ['null header', null]
  ])('rejects %s', (_name, raw) => rejects(raw))
  it('applies the explicit cut rules without inferring the cut', () => {
    rejects({ ...base, isSeeded: true })
    expect(
      validateSessionHeader({ ...base, isSeeded: true }, 0).inheritedEventCount
    ).toBe(0)
    expect(
      validateSessionHeader({ ...base, isSeeded: true }, 7).inheritedEventCount
    ).toBe(7)
    rejects({ ...base, isSeeded: false }, 3)
    expect(validateSessionHeader({ ...base }, 0).inheritedEventCount).toBe(0)
    rejects({ ...base, isSeeded: true }, -1)
    rejects({ ...base, isSeeded: true }, 1.5)
  })
  it('rejects non-JSON shapes', () => {
    const cyc: Record<string, unknown> = { ...base }
    cyc['self'] = cyc
    rejects(cyc)
    rejects({ ...base, f: () => 1 })
    rejects({ ...base, u: undefined })
    rejects({ ...base, b: 1n })
    rejects({ ...base, n: Number.NaN })
    rejects({ ...base, z: -0 })
    rejects({ ...base, [Symbol('k')]: 1 })
    rejects({ ...base, arr: [1, , 3] })
    rejects({ ...base, d: new Date(0) })
    const hidden = { ...base }
    Object.defineProperty(hidden, 'h', { value: 1, enumerable: false })
    rejects(hidden)
  })
  it('allows a shared (non-cyclic) alias to be copied twice', () => {
    const shared = { a: 1 }
    const out = validateSessionHeader({ ...base, x: shared, y: shared })
    expect(out.header['x']).toEqual({ a: 1 })
    expect(out.header['x']).not.toBe(out.header['y'])
  })
  it('reads each property once (A/B getter shows one value to validation and storage)', () => {
    let reads = 0
    const raw = { ...base }
    Object.defineProperty(raw, 'id', {
      enumerable: true,
      get: () => (++reads === 1 ? 's-A' : '')
    })
    expect(validateSessionHeader(raw).header.id).toBe('s-A')
    expect(reads).toBe(1)
  })
  it('a throwing getter fails without partial output', () => {
    const raw = { ...base }
    Object.defineProperty(raw, 'boom', {
      enumerable: true,
      get: () => {
        throw new Error('getter')
      }
    })
    expect(() => validateSessionHeader(raw)).toThrow('getter')
  })
  it('enforces depth, node and byte limits', () => {
    let deep: unknown = 1
    for (let i = 0; i < 70; i++) deep = [deep]
    rejects({ ...base, deep })
    rejects({ ...base, wide: new Array(20_001).fill(1) })
    rejects({ ...base, big: 'x'.repeat(SESSION_HEADER_MAX_BYTES) })
    expect(() =>
      validateSessionHeader({
        ...base,
        ok: 'x'.repeat(SESSION_HEADER_MAX_BYTES - 200)
      })
    ).not.toThrow()
  })
  it('errors are distinct classes with a sessionId and no leaked detail', () => {
    const e = new SessionAlreadyExistsError('exists', 's-1')
    expect(e).toBeInstanceOf(SessionPersistenceError)
    expect(e).not.toBeInstanceOf(SessionCommitUnknownError)
    expect(e.name).toBe('SessionAlreadyExistsError')
    expect(e.sessionId).toBe('s-1')
  })
})
