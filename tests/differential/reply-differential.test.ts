import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDifferentialEvidence } from './evidence-lifecycle.mjs'
import { runCvgReply, type ReplyCase } from './cvg-reply.ts'
import { compareReplyProjections } from './compare-reply.mjs'

const cases: ReplyCase[] = [
  {
    version: 1,
    id: 'ascii',
    message: 'Responda de forma neutra',
    fragments: ['resposta neutra']
  },
  {
    version: 1,
    id: 'unicode',
    message: 'Mensagem sintética com Unicode',
    fragments: ['Olá 🐾 — ação sintética.']
  },
  {
    version: 1,
    id: 'fragmented',
    message: 'Resposta em fragmentos',
    fragments: ['a', 'ç', 'ão ', '🐾']
  }
]
const script = path.resolve('tests/differential/reference-agent-driver.mjs')
const evidenceLifecycle = createDifferentialEvidence('reply')
const evidence = evidenceLifecycle.directory
const sha = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex')

beforeEach(({ onTestFailed }) => {
  onTestFailed(evidenceLifecycle.failed)
})
afterAll(evidenceLifecycle.finish)

describe('SPEC0213 bounded installed-loop reply differential', () => {
  for (const fixture of cases)
    it(`executes both real motors: ${fixture.id}`, async () => {
      const home = fs.mkdtempSync(
        path.join(os.tmpdir(), 'cvg-pare100-differential-')
      )
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
          NODE_ENV: 'test'
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
              envKeys: Object.keys(env),
              environment: env,
              pid: child.pid,
              elapsedMs: Date.now() - started,
              timeoutMs: 5000,
              maxBuffer: 1048576,
              childExitObserved: child.status !== null || child.signal !== null,
              exit: child.status,
              signal: child.signal,
              error: child.error?.message ?? null,
              stdoutSha256: sha(child.stdout ?? ''),
              stderrSha256: sha(child.stderr ?? '')
            },
            null,
            2
          ) + '\n'
        )
        expect(child.error, child.stderr).toBeUndefined()
        expect(child.status, child.stderr).toBe(0)
        const reference = JSON.parse(child.stdout)
        expect(reference.fixtureId).toBe(fixture.id)
        expect(reference.networkAttempts).toEqual([])
        expect(
          reference.native.events.some(
            (event: { type: string }) => event.type === 'assistant/message'
          )
        ).toBe(true)
        const cvg = await runCvgReply(fixture)
        expect(cvg.native.events.length).toBeGreaterThan(0)
        const result = compareReplyProjections(
          reference.projection,
          cvg.projection
        )
        fs.writeFileSync(
          path.join(evidence, `${fixture.id}.result.json`),
          JSON.stringify({ reference, cvg, result }, null, 2) + '\n'
        )
        expect(result.fullParity).toBe('NOT_VERIFIED')
        for (const field of [
          'text',
          'modelCalls',
          'toolCalls',
          'inputTokens',
          'outputTokens',
          'effects'
        ]) {
          const bad = structuredClone(cvg.projection)
          if (field === 'text') bad.text += '!'
          else if (field === 'effects')
            bad.effects = [{ kind: 'unexpected_effect' }] as never[]
          else bad[field as 'modelCalls'] += 1
          expect(() =>
            compareReplyProjections(reference.projection, bad)
          ).toThrow(/reply difference/)
        }
      } finally {
        fs.rmSync(home, { recursive: true, force: true })
      }
    }, 10000)

  it('rejects missing and malformed projections', () => {
    for (const value of [null, {}, [], { text: 'reply' }])
      expect(() => compareReplyProjections(value, value)).toThrow(
        /invalid reply projection/
      )
  })
})
