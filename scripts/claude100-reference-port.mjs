import { pathToFileURL } from 'node:url'
import { freezeHostGraph } from '../tests/claude100/reference-port/bootstrap.mjs'

export function parseArgs(args) {
  const known = new Map([
    ['--manifest', 'manifest'],
    ['--evidence-root', 'evidenceRoot'],
    ['--out', 'out']
  ])
  const result = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = known.get(args[i])
    if (
      !key ||
      Object.hasOwn(result, key) ||
      typeof args[i + 1] !== 'string' ||
      !args[i + 1].length ||
      args[i + 1].startsWith('--')
    )
      throw new Error('USAGE')
    result[key] = args[i + 1]
  }
  if (Object.keys(result).length !== 3) throw new Error('USAGE')
  return result
}

async function execute(options) {
  let graph,
    returned = false,
    primary = null
  let cancellation = null
  const entrySignals = new Map(
    ['SIGINT', 'SIGTERM'].map((signal) => [
      signal,
      () => {
        cancellation ??= Object.assign(
          new Error('Native port entry cancelled'),
          { code: 'SIGNAL', signal }
        )
      }
    ])
  )
  for (const [signal, handler] of entrySignals) process.on(signal, handler)
  const checkCancellation = () => {
    if (cancellation) throw cancellation
  }
  const releaseEntrySignals = () => {
    for (const [signal, handler] of entrySignals) process.off(signal, handler)
  }
  try {
    graph = await freezeHostGraph(options.evidenceRoot)
    checkCancellation()
    for (const pin of graph.pins) {
      await pin.verify()
      checkCancellation()
    }
    const controller = await import(
      pathToFileURL(
        graph.root + '/tests/claude100/reference-port/controller.mjs'
      ).href
    )
    if (typeof controller.runProbe !== 'function')
      throw new Error('Native port bootstrap entry unavailable')
    checkCancellation()
    const result = await controller.runProbe(
      options,
      graph,
      releaseEntrySignals
    )
    returned = true
    // The controller disposes the graph before publication. No fallible IO here
    // after a successful runProbe return/publication, including in finally.
    return result
  } catch (cause) {
    primary = cause
    throw cause
  } finally {
    try {
      if (graph && !returned) {
        const causes = primary ? [primary] : []
        const results = await Promise.allSettled(
          graph.pins.map((pin) => pin.close())
        )
        for (const result of results)
          if (result.status === 'rejected') causes.push(result.reason)
        try {
          await graph.dispose()
        } catch (cause) {
          causes.push(cause)
        }
        if (cancellation && primary?.code !== 'SIGNAL')
          causes.push(cancellation)
        if (causes.length > (primary ? 1 : 0))
          throw new AggregateError(
            causes,
            'Native port bootstrap cleanup failed',
            { cause: primary ?? causes[0] }
          )
      }
    } finally {
      releaseEntrySignals()
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch {
    process.stderr.write(
      'Usage: --manifest FILE --evidence-root PRIVATE_DIR --out NEW_DIR\n'
    )
    process.exitCode = 2
  }
  if (options) {
    try {
      const result = await execute(options)
      // Successful publication is the final fallible IO. The report is the output.
      if (!result.report)
        process.stderr.write(
          'Native port probe failed; only partial evidence may exist.\n'
        )
      process.exitCode = result.exitCode
    } catch {
      process.stderr.write(
        'Native port probe failed; only partial evidence may exist.\n'
      )
      process.exitCode = 1
    }
  }
}
