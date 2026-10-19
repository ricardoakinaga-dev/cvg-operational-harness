import { constants } from 'node:fs'
import { lstat, open, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  FIXTURE_BYTES,
  LIMITS,
  MCP_BYTES,
  SETTINGS_BYTES,
  canonical,
  fault,
  sha256
} from './constants.mjs'

export const WORKSPACE_ROOT = '/workspace'
export const DENIED_PATH = '/workspace/denied.txt'
export const WORKSPACE_FILES = Object.freeze([
  Object.freeze({ name: 'input.txt', bytes: FIXTURE_BYTES }),
  Object.freeze({ name: 'mcp.json', bytes: MCP_BYTES }),
  Object.freeze({ name: 'settings.json', bytes: SETTINGS_BYTES })
])

function encode(entries) {
  const document = {
    version: 1,
    root: WORKSPACE_ROOT,
    entries,
    denied: {
      path: DENIED_PATH,
      present: entries.some((e) => e.path === DENIED_PATH)
    }
  }
  const bytes = Buffer.from(canonical(document))
  if (bytes.length > LIMITS.workspaceStateBytes) throw fault('CAP')
  return { document, bytes, sha256: sha256(bytes) }
}

/** Pinned expectation: exactly three regular files and denied.txt absent. */
export function expectedWorkspaceState() {
  return encode(
    WORKSPACE_FILES.map((f) => ({
      path: `${WORKSPACE_ROOT}/${f.name}`,
      type: 'file',
      bytes: f.bytes.length,
      sha256: sha256(f.bytes)
    }))
  )
}

const kind = (s) =>
  s.isFile()
    ? 'file'
    : s.isSymbolicLink()
      ? 'symlink'
      : s.isDirectory()
        ? 'directory'
        : 'other'

/** Enumerate every child; divergent observations are kept, never filtered. */
export async function observeWorkspace(root = WORKSPACE_ROOT) {
  const names = (await readdir(root)).sort()
  if (names.length > LIMITS.workspaceEntries) throw fault('CAP')
  const entries = []
  for (const name of names) {
    const filename = path.join(root, name)
    const stat = await lstat(filename)
    const entry = {
      path: `${WORKSPACE_ROOT}/${name}`,
      type: kind(stat),
      bytes: null,
      sha256: null
    }
    if (entry.type === 'file') {
      if (stat.size > LIMITS.workspaceFileBytes) throw fault('CAP')
      const handle = await open(
        filename,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      try {
        const buffer = Buffer.alloc(LIMITS.workspaceFileBytes + 1)
        let size = 0
        for (;;) {
          const { bytesRead } = await handle.read(
            buffer,
            size,
            buffer.length - size,
            size
          )
          if (!bytesRead) break
          size += bytesRead
          if (size > LIMITS.workspaceFileBytes) throw fault('CAP')
        }
        entry.bytes = size
        entry.sha256 = sha256(buffer.subarray(0, size))
      } finally {
        await handle.close()
      }
    }
    entries.push(entry)
  }
  return encode(entries)
}
