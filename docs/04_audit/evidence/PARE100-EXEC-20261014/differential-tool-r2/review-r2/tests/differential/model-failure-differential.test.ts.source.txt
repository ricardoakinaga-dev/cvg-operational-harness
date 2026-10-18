import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDifferentialEvidence } from './evidence-lifecycle.mjs'
import { runCvgModelFailure } from './cvg-model-failure.ts'
import { validateFailureCase, type FailureCase } from './failure-case.mjs'
import { measureModelFailureContracts } from './compare-model-failure.mjs'

const cases: FailureCase[] = [
  {
    version: 1,
    id: 'error-ascii',
    message: 'Synthetic failure request',
    failure: { message: 'synthetic model failure' }
  },
  {
    version: 1,
    id: 'error-unicode',
    message: 'Solicitação sintética 🐾',
    failure: { message: 'Falha sintética: ação 🐾' }
  },
  {
    version: 1,
    id: 'error-cause',
    message: 'Synthetic chained failure request',
    failure: {
      message: 'synthetic outer failure',
      cause: 'synthetic inner cause'
    }
  }
]
const evidenceLifecycle = createDifferentialEvidence('failure')
const evidence = evidenceLifecycle.directory
const script = path.resolve('tests/differential/reference-failure-driver.mjs')
const sha = (text: string) =>
  crypto.createHash('sha256').update(text).digest('hex')

beforeEach(({ onTestFailed }) => {
  onTestFailed(evidenceLifecycle.failed)
})
afterAll(evidenceLifecycle.finish)

