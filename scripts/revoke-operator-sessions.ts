/**
 * SPEC 0262 §6.1 — local operation that invalidates every session family of
 * one operator by bumping ONLY `case_principals.revision`.
 *
 *   tsx scripts/revoke-operator-sessions.ts \
 *     --tenant <tenant_...> --operator-id <id> --expected-revision <n> \
 *     --proof <absolute path of the approved decision> [--apply]
 *
 * Not an HTTP route, not a model tool, not dispatchable by the serving
 * process. Dry-run is the default. A real launch needs euid 0 and the fixed
 * policy `/etc/cvg/operator-action-policy.json`; there is no flag or
 * environment variable to change that path, no `--test`, no `--force`, and
 * no `DATABASE_URL` is read from the shell.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { PostgresCaseAuthority } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import {
  OperatorActionRefusal,
  runOperatorAction,
  type DatastoreProfile,
  type DatastoreSession,
  type FileStat,
  type OperatorActionFileSystem
} from './lib/operator-action.ts'

const realFileSystem: OperatorActionFileSystem = {
  lstat(file): FileStat | null {
    try {
      const stat = lstatSync(file)
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        isSymlink: stat.isSymbolicLink(),
        uid: stat.uid,
        mode: stat.mode & 0o7777,
        size: stat.size
      }
    } catch {
      return null
    }
  },
  readFile: (file) => readFileSync(file)
}

async function connect(
  connectionText: string,
  expected: DatastoreProfile
): Promise<DatastoreSession> {
  let url: URL
  try {
    url = new URL(connectionText)
  } catch {
    throw new OperatorActionRefusal('connection file is not a PostgreSQL URL')
  }
  // The profile is compared BEFORE any connection is opened.
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== expected.host ||
    Number(url.port || 5432) !== expected.port ||
    decodeURIComponent(url.pathname.slice(1)) !== expected.database ||
    decodeURIComponent(url.username) !== expected.user
  ) {
    throw new OperatorActionRefusal(
      'connection differs from the policy profile'
    )
  }
  const pool = new Pool({
    connectionString: connectionText,
    max: 1,
    connectionTimeoutMillis: 3_000,
    query_timeout: 10_000,
    statement_timeout: 10_000
  })
  pool.on('error', () => undefined)
  const authority = new PostgresCaseAuthority(pool)
  return {
    async identity() {
      const result = await pool.query<{ database: string; user: string }>(
        'SELECT current_database() AS database, current_user AS "user"'
      )
      return result.rows[0]!
    },
    async invalidate(input) {
      const principal = await authority.invalidateOperatorSessions({
        ...input,
        tenantId: input.tenantId as TenantId
      })
      return { revision: principal.revision }
    },
    close: () => pool.end()
  }
}

async function main(): Promise<void> {
  const artifact = fileURLToPath(import.meta.url)
  const result = await runOperatorAction(
    {
      fs: realFileSystem,
      euid: process.geteuid?.() ?? -1,
      now: () => new Date(),
      installedArtifactSha256: () =>
        createHash('sha256').update(readFileSync(artifact)).digest('hex'),
      connect
    },
    process.argv.slice(2)
  )
  // Never prints a URL, a secret or the raw reference.
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode =
    result.outcome === 'APPLIED' || result.outcome === 'DRY_RUN'
      ? 0
      : result.outcome === 'UNKNOWN'
        ? 3
        : 2
}

main().catch(() => {
  process.stdout.write(
    `${JSON.stringify({ outcome: 'REFUSED', reason: 'unexpected failure before any write' })}\n`
  )
  process.exitCode = 2
})
