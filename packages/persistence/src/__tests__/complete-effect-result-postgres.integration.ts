import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Client, Pool, QueryConfig, QueryResult, QueryResultRow } from 'pg'
import type { ToolExecutionContext, ToolRegistry } from '@cvg/harness-contracts'
import {
  verifyNativeJournalBinding,
  journalRoot,
  journalSchema,
  journalTenant,
  journalOtherTenant,
  journalValues,
  journalCredentials,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'
import { createJournalResourceFixture } from './fixtures/journal-result-resource.ts'

let binding: NativeJournalBinding
let resource: ReturnType<typeof createJournalResourceFixture> | undefined
let admin: Client | undefined
let pool: Pool | undefined
let Journal: typeof import('@cvg/persistence').PostgresOperationalEffectJournal
before(async () => {
  binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'journal')
  resource = createJournalResourceFixture(binding)
  await resource.setup()
  admin = resource.admin
  pool = resource.pool
  Journal = resource.Journal
})
after(async () => {
  await resource?.cleanup()
})
const oldReaderDenied = async () => {
  assert(resource)
  await resource.oldReaderDenied()
}

describe(
  'SPEC0225 J03 native bounds and separate SQL/driver component',
  { concurrency: false },
  () => {
    const byteShapes = [
      ['ascii', 'a'.repeat(1048574)],
      ['nul', '\0'.repeat(174762) + 'aa'],
      ['quote', '"'.repeat(524287)],
      ['bmp', '\u20ac'.repeat(349524) + 'aa'],
      ['astral', '\u{1f600}'.repeat(262143) + 'aa'],
      ['nul-key', { ['\0'.repeat(174761) + 'aaaa']: 0 }]
    ] as const
    const digest = (text: string) =>
      createHash('sha256').update(text).digest('hex')
    const nested = (arrays: number): unknown => {
      let value: unknown = 0
      for (let i = 0; i < arrays; i++) value = [value]
      return value
    }
    const row = async (operationKey: string) => {
      const { withTenantContext } = await import('@cvg/persistence')
      const { TenantIdSchema } = await import('@cvg/platform')
      return withTenantContext(
        pool!,
        TenantIdSchema.parse(journalTenant),
        async (client) =>
          (
            await client.query(
              'SELECT to_jsonb(j)::text AS row FROM operational_effect_journal j WHERE tenant_id=$1 AND operation_key=$2',
              [journalTenant, operationKey]
            )
          ).rows[0]!.row as string
      )
    }
    const exercise = async (
      id: string,
      value: unknown,
      bytes: number,
      accepted: boolean,
      scope: string
    ) => {
      verifyNativeJournalBinding()
      const json = JSON.stringify(value)
      assert.equal(
        Buffer.byteLength(json),
        bytes,
        'independent fixture byte oracle'
      )
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':j03:' + id,
        proposalHash: 'synthetic-j03',
        attemptId: 'a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      const before = await row(input.operationKey)
      let result: unknown
      if (accepted) {
        const confirmed = await journal.confirm({ ...input, result: value })
        assert.equal(confirmed.state, 'CONFIRMED')
        assert.equal(JSON.stringify(confirmed.result), json)
        const read = await journal.get(journalTenant, input.operationKey)
        assert(read && Object.hasOwn(read, 'result'))
        assert.equal(JSON.stringify(read.result), json)
        const raw = JSON.parse(await row(input.operationKey)) as Record<
          string,
          unknown
        >
        const envelope = raw.result_storage_payload as {
          decodedBytes: number
          decodedSha256: string
          data: string
        }
        assert.equal(raw.result, null)
        assert.equal(raw.result_storage_version, 1)
        assert.equal(envelope.decodedBytes, bytes)
        assert.equal(envelope.decodedSha256, digest(json))
        assert.equal(
          Buffer.from(envelope.data, 'base64').toString('utf8'),
          json
        )
        result = {
          state: read.state,
          ownResult: true,
          exactValue: true,
          decodedBytes: envelope.decodedBytes,
          decodedSha256: envelope.decodedSha256,
          dataChars: envelope.data.length
        }
      } else {
        await assert.rejects(
          journal.confirm({ ...input, result: value }),
          (error: unknown) =>
            (error as Error).message === 'JOURNAL_RESULT_TOO_LARGE'
        )
        assert.equal(
          await row(input.operationKey),
          before,
          'failed encoding mutated durable row'
        )
        const read = await journal.get(journalTenant, input.operationKey)
        assert(
          read &&
            read.state === 'EFFECT_STARTED' &&
            !Object.hasOwn(read, 'result')
        )
        await journal.markUncertain({
          ...input,
          reason: 'synthetic J03 rejected confirmation'
        })
        const uncertain = await row(input.operationKey)
        const reserved = await journal.reserve({
          ...input,
          attemptId: 'unsafe-new-attempt'
        })
        assert.equal(reserved.state, 'UNCERTAIN')
        assert.equal(reserved.attemptId, 'a')
        assert.equal(
          await row(input.operationKey),
          uncertain,
          'unsafe retry changed row'
        )
        result = {
          state: read.state,
          ownResult: false,
          beforeAfterExact: true,
          reservedState: reserved.state,
          attemptId: reserved.attemptId,
          unsafeRetryNoWrite: true
        }
      }
      writeFileSync(
        join(binding.evidenceRoot, binding.runId + '-j03-' + id + '.json'),
        JSON.stringify(
          {
            scope,
            id,
            bytes,
            sha256: digest(json),
            accepted,
            result,
            modelCalls: 0,
            toolBodies: 0
          },
          null,
          2
        ) + '\n'
      )
    }
    for (const [shape, value] of byteShapes) {
      for (const extra of [0, 1]) {
        it(`${shape}: escaped UTF8 bytes1048576+${extra}`, async () => {
          const input =
            extra === 0
              ? value
              : typeof value === 'string'
                ? value + 'x'
                : { [Object.keys(value)[0]! + 'x']: 0 }
          await exercise(
            shape + '-' + extra,
            input,
            1048576 + extra,
            extra === 0,
            'NATIVE_JOURNAL_EXACT_ESCAPED_UTF8_BOUNDARY'
          )
        })
      }
    }
    for (const depth of [64, 65]) {
      it(`root1 depth${depth}`, async () => {
        await exercise(
          'depth-' + depth,
          nested(depth - 1),
          depth * 2 - 1,
          depth === 64,
          'NATIVE_JOURNAL_DEPTH_BOUNDARY_ROOT1'
        )
      })
    }
    for (const nodes of [1000000, 1000001]) {
      it(`nodes${nodes}: above logical byte budget, no isolated node-branch claim`, async () => {
        await exercise(
          'nodes-' + nodes,
          Array<number>(nodes - 1).fill(0),
          2 * nodes - 1,
          false,
          'NATIVE_JOURNAL_REJECTION_JOINT_BYTE_COMPLEXITY; INDEPENDENT_SCAN_SEAM_REQUIRED'
        )
      })
    }
    it('actual shared projection suppresses E+1 before driver JSONB parser; separate readonly virtual source', async () => {
      verifyNativeJournalBinding()
      assert(pool)
      const queries: string[] = []
      const connection = {
        connect: async () => {
          const client = await pool!.connect()
          return {
            release: (error?: Error) => client.release(error),
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string,
              values?: unknown[]
            ) => {
              if (text.includes('AS result_storage_overflow'))
                queries.push(text)
              return client.query<T>(text, values)
            }
          }
        }
      }
      const journal = new Journal(connection, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':j03:driver-source',
        proposalHash: 'p',
        attemptId: 'a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      await journal.confirm({ ...input, result: null })
      const good = await journal.get(journalTenant, input.operationKey)
      assert(good && good.state === 'CONFIRMED' && good.result === null)
      const retryInput = {
        ...input,
        operationKey: input.operationKey + ':retry'
      }
      await journal.reserve(retryInput)
      await journal.markStarted(retryInput)
      await journal.fail({ ...retryInput, error: 'synthetic retry projection' })
      const retried = await journal.reserve({ ...retryInput, attemptId: 'b' })
      assert.equal(retried.state, 'RESERVED')
      assert.equal(retried.attemptId, 'b')
      const before = await row(input.operationKey)
      const casePattern =
        /CASE WHEN octet_length\(result_storage_payload::text\) <= 1398616\s+THEN result_storage_payload ELSE NULL END AS result_storage_payload/
      const projectionPattern =
        /CASE WHEN octet_length\(result_storage_payload::text\) <= 1398616[\s\S]*?AS result_storage_overflow/
      const projections = queries.map((text) => {
        const match = projectionPattern.exec(text)
        assert(match)
        return match[0]
      })
      assert(projections.length >= 6)
      assert(projections.every((text) => text === projections[0]))
      assert(
        queries.some(
          (text) => /^SELECT/.test(text.trim()) && text.includes('FOR UPDATE')
        )
      )
      assert(
        queries.some(
          (text) => /^UPDATE/.test(text.trim()) && text.includes('RETURNING')
        )
      )
      const nativeSelect = queries.find((text) =>
        text.includes('result_storage_read_committed')
      )
      assert(nativeSelect && casePattern.test(nativeSelect))
      // The actual native calls above are never rewritten. This separate CTE is
      // explicitly a SQL/driver component, not a malformed persisted journal row.
      const cte = `WITH operational_effect_journal AS (
      SELECT (jsonb_populate_record(NULL::${journalSchema}.operational_effect_journal,
        to_jsonb(j) || jsonb_build_object('result_storage_payload', $3::jsonb))).*
      FROM ${journalSchema}.operational_effect_journal j
      WHERE tenant_id=$1 AND operation_key=$2
    ) `
      const pg = (await import('pg')).default
      const observed: number[] = []
      const tripwire = new Error('SYNTHETIC_OVERSIZED_DRIVER_ENTRY')
      const client = new pg.Client({
        ...journalCredentials('service'),
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-driver-component',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
        types: {
          getTypeParser: (oid: number, format?: 'text' | 'binary') => {
            if (oid === 3802 && (format === undefined || format === 'text'))
              return (raw: string) => {
                const size = Buffer.byteLength(raw)
                observed.push(size)
                if (size > 1398616) throw tripwire
                return JSON.parse(raw) as unknown
              }
            return pg.types.getTypeParser(oid, format)
          }
        }
      })
      const observations: unknown[] = []
      try {
        await client.connect()
        await client.query("SELECT set_config('cvg.tenant_id',$1,false)", [
          journalTenant
        ])
        for (const rowMode of ['object', 'array'] as const) {
          for (const size of [1398615, 1398616, 1398617]) {
            const payload = JSON.stringify('x'.repeat(size - 2))
            assert.equal(Buffer.byteLength(payload), size)
            observed.length = 0
            const query: QueryConfig<unknown[]> = {
              text: cte + nativeSelect,
              values: [journalTenant, input.operationKey, payload],
              ...(rowMode === 'array' ? { rowMode: 'array' as const } : {})
            }
            const result: QueryResult = await client.query(query)
            assert.equal(result.rowCount, 1)
            const value = (name: string): unknown =>
              rowMode === 'array'
                ? result.rows[0]![
                    result.fields.findIndex((field) => field.name === name)
                  ]
                : result.rows[0]![name]
            assert.equal(value('result_storage_overflow'), size > 1398616)
            if (size <= 1398616) {
              assert.deepEqual(observed, [size])
              assert.equal(
                value('result_storage_payload'),
                'x'.repeat(size - 2)
              )
            } else {
              assert.deepEqual(observed, [])
              assert.equal(value('result_storage_payload'), null)
            }
            observations.push({
              rowMode,
              size,
              overflow: value('result_storage_overflow'),
              parserEntries: [...observed]
            })
          }
          observed.length = 0
          const bad = nativeSelect.replace(
            casePattern,
            'result_storage_payload AS result_storage_payload'
          )
          assert.notEqual(bad, nativeSelect)
          await assert.rejects(
            client.query({
              text: cte + bad,
              values: [
                journalTenant,
                input.operationKey,
                JSON.stringify('x'.repeat(1398615))
              ],
              ...(rowMode === 'array' ? { rowMode: 'array' as const } : {})
            }),
            (error: unknown) => error === tripwire
          )
          assert.deepEqual(observed, [1398617])
          observations.push({
            rowMode,
            knownBad: true,
            parserEntries: [...observed],
            caughtBeforeJsonParse: true
          })
        }
      } finally {
        await client.end()
      }
      assert.equal(await row(input.operationKey), before)
      const summary = {
        scope:
          'SQL_DRIVER_COMPONENT_WITH_READONLY_VIRTUAL_SOURCE_NOT_PERSISTED_CORRUPTION',
        allocationClaim:
          'SQL NULL suppresses installed driver JSONB parser only; no zero server/client allocation claim',
        nativeQueryKinds: queries.map((text) => text.trim().split(/\s/, 1)[0]),
        nativeProjectionExactShared: true,
        nativeRetryReturningObserved: true,
        insertBehavior:
          'Actual INSERT has no RETURNING; reserve follows with SELECT FOR UPDATE',
        projectionSha256: digest(projections[0]!),
        sourceRowUnchanged: true,
        observations,
        remaining:
          'No malformed persisted oversized row or malformed native RETURNING executed; all constraints/readiness/ACL retained',
        modelCalls: 0,
        toolBodies: 0
      }
      writeFileSync(
        join(
          binding.evidenceRoot,
          binding.runId + '-j03-driver-component.json'
        ),
        JSON.stringify(summary, null, 2) + '\n'
      )
      writeFileSync(
        join(
          binding.evidenceRoot,
          binding.runId + '-j03-native-query-trace.json'
        ),
        JSON.stringify(
          {
            scope: 'ACTUAL_NATIVE_SQL_TEXT_NO_CREDENTIALS_OR_PARAMETERS',
            queries,
            componentCte: cte
          },
          null,
          2
        ) + '\n'
      )
    })
  }
)

