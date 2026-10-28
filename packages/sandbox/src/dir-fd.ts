import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync
} from 'node:fs'

/**
 * Directory-descriptor helpers for the fs tools (SPEC 0270 §3.2). Node 22 has
 * no openat/renameat, so paths are resolved through `/proc/self/fd/<fd>/…`,
 * which Linux resolves from the descriptor's inode rather than from a name.
 * Every component is opened with O_NOFOLLOW: a symlink anywhere in the path is
 * refused, and swapping a directory after it was opened cannot redirect the
 * operation.
 */
const FD_ROOT = '/proc/self/fd'

const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW

export function directoryDescriptorsAvailable(): boolean {
  return process.platform === 'linux' && existsSync(FD_ROOT)
}

/** Path of `name` relative to the directory behind `fd`, or of the dir itself. */
export function atFd(fd: number, name?: string): string {
  return name === undefined ? `${FD_ROOT}/${fd}` : `${FD_ROOT}/${fd}/${name}`
}

export type DirOpen =
  | { readonly ok: true; readonly fd: number }
  | { readonly ok: false; readonly reason: 'symlink' | 'missing' | 'other' }

/**
 * O_NOFOLLOW on a symlink yields ELOOP, but combined with O_DIRECTORY Linux
 * reports ENOTDIR, the same code as a regular file; `lstat` of the entry
 * tells the two apart.
 */
function reasonOf(
  error: unknown,
  entry: string
): 'symlink' | 'missing' | 'other' {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'ELOOP') return 'symlink'
  if (code === 'ENOTDIR') {
    try {
      return lstatSync(entry).isSymbolicLink() ? 'symlink' : 'missing'
    } catch {
      return 'missing'
    }
  }
  if (code === 'ENOENT') return 'missing'
  return 'other'
}

/**
 * Opens `root` and then each of `parts` below it as directories, never
 * following a symlink. Intermediate descriptors are closed; the caller owns
 * and must close the returned one.
 */
export function openDirectoryChain(
  root: string,
  parts: readonly string[]
): DirOpen {
  let fd: number
  try {
    fd = openSync(root, DIRECTORY_FLAGS)
  } catch (error) {
    return { ok: false, reason: reasonOf(error, root) }
  }
  for (const part of parts) {
    let next: number
    try {
      next = openSync(atFd(fd, part), DIRECTORY_FLAGS)
    } catch (error) {
      const reason = reasonOf(error, atFd(fd, part))
      closeSync(fd)
      return { ok: false, reason }
    }
    closeSync(fd)
    fd = next
  }
  return { ok: true, fd }
}

/** Opens `name` inside the directory behind `dirFd` without following it. */
export function openFileAt(
  dirFd: number,
  name: string,
  flags: number,
  mode?: number
):
  | { readonly ok: true; readonly fd: number }
  | { readonly ok: false; readonly reason: 'symlink' | 'missing' | 'other' } {
  try {
    return {
      ok: true,
      fd: openSync(atFd(dirFd, name), flags | constants.O_NOFOLLOW, mode)
    }
  } catch (error) {
    return { ok: false, reason: reasonOf(error, atFd(dirFd, name)) }
  }
}

/** True when the nominal chain still leads to the directory behind `fd`. */
export function sameDirectory(
  fd: number,
  root: string,
  parts: readonly string[]
): boolean {
  const reopened = openDirectoryChain(root, parts)
  if (!reopened.ok) return false
  try {
    const held = fstatSync(fd)
    const current = fstatSync(reopened.fd)
    return held.dev === current.dev && held.ino === current.ino
  } finally {
    closeSync(reopened.fd)
  }
}

export function closeQuietly(fd: number): void {
  try {
    closeSync(fd)
  } catch {
    // Already closed or invalid; nothing else to release.
  }
}
