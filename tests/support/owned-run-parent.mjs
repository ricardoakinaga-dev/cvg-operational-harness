// One private parent directory per suite run (ROOT-TEST-PORTABILITY-20261018).
// Its path is fixed when the suite is collected, under os.tmpdir() (so the
// base follows TMPDIR), with a random suffix. The directory itself is created
// exclusively (mode 0700, never reusing an existing one) in beforeAll and
// removed in afterAll, which Vitest also runs when the suite fails. A file
// whose tests are all filtered out runs neither hook and creates nothing.
// Suites keep their own per-case cleanup; nothing is written outside this
// parent, and no other front's runtime directory is ever reused.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll } from 'vitest'

export function ownedRunParent(label) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(label))
    throw new Error('invalid run parent label')
  const parent = path.join(
    fs.realpathSync(os.tmpdir()),
    `cvg-test-${label}-${randomBytes(8).toString('hex')}`
  )
  // Vitest runs afterAll even when beforeAll failed: remove only what this
  // suite created, never a pre-existing path that caused the collision.
  let created = false
  beforeAll(() => {
    fs.mkdirSync(parent, { mode: 0o700 })
    created = true
  })
  afterAll(() => {
    if (created) fs.rmSync(parent, { recursive: true, force: true })
  })
  return parent
}