describe(
  'SPEC0225 J12 primary plus uncertain-settlement failure',
  { concurrency: false },
  () => {
    for (const point of ['encode-overflow', 'body-error'] as const)
      it(point + ': retain both causes and durable started state', async () => {
        verifyNativeJournalBinding()
        assert(pool)
        const { createJournaledToolRegistry } = await import('@cvg/harness')
        const { withTenantContext } = await import('@cvg/persistence')
        const { TenantIdSchema } = await import('@cvg/platform')
        const primaryBody = new Error('SYNTHETIC_PRIMARY_BODY_FAILURE')
        const secondary = new Error('SYNTHETIC_UNCERTAIN_UPDATE_FAILURE')
        const queryTrace: string[] = []
        let secondaryAttempts = 0
        const connection = {
          connect: async () => {
            const client = await pool!.connect()
            return {
              release: (error?: Error) => client.release(error),
              query: async <T extends QueryResultRow = QueryResultRow>(
                text: string,
                values?: unknown[]
              ) => {
                if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text))
                  queryTrace.push(text)
                if (
                  /^UPDATE operational_effect_journal\s/.test(text.trim()) &&
                  values?.[2] === 'UNCERTAIN'
                ) {
                  secondaryAttempts++
                  queryTrace.push('INJECT_BEFORE_UNCERTAIN_UPDATE')
                  throw secondary
                }
                return client.query<T>(text, values)
              }
            }
          }
        }
        const journal = new Journal(connection, {
          resultStorage: { version: 1 }
        })
        const confirm = journal.confirm.bind(journal)
        let primary: unknown = point === 'body-error' ? primaryBody : undefined
        journal.confirm = async (input) => {
          try {
            return await confirm(input)
          } catch (error) {
            primary = error
            throw error
          }
        }
        let bodies = 0
        const tool = {
          id: 'synthetic.j225.failure',
          version: '1',
          description: 'Synthetic fault fixture',
          inputSchema: { type: 'object' },
          outputSchema: {},
          risk: 'LOW' as const,
          sideEffect: 'NONE' as const,
          idempotent: true,
          requiresApproval: false,
          execute: async () => {
            bodies++
            if (point === 'body-error') throw primaryBody
            // Quotes add two canonical bytes: exact journal limit +1, below capture8MiB.
            return { status: 'SUCCEEDED' as const, output: 'a'.repeat(1048575) }
          }
        }
        const registry: ToolRegistry = {
          list: () => [tool],
          resolve: (id) => (id === tool.id ? tool : undefined)
        }
        const wrapped = createJournaledToolRegistry(registry, journal, {
          attemptIdFactory: () => 'failure-case'
        })
        const operationKey = binding.runId + ':j12:' + point
        const context = {
          tenantId: journalTenant,
          agentId: 'synthetic',
          correlationId: 'synthetic',
          traceId: 'synthetic',
          operationKey
        } as ToolExecutionContext
        let thrown: unknown
        try {
          await wrapped.resolve(tool.id)!.execute({}, context)
        } catch (error) {
          thrown = error
        }
        const rows = await withTenantContext(
          pool,
          TenantIdSchema.parse(journalTenant),
          async (client) =>
            (
              await client.query(
                'SELECT to_jsonb(j) AS row FROM operational_effect_journal j WHERE tenant_id=$1 AND operation_key=$2',
                [journalTenant, operationKey]
              )
            ).rows
        )
        const encodePrimary = primary as { code?: string; message?: string }
        const summary = {
          scope: 'NATIVE_J12_DOUBLE_FAILURE_ONLY',
          point,
          bodyCalls: bodies,
          secondaryAttempts,
          queryTrace,
          primary: {
            type: primary instanceof Error ? primary.name : typeof primary,
            code: encodePrimary?.code,
            message: encodePrimary?.message
          },
          secondary: { name: secondary.name, message: secondary.message },
          thrown: {
            name: thrown instanceof Error ? thrown.name : typeof thrown,
            message: thrown instanceof Error ? thrown.message : String(thrown),
            retainsPrimaryCause:
              thrown instanceof Error && thrown.cause === primary,
            retainsBothErrors:
              thrown instanceof AggregateError &&
              thrown.errors.length === 2 &&
              thrown.errors[0] === primary &&
              thrown.errors[1] === secondary
          },
          durable: rows,
          resourceId: binding.containerId,
          modelCalls: 0,
          capture8MiBBoundaryProved: false
        }
        writeFileSync(
          join(binding.evidenceRoot, binding.runId + '-j12-' + point + '.json'),
          JSON.stringify(summary, null, 2) + '\n'
        )
        assert.equal(bodies, 1)
        assert.equal(secondaryAttempts, 1)
        assert.equal(rows.length, 1)
        assert.equal(rows[0]!.row.state, 'EFFECT_STARTED')
        assert.equal(rows[0]!.row.result_storage_payload, null)
        assert.equal(queryTrace.at(-1), 'ROLLBACK')
        if (point === 'encode-overflow') {
          assert.equal(encodePrimary.code, 'validation_failed')
          assert.equal(encodePrimary.message, 'JOURNAL_RESULT_TOO_LARGE')
        } else assert.equal(primary, primaryBody)
        assert(
          summary.thrown.retainsPrimaryCause,
          'uncertain settlement failure masked the original cause'
        )
        assert(
          summary.thrown.retainsBothErrors,
          'both independent failures must remain available'
        )
        const replay = await wrapped.resolve(tool.id)!.execute({}, context)
        assert.equal(replay.status, 'REJECTED')
        assert.match(replay.error!, /unknown_effect/)
        assert.equal(bodies, 1)
        assert.equal(secondaryAttempts, 1)
        const afterReplay = await withTenantContext(
          pool,
          TenantIdSchema.parse(journalTenant),
          async (client) =>
            (
              await client.query(
                'SELECT to_jsonb(j) AS row FROM operational_effect_journal j WHERE tenant_id=$1 AND operation_key=$2',
                [journalTenant, operationKey]
              )
            ).rows
        )
        assert.deepEqual(afterReplay, rows)
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-j12-' + point + '-replay.json'
          ),
          JSON.stringify(
            {
              status: replay.status,
              error: replay.error,
              bodyCallsAfterReplay: bodies,
              secondaryAttemptsAfterReplay: secondaryAttempts,
              originalDurable: rows,
              afterReplay
            },
            null,
            2
          ) + '\n'
        )
      })
  }
)

