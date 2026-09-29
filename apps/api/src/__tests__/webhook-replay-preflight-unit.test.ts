import type { QueryResult, QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import type { PostgresQueryable } from '@cvg/persistence'
import { assertWebhookReplaySchema } from '../tenant-preflight.ts'

interface Column {
  attname: string
  attnum: number
  atttypid: string
  attnotnull: boolean
  attisdropped: boolean
  default_expr: string | null
}
interface Constraint {
  oid: string
  conname: string
  contype: string
  convalidated: boolean
  condeferrable: boolean
  condeferred: boolean
  conkey: number[] | null
  conindid: string
  definition: string
}
interface Index {
  oid: string
  relname: string
  relkind: string
  relpersistence: string
  amname: string
  indkey: string
  indnatts: number
  indnkeyatts: number
  indisprimary: boolean
  indisunique: boolean
  indimmediate: boolean
  indisvalid: boolean
  indisready: boolean
  indislive: boolean
  indexprs: string | null
  indpred: string | null
}

function catalogFixture() {
  const columns: Column[] = [
    {
      attname: 'event_key',
      attnum: 1,
      atttypid: '25',
      attnotnull: true,
      attisdropped: false,
      default_expr: null
    },
    {
      attname: 'status',
      attnum: 2,
      atttypid: '25',
      attnotnull: true,
      attisdropped: false,
      default_expr: null
    },
    {
      attname: 'expires_at',
      attnum: 3,
      atttypid: '1184',
      attnotnull: true,
      attisdropped: false,
      default_expr: null
    },
    {
      attname: 'created_at',
      attnum: 4,
      atttypid: '1184',
      attnotnull: true,
      attisdropped: false,
      default_expr: 'now()'
    },
    {
      attname: 'lease_generation',
      attnum: 5,
      atttypid: '20',
      attnotnull: true,
      attisdropped: false,
      default_expr: '0'
    },
    {
      attname: 'lease_token',
      attnum: 6,
      atttypid: '25',
      attnotnull: false,
      attisdropped: false,
      default_expr: null
    }
  ]
  const checks: Array<[string, string]> = [
    [
      'webhook_replay_events_event_key_check',
      "CHECK (btrim(event_key) <> ''::text)"
    ],
    [
      'webhook_replay_events_status_check',
      "CHECK (status = ANY (ARRAY['reserved'::text, 'committed'::text]))"
    ],
    [
      'webhook_replay_events_lease_generation_check',
      'CHECK (lease_generation >= 0)'
    ],
    [
      'webhook_replay_events_fencing_check',
      "CHECK (status = 'reserved'::text AND lease_generation > 0 AND lease_token IS NOT NULL AND btrim(lease_token) <> ''::text OR status = 'committed'::text AND lease_token IS NULL)"
    ]
  ]
  const constraints: Constraint[] = [
    {
      oid: '310',
      conname: 'webhook_replay_events_pkey',
      contype: 'p',
      convalidated: true,
      condeferrable: false,
      condeferred: false,
      conkey: [1],
      conindid: '300',
      definition: 'PRIMARY KEY (event_key)'
    },
    ...checks.map(([conname, definition], i) => ({
      oid: String(311 + i),
      conname,
      contype: 'c',
      convalidated: true,
      condeferrable: false,
      condeferred: false,
      conkey: null,
      conindid: '0',
      definition
    }))
  ]
  const indexBase = {
    relkind: 'i',
    relpersistence: 'p',
    amname: 'btree',
    indnatts: 1,
    indnkeyatts: 1,
    indimmediate: true,
    indisvalid: true,
    indisready: true,
    indislive: true,
    indexprs: null,
    indpred: null
  }
  const indexes: Index[] = [
    {
      ...indexBase,
      oid: '300',
      relname: 'webhook_replay_events_pkey',
      indkey: '1',
      indisprimary: true,
      indisunique: true
    },
    {
      ...indexBase,
      oid: '301',
      relname: 'idx_webhook_replay_events_expires',
      indkey: '3',
      indisprimary: false,
      indisunique: false
    }
  ]
  return {
    schema: [{ schema_oid: '100', version: 160015 }],
    relation: [
      {
        oid: '200',
        relkind: 'r',
        relpersistence: 'p',
        relispartition: false,
        relrowsecurity: false,
        relforcerowsecurity: false,
        inherited: false,
        policies: 0
      }
    ],
    columns,
    constraints,
    dependencies: [{ count: 0 }],
    indexes,
    blockers: [{ triggers: 0, rules: 0, foreign_keys: 0 }]
  }
}
type Fixture = ReturnType<typeof catalogFixture>

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', fields: [], oid: 0, rowCount: rows.length, rows }
}
function clientFor(fixture: Fixture): PostgresQueryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string
    ): Promise<QueryResult<T>> {
      let rows: QueryResultRow[] = []
      if (sql.includes('server_version_num')) rows = fixture.schema
      else if (sql.includes('FROM pg_class AS c WHERE')) rows = fixture.relation
      else if (sql.includes('FROM pg_attribute AS a')) rows = fixture.columns
      else if (sql.includes('FROM pg_constraint AS x'))
        rows = fixture.constraints
      else if (sql.includes('FROM pg_depend AS dep'))
        rows = fixture.dependencies
      else if (sql.includes('FROM pg_index AS i')) rows = fixture.indexes
      else if (sql.includes('FROM pg_trigger WHERE')) rows = fixture.blockers
      return result(rows) as QueryResult<T>
    }
  }
}

