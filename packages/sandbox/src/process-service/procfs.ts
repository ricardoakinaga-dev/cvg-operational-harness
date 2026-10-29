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

function realUid(pid: string, procRoot: string): number | undefined {
  try {
    const status = readFileSync(`${procRoot}/${pid}/status`, 'latin1')
    const line = status.split('\n').find((l) => l.startsWith('Uid:'))
    const uid = line?.split(/\s+/)[1]
    return uid !== undefined && NUMERIC.test(uid) ? Number(uid) : undefined
  } catch {
    return undefined
  }
}

export interface PidNamespaceScan {
  /** Host-visible pids inside the namespace (the observer excluded). */
  readonly members: readonly number[]
  /** Same-uid entries whose namespace could not be read: they block `clean`. */
  readonly unverified: number
}

/** Scans the host's /proc for processes whose PID namespace is `pid:[inode]`. */
export function scanPidNamespace(
  inode: number,
  options: {
    readonly procRoot?: string
    readonly uid?: number
    readonly exclude?: readonly number[]
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
      // Another user's process cannot be ours; the same user's unreadable one cannot be ruled out.
      if (
        realUid(entry, procRoot) === uid ||
        realUid(entry, procRoot) === undefined
      )
        unverified++
    }
  }
  return { members, unverified }
}
