import { pathToFileURL } from 'node:url'
import { qualify } from '../tests/claude100/qualification/qualify.mjs'

const names = new Map([
  ['--manifest', 'manifest'],
  ['--catalog', 'catalog'],
  ['--rule', 'rule'],
  ['--capture-index', 'captureIndex'],
  ['--authority-index', 'authorityIndex'],
  ['--evidence-root', 'evidenceRoot'],
  ['--out', 'out']
])

export function parseArgs(args) {
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    const name = names.get(args[i])
    const value = args[i + 1]
    if (
      !name ||
      Object.hasOwn(options, name) ||
      typeof value !== 'string' ||
      !value.length ||
      value.startsWith('--')
    )
      throw new TypeError(
        'Expected exactly seven distinct options with file/directory values'
      )
    options[name] = value
  }
  if (Object.keys(options).length !== names.size)
    throw new TypeError('All seven options are required')
  return options
}

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
  const report = await qualify(options)
  if (report.status === 'INFRA_FAILURE')
    process.stderr.write(
      'INFRA_FAILURE: consult checks and any partial evidence; a report may not have been materialized\n'
    )
  process.stdout.write(`${JSON.stringify(report)}\n`)
  return report.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main()