describe('webhook replay preflight catalog completeness', () => {
  it('accepts a complete PG16 catalog response', async () => {
    await expect(
      assertWebhookReplaySchema(clientFor(catalogFixture()))
    ).resolves.toBeUndefined()
  })
  const corruptions: Array<[string, (fixture: Fixture) => void]> = [
    [
      'missing schema OID',
      (f) => {
        f.schema = []
      }
    ],
    [
      'wrong server major',
      (f) => {
        f.schema[0]!.version = 170000
      }
    ],
    [
      'missing table OID',
      (f) => {
        f.relation = []
      }
    ],
    [
      'unlogged table',
      (f) => {
        f.relation[0]!.relpersistence = 'u'
      }
    ],
    [
      'inherited table',
      (f) => {
        f.relation[0]!.inherited = true
      }
    ],
    [
      'installed policy',
      (f) => {
        f.relation[0]!.policies = 1
      }
    ],
    [
      'missing column',
      (f) => {
        f.columns.pop()
      }
    ],
    [
      'unexpected column',
      (f) => {
        f.columns.push({
          attname: 'unexpected',
          attnum: 7,
          atttypid: '25',
          attnotnull: true,
          attisdropped: false,
          default_expr: null
        })
      }
    ],
    [
      'wrong built-in type OID',
      (f) => {
        f.columns[4]!.atttypid = '23'
      }
    ],
    [
      'nullable column',
      (f) => {
        f.columns[3]!.attnotnull = false
      }
    ],
    [
      'missing default',
      (f) => {
        f.columns[4]!.default_expr = null
      }
    ],
    [
      'dropped attribute',
      (f) => {
        f.columns[0]!.attisdropped = true
      }
    ],
    [
      'PK wrong contype',
      (f) => {
        f.constraints[0]!.contype = 'u'
      }
    ],
    [
      'PK wrong conkey',
      (f) => {
        f.constraints[0]!.conkey = [2]
      }
    ],
    [
      'PK deferrable',
      (f) => {
        f.constraints[0]!.condeferrable = true
      }
    ],
    [
      'CHECK not validated',
      (f) => {
        f.constraints[4]!.convalidated = false
      }
    ],
    [
      'CHECK wrong definition',
      (f) => {
        f.constraints[4]!.definition = 'CHECK (true)'
      }
    ],
    [
      'missing support index',
      (f) => {
        f.indexes.pop()
      }
    ],
    [
      'invalid support index',
      (f) => {
        f.indexes[1]!.indisvalid = false
      }
    ],
    [
      'wrong index key',
      (f) => {
        f.indexes[1]!.indkey = '4'
      }
    ],
    [
      'nonbuilt-in CHECK dependency',
      (f) => {
        f.dependencies[0]!.count = 1
      }
    ],
    [
      'user trigger',
      (f) => {
        f.blockers[0]!.triggers = 1
      }
    ],
    [
      'rewrite rule',
      (f) => {
        f.blockers[0]!.rules = 1
      }
    ],
    [
      'inbound foreign key',
      (f) => {
        f.blockers[0]!.foreign_keys = 1
      }
    ],
    [
      'incomplete blockers response',
      (f) => {
        f.blockers = []
      }
    ]
  ]
  it.each(corruptions)('rejects %s', async (_name, corrupt) => {
    const fixture = catalogFixture()
    corrupt(fixture)
    await expect(assertWebhookReplaySchema(clientFor(fixture))).rejects.toThrow(
      'webhook replay storage is not fully installed'
    )
  })

  const missingBooleanFields: Array<[string, (fixture: Fixture) => object]> = [
    ['relispartition', (f) => f.relation[0]!],
    ['inherited', (f) => f.relation[0]!],
    ['relrowsecurity', (f) => f.relation[0]!],
    ['relforcerowsecurity', (f) => f.relation[0]!],
    ['attnotnull', (f) => f.columns[0]!],
    ['attisdropped', (f) => f.columns[0]!],
    ['convalidated', (f) => f.constraints[0]!],
    ['condeferrable', (f) => f.constraints[0]!],
    ['condeferred', (f) => f.constraints[0]!],
    ['convalidated', (f) => f.constraints[4]!],
    ['condeferrable', (f) => f.constraints[4]!],
    ['indisprimary', (f) => f.indexes[0]!],
    ['indisunique', (f) => f.indexes[0]!],
    ['indimmediate', (f) => f.indexes[0]!],
    ['indisvalid', (f) => f.indexes[0]!],
    ['indisready', (f) => f.indexes[0]!],
    ['indislive', (f) => f.indexes[0]!],
    ['indisprimary', (f) => f.indexes[1]!],
    ['indisunique', (f) => f.indexes[1]!],
    ['indisvalid', (f) => f.indexes[1]!],
    ['indisready', (f) => f.indexes[1]!],
    ['indislive', (f) => f.indexes[1]!]
  ]
  it.each(missingBooleanFields)(
    'rejects a missing required %s catalog flag',
    async (field, select) => {
      const fixture = catalogFixture()
      Reflect.deleteProperty(select(fixture), field)
      await expect(
        assertWebhookReplaySchema(clientFor(fixture))
      ).rejects.toThrow('webhook replay storage is not fully installed')
    }
  )
})
