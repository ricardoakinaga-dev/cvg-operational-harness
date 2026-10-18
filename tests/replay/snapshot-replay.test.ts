import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CASE_IDS,
  assertReplay,
  fixtureSchema,
  loadFixtures,
  safeCaseId,
  validateJson
} from './fixture-schema.mjs'
import { executeFixture } from './execute-fixture.ts'
import { assertBehavior } from './behavior-contract.ts'

const directory = resolve(
  process.env.CVG_REPLAY_FIXTURES_DIR ?? 'snapshots/core'
)
const record = process.env.CVG_REPLAY_RECORD_CASE
if (record) safeCaseId.parse(record)
const fixtures = loadFixtures(directory, { requireExpected: !record })

describe('PDSH-032 public keyless recorded-turn replay', () => {
  for (const { input, expected } of fixtures) {
    if (record && input.id !== record) continue
    it(`${input.id}: exact transcript in two fresh executions`, async () => {
      const first = await executeFixture(input)
      const second = await executeFixture(input)
      assertBehavior(input.id, first)
      assertReplay(second, first, `${input.id}: determinism`)
      if (record) {
        const destination = resolve('snapshots/core/recordings')
        mkdirSync(destination, { recursive: true })
        // Exclusive create: even a candidate cannot be silently overwritten.
        writeFileSync(
          join(destination, `${input.id}.candidate.json`),
          JSON.stringify(
            { formatVersion: 1, id: input.id, transcript: first },
            null,
            2
          ) + '\n',
          { flag: 'wx' }
        )
      } else {
        if (!expected) throw new Error(`missing expected fixture: ${input.id}`)
        assertReplay(first, expected.transcript, input.id)
        assertReplay(second, expected.transcript, input.id)
      }
    })
  }
})

if (!record)
  describe('known-bad replay and fixture rejection', () => {
    for (const { input, expected } of fixtures) {
      it(`${input.id}: rejects changed output, counters, event and effect`, () => {
        if (!expected) throw new Error('expected fixture missing')
        for (const mutate of [
          (t: typeof expected.transcript) => {
            Object.assign(t.result, {
              response: t.result.response + ' MUTATED'
            })
          },
          (t: typeof expected.transcript) => {
            Object.assign(t.result.usage, {
              costUsd: t.result.usage.costUsd + 1
            })
          },
          (t: typeof expected.transcript) => {
            t.events.pop()
          },
          (t: typeof expected.transcript) => {
            t.toolBodies.push({ unauthorizedEffect: true })
          },
          (t: typeof expected.transcript) => {
            Object.assign(t.result, { approvalId: 'MUTATED' })
          },
          (t: typeof expected.transcript) => {
            t.journal = { state: 'MUTATED' }
          }
        ]) {
          const bad = structuredClone(expected.transcript)
          mutate(bad)
          expect(() =>
            assertReplay(bad, expected.transcript, input.id)
          ).toThrow(/replay mismatch/)
        }
      })
    }
    function inTemp(run: (dir: string) => void) {
      const dir = mkdtempSync(resolve('tests/replay/.fixture-negative-'))
      try {
        for (const id of CASE_IDS)
          for (const suffix of ['input', 'expected']) {
            copyFileSync(
              join(directory, `${id}.${suffix}.json`),
              join(dir, `${id}.${suffix}.json`)
            )
          }
        run(dir)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    it('rejects empty corpus and each independently missing input/expected', () => {
      for (const id of CASE_IDS)
        for (const suffix of ['input', 'expected'])
          inTemp((dir) => {
            rmSync(join(dir, `${id}.${suffix}.json`))
            expect(() => loadFixtures(dir)).toThrow()
          })
      inTemp((dir) => {
        for (const id of CASE_IDS)
          for (const suffix of ['input', 'expected'])
            rmSync(join(dir, `${id}.${suffix}.json`))
        expect(() => loadFixtures(dir)).toThrow()
      })
    })
    it('rejects hostile names, symlinks, schema errors and input/id drift before execution', () => {
      for (const hostile of [
        '../escape',
        'a/b',
        'simple-response.json',
        '$(echo injected)',
        '__proto__'
      ]) {
        expect(() => safeCaseId.parse(hostile)).toThrow()
      }
      inTemp((dir) => {
        writeFileSync(join(dir, 'hostile.json'), '{}')
        expect(() => loadFixtures(dir)).toThrow(/hostile/)
      })
      inTemp((dir) => {
        const target = join(dir, 'simple-response.input.json')
        rmSync(target)
        symlinkSync(join(directory, 'simple-response.input.json'), target)
        expect(() => loadFixtures(dir)).toThrow(/invalid fixture/)
      })
      inTemp((dir) => {
        symlinkSync(directory, join(dir, 'recordings'))
        expect(() => loadFixtures(dir)).toThrow(/recordings/)
      })
      inTemp((dir) => {
        symlinkSync(
          join(directory, 'simple-response.input.json'),
          join(dir, 'README.md')
        )
        expect(() => loadFixtures(dir)).toThrow(/README/)
      })
      inTemp((dir) => {
        writeFileSync(
          join(dir, 'simple-response.input.json'),
          'x'.repeat(256_001)
        )
        expect(() => loadFixtures(dir)).toThrow(/invalid fixture/)
      })
      inTemp((dir) => {
        writeFileSync(join(dir, 'simple-response.expected.json'), '{}')
        expect(() => loadFixtures(dir)).toThrow()
      })
      for (const change of [
        { id: 'sdk-response' },
        { formatVersion: 2 },
        { model: { command: 'sh' } },
        { unexpected: true }
      ])
        inTemp((dir) => {
          const target = join(dir, 'simple-response.input.json')
          writeFileSync(
            target,
            JSON.stringify({
              ...JSON.parse(readFileSync(target, 'utf8')),
              ...change
            })
          )
          expect(() => loadFixtures(dir)).toThrow()
        })
      expect(() => fixtureSchema.parse({})).toThrow()
      expect(() =>
        validateJson(JSON.parse('{"__proto__":{"polluted":true}}'))
      ).toThrow(/hostile/)
      expect(() => validateJson({ constructor: {} })).toThrow(/hostile/)
      expect(() => validateJson({ invalid: Infinity })).toThrow()
    })
  })
