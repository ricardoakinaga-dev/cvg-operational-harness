import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export function createDifferentialEvidence(kind) {
  const owned = process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR === undefined
  const directory = owned
    ? fs.mkdtempSync(path.join(os.tmpdir(), `cvg-${kind}-evidence-`))
    : path.join(
        path.resolve(process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR),
        kind === 'reply' ? '' : kind === 'tool' ? 'tool-turn' : 'model-failure'
      )
  let failed = false
  return {
    directory,
    failed: () => {
      failed = true
    },
    finish: () => {
      if (!failed) {
        if (owned) fs.rmSync(directory, { recursive: true, force: true })
        return
      }
      if (!owned) {
        process.stderr.write(
          JSON.stringify({
            kind: 'PARE100_DIFFERENTIAL_FAILURE_EVIDENCE',
            directory,
            retained: true,
            explicit: true
          }) + '\n'
        )
        return
      }
      // Keep proof outside the session HOME; emit bounded transport data too
      // so the runner's log retains the fault even after its sandbox expires.
      // JSON escaping can expand bytes by up to 6x. A 64KiB content budget
      // keeps the emitted record below 512KiB for this bounded case inventory.
      let budget = 64 * 1024
      const files = []
      if (fs.existsSync(directory))
        for (const name of fs.readdirSync(directory).sort().slice(0, 32)) {
          const filename = path.join(directory, name)
          if (!fs.lstatSync(filename).isFile()) continue
          if (fs.statSync(filename).size > 4 * 1024 * 1024) {
            files.push({
              name,
              bytes: fs.statSync(filename).size,
              content: null,
              truncated: true,
              reason: 'oversize file retained on disk'
            })
            continue
          }
          const bytes = fs.readFileSync(filename)
          const size = Math.min(bytes.length, 64 * 1024, budget)
          budget -= size
          files.push({
            name,
            bytes: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            content: bytes.subarray(0, size).toString('utf8'),
            truncated: size < bytes.length
          })
        }
      process.stderr.write(
        JSON.stringify({
          kind: 'PARE100_DIFFERENTIAL_FAILURE_EVIDENCE',
          directory,
          retained: true,
          explicit: false,
          contentBudgetBytes: 64 * 1024,
          files
        }) + '\n'
      )
    }
  }
}
