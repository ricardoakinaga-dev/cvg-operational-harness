import { spawnSync } from 'node:child_process'
import {
  createProcessContainmentProfile,
  type ProcessContainmentProfile,
  type ProcessRuntimeFile
} from '../../packages/sandbox/src/process-profile.ts'

let manifest: readonly ProcessRuntimeFile[] | undefined
/** Trusted fixture preparation: only the Node binary already running this test. */
export function reviewedNodeRuntimeFiles(): readonly ProcessRuntimeFile[] {
  if (!manifest) {
    const result = spawnSync('/usr/bin/ldd', [process.execPath], {
      encoding: 'utf8',
      timeout: 5000,
      env: { LANG: 'C', LC_ALL: 'C' }
    })
    if (result.status !== 0 || result.error)
      throw new Error(
        'trusted Node runtime fixture dependency discovery failed'
      )
    const paths = [
      ...new Set([
        process.execPath,
        ...Array.from(
          result.stdout.matchAll(/(\/[^\s()]+)/g),
          (match) => match[1]!
        )
      ])
    ].sort()
    manifest = Object.freeze(
      paths.map((path) => Object.freeze({ source: path, destination: path }))
    )
  }
  return manifest
}
/** The production API never invokes ldd or accepts model-selected manifests. */
export function reviewedNodeProfile(
  workspaceRoot: string
): ProcessContainmentProfile {
  return createProcessContainmentProfile({
    workspaceRoot,
    bwrapPath: '/usr/bin/bwrap',
    runtimeFiles: reviewedNodeRuntimeFiles(),
    executablePaths: [process.execPath]
  })
}
