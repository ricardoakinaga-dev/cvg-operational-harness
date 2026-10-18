import { spawn as spawnChild } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  LIMITS,
  PINS,
  SIGNALS,
  VERSION_PATTERN,
  argvDigest,
  envDigest,
  envSetDigest,
  fault,
  processInvocation,
  sha256
} from './constants.mjs'
import {
  clientFrame,
  clientFrames,
  controlWriter,
  hostCommands,
  isDirectMain,
  preflight,
  wrapperArguments,
  writeBytes
} from './protocol.mjs'
import { expectedWorkspaceState, observeWorkspace } from './workspace.mjs'

async function hashFile(filename) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filename, { highWaterMark: 1 << 20 })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', resolve)
  })
  return hash.digest('hex')
}
/**
 * Live processes other than this PID1 wrapper. A zombie (state Z) has already
 * terminated: Node does not reap adopted orphans, so it is not a running
 * descendant. A process that vanishes while being read is likewise not live.
 */
async function otherPids() {
  const live = []
  for (const name of await readdir('/proc')) {
    if (!/^[1-9]\d*$/.test(name) || Number(name) === process.pid) continue
    let stat
    try {
      stat = await readFile(`/proc/${name}/stat`, 'latin1')
    } catch (cause) {
      if (cause.code === 'ENOENT' || cause.code === 'ESRCH') continue
      throw cause
    }
    const state = stat.slice(
      stat.lastIndexOf(')') + 2,
      stat.lastIndexOf(')') + 3
    )
    if (state !== 'Z') live.push(Number(name))
  }
  return live
}
const identity = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(':')

/**
 * Client core: PID1 creates only the four fixed native children, in order,
 * after CONFIGURE. Dependencies are injectable for in-process tests only.
 */
