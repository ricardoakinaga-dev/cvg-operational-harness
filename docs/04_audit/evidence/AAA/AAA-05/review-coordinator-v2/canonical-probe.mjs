import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '../../../../../../packages/shared/src/canonical.ts'
import { canonicalizePayload } from '../../../../../../packages/channel-gateway/src/effect-journal.ts'
import { CanonicalOutboundMessageSchema } from '../../../../../../packages/channel-gateway/src/contracts.ts'
const metadata = CanonicalOutboundMessageSchema.shape.metadata.parse({
  2: 'two',
  10: 'ten'
})
const runtime = canonicalizeJson(metadata)
const channel = canonicalizePayload(metadata)
assert.notEqual(runtime, channel)
const hash = (value) => createHash('sha256').update(value).digest('hex')
assert.notEqual(hash(runtime), hash(channel))
console.log(
  JSON.stringify(
    {
      result: 'CONFIRMED_COUNTEREXAMPLE',
      schemaAccepted: true,
      metadata,
      runtime,
      channel,
      runtimeHash: hash(runtime),
      channelHash: hash(channel),
      consequence: 'A1 equivalence claim fails for valid numeric metadata keys'
    },
    null,
    2
  )
)
