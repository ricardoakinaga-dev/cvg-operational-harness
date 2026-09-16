import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileChannelEffectJournal } from '../../../../../../packages/channel-gateway/src/effect-journal-file.ts'
import {
  channelEffectKey,
  LEGACY_HASH_VERSION
} from '../../../../../../packages/channel-gateway/src/effect-journal.ts'
const directory = await mkdtemp(join(tmpdir(), 'aaa12-invalid-version-'))
try {
  const identity = {
    tenantId: 'tenant_synthetic',
    channel: 'whatsapp',
    operationKind: 'outbound_message',
    idempotencyKey: 'synthetic-version-key'
  }
  const path = join(
    directory,
    `${createHash('sha256').update(channelEffectKey(identity)).digest('hex')}.json`
  )
  const journal = new FileChannelEffectJournal({ directory })
  const results = []
  for (const hashVersion of [null, 7, '', false, {}, 'unknown-algorithm-v9']) {
    const record = {
      identity,
      payloadHash: 'synthetic-hash',
      hashVersion,
      state: 'PENDING',
      attempt: 1,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      result: null,
      errorCode: null,
      updatedAtMs: 1,
      revision: 1
    }
    const before = JSON.stringify(record)
    await writeFile(path, before)
    const observed = await journal.reserve({
      identity,
      payloadHash: record.payloadHash,
      hashVersion: LEGACY_HASH_VERSION,
      leaseOwner: 'synthetic-owner',
      leaseMs: 10000
    })
    const changed = before !== (await readFile(path, 'utf8'))
    let claimed = false
    if (observed.outcome === 'reserved')
      claimed =
        (await journal.claimSend(identity, 'synthetic-owner')).state ===
        'SENDING'
    results.push({
      storedVersion: hashVersion,
      outcome: observed.outcome,
      bytesChanged: changed,
      claimSendAllowed: claimed
    })
  }
  assert(
    results
      .slice(0, 5)
      .every(
        (x) => x.outcome === 'reserved' && x.bytesChanged && x.claimSendAllowed
      )
  )
  assert.equal(results[5].outcome, 'version_mismatch')
  console.log(
    JSON.stringify(
      {
        result: 'CONFIRMED_COUNTEREXAMPLE',
        externalEffects: 0,
        boundary:
          'public file journal; explicit malformed version becomes legacy',
        results
      },
      null,
      2
    )
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