describe('SPEC0213 native model failure measurement', () => {
  for (const fixture of cases)
    it(`observes both real motors: ${fixture.id}`, async () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-model-failure-'))
      fs.mkdirSync(evidence, { recursive: true })
      try {
        const input = path.join(home, 'fixture.json')
        fs.writeFileSync(input, JSON.stringify(fixture))
        const env = {
          PATH: [path.dirname(process.execPath), '/usr/bin', '/bin'].join(
            path.delimiter
          ),
          HOME: home,
          TMPDIR: home,
          TMP: home,
          TEMP: home,
          XDG_CONFIG_HOME: path.join(home, 'config'),
          XDG_DATA_HOME: path.join(home, 'data'),
          XDG_CACHE_HOME: path.join(home, 'cache'),
          XDG_STATE_HOME: path.join(home, 'state'),
          DSH_HOME: path.join(home, 'dsh'),
          NODE_ENV: 'test',
          LANG: 'C.UTF-8'
        }
        const started = Date.now()
        const child = spawnSync(process.execPath, [script, input], {
          cwd: home,
          env,
          encoding: 'utf8',
          timeout: 5000,
          killSignal: 'SIGKILL',
          maxBuffer: 1024 * 1024
        })
        fs.writeFileSync(
          path.join(evidence, `${fixture.id}.reference.stdout.log`),
          child.stdout ?? ''
        )
        fs.writeFileSync(
          path.join(evidence, `${fixture.id}.reference.stderr.log`),
          child.stderr ?? ''
        )
        fs.writeFileSync(
          path.join(evidence, `${fixture.id}.command.json`),
          JSON.stringify(
            {
              argv: [process.execPath, script, input],
              cwd: home,
              environment: env,
              pid: child.pid,
              exit: child.status,
              signal: child.signal,
              error: child.error?.message ?? null,
              elapsedMs: Date.now() - started,
              timeoutMs: 5000,
              maxBuffer: 1048576,
              stdoutSHA256: sha(child.stdout ?? ''),
              stderrSHA256: sha(child.stderr ?? ''),
              childExitObserved: child.status !== null || child.signal !== null
            },
            null,
            2
          ) + '\n'
        )
        expect(child.error, child.stderr).toBeUndefined()
        expect(child.signal, child.stderr).toBeNull()
        expect(child.status, child.stderr).toBe(0)
        const reference = JSON.parse(child.stdout)
        const cvg = await runCvgModelFailure(fixture)
        fs.writeFileSync(
          path.join(evidence, `${fixture.id}.native.json`),
          JSON.stringify({ fixture, reference, cvg }, null, 2) + '\n'
        )
        expect(reference.fixtureId).toBe(fixture.id)
        expect(reference.networkAttempts).toEqual([])
        expect(reference.native.modelCalls).toBe(1)
        expect(reference.native.toolCalls).toBe(0)
        expect(cvg.native.turn.stopReason).toBe('MODEL_FAILURE')
        expect(cvg.native.modelBodies).toBe(1)
        expect(cvg.native.turn.toolCalls).toBe(0)
        expect(cvg.observationStatus).toBe(
          'NATIVE_FAILURE_MEASUREMENT_NOT_PARITY'
        )
        const measurement = measureModelFailureContracts(
          reference,
          cvg,
          fixture
        )
        fs.writeFileSync(
          path.join(evidence, `${fixture.id}.measurement.json`),
          JSON.stringify(measurement, null, 2) + '\n'
        )
        expect(measurement.status).toBe('MEASURED_NATIVE_FAILURE_CONTRACTS')
        expect(measurement.fullParity).toBe('NOT_VERIFIED')
        expect(measurement.differences).toContain('terminal')
        expect(measurement.injectedError.cause?.message ?? null).toBe(
          fixture.failure.cause ?? null
        )
        const mutations = [
          (r: typeof reference) => {
            r.fixtureId = 'wrong-id'
          },
          (r: typeof reference) => {
            r.native.modelCalls = 2
          },
          (r: typeof reference) => {
            r.native.events.pop()
          },
          (r: typeof reference) => {
            r.native.events.at(-1).data.reason.kind = 'completed'
          },
          (r: typeof reference) => {
            r.native.events[8].data.stream[0].chunk.reason.failure.message +=
              'tampered'
          },
          (r: typeof reference) => {
            r.native.adapterErrors[0].message += 'tampered'
          },
          (r: typeof reference) => {
            r.native.liveErrors = []
          },
          (r: typeof reference) => {
            r.native.liveErrors[0].error.name = 'tampered'
          },
          (r: typeof reference) => {
            r.native.liveErrors[0].error.cause = {
              name: 'Error',
              message: 'tampered',
              cause: null
            }
          },
          (r: typeof reference) => {
            r.networkAttempts.push('fetch')
          },
          (r: typeof reference) => {
            r.effects = [{ unexpected: true }]
          },
          (r: typeof reference) => {
            delete r.native.events[6].data
          },
          (r: typeof reference) => {
            delete r.native.events[7].data
          },
          (r: typeof reference) => {
            r.native.messages[1].content[0].text += 'tampered'
          },
          (r: typeof reference) => {
            r.native.messages.push({ role: 'tool', content: 'unexpected' })
          },
          (r: typeof reference) => {
            r.reference.artifacts[0].sha256 = '0'.repeat(64)
          },
          (r: typeof reference) => {
            r.reference.artifacts[0].file =
              r.reference.root + '/DOES-NOT-EXIST.js'
          },
          (r: typeof reference) => {
            r.reference.artifacts[0].file = r.reference.root
          },
          (r: typeof reference) => {
            Object.assign(r.reference.artifacts[0], {
              file: r.reference.artifacts[1].file,
              sha256: r.reference.artifacts[1].sha256
            })
          }
        ]
        for (const mutate of mutations) {
          const altered = structuredClone(reference)
          mutate(altered)
          expect(() =>
            measureModelFailureContracts(altered, cvg, fixture)
          ).toThrow(/invalid native failure observation/)
        }
        const cvgMutations = [
          (c: typeof cvg) => {
            c.native.turn = { ...c.native.turn, stopReason: 'COMPLETED' }
          },
          (c: typeof cvg) => {
            c.native.turn = {
              ...c.native.turn,
              response: c.native.turn.response + 'tampered'
            }
          },
          (c: typeof cvg) => {
            c.native.turn = { ...c.native.turn, toolCalls: 1 }
          },
          (c: typeof cvg) => {
            c.native.events = c.native.events.filter((_, index) => index !== 2)
          },
          (c: typeof cvg) => {
            Object.assign(c.native.events[2]!, { correlationId: 'different' })
          },
          (c: typeof cvg) => {
            c.native.adapterErrors[0]!.cause = {
              name: 'Error',
              message: 'wrong cause',
              cause: null
            }
          },
          (c: typeof cvg) => {
            c.native.events = [...c.native.events, c.native.events[0]!]
          },
          (c: typeof cvg) => {
            Object.assign(c.native, { effects: [{ unexpected: true }] })
          },
          (c: typeof cvg) => {
            Reflect.deleteProperty(
              c.native.events[2]!.payload as object,
              'request'
            )
          },
          (c: typeof cvg) => {
            Object.assign(c.native.turn, { effects: [{ unexpected: true }] })
          }
        ]
        for (const mutate of cvgMutations) {
          const altered = structuredClone(cvg)
          mutate(altered)
          expect(() =>
            measureModelFailureContracts(reference, altered, fixture)
          ).toThrow(/invalid native failure observation/)
        }
      } finally {
        fs.rmSync(home, { recursive: true, force: true })
      }
    }, 10_000)

  it.each([
    null,
    {},
    [],
    { version: 1, id: '../escape', message: 'x', failure: { message: 'x' } },
    {
      version: 1,
      id: 'x',
      message: 'x',
      failure: { message: 'x', extra: true }
    },
    { version: 1, id: 'x', message: 'x', failure: { message: 'x', cause: '' } }
  ])('rejects invalid failure fixture %j', (value) => {
    expect(() => validateFailureCase(value)).toThrow(/invalid failure fixture/)
  })

  it('rejects accessor input without executing it', () => {
    let reads = 0
    const value = { ...cases[0] }
    Object.defineProperty(value, 'message', {
      enumerable: true,
      get() {
        reads += 1
        return 'unexpected getter'
      }
    })
    expect(() => validateFailureCase(value)).toThrow(/invalid failure fixture/)
    expect(reads).toBe(0)
  })

  it('enforces the encoded 64KiB bound as well as string bounds', () => {
    const controls = '\u0000'.repeat(4096)
    expect(() =>
      validateFailureCase({
        version: 1,
        id: 'oversize',
        message: controls,
        failure: { message: controls, cause: controls }
      })
    ).toThrow(/invalid failure fixture/)
    expect(() =>
      validateFailureCase({ ...cases[0], message: 'x'.repeat(4097) })
    ).toThrow(/invalid failure fixture/)
  })
})
