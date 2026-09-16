import { withTenantTransaction } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/tenant-scoped-postgres.ts'
async function main() {
  const queries: string[] = []
  let destroy = false
  let setting = ''
  const client = {
    query: async (sql: string, params?: any[]) => {
      queries.push(sql)
      if (sql.includes('set_config') && params?.[1]) setting = params[1]
      return { rows: [{ tenant_id: setting }] }
    },
    release: (e?: Error) => {
      destroy = !!e
    }
  }
  try {
    await withTenantTransaction(
      { connect: async () => client } as never,
      'tenant_00000000-0000-4000-8000-000000000821' as never,
      async () => {
        throw new Error('synthetic callback failure')
      }
    )
  } catch {}
  console.log(
    JSON.stringify({
      case: 'rollback-cleanup-unverified-noop',
      destroy,
      dirtyTenant: setting,
      verificationQueries: queries.filter((q) => q.includes('current_setting'))
        .length,
      queries
    })
  )
}
main()