// These finite fixtures enter through the actual service principal and intact SQL
// guards. Logical corruption is stored only where the physical envelope permits
// it; the adapter must still reject it without changing an immutable outcome.
const corruptionEnvelope = (value: string | Buffer) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
  return {
    encoding: 'base64',
    decodedBytes: bytes.length,
    decodedSha256: createHash('sha256').update(bytes).digest('hex'),
    data: bytes.toString('base64')
  }
}
const logicalCorruptions = [
  [
    'hash-mismatch',
    { ...corruptionEnvelope('0'), decodedSha256: '0'.repeat(64) }
  ],
  ['declared-length-mismatch', { ...corruptionEnvelope('0'), decodedBytes: 2 }],
  [
    'noncanonical-base64-low-bits',
    { ...corruptionEnvelope('0'), data: 'MB==' }
  ],
  ['invalid-utf8', corruptionEnvelope(Buffer.from([0xc3, 0x28]))],
  ['overlong-utf8', corruptionEnvelope(Buffer.from([0xc0, 0x80]))],
  ['surrogate-utf8', corruptionEnvelope(Buffer.from([0xed, 0xa0, 0x80]))],
  ['truncated-utf8', corruptionEnvelope(Buffer.from([0xf0, 0x9f, 0x98]))],
  [
    'bom',
    corruptionEnvelope(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('null')])
    )
  ],
  ['duplicate-json-key', corruptionEnvelope('{"a":1,"a":2}')],
  ['escaped-duplicate-json-key', corruptionEnvelope('{"a":1,"\\u0061":2}')],
  ['trailing-json', corruptionEnvelope('{"a":1}x')],
  ['leading-whitespace', corruptionEnvelope(' null')],
  ['trailing-whitespace', corruptionEnvelope('null ')],
  ['noncanonical-key-order', corruptionEnvelope('{"b":1,"a":2}')],
  ['noncanonical-escape', corruptionEnvelope('"\\u0061"')],
  ['negative-zero', corruptionEnvelope('-0')],
  ['noncanonical-number', corruptionEnvelope('1.0')],
  ['nonfinite-number', corruptionEnvelope('1e309')],
  ['lone-surrogate', corruptionEnvelope('"\\ud800"')],
  ['raw-nul', corruptionEnvelope('"\0"')],
  ['raw-newline', corruptionEnvelope('"\n"')],
  ['depth65', corruptionEnvelope('['.repeat(64) + '0' + ']'.repeat(64))],
  ['invalid-literal', corruptionEnvelope('undefined')],
  ['truncated-json', corruptionEnvelope('"a')]
] as const
const intactEnvelope = corruptionEnvelope('null')
const physicalCorruptions = [
  { id: 'unknown-version', version: 2, payload: intactEnvelope, code: '42501' },
  { id: 'extra-key', payload: { ...intactEnvelope, extra: 1 } },
  {
    id: 'missing-key',
    payload: { encoding: 'base64', decodedBytes: 4, data: 'bnVsbA==' }
  },
  { id: 'unknown-encoding', payload: { ...intactEnvelope, encoding: 'hex' } },
  {
    id: 'uppercase-hash',
    payload: {
      ...intactEnvelope,
      decodedSha256: intactEnvelope.decodedSha256.toUpperCase()
    }
  },
  { id: 'data-not-string', payload: { ...intactEnvelope, data: 1 } },
  { id: 'payload-sql-null', payload: null },
  { id: 'payload-array', payload: [] },
  { id: 'mixed-legacy-result', payload: intactEnvelope, legacy: 'null' },
  { id: 'payload-before-confirm', payload: intactEnvelope, state: 'RESERVED' },
  { id: 'confirmed-error', payload: intactEnvelope, error: 'synthetic' },
  { id: 'declared-zero', payload: { ...intactEnvelope, decodedBytes: 0 } },
  {
    id: 'declared-limit-plus-one',
    payload: { ...intactEnvelope, decodedBytes: 1048577 }
  },
  {
    id: 'declared-fraction',
    payload: { ...intactEnvelope, decodedBytes: 1.5 }
  },
  { id: 'declared-string', payload: { ...intactEnvelope, decodedBytes: '4' } },
  {
    id: 'illegal-base64-character',
    payload: { ...intactEnvelope, data: '!nVsbA==' }
  },
  {
    id: 'misplaced-base64-padding',
    payload: { ...intactEnvelope, data: 'bn=sbA==' }
  },
  {
    id: 'data-physical-limit-plus-one',
    payload: { ...intactEnvelope, data: 'A'.repeat(1398105) }
  },
  {
    id: 'envelope-over-physical-limit',
    payload: { ...intactEnvelope, extra: 'A'.repeat(1398617) }
  }
] as const

