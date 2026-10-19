import { pathToFileURL } from 'node:url'
import { freezeCaptureGraph } from '../tests/claude100/reference-port/bootstrap.mjs'

/** Three mandatory unique options, no positionals; values are never selectors. */
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
    primary = null,
    cancellation = null
  // SIGHUP/SIGINT/SIGTERM share one cancellation from entry to transfer.
  const entrySignals = new Map(
    ['SIGHUP', 'SIGINT', 'SIGTERM'].map((signal) => [
      signal,
      () => {
        cancellation ??= Object.assign(
          new Error('Reference capture entry cancelled'),
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
    graph = await freezeCaptureGraph(options.evidenceRoot)
    checkCancellation()
    for (const pin of graph.pins) {
      await pin.verify()
      checkCancellation()
    }
    const controller = await import(
      pathToFileURL(
        graph.root + '/tests/claude100/reference-capture/controller.mjs'
      ).href
    )
    if (typeof controller.runCapture !== 'function')
      throw new Error('Reference capture entry unavailable')
    checkCancellation()
    const result = await controller.runCapture(
      options,
      graph,
      releaseEntrySignals
    )
    returned = true
    // The controller disposes the graph before publication; no IO follows.
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
            'Reference capture bootstrap cleanup failed',
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
    // Inherited loader/runtime options could run code before this boundary.
    if (
      process.execArgv.length ||
      Object.hasOwn(process.env, 'NODE_OPTIONS') ||
      Object.hasOwn(process.env, 'NODE_PATH')
    )
      throw new Error('USAGE')
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
      if (!result.report)
        process.stderr.write(
          'Reference capture incomplete; only partial evidence may exist.\n'
        )
      process.exitCode = result.exitCode
    } catch {
      process.stderr.write(
        'Reference capture incomplete; only partial evidence may exist.\n'
      )
      process.exitCode = 1
    }
  }
}
