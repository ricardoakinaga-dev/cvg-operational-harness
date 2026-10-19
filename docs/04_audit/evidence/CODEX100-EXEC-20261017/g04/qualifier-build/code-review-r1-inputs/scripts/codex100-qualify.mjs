import { pathToFileURL } from 'node:url'
import { qualifyCodex } from '../tests/claude100/qualification/qualify.mjs'
import { parseArgs } from './claude100-qualify.mjs'

export async function main(args = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(args)
  } catch {
    process.stderr.write(
      'INVALID_INPUT: use --manifest --catalog --rule --capture-index --authority-index --evidence-root --out, each once with a value\n'
    )
    return 2
  }
  const report = await qualifyCodex(options)
  if (report.status === 'INFRA_FAILURE')
    process.stderr.write(
      'INFRA_FAILURE: consult checks and any partial evidence; a report may not have been materialized\n'
    )
  process.stdout.write(`${JSON.stringify(report)}\n`)
  return report.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main()