describe(
  'SPEC0225 native corruption boundaries — unbound ports only',
  { concurrency: false },
  () => {
    const controlKey = () => binding.runId + ':corruption-control'
    const controlValue = { nul: '\0', n: null }
    const checkedControl = async () => {
      const row = await new Journal(pool!, {
        resultStorage: { version: 1 }
      }).get(journalTenant, controlKey())
      assert(row)
      assert.deepEqual(row.result, controlValue)
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(
          row,
          Symbol.for('cvg.journal.validated-result.v1')
        ),
        {
          value: 1,
          writable: false,
          enumerable: false,
          configurable: false
        }
      )
    }
    const sql = async (text: string, values: unknown[]) => {
      const { withTenantContext } = await import('@cvg/persistence')
      const { TenantIdSchema } = await import('@cvg/platform')
      return withTenantContext(
        pool!,
        TenantIdSchema.parse(journalTenant),
        (client) => client.query(text, values)
      )
    }
    const snapshot = async (op: string) =>
      (
        await sql(
          'SELECT to_jsonb(j) AS row FROM operational_effect_journal j WHERE tenant_id=$1 AND operation_key=$2',
          [journalTenant, op]
        )
      ).rows
    const save = (id: string, value: unknown) => {
      const dir = join(binding.evidenceRoot, binding.runId + '-corruption')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, id + '.json'),
        JSON.stringify(value, null, 2) + '\n'
      )
    }
    before(async () => {
      const input = {
        tenantId: journalTenant,
        operationKey: controlKey(),
        proposalHash: 'p',
        attemptId: 'a'
      }
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      await journal.reserve(input)
      await journal.markStarted(input)
      await journal.confirm({ ...input, result: controlValue })
      await checkedControl()
    })
    for (const [id, payload] of logicalCorruptions)
      it(
        id + ': reject logical corruption with physical guards intact',
        async () => {
          verifyNativeJournalBinding()
          await checkedControl()
          const input = {
            tenantId: journalTenant,
            operationKey: binding.runId + ':corrupt:' + id,
            proposalHash: 'p',
            attemptId: 'a'
          }
          await sql(
            "INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id,result_storage_version,result_storage_payload) VALUES($1,$2,'p','CONFIRMED','a',1,$3::jsonb)",
            [journalTenant, input.operationKey, JSON.stringify(payload)]
          )
          const before = await snapshot(input.operationKey)
          assert.equal(before.length, 1)
          const journal = new Journal(pool!, { resultStorage: { version: 1 } })
          const errors: { method: string; code: string; message: string }[] = []
          for (const [method, call] of [
            ['get', () => journal.get(journalTenant, input.operationKey)],
            ['reserve', () => journal.reserve(input)],
            ['confirm', () => journal.confirm({ ...input, result: null })],
            ['fail', () => journal.fail({ ...input, error: 'synthetic' })],
            [
              'markUncertain',
              () => journal.markUncertain({ ...input, reason: 'synthetic' })
            ]
          ] as const)
            await assert.rejects(call, (error: unknown) => {
              const e = error as { code?: string; message?: string }
              assert.equal(e.code, 'invalid_action')
              assert.equal(e.message, 'JOURNAL_RESULT_CORRUPT')
              errors.push({ method, code: e.code!, message: e.message! })
              return true
            })
          await assert.rejects(
            sql(
              "UPDATE operational_effect_journal SET state='FAILED',result_storage_payload=NULL,error='synthetic' WHERE tenant_id=$1 AND operation_key=$2",
              [journalTenant, input.operationKey]
            ),
            (error: unknown) => {
              assert.equal((error as { code?: string }).code, '23514')
              assert.equal((error as Error).message, 'JOURNAL_RESULT_CONFLICT')
              return true
            }
          )
          const after = await snapshot(input.operationKey)
          assert.deepEqual(after, before)
          await checkedControl()
          save(id, {
            scope: 'NATIVE_LOGICAL_CORRUPTION_UNBOUND_ONLY',
            id,
            errors,
            before,
            after,
            controlBeforeAndAfter: true,
            sqlGuardStillRejectsDemotion: true,
            modelCalls: 0,
            toolBodies: 0,
            resourceId: binding.containerId
          })
        }
      )
    for (const entry of physicalCorruptions)
      it(
        entry.id + ': unchanged SQL boundary refuses physical invalidity',
        async () => {
          verifyNativeJournalBinding()
          await checkedControl()
          const test = entry as {
            id: string
            version?: number
            payload: unknown
            legacy?: string
            state?: string
            error?: string
            code?: string
          }
          const op = binding.runId + ':physical:' + test.id
          let actualCode: string | undefined
          await assert.rejects(
            sql(
              "INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id,result_storage_version,result_storage_payload,result,error) VALUES($1,$2,'p',$3,'a',$4,$5::jsonb,$6::jsonb,$7)",
              [
                journalTenant,
                op,
                test.state ?? 'CONFIRMED',
                test.version ?? 1,
                test.payload === null ? null : JSON.stringify(test.payload),
                test.legacy ?? null,
                test.error ?? null
              ]
            ),
            (error: unknown) => {
              actualCode = (error as { code?: string }).code
              assert.equal(actualCode, test.code ?? '23514')
              return true
            }
          )
          assert.deepEqual(await snapshot(op), [])
          await checkedControl()
          save(test.id, {
            scope: 'NATIVE_SQL_REJECTION_UNBOUND_ONLY',
            id: test.id,
            actualCode,
            rowAbsent: true,
            controlBeforeAndAfter: true,
            constraintsAndTriggersUnmodified: true,
            isolatedEnvelopeCapProof: false,
            modelCalls: 0,
            toolBodies: 0,
            resourceId: binding.containerId
          })
        }
      )
  }
)

