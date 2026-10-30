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
import { lstatSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PostgresCaseAuthority } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { createPool } from './lib/operator-action-connect.ts'
import {
  artifactSha256,
  INSTALLED_ARTIFACT_FILES,
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
        nlink: stat.nlink,
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
  const pool = createPool(connectionText, expected)
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
  const root = fileURLToPath(new URL('..', import.meta.url))
  const result = await runOperatorAction(
    {
      fs: realFileSystem,
      euid: process.geteuid?.() ?? -1,
      now: () => new Date(),
      installedArtifactSha256: () =>
        artifactSha256(
          INSTALLED_ARTIFACT_FILES.map((label) => ({
            label,
            bytes: readFileSync(`${root}${label}`)
          }))
        ),
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
