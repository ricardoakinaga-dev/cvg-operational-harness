// One private parent directory per suite run (ROOT-TEST-PORTABILITY-20261018).
// It is created with mkdtemp under os.tmpdir(), so the base follows TMPDIR, and
// it is removed in afterAll, which Vitest also runs when the suite fails.
// Suites keep their own per-case cleanup; nothing is written outside this
// parent, and no other front's runtime directory is ever reused.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'

export function ownedRunParent(label) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(label))
    throw new Error('invalid run parent label')
  const parent = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), `cvg-test-${label}-`)
  )
  afterAll(() => fs.rmSync(parent, { recursive: true, force: true }))
  return parent
}
