// P1 probe AAA-12/C2-F01: channel payload hash must use the shared canonical
// form (integer-like key order, input permutation invariance, digest equality).
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'
import { hashOutboundPayload } from '/home/ricardo/cvg-agent-secretary-v2/packages/channel-gateway/src/effect-journal.ts'

const base = {
  conversationId: 'conv_1',
  channel: 'whatsapp' as const,
  recipient: { id: '5511999999999', type: 'phone' as const },
  body: { text: 'oi', attachments: [] },
  correlationId: 'corr_00000000-0000-4000-8000-0000000000c2'
}
const failures: string[] = []
const h1 = hashOutboundPayload({
  ...base,
  metadata: { '2': 'two', '10': 'ten' }
})
const h2 = hashOutboundPayload({
  ...base,
  metadata: { '10': 'ten', '2': 'two' }
})
if (h1 !== h2) failures.push(`permutation changed hash: ${h1} vs ${h2}`)
const manual = createHash('sha256')
  .update(
    canonicalizeJson({
      conversationId: base.conversationId,
      channel: base.channel,
      recipient: base.recipient,
      body: base.body,
      correlationId: base.correlationId,
      metadata: { '2': 'two', '10': 'ten' }
    })
  )
  .digest('hex')
if (h1 !== manual)
  failures.push(`shared canonical digest mismatch: ${h1} vs ${manual}`)
const h3 = hashOutboundPayload({
  ...base,
  metadata: { '2': 'two', '10': 'ten', extra: 'x' }
})
if (h1 === h3) failures.push('changed projection did not change hash')
console.log(
  JSON.stringify({
    probe: 'AAA12-hash-binding',
    h1,
    h2,
    manual,
    changed: h3,
    failures,
    falsified: failures.length > 0
  })
)
if (failures.length > 0) process.exitCode = 1
