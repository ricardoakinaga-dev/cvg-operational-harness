import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const target =
  '55787d37f7d42d1e0348c2d0df9db269838c7175a31f5bdec70473bb17f0dda9'
const start = Date.parse('2026-09-12T20:57:40.000Z')
const end = Date.parse('2026-09-12T20:58:20.000Z')
const body = (iso) => `{
  "schemaVersion": 2,
  "generatedAt": "${iso}",
  "total": 372,
  "internalCount": 21,
  "deniedCount": 0,
  "unknownCount": 0,
  "unclassifiedCount": 0,
  "invalidExceptions": [],
  "denied": [],
  "unknown": [],
  "unclassified": []
}
`
for (let t = start; t <= end; t++) {
  const iso = new Date(t).toISOString()
  const content = body(iso)
  const hash = createHash('sha256').update(content).digest('hex')
  if (hash === target) {
    writeFileSync(
      '/home/ricardo/cvg-agent-secretary-v2/certification/license-report.json',
      content
    )
    console.log('RESTORED', iso, hash)
    process.exit(0)
  }
}
console.log('NOT FOUND')
process.exit(1)
