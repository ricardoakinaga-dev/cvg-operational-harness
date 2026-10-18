import { Session } from 'node:inspector/promises'

/** Test-only in-process V8 observer. No listening port and no function replacement. */
export async function observeFunctionCalls(
  functions: Record<string, unknown>,
  filters: Record<
    string,
    { scopeVariable?: string; identity?: unknown; callerName?: string }
  > = {}
) {
  const session = new Session()
  const protocol = session as unknown as {
    post(
      method: string,
      params?: Record<string, unknown>
    ): Promise<Record<string, unknown>>
  }
  const key = `__pare217_probe_${process.pid}`
  const counts: Record<string, number> = {}
  const breakpoints = new Map<string, string>()
  let resumeFailure: unknown
  Object.defineProperty(globalThis, key, {
    value: Object.freeze({ functions, filters }),
    configurable: true
  })
  session.connect()
  session.on('Debugger.paused', (message) => {
    for (const id of message.params.hitBreakpoints ?? []) {
      const name = breakpoints.get(id)
      if (
        name &&
        (!filters[name]?.callerName ||
          message.params.callFrames.some(
            (frame) => frame.functionName === filters[name]?.callerName
          ))
      )
        counts[name] = (counts[name] ?? 0) + 1
    }
    void protocol.post('Debugger.resume').catch((error) => {
      resumeFailure = error
    })
  })
  try {
    await protocol.post('Debugger.enable')
    for (const [name, fn] of Object.entries(functions)) {
      if (typeof fn !== 'function')
        throw new Error(`Function probe target missing: ${name}`)
      counts[name] = 0
      const evaluated = await protocol.post('Runtime.evaluate', {
        expression: `globalThis[${JSON.stringify(key)}].functions[${JSON.stringify(name)}]`
      })
      const result = evaluated.result as { objectId?: string } | undefined
      if (!result?.objectId)
        throw new Error('Function probe did not resolve a V8 identity')
      const filter = filters[name]
      if (
        filter?.scopeVariable &&
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(filter.scopeVariable)
      )
        throw new Error('Unsafe function probe filter')
      const breakpoint = await protocol.post(
        'Debugger.setBreakpointOnFunctionCall',
        {
          objectId: result.objectId,
          ...(filter?.scopeVariable
            ? {
                condition: `typeof ${filter.scopeVariable} !== 'undefined' && ${filter.scopeVariable} === globalThis[${JSON.stringify(key)}].filters[${JSON.stringify(name)}].identity`
              }
            : {})
        }
      )
      if (typeof breakpoint.breakpointId !== 'string')
        throw new Error('Function probe breakpoint not installed')
      breakpoints.set(breakpoint.breakpointId, name)
    }
    return {
      counts,
      async stop() {
        try {
          for (const id of breakpoints.keys())
            await protocol.post('Debugger.removeBreakpoint', {
              breakpointId: id
            })
          if (resumeFailure) throw resumeFailure
        } finally {
          session.disconnect()
          Reflect.deleteProperty(globalThis, key)
        }
      }
    }
  } catch (error) {
    session.disconnect()
    Reflect.deleteProperty(globalThis, key)
    throw error
  }
}
