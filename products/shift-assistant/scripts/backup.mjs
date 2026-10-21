#!/usr/bin/env node
// Assistente de Plantão — consistent backup of a stopped volume (SPEC 0179
// section 10, PISO-008). From the repository root:
//   node --import tsx products/shift-assistant/scripts/backup.mjs \
//     --data <volume> --out <backups dir> --writer-stopped \
//     [--stopped-url http://127.0.0.1:3400/health/live]
// Pause the assistant ("pausar assistente"), stop the process, then run this
// with --writer-stopped (the operator's statement; journal V1 has no lock
// file yet). The copy goes to a new <out>/<backupId>/ (0700/0600) with an
// inventory of relative paths, sizes and SHA-256, a content-free projection
// and receipt.json: `backup_verified` only after every copied hash matched
// and the source stayed unchanged. Nothing is ever removed (D4). The
// configuration and its secrets are never read. Prints the receipt as JSON.
// Exit 0 VERIFIED, 1 FAILED, 2 usage or tool unavailable.

function arg(name) {
  const index = process.argv.indexOf(name)
  return index > 0 ? process.argv[index + 1] : undefined
}

const dataDir = arg('--data')
const outDir = arg('--out')
if (!dataDir || !outDir) {
  process.stderr.write(
    'usage: backup.mjs --data <volume> --out <dir> --writer-stopped [--stopped-url <url>]\n'
  )
  process.exit(2)
}

let createBackup
try {
  ;({ createBackup } = await import('../src/backup.ts'))
} catch {
  process.stderr.write(
    'cannot load the product code: run from the repository root with node --import tsx\n'
  )
  process.exit(2)
}

const stoppedUrl = arg('--stopped-url')
const { receipt, backupDir } = await createBackup({
  dataDir,
  outDir,
  writerStopped: process.argv.includes('--writer-stopped'),
  ...(stoppedUrl ? { stoppedUrl } : {})
})
process.stdout.write(`${JSON.stringify({ backupDir, receipt }, null, 2)}\n`)
process.exit(receipt.status === 'VERIFIED' ? 0 : 1)
