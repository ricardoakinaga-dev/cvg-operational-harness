import { readdirSync, readFileSync, readlinkSync } from 'node:fs'

/**
 * Observation of a launch through /proc (SPEC 0286 I5, I9). Membership is decided by the PID
 * namespace inode, not by ancestry or a remembered pid, so a double-forked `setsid` descendant
 * and a reused pid are both handled. `procRoot` is injectable for tests.
 */
export const DEFAULT_PROC_ROOT = '/proc'

const NUMERIC = /^\d+$/

/** `starttime` (field 22 of /proc/<pid>/stat), the identity half of a pid. */
export function readStartTime(
  pid: number,
  procRoot: string = DEFAULT_PROC_ROOT
): string | undefined {
  try {
    const stat = readFileSync(`${procRoot}/${pid}/stat`, 'latin1')
    // comm may contain spaces and parentheses: fields restart after the LAST ')'.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const start = fields[19]
    return start !== undefined && NUMERIC.test(start) ? start : undefined
  } catch {
    return undefined
  }
}

/** True only if `pid` still has the same start time that was captured when it was launched. */
export function sameProcess(
  pid: number,
  startTime: string,
  procRoot: string = DEFAULT_PROC_ROOT
): boolean {
  return readStartTime(pid, procRoot) === startTime
}

interface ProcStatus {
  readonly uid: number | undefined
  /** Pid per namespace level, outermost first; depth 1 means "only the host namespace". */
  readonly nsDepth: number | undefined
}
function readStatus(
  pid: string | number,
  procRoot: string
): ProcStatus | undefined {
  try {
    const lines = readFileSync(`${procRoot}/${pid}/status`, 'latin1').split(
      '\n'
    )
    const uid = lines.find((l) => l.startsWith('Uid:'))?.split(/\s+/)[1]
    const nsPid = lines.find((l) => l.startsWith('NSpid:'))?.split(/\s+/)
    return {
      uid: uid !== undefined && NUMERIC.test(uid) ? Number(uid) : undefined,
      nsDepth: nsPid ? nsPid.length - 1 : undefined
    }
  } catch {
    return undefined
  }
}
function parentOf(pid: number, procRoot: string): number | undefined {
  try {
    const stat = readFileSync(`${procRoot}/${pid}/stat`, 'latin1')
    const ppid = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]
    return ppid !== undefined && NUMERIC.test(ppid) ? Number(ppid) : undefined
  } catch {
    return undefined
  }
}
/** Every process of a PID namespace descends, in the host's view, from the namespace init. */
function descendsFrom(
  pid: number,
  ancestor: number,
  procRoot: string
): boolean | undefined {
  let current = pid
  for (let step = 0; step < 4096; step++) {
    if (current === ancestor) return true
    if (current <= 1) return false
    const parent = parentOf(current, procRoot)
    if (parent === undefined) return undefined
    current = parent
  }
  return undefined
}

export interface PidNamespaceScan {
  /** Host-visible pids inside the namespace (the observer excluded). */
  readonly members: readonly number[]
  /** Same-uid entries that could be neither placed in nor ruled out of the namespace. */
  readonly unverified: number
}

/**
 * Scans the host's /proc for processes whose PID namespace is `pid:[inode]`. A process that hides
 * its namespace link (non-dumpable) is still placed by its namespace depth and by descending from
 * the namespace init (`initPid`, the host pid bubblewrap reports).
 */
export function scanPidNamespace(
  inode: number,
  options: {
    readonly procRoot?: string
    readonly uid?: number
    readonly exclude?: readonly number[]
    readonly initPid?: number
  } = {}
): PidNamespaceScan {
  const procRoot = options.procRoot ?? DEFAULT_PROC_ROOT
  const uid = options.uid ?? process.getuid?.() ?? -1
  const skip = new Set(options.exclude ?? [])
  const wanted = `pid:[${inode}]`
  const members: number[] = []
  let unverified = 0
  let entries: string[]
  try {
    entries = readdirSync(procRoot)
  } catch {
    // Without /proc nothing can be proven.
    return { members: [], unverified: 1 }
  }
  for (const entry of entries) {
    if (!NUMERIC.test(entry)) continue
    const pid = Number(entry)
    if (skip.has(pid)) continue
    try {
      if (readlinkSync(`${procRoot}/${entry}/ns/pid`) === wanted)
        members.push(pid)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Gone between readdir and readlink: not a member any more.
      if (code === 'ENOENT' || code === 'ESRCH') continue
      const status = readStatus(entry, procRoot)
      // Another user's process cannot be ours.
      if (status?.uid !== undefined && status.uid !== uid) continue
      // Only the host namespace: it cannot be inside a child namespace.
      if (status?.nsDepth !== undefined && status.nsDepth < 2) continue
      const inside =
        options.initPid === undefined
          ? undefined
          : descendsFrom(pid, options.initPid, procRoot)
      if (inside === true) members.push(pid)
      else if (inside === false) continue
      else unverified++
    }
  }
  return { members, unverified }
}

/** True if `pid` is (still) in the namespace; used right before a member kill. */
export function inPidNamespace(
  pid: number,
  inode: number,
  procRoot: string = DEFAULT_PROC_ROOT,
  initPid?: number
): boolean {
  try {
    return readlinkSync(`${procRoot}/${pid}/ns/pid`) === `pid:[${inode}]`
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ESRCH' || initPid === undefined)
      return false
    return descendsFrom(pid, initPid, procRoot) === true
  }
}