export function createClient({
  send,
  raw,
  spawn = spawnChild,
  listPids = otherPids,
  executableDigest = () => hashFile('/toolchain/claude'),
  executableIdentity = async () => identity(await stat('/toolchain/claude')),
  workspaceState = () => observeWorkspace(),
  prepareScratch = async (directory) => {
    await mkdir(directory, { mode: 0o700 })
    await mkdir(`${directory}/home`, { mode: 0o700 })
    await mkdir(`${directory}/config`, { mode: 0o700 })
  },
  invocation = processInvocation,
  kill = (pid, signal) => process.kill(pid, signal),
  selfPid = () => process.pid,
  now = () => new Date().toISOString()
}) {
  const failures = []
  const expectedState = expectedWorkspaceState().sha256
  let configured = null,
    child = null,
    active = false,
    rawBroken = false,
    nextProcess = 0,
    versionAccepted = false,
    stopping = false,
    stdoutTotal = 0,
    stderrTotal = 0,
    rawChain = Promise.resolve()
  const record = (code, context = {}) => {
    const error = fault(code)
    failures.push(error)
    return send('ERROR', {
      code,
      caseId: context.caseId ?? null,
      processOrdinal: context.processOrdinal ?? null,
      requestOrdinal: null
    }).catch(() => failures.push(fault('IO')))
  }
  function queue(bytes) {
    const step = rawChain.then(() => (rawBroken ? undefined : raw(bytes)))
    rawChain = step.catch((cause) => {
      if (rawBroken) return
      rawBroken = true
      return record(cause?.code === 'CAP' ? 'CAP' : 'IO')
    })
    return rawChain
  }
  function killGroup(pid, signal) {
    try {
      kill(-pid, signal)
    } catch (cause) {
      if (cause.code !== 'ESRCH') throw fault('CLEANUP', cause)
    }
  }

  async function run(processOrdinal, caseId) {
    const inv = invocation(processOrdinal, configured.port)
    const budget = processOrdinal === 0 ? LIMITS.versionMs : LIMITS.caseMs
    const context = { processOrdinal, caseId }
    // Inputs are re-identified before every child; drift prevents the spawn.
    let executableSha256, before
    try {
      await prepareScratch(inv.scratch)
      executableSha256 = await executableDigest()
      before = await executableIdentity()
      if (executableSha256 !== PINS.claudeSha256) throw fault('DRIFT_RUNTIME')
      if ((await workspaceState()).sha256 !== expectedState)
        throw fault('DRIFT_RUNTIME')
    } catch (cause) {
      await record(
        cause?.code === 'DRIFT_RUNTIME' ? 'DRIFT_RUNTIME' : 'IO',
        context
      )
      return
    }
    if (stopping) return // STOP during re-identification: no child is created.
    const hashes = { 1: createHash('sha256'), 2: createHash('sha256') }
    const counts = { 1: 0, 2: 0 }
    const versionOutput = []
    let timedOut = false,
      capped = false,
      spawned = false,
      startSent = Promise.resolve(),
      killTimer = null
    const owned = spawn(inv.file, inv.args, {
      cwd: inv.cwd,
      env: inv.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    })
    child = owned
    const budgetTimer = setTimeout(() => {
      timedOut = true
      if (owned.pid) {
        try {
          killGroup(owned.pid, 'SIGTERM')
        } catch {}
        killTimer = setTimeout(() => {
          try {
            killGroup(owned.pid, 'SIGKILL')
          } catch {}
        }, LIMITS.killGraceMs)
      }
    }, budget)
    const onData = (channel) => (bytes) => {
      if (capped || bytes.length === 0) return
      counts[channel] += bytes.length
      if (channel === 1) stdoutTotal += bytes.length
      else stderrTotal += bytes.length
      if (
        stdoutTotal > LIMITS.nativeStreamBytes ||
        stderrTotal > LIMITS.nativeStreamBytes
      ) {
        capped = true
        owned.stdout.pause()
        owned.stderr.pause()
        record('CAP', context)
        try {
          killGroup(owned.pid, 'SIGKILL')
        } catch {}
        return
      }
      hashes[channel].update(bytes)
      if (processOrdinal === 0 && channel === 1)
        versionOutput.push(Buffer.from(bytes))
      for (const frame of clientFrames(bytes, processOrdinal, channel))
        queue(frame)
    }
    owned.stdout.on('data', onData(1))
    owned.stderr.on('data', onData(2))
    for (const stream of [owned.stdout, owned.stderr, owned.stdin])
      stream.on('error', () => {})
    const done = new Promise((resolve) => {
      owned.once('spawn', () => {
        spawned = true
        startSent = send('NATIVE_START', {
          processOrdinal,
          caseId,
          pid: owned.pid,
          ppid: selfPid(),
          startedAt: now(),
          executableSha256,
          argvSha256: argvDigest(inv),
          envSha256: envDigest(inv),
          stdinSha256: sha256(inv.stdin)
        })
        startSent.catch(() => failures.push(fault('IO')))
        owned.stdin.end(inv.stdin)
      })
      owned.once('error', () => {
        if (!spawned) {
          clearTimeout(budgetTimer)
          // Spawn failed before any PID: no START/END is invented.
          record('TOOLCHAIN_UNAVAILABLE', context).then(resolve)
        }
      })
      owned.once('close', async (exitCode, signal) => {
        clearTimeout(budgetTimer)
        clearTimeout(killTimer)
        const endedAt = now()
        if (!spawned) return
        try {
          await startSent
        } catch {}
        await rawChain
        // Both terminators precede END; the host joins pipes by key, not order.
        if (!capped) {
          await queue(clientFrame(processOrdinal, 1, Buffer.alloc(0)))
          await queue(clientFrame(processOrdinal, 2, Buffer.alloc(0)))
        }
        let remaining = []
        try {
          remaining = await listPids()
          for (const pid of remaining)
            try {
              kill(pid, 'SIGKILL')
            } catch {}
        } catch {
          // An unlistable namespace never reports absent descendants.
          remaining = [0]
          await record('IO', context)
        }
        let observedSignal = signal
        if (observedSignal !== null && !SIGNALS.includes(observedSignal)) {
          await record('SIGNAL', context)
          observedSignal = null
        }
        try {
          if ((await executableIdentity()) !== before)
            await record('DRIFT_RUNTIME', context)
          if ((await workspaceState()).sha256 !== expectedState)
            await record('DRIFT_RUNTIME', context)
        } catch {
          await record('IO', context)
        }
        const stdout = Buffer.concat(versionOutput)
        if (processOrdinal === 0)
          versionAccepted =
            exitCode === 0 &&
            observedSignal === null &&
            !timedOut &&
            VERSION_PATTERN.test(stdout.toString('latin1')) &&
            Buffer.from(stdout.toString('utf8')).equals(stdout)
        try {
          await send('NATIVE_END', {
            processOrdinal,
            caseId,
            pid: owned.pid,
            endedAt,
            exitCode: Number.isSafeInteger(exitCode) ? exitCode : null,
            signal: Number.isSafeInteger(exitCode) ? null : observedSignal,
            timeout: timedOut,
            stdoutSha256: hashes[1].digest('hex'),
            stdoutBytes: counts[1],
            stderrSha256: hashes[2].digest('hex'),
            stderrBytes: counts[2],
            descendantsAbsent: remaining.length === 0
          })
        } catch {
          failures.push(fault('IO'))
        }
        resolve()
      })
    })
    await done
    if (child === owned) child = null
  }

  return {
    failures,
    async configure(payload, base) {
      if (configured || nextProcess !== 0) throw fault('PROTOCOL')
      if (envSetDigest(payload.port) !== payload.envSetSha256)
        throw fault('PROTOCOL')
      configured = Object.freeze({ ...payload })
      await send('READY', { ...base, ...configured })
    },
    async startNative({ processOrdinal, caseId }) {
      if (
        !configured ||
        stopping ||
        child ||
        active ||
        failures.length ||
        processOrdinal !== nextProcess ||
        (processOrdinal > 0 && !versionAccepted)
      )
        throw fault('PROTOCOL')
      if ((await listPids()).length) throw fault('CONTAINMENT')
      nextProcess++
      active = true
      // Runs in background; END is the completion signal to the host.
      try {
        await run(processOrdinal, caseId)
      } finally {
        active = false
      }
    },
    async stop() {
      stopping = true
      const owned = child
      if (owned?.pid) {
        try {
          killGroup(owned.pid, 'SIGTERM')
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200))
        try {
          killGroup(owned.pid, 'SIGKILL')
        } catch {}
      }
      for (const pid of await listPids().catch(() => []))
        try {
          kill(pid, 'SIGKILL')
        } catch {}
      const deadline = Date.now() + LIMITS.closeMs
      while ((child || active) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50))
      await rawChain
      const clean =
        !child && !active && (await listPids().catch(() => [1])).length === 0
      if (!clean) failures.push(fault('CLEANUP'))
      return clean
    }
  }
}

