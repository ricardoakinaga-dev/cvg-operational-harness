import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Reserved namespace for atomic-write temp files (SPEC 0197 §3). */
export const TEMP_PREFIX = '.cvg-fs-tmp-'

/**
 * Resolves a caller path inside the workspace root, refusing absolute paths,
 * `..` escapes and symlinks that leave the root (SPEC 0197 §3). Shared by the
 * fs tools and the shell tool as defense in depth alongside the WORKSPACE /
 * PROCESS gate. Returns the normalized relative path and the absolute path
 * under the real root.
 */
export function confinePath(
  root: string,
  raw: unknown
):
  | { readonly ok: true; readonly rel: string; readonly abs: string }
  | { readonly ok: false; readonly error: string } {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'path is required' }
  }
  const path = raw.trim()
  if (path.length > 4096) {
    return { ok: false, error: 'path exceeds maxPathLength' }
  }
  if (isAbsolute(path) || path.includes('\0')) {
    return { ok: false, error: 'path must be relative and free of NUL' }
  }
  const abs = resolve(root, path)
  if (abs !== root && !abs.startsWith(root + sep)) {
    return { ok: false, error: 'path escapes the workspace root' }
  }
  // Walk to the deepest existing ancestor and realpath it so a symlink that
  // points outside the workspace is refused even when it does not exist yet.
  let probe = abs
  const tail: string[] = []
  for (;;) {
    if (existsSync(probe)) break
    const parent = dirname(probe)
    if (parent === probe) {
      return { ok: false, error: 'path has no existing ancestor' }
    }
    tail.unshift(probe.slice(parent.length + 1))
    probe = parent
  }
  let real: string
  try {
    real = realpathSync(probe)
  } catch {
    return { ok: false, error: 'path cannot be resolved' }
  }
  const rebuilt = tail.length > 0 ? join(real, ...tail) : real
  if (rebuilt !== root && !rebuilt.startsWith(root + sep)) {
    return { ok: false, error: 'path resolves outside the workspace root' }
  }
  const rel = relative(root, rebuilt)
  if (rel.split(sep).some((part) => part.startsWith(TEMP_PREFIX))) {
    return { ok: false, error: 'path uses the reserved temp namespace' }
  }
  return { ok: true, rel: rel === '' ? '.' : rel, abs: rebuilt }
}