describe(
  'SPEC0225 native journal profile — no public-loop or global credit',
  { concurrency: false },
  () => {
    it('preserves JSON value/type/bytes via write/get/re-reserve in three fresh OS processes', () => {
      const frames: { pid: number; phase: string; frames: unknown[] }[] = []
      for (const phase of ['write', 'read', 'reserve']) {
        const script = join(
          journalRoot,
          'packages/persistence/src/__tests__/fixtures/journal-result-process.ts'
        )
        const args = ['--experimental-strip-types', script, phase]
        const child = spawnSync(process.execPath, args, {
          cwd: journalRoot,
          env: process.env,
          encoding: 'utf8',
          timeout: 90000,
          maxBuffer: 1024 * 1024
        })
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-' + phase + '-command.json'
          ),
          JSON.stringify(
            {
              argv: [process.execPath, ...args],
              pid: child.pid,
              status: child.status,
              signal: child.signal,
              stdout: child.stdout,
              stderr: child.stderr,
              error: child.error
                ? { name: child.error.name, message: child.error.message }
                : null
            },
            null,
            2
          ) + '\n'
        )
        assert.equal(child.status, 0, 'contained native journal phase failed')
        const result = JSON.parse(child.stdout)
        assert.equal(result.phase, phase)
        assert.equal(result.pid, child.pid)
        assert.notEqual(result.pid, process.pid)
        assert.equal(result.frames.length, journalValues.length)
        frames.push(result)
      }
      assert.equal(new Set(frames.map((x) => x.pid)).size, 3)
      assert.deepEqual(frames[0]!.frames, frames[1]!.frames)
      assert.deepEqual(frames[1]!.frames, frames[2]!.frames)
    })

    it('requires identical bytes for idempotent confirmation and refuses conflicting value or attempt', async () => {
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':idempotent',
        proposalHash: 'p',
        attemptId: 'a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      await journal.confirm({ ...input, result: { nul: '\0', n: null } })
      assert.equal(
        (await journal.confirm({ ...input, result: { n: null, nul: '\0' } }))
          .state,
        'CONFIRMED'
      )
      await assert.rejects(
        journal.confirm({ ...input, result: { nul: 'different', n: null } }),
        (e: unknown) => (e as { code?: string }).code === 'conflict'
      )
      await assert.rejects(
        journal.confirm({
          ...input,
          attemptId: 'other',
          result: { nul: '\0', n: null }
        }),
        (e: unknown) => (e as { code?: string }).code === 'lease_lost'
      )
      assert.equal(
        (await journal.get(journalTenant, input.operationKey))!.state,
        'CONFIRMED'
      )
      assert.equal(
        await journal.get(journalOtherTenant, input.operationKey),
        null
      )
    })

    it('inspects legacy JSON null separately from SQL NULL but never adopts a legacy reservation', async () => {
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const known = await journal.get(journalTenant, 'legacy-null')
      const unknown = await journal.get(journalTenant, 'legacy-unknown')
      assert(known && Object.hasOwn(known, 'result') && known.result === null)
      assert(unknown && !Object.hasOwn(unknown, 'result'))
      for (const operationKey of [
        'legacy-null',
        'legacy-unknown',
        'legacy-failed'
      ]) {
        await assert.rejects(
          journal.reserve({
            tenantId: journalTenant,
            operationKey,
            proposalHash: 'legacy-p',
            attemptId: 'new'
          }),
          (e: unknown) => (e as { code?: string }).code === 'invalid_action'
        )
      }
    })

    it('refuses a default journal on the activated principal without an implicit opt-in', async () => {
      await assert.rejects(
        new Journal(pool!).get(journalTenant, 'legacy-null'),
        (e: unknown) =>
          (e as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
      )
    })

    it('keeps old credential SELECT denied42501 after activation', async () => {
      await oldReaderDenied()
    })

    it('qualifies only committed native get, preserving null without stamping confirm or reserve', async () => {
      assert(pool)
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':read-proof',
        proposalHash: 'p',
        attemptId: 'a'
      }
      const key = Symbol.for('cvg.journal.validated-result.v1')
      await journal.reserve(input)
      await journal.markStarted(input)
      const confirmed = await journal.confirm({ ...input, result: null })
      assert.equal(Object.getOwnPropertyDescriptor(confirmed, key), undefined)
      const read = await journal.get(journalTenant, input.operationKey)
      assert(read && Object.hasOwn(read, 'result') && read.result === null)
      assert.deepEqual(Object.getOwnPropertyDescriptor(read, key), {
        value: 1,
        enumerable: false,
        configurable: false,
        writable: false
      })
      assert.equal(
        Object.getOwnPropertyDescriptor(
          await journal.reserve({ ...input, attemptId: 'other' }),
          key
        ),
        undefined
      )
      assert.equal(
        Object.getOwnPropertyDescriptor(
          (await journal.get(journalTenant, 'legacy-null'))!,
          key
        ),
        undefined
      )
      writeFileSync(
        join(binding.evidenceRoot, binding.runId + '-qualified-read.json'),
        JSON.stringify({
          runtimeRoleRead: true,
          nullOwnProperty: true,
          getDescriptorExact: true,
          confirmReserveLegacyUnstamped: true,
          modelCalls: 0,
          toolBodies: 0
        }) + '\n'
      )
    })

    it('never qualifies own uncommitted journal output or commits the caller transaction', async () => {
      assert(pool)
      const { withTenantContext } = await import('@cvg/persistence')
      const { TenantIdSchema } = await import('@cvg/platform')
      const op = binding.runId + ':uncommitted-read'
      const envelope = {
        encoding: 'base64',
        decodedBytes: 4,
        decodedSha256:
          '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
        data: 'bnVsbA=='
      }
      await withTenantContext(
        pool,
        TenantIdSchema.parse(journalTenant),
        async (client) => {
          await client.query('BEGIN')
          try {
            await client.query(
              `INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id,result_storage_version) VALUES($1,$2,'p','RESERVED','a',1)`,
              [journalTenant, op]
            )
            await client.query(
              "UPDATE operational_effect_journal SET state='EFFECT_STARTED' WHERE tenant_id=$1 AND operation_key=$2",
              [journalTenant, op]
            )
            await client.query(
              "UPDATE operational_effect_journal SET state='CONFIRMED',result_storage_payload=$3::jsonb WHERE tenant_id=$1 AND operation_key=$2",
              [journalTenant, op, JSON.stringify(envelope)]
            )
            assert.equal(
              (
                await client.query(
                  'SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS assigned'
                )
              ).rows[0]!.assigned,
              true
            )
            const journal = new Journal(
              { query: client.query.bind(client) },
              { resultStorage: { version: 1 } }
            )
            const read = await journal.get(journalTenant, op)
            assert(
              read && Object.hasOwn(read, 'result') && read.result === null
            )
            assert.equal(
              Object.getOwnPropertyDescriptor(
                read,
                Symbol.for('cvg.journal.validated-result.v1')
              ),
              undefined
            )
          } finally {
            await client.query('ROLLBACK')
          }
        }
      )
      assert.equal(
        await new Journal(pool, { resultStorage: { version: 1 } }).get(
          journalTenant,
          op
        ),
        null,
        'get committed a transaction it did not own'
      )
      writeFileSync(
        join(binding.evidenceRoot, binding.runId + '-uncommitted-read.json'),
        JSON.stringify({
          assignedTransaction: true,
          visibleOwnOutputNull: true,
          recoveryUnqualified: true,
          rollbackRemovedRow: true,
          callerTransactionNotCommitted: true,
          modelCalls: 0,
          toolBodies: 0
        }) + '\n'
      )
    })

    for (const mutation of [
      'public-grant',
      'membership',
      'checksum',
      'disabled-trigger',
      'inherit',
      'createdb',
      'createrole',
      'bypassrls',
      'replication'
    ] as const) {
      it(`refuses isolated ${mutation} before admission and accepts its exact restoration`, async () => {
        assert(admin && pool)
        const journal = new Journal(pool, { resultStorage: { version: 1 } })
        const probe = binding.runId + ':readiness-probe'
        assert.equal(await journal.get(journalTenant, probe), null)
        const version = '0030_complete_tool_result_journal'
        const original =
          mutation === 'checksum'
            ? ((
                await admin.query(
                  `SELECT checksum FROM ${journalSchema}.schema_migrations WHERE version=$1`,
                  [version]
                )
              ).rows[0]!.checksum as string)
            : null
        const sql =
          mutation === 'public-grant'
            ? [
                `GRANT SELECT ON ${journalSchema}.operational_effect_journal TO PUBLIC`,
                `REVOKE SELECT ON ${journalSchema}.operational_effect_journal FROM PUBLIC`
              ]
            : mutation === 'membership'
              ? [
                  'GRANT c100_j225_old TO c100_j225_service',
                  'REVOKE c100_j225_old FROM c100_j225_service'
                ]
              : mutation === 'disabled-trigger'
                ? [
                    `ALTER TABLE ${journalSchema}.operational_effect_journal DISABLE TRIGGER journal_result_storage_guard`,
                    `ALTER TABLE ${journalSchema}.operational_effect_journal ENABLE TRIGGER journal_result_storage_guard`
                  ]
                : mutation === 'inherit' ||
                    mutation === 'createdb' ||
                    mutation === 'createrole' ||
                    mutation === 'bypassrls' ||
                    mutation === 'replication'
                  ? [
                      'ALTER ROLE c100_j225_service ' + mutation.toUpperCase(),
                      'ALTER ROLE c100_j225_service NO' + mutation.toUpperCase()
                    ]
                  : null
        let restored = false
        try {
          if (sql) await admin.query(sql[0]!)
          else {
            const changed = await admin.query(
              `UPDATE ${journalSchema}.schema_migrations SET checksum=$2 WHERE version=$1`,
              [version, '0'.repeat(64)]
            )
            assert.equal(changed.rowCount, 1)
          }
          await assert.rejects(
            journal.get(journalTenant, probe),
            (error: unknown) =>
              (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
          )
        } finally {
          if (sql) await admin.query(sql[1]!)
          else {
            const changed = await admin.query(
              `UPDATE ${journalSchema}.schema_migrations SET checksum=$2 WHERE version=$1`,
              [version, original]
            )
            assert.equal(changed.rowCount, 1)
          }
          assert.equal(await journal.get(journalTenant, probe), null)
          restored = true
        }
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-negative-' + mutation + '.json'
          ),
          JSON.stringify(
            {
              mutation,
              rejected: true,
              restored,
              beforeAndAfterPositive: true,
              modelCalls: 0,
              toolBodies: 0,
              resourceId: binding.containerId
            },
            null,
            2
          ) + '\n'
        )
      })
    }

    it('rejects an old live login session without granting it journal access', async () => {
      assert(pool)
      const pg = (await import('pg')).default
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const probe = binding.runId + ':session-probe'
      assert.equal(await journal.get(journalTenant, probe), null)
      const old = new pg.Client({
        ...journalCredentials('old'),
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-old-session-negative',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      })
      try {
        await old.connect()
        await assert.rejects(
          old.query('SELECT result FROM operational_effect_journal'),
          (error: unknown) => (error as { code?: string }).code === '42501'
        )
        const service = await pool.connect()
        try {
          const visible = await service.query(
            'SELECT pid,usename,backend_type FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid'
          )
          const owner = await admin!.query(
            'SELECT pid,usename,backend_type FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid'
          )
          writeFileSync(
            join(
              binding.evidenceRoot,
              binding.runId + '-old-session-visibility.json'
            ),
            JSON.stringify(
              { service: visible.rows, owner: owner.rows },
              null,
              2
            ) + '\n'
          )
        } finally {
          service.release()
        }
        await assert.rejects(
          journal.get(journalTenant, probe),
          (error: unknown) =>
            (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
        )
      } finally {
        await old.end()
      }
      assert.equal(await journal.get(journalTenant, probe), null)
      writeFileSync(
        join(
          binding.evidenceRoot,
          binding.runId + '-negative-old-session.json'
        ),
        JSON.stringify({
          oldSelect: '42501',
          servingReadiness: 'JOURNAL_STORAGE_MODE',
          restored: true,
          modelCalls: 0,
          toolBodies: 0
        }) + '\n'
      )
    })

    it('never treats forged GUC or application name as an activated principal', async () => {
      assert(pool)
      const pg = (await import('pg')).default
      const old = new pg.Client({
        ...journalCredentials('old'),
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-native-service',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      })
      try {
        await old.connect()
        await old.query(
          "SELECT set_config('cvg.tenant_id',$1,false),set_config('cvg.journal_result_storage_version','1',false),set_config('cvg.journal_result_storage_principal','c100_j225_service',false)",
          [journalTenant]
        )
        await assert.rejects(
          new Journal(
            { query: old.query.bind(old) },
            { resultStorage: { version: 1 } }
          ).get(journalTenant, 'legacy-null'),
          (error: unknown) =>
            (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
        )
        await assert.rejects(
          old.query('SELECT result FROM operational_effect_journal'),
          (error: unknown) => (error as { code?: string }).code === '42501'
        )
      } finally {
        await old.end()
      }
      assert.equal(
        await new Journal(pool, { resultStorage: { version: 1 } }).get(
          journalTenant,
          binding.runId + ':forged-probe'
        ),
        null
      )
    })

    it('refuses direct version0 insertion by the activated service principal', async () => {
      assert(pool)
      const { withTenantContext } = await import('@cvg/persistence')
      const { TenantIdSchema } = await import('@cvg/platform')
      await assert.rejects(
        withTenantContext(pool, TenantIdSchema.parse(journalTenant), (client) =>
          client.query(
            `INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id) VALUES($1,$2,'p','RESERVED','a')`,
            [journalTenant, binding.runId + ':forbidden0']
          )
        ),
        (error: unknown) => (error as { code?: string }).code === '42501'
      )
      assert.equal(
        await new Journal(pool, { resultStorage: { version: 1 } }).get(
          journalTenant,
          binding.runId + ':forbidden0'
        ),
        null
      )
    })

    it('refuses version1 from another login even with INSERT and correct tenant', async () => {
      assert(admin && pool)
      const pg = (await import('pg')).default
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const key = binding.runId + ':other-writer1'
      assert.equal(await journal.get(journalTenant, key), null)
      const old = new pg.Client({
        ...journalCredentials('old'),
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-other-writer-negative',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      })
      try {
        await admin.query(
          `GRANT INSERT ON ${journalSchema}.operational_effect_journal TO c100_j225_old`
        )
        await admin.query(
          `GRANT SELECT ON ${journalSchema}.operational_executions TO c100_j225_old`
        )
        await old.connect()
        await old.query("SELECT set_config('cvg.tenant_id',$1,false)", [
          journalTenant
        ])
        await assert.rejects(
          old.query(
            `INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id,result_storage_version) VALUES($1,$2,'p','RESERVED','a',1)`,
            [journalTenant, key]
          ),
          (error: unknown) =>
            (error as { code?: string; message?: string }).code === '42501' &&
            (error as Error).message === 'JOURNAL_STORAGE_MODE'
        )
      } finally {
        try {
          await old.end()
        } finally {
          try {
            await admin.query(
              `REVOKE INSERT ON ${journalSchema}.operational_effect_journal FROM c100_j225_old`
            )
          } finally {
            await admin.query(
              `REVOKE SELECT ON ${journalSchema}.operational_executions FROM c100_j225_old`
            )
          }
        }
      }
      assert.equal(await journal.get(journalTenant, key), null)
      await oldReaderDenied()
      writeFileSync(
        join(
          binding.evidenceRoot,
          binding.runId + '-negative-other-writer1.json'
        ),
        JSON.stringify({
          rejectedByGuard: '42501/JOURNAL_STORAGE_MODE',
          restored: true,
          rowAbsent: true,
          modelCalls: 0,
          toolBodies: 0
        }) + '\n'
      )
    })

    for (const fault of [
      'before-update',
      'after-update',
      'before-commit',
      'commit-ack-loss'
    ] as const) {
      it(`preserves durable state and primary error for ${fault}`, async () => {
        assert(pool)
        const { withTenantContext } = await import('@cvg/persistence')
        const { TenantIdSchema } = await import('@cvg/platform')
        const journal = new Journal(pool, { resultStorage: { version: 1 } })
        const input = {
          tenantId: journalTenant,
          operationKey: binding.runId + ':transaction:' + fault,
          proposalHash: 'transaction-p',
          attemptId: 'transaction-a'
        }
        const value = { nul: '\0'.repeat(4096), value: null }
        await journal.reserve(input)
        await journal.markStarted(input)
        const before = await journal.get(journalTenant, input.operationKey)
        const primary = new Error('SYNTHETIC_' + fault)
        let injected = false
        let committed = false
        const operations: string[] = []
        await assert.rejects(
          withTenantContext(
            pool,
            TenantIdSchema.parse(journalTenant),
            async (client) => {
              const connection = {
                query: async <T extends QueryResultRow = QueryResultRow>(
                  text: string,
                  values?: unknown[]
                ) => {
                  const update =
                    /^UPDATE operational_effect_journal\s/.test(text.trim()) &&
                    values?.[2] === 'CONFIRMED'
                  const commit = text === 'COMMIT'
                  if (
                    update ||
                    commit ||
                    text === 'BEGIN' ||
                    text === 'ROLLBACK'
                  )
                    operations.push(update ? 'UPDATE_CONFIRM' : text)
                  if (
                    !injected &&
                    ((fault === 'before-update' && update) ||
                      (fault === 'before-commit' && commit))
                  ) {
                    injected = true
                    throw primary
                  }
                  const result = await client.query<T>(text, values)
                  if (commit) committed = true
                  if (
                    !injected &&
                    ((fault === 'after-update' && update) ||
                      (fault === 'commit-ack-loss' && commit))
                  ) {
                    injected = true
                    throw primary
                  }
                  return result
                }
              }
              return new Journal(connection, {
                resultStorage: { version: 1 }
              }).confirm({ ...input, result: value })
            }
          ),
          (error: unknown) => error === primary
        )
        assert.equal(injected, true, 'named fault was not reached')
        const after = await journal.get(journalTenant, input.operationKey)
        assert(after)
        assert.equal(committed, fault === 'commit-ack-loss')
        if (committed) {
          assert.equal(after.state, 'CONFIRMED')
          assert.equal(JSON.stringify(after.result), JSON.stringify(value))
          const same = await journal.confirm({ ...input, result: value })
          assert.deepEqual(same, after)
          await assert.rejects(
            journal.confirm({ ...input, result: false }),
            (error: unknown) => (error as { code?: string }).code === 'conflict'
          )
        } else {
          assert.deepEqual(
            after,
            before,
            'rolled-back UPDATE changed durable row'
          )
          assert.equal(after.state, 'EFFECT_STARTED')
          assert(!Object.hasOwn(after, 'result'))
          await journal.markUncertain({
            ...input,
            reason: 'synthetic commit not established'
          })
          assert.equal(
            (await journal.reserve({ ...input, attemptId: 'unsafe-retry' }))
              .state,
            'UNCERTAIN'
          )
        }
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-fault-' + fault + '.json'
          ),
          JSON.stringify(
            {
              fault,
              injected,
              committed,
              operations,
              before,
              after,
              primaryPreserved: true
            },
            null,
            2
          ) + '\n'
        )
      })
    }

    it('leaves an over-cap confirmation unconfirmed and blocks unsafe repeat reservation', async () => {
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':too-large',
        proposalHash: 'p',
        attemptId: 'a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      await assert.rejects(
        journal.confirm({ ...input, result: 'x'.repeat(1048576 - 1) }),
        (e: unknown) =>
          (e as { message?: string }).message === 'JOURNAL_RESULT_TOO_LARGE'
      )
      assert.equal(
        (await journal.get(journalTenant, input.operationKey))!.state,
        'EFFECT_STARTED'
      )
      await journal.markUncertain({
        ...input,
        reason: 'synthetic confirmation refused'
      })
      const reserved = await journal.reserve({ ...input, attemptId: 'new' })
      assert.equal(reserved.state, 'UNCERTAIN')
      assert.equal(reserved.attemptId, 'a')
    })
    it('refuses the activated default worker at its native preflight before downstream admission', async () => {
      const worker = (await import(
        pathToFileURL(
          join(journalRoot, 'apps/worker/dist/postgres-role-preflight.js')
        ).href
      )) as typeof import('../../../../apps/worker/dist/postgres-role-preflight.js')
      const { TenantIdSchema } = await import('@cvg/platform')
      const critical = [
        ...new Set([
          ...worker.WORKER_CRITICAL_TABLES,
          ...worker.OPERATIONAL_HARNESS_CRITICAL_TABLES
        ])
      ]
      assert(critical.every((name) => /^[a-z][a-z0-9_]*$/.test(name)))
      // All earlier standard role/table/policy/migration checks must pass;
      // a failure on any of them cannot satisfy this mode-specific negative.
      await admin!.query(
        `GRANT SELECT,INSERT,UPDATE ON ${critical.map((name) => `"${journalSchema}"."${name}"`).join(',')} TO c100_j225_service`
      )
      const downstream = { claims: 0, models: 0, bodies: 0 }
      await assert.rejects(
        async () => {
          await worker.assertPostgresWorkerPreflight(pool!, {
            tenantId: TenantIdSchema.parse(journalTenant),
            criticalTables: critical,
            requiredMigrations: worker.OPERATIONAL_HARNESS_REQUIRED_MIGRATIONS
          })
          downstream.claims++
          downstream.models++
          downstream.bodies++
        },
        (error: unknown) =>
          (error as { message?: string }).message ===
          'Worker composition is not qualified for journal result storage'
      )
      assert.deepEqual(downstream, { claims: 0, models: 0, bodies: 0 })
      const borrowed = await pool!.connect()
      try {
        assert.equal(
          (
            await borrowed.query(
              "SELECT NULLIF(current_setting('cvg.tenant_id',true),'') AS tenant"
            )
          ).rows[0].tenant,
          null
        )
      } finally {
        borrowed.release()
      }
      writeFileSync(
        join(binding.evidenceRoot, binding.runId + '-native-preclaim.json'),
        JSON.stringify(
          {
            scope:
              'NATIVE_PREFLIGHT_METHOD_AND_ADMISSION_WRAPPER; no host CLI or fullJ07 credit',
            downstream,
            tenantContextCleared: true,
            criticalTables: critical,
            resourceId: binding.containerId
          },
          null,
          2
        ) + '\n'
      )
    })
  }
)