export async function main() {
  const { runId, hostMarkerPath } = wrapperArguments(process.argv.slice(2))
  const send = controlWriter(process.stdout, 'client', runId)
  let rawBytes = 0,
    rawFrames = 0
  const raw = async (bytes) => {
    rawBytes += bytes.length
    rawFrames++
    if (rawBytes > LIMITS.rawWireBytes || rawFrames > LIMITS.rawFrames)
      throw fault('CAP')
    await writeBytes(process.stderr, bytes)
  }
  const client = createClient({ send, raw })
  let cancel
  const cancelled = new Promise((resolve) => {
    cancel = resolve
  })
  const onSignal = () => {
    client.failures.push(fault('SIGNAL'))
    cancel()
  }
  const life = setTimeout(() => {
    client.failures.push(fault('TIMEOUT'))
    cancel()
  }, LIMITS.wrapperLifeMs)
  for (const s of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.on(s, onSignal)
  const ioError = (cause) => {
    client.failures.push(fault('IO', cause))
    cancel()
  }
  process.stdout.on('error', ioError)
  process.stderr.on('error', ioError)
  process.stdin.on('error', ioError)
  let stopped = false
  const running = new Set()
  try {
    const base = await preflight(hostMarkerPath)
    // PID1 in an initially empty private namespace owns every later process.
    if ((await otherPids()).length) throw fault('CONTAINMENT')
    const commands = hostCommands(process.stdin, 'client', runId)[
      Symbol.asyncIterator
    ]()
    let first = true
    for (;;) {
      const step = await Promise.race([
        commands.next(),
        cancelled.then(() => ({ cancelled: true }))
      ])
      if (step.cancelled) break
      const { type, payload } = step.value
      if (type === 'STOP') {
        stopped = true
        break
      }
      try {
        if (first !== (type === 'CONFIGURE')) throw fault('PROTOCOL')
        first = false
        if (type === 'CONFIGURE') await client.configure(payload, base)
        else {
          const task = client.startNative(payload)
          running.add(task)
          task
            .catch(async (cause) => {
              client.failures.push(cause?.code ? cause : fault('PROTOCOL'))
              await send('ERROR', {
                code: cause?.code ?? 'PROTOCOL',
                caseId: payload.caseId,
                processOrdinal: payload.processOrdinal,
                requestOrdinal: null
              }).catch(() => {})
            })
            .finally(() => running.delete(task))
        }
      } catch (cause) {
        client.failures.push(cause?.code ? cause : fault('PROTOCOL', cause))
        await send('ERROR', {
          code: cause?.code ?? 'PROTOCOL',
          caseId: null,
          processOrdinal: null,
          requestOrdinal: null
        }).catch(() => {})
        const next = await Promise.race([
          commands.next(),
          cancelled.then(() => ({ cancelled: true }))
        ])
        if (!next.cancelled && next.value?.type === 'STOP') stopped = true
        break
      }
    }
  } catch (cause) {
    client.failures.push(cause?.code ? cause : fault('PROTOCOL', cause))
  }
  const clean = await client.stop()
  await Promise.allSettled([...running])
  if (stopped && clean)
    await Promise.race([
      send('CLOSED', {}),
      new Promise((resolve) => setTimeout(resolve, LIMITS.closeMs))
    ]).catch(() => client.failures.push(fault('IO')))
  clearTimeout(life)
  for (const s of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.off(s, onSignal)
  process.stdin.destroy()
  process.exitCode = client.failures.length || !stopped ? 1 : 0
}

if (isDirectMain(import.meta.url)) {
  main().catch(() => {
    process.exitCode = 1
  })
}
