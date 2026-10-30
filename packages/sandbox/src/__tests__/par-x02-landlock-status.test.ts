import { describe, expect, it } from 'vitest'
import { LANDLOCK_MIN_ABI } from '../capabilities.ts'
import {
  LANDLOCK_STATUS_MAX_BYTES,
  LandlockStatusChannel
} from '../process-service/landlock-status.ts'

/** SPEC 0288 §5.4: only one well-formed proof on the helper's channel is "applied". */
const read = (...chunks: string[]) => {
  const channel = new LandlockStatusChannel()
  for (const chunk of chunks) channel.feed(Buffer.from(chunk))
  return channel.report()
}
const proof = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    applied: true,
    abi: 8,
    handledFs: 65535,
    handledNet: 3,
    scoped: 3,
    ...over
  }) + '\n'

describe('PAR-X02 slice 3: Landlock status channel', () => {
  it('one proof, even split across chunks, is applied', () => {
    const text = proof()
    expect(read(text.slice(0, 7), text.slice(7))).toEqual({
      applied: true,
      abi: 8,
      handledFs: 65535,
      handledNet: 3,
      scoped: 3
    })
  })

  it('nothing written is not applied', () => {
    expect(read()).toEqual({ applied: false, error: 'status_missing' })
    expect(read('  \n')).toEqual({ applied: false, error: 'status_missing' })
  })

  it('the helper refusal keeps its code; an unexpected code is generic', () => {
    expect(
      read('{"applied":false,"error":"rule_path_unavailable","errno":2}\n')
    ).toEqual({
      applied: false,
      error: 'rule_path_unavailable'
    })
    expect(read('{"applied":false,"error":"Bad Code!"}')).toEqual({
      applied: false,
      error: 'helper_refused'
    })
    expect(read('{"applied":false}')).toEqual({
      applied: false,
      error: 'helper_refused'
    })
  })

  it('two documents, garbage, arrays and extra or missing fields are malformed', () => {
    for (const text of [
      proof() + proof(),
      'applied',
      '[1]',
      'null',
      proof({ extra: 1 }),
      JSON.stringify({ applied: true, abi: 8, handledFs: 1, handledNet: 0 }),
      proof({ abi: '8' }),
      proof({ abi: 2.5 }),
      proof({ handledNet: -1 }),
      proof({ scoped: Number.MAX_SAFE_INTEGER + 1 }),
      proof({ handledFs: 0 }),
      proof({ applied: 'true' })
    ])
      expect(read(text)).toEqual({ applied: false, error: 'status_malformed' })
  })

  it('a proof below the floor is not Landlock', () => {
    expect(read(proof({ abi: LANDLOCK_MIN_ABI - 1 }))).toEqual({
      applied: false,
      error: 'abi_too_low'
    })
    expect(read(proof({ abi: LANDLOCK_MIN_ABI }))).toMatchObject({
      applied: true
    })
  })

  it('an oversized channel is refused and stays refused', () => {
    const channel = new LandlockStatusChannel()
    channel.feed(Buffer.alloc(LANDLOCK_STATUS_MAX_BYTES + 1, 0x20))
    channel.feed(Buffer.from(proof()))
    expect(channel.report()).toEqual({
      applied: false,
      error: 'status_oversized'
    })
  })
})
