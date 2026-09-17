import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPostgresMigrationSql } from '../postgres.ts'

describe('Phase 4A conversation migration contract', () => {
  it('ships separate bounded tenant-scoped tables with RLS and no public grants', async () => {
    const sql = await readPostgresMigrationSql('0020_conversation_intelligence')
    for (const table of [
      'cvg_conversation_sessions',
      'cvg_conversation_messages',
      'cvg_conversation_turns',
      'cvg_conversation_execution_claims',
      'cvg_conversation_deliveries'
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
      expect(sql).toContain(`'${table}'`)
    }
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain("current_setting(''cvg.tenant_id'', true)")
    expect(sql).toContain('REVOKE ALL ON TABLE')
    expect(sql).toContain('UNIQUE (tenant_id, idempotency_key)')
    expect(sql).toContain('turn_id text NOT NULL')
    expect(sql).toContain(
      'REFERENCES cvg_conversation_turns (tenant_id, conversation_id, turn_id)'
    )
    expect(sql).toContain('octet_length(working_memory::text) <= 32000')
    expect(sql).toContain("'SENDING'")
    expect(sql).toContain('lease_until timestamptz')
    expect(sql).toContain('lease_token text')
  })

  it('does not replace the product conversation schema', async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        'packages/persistence/migrations/0020_conversation_intelligence.sql'
      ),
      'utf8'
    )
    expect(migration).not.toContain('ALTER TABLE conversations')
    expect(migration).not.toContain('DROP TABLE')
    expect(migration).toContain('existing Runtime/Effect Journal authorities')
  })
})
