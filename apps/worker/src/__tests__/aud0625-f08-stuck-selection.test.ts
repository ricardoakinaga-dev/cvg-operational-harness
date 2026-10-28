import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import { reconcileStuckApprovalDecisions } from '../homolog-worker.ts'

// AUD0625 F08 / SPEC 0272 — the worker's selector is checked through the SQL
// it sends to a fake pool (no PostgreSQL is run). `it.fails` states the target
// and passes only because the defect exists.

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000f08'
)

async function selectorSql(): Promise<string> {
  const statements: string[] = []
  const client = {
    query: async (text: string) => {
      statements.push(text)
      if (text.includes('SHOW search_path')) {
        return { rows: [{ search_path: '"$user", public' }] }
      }
      return { rows: [] }
    },
    release: () => undefined
  }
  const pool = { connect: async () => client } as never
  const runtime = {} as never
  await reconcileStuckApprovalDecisions(pool, tenantId, runtime)
  const sql = statements.find((text) => text.includes('operational_executions'))
  if (!sql) throw new Error('selector query not issued')
  return sql
}

describe('F08: seletor do worker para decisões sem evento', () => {
  it.fails(
    'alvo: considera aprovações que já avançaram (RESERVED/EXECUTING/EXECUTED)',
    async () => {
      const sql = await selectorSql()
      for (const status of ['RESERVED', 'EXECUTING', 'EXECUTED']) {
        expect(sql).toContain(`'${status}'`)
      }
    }
  )

  it('controle: busca APPROVED/REJECTED sem evento correspondente', async () => {
    const sql = await selectorSql()
    expect(sql).toContain("a.status IN ('APPROVED', 'REJECTED')")
    expect(sql).toContain("audit.type = 'approval_decision'")
    expect(sql).toContain("audit.payload->>'approvalId' = a.approval_id")
  })
})
