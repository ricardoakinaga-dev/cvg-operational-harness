// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import { createCapabilityRegistry } from '../packages/harness/src/capability-boundary.ts'
import { createShellTool } from '../packages/sandbox/src/shell-tool.ts'
import { runContained } from '../packages/sandbox/src/run.ts'
import {
  createProcessContainmentProfile,
  prepareProcessLaunch,
  type ProcessContainmentProfile
} from '../packages/sandbox/src/process-profile.ts'
import { phase3RuntimeInput } from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'
import {
  reviewedNodeProfile,
  reviewedNodeRuntimeFiles
} from './helpers/aud0625-node-process-profile.ts'

let base: string, workspace: string, outside: string
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'aud0625-profile-'))
  workspace = join(base, 'workspace')
  outside = join(base, 'outside')
  mkdirSync(workspace)
  mkdirSync(outside)
  writeFileSync(join(outside, 'sentinel'), 'OWNED-OUTSIDE')
})
afterEach(() => rmSync(base, { recursive: true, force: true }))
function request(
  processProfile?: ProcessContainmentProfile,
  script = 'process.stdout.write("OWNED-PAYLOAD")'
) {
  return {
    argv: [process.execPath, '-e', script],
    handle: {
      mode: 'PROCESS' as const,
      workspaceRoot: workspace,
      allowNetwork: false,
      allowSubprocess: true
    },
    timeoutMs: 2000,
    ...(processProfile ? { processProfile } : {})
  }
}
function context(): ToolExecutionContext {
  const input = phase3RuntimeInput()
  return {
    tenantId: input.tenantId,
    agentId: input.agent.id,
    correlationId: input.correlationId,
    traceId: input.traceId,
    sandboxHandle: {
      mode: 'PROCESS',
      workspaceRoot: workspace,
      allowNetwork: false,
      allowSubprocess: true
    }
  }
}
function assetProfile(asset: string): ProcessContainmentProfile {
  return createProcessContainmentProfile({
    workspaceRoot: workspace,
    bwrapPath: '/usr/bin/bwrap',
    executablePaths: [process.execPath],
    runtimeFiles: [
      ...reviewedNodeRuntimeFiles(),
      { source: asset, destination: '/opt/owned-runtime.txt' }
    ]
  })
}
function startPrepared(launch: ReturnType<typeof prepareProcessLaunch>) {
  try {
    return spawnSync(launch.executable, [...launch.args], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe', ...launch.fds],
      env: launch.env
    })
  } finally {
    launch.close()
  }
}
function ownedRuntimeFds(): string[] {
  const files = new Set([
    ...reviewedNodeRuntimeFiles().map((f) => realpathSync(f.source)),
    realpathSync('/usr/bin/bwrap')
  ])
  return readdirSync('/proc/self/fd')
    .flatMap((fd) => {
      try {
        const target = readlinkSync('/proc/self/fd/' + fd)
        return target.startsWith(base) || files.has(target) ? [target] : []
      } catch {
        return []
      }
    })
    .sort()
}

describe('F02 explicit reviewed process profile', () => {
  it('fails closed without a profile before any payload', async () => {
    const actual = await runContained(
      request(undefined, 'require("node:fs").writeFileSync("launched","OWNED")')
    )
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_qualified_profile_required'
    })
    expect(existsSync(join(workspace, 'launched'))).toBe(false)
  })
  it('rejects a copied profile and does not read an attacker getter', async () => {
    const profile = reviewedNodeProfile(workspace)
    let reads = 0
    const fake = {
      get digest() {
        reads++
        return profile.digest
      }
    }
    const actual = await runContained(request(fake))
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_qualified_profile_required'
    })
    expect(reads).toBe(0)
  }, 30000)
  it('executes with exactly the declared environment, writable workspace and no host env', async () => {
    const profile = reviewedNodeProfile(workspace)
    const actual = await runContained(
      request(
        profile,
        'require("node:fs").writeFileSync("inside.out","OWNED-WRITE");process.stdout.write(JSON.stringify({keys:Object.keys(process.env).sort(),home:process.env.HOME==="/tmp",path:process.env.PATH==="",tmp:process.env.TMPDIR==="/tmp"}))'
      )
    )
    expect(actual.exitCode, actual.stderr).toBe(0)
    expect(JSON.parse(actual.stdout)).toEqual({
      keys: ['HOME', 'LANG', 'LC_ALL', 'PATH', 'PWD', 'TMPDIR', 'TZ'],
      home: true,
      path: true,
      tmp: true
    })
    expect(readFileSync(join(workspace, 'inside.out'), 'utf8')).toBe(
      'OWNED-WRITE'
    )
    expect(reviewedNodeProfile(workspace).digest).toBe(profile.digest)
  }, 30000)
  it('keeps a workspace under real /tmp writable after private tmpfs and preserves cwd stdin', async () => {
    const root = mkdtempSync('/tmp/aud0625-profile-owned-')
    try {
      const sub = join(root, 'sub')
      mkdirSync(sub)
      const input = request(
        reviewedNodeProfile(root),
        'const fs=require("node:fs");fs.writeFileSync("result",fs.readFileSync(0,"utf8"));process.stdout.write(process.cwd())'
      )
      const actual = await runContained({
        ...input,
        handle: { ...input.handle, workspaceRoot: root },
        cwd: sub,
        stdin: 'OWNED-STDIN'
      })
      expect(actual.exitCode, actual.stderr).toBe(0)
      expect(actual.stdout).toBe(sub)
      expect(readFileSync(join(sub, 'result'), 'utf8')).toBe('OWNED-STDIN')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30000)
  it('refuses an executable not present in the reviewed manifest', async () => {
    const actual = await runContained({
      ...request(reviewedNodeProfile(workspace)),
      argv: ['/bin/sh']
    })
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_executable_not_approved'
    })
  }, 30000)
  it('does not leak a host directory descriptor through the payload or namespace init', async () => {
    const profile = reviewedNodeProfile(workspace)
    const script =
      'const fs=require("node:fs");if(process.pid>4)throw Error("PID namespace missing");const leaked=[];for(const pid of ["self","1"]){let names;try{names=fs.readdirSync("/proc/"+pid+"/fd")}catch(e){if(["ENOENT","EACCES","EPERM"].includes(e.code))continue;throw e}for(const fd of names){const p="/proc/"+pid+"/fd/"+fd;let target;try{target=fs.readlinkSync(p)}catch{continue}if(target!==process.cwd())continue;try{if(fs.readFileSync(p+"/../outside/sentinel","utf8")==="OWNED-OUTSIDE")leaked.push(pid+":"+fd)}catch(e){if(!["ENOENT","ENOTDIR","EACCES","EPERM","EBADF"].includes(e.code))throw e}}}process.stdout.write(JSON.stringify({leaked}))'
    const actual = await runContained(request(profile, script))
    expect(actual.exitCode, actual.stderr).toBe(0)
    expect(JSON.parse(actual.stdout)).toEqual({ leaked: [] })
  }, 30000)
  it('refuses a different backend binding', async () => {
    const actual = await runContained({
      ...request(reviewedNodeProfile(workspace)),
      bwrapPath: process.execPath
    })
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_backend_binding_mismatch'
    })
  }, 30000)
  it('refuses a replacement directory at the workspace name', async () => {
    const profile = reviewedNodeProfile(workspace)
    renameSync(workspace, join(base, 'original-workspace'))
    mkdirSync(workspace)
    const actual = await runContained(request(profile))
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_workspace_identity_changed'
    })
  }, 30000)
  it('refuses a workspace name replaced with an outside symlink', async () => {
    const profile = reviewedNodeProfile(workspace)
    renameSync(workspace, join(base, 'original-workspace'))
    symlinkSync(outside, workspace)
    const actual = await runContained(request(profile))
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_workspace_outside_grant'
    })
    expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe(
      'OWNED-OUTSIDE'
    )
  }, 30000)
  it('refuses a cwd symlink that resolves beyond the bound workspace', async () => {
    const profile = reviewedNodeProfile(workspace)
    const cwd = join(workspace, 'sub')
    symlinkSync(outside, cwd)
    const actual = await runContained({ ...request(profile), cwd })
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_cwd_outside_profile'
    })
  }, 30000)
  it('refuses changed runtime bytes and closes all pinned descriptors on refusal', async () => {
    const asset = join(base, 'runtime-asset')
    writeFileSync(asset, 'OWNED-A')
    const profile = assetProfile(asset)
    writeFileSync(asset, 'OWNED-B')
    const before = ownedRuntimeFds()
    const actual = await runContained(request(profile))
    const after = ownedRuntimeFds()
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_runtime_identity_changed'
    })
    expect(after).toEqual(before)
  }, 30000)
  it('refuses a runtime member replaced with a symlink', async () => {
    const asset = join(base, 'runtime-asset')
    writeFileSync(asset, 'OWNED-A')
    const profile = assetProfile(asset)
    renameSync(asset, join(base, 'original-asset'))
    symlinkSync(join(outside, 'sentinel'), asset)
    const actual = await runContained(request(profile))
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'process_profile_runtime_file_unavailable'
    })
  }, 30000)
  it('pins the original workspace across a name swap after preparation', () => {
    const profile = reviewedNodeProfile(workspace)
    const input = request(
      profile,
      'require("node:fs").writeFileSync("owned-result","OWNED-PINNED")'
    )
    const launch = prepareProcessLaunch({
      profile,
      argv: input.argv,
      handle: input.handle
    })
    const original = join(base, 'original-workspace')
    renameSync(workspace, original)
    symlinkSync(outside, workspace)
    const actual = startPrepared(launch)
    expect(actual.error).toBeUndefined()
    expect(actual.status, actual.stderr).toBe(0)
    expect(existsSync(join(original, 'owned-result'))).toBe(true)
    expect(readFileSync(join(original, 'owned-result'), 'utf8')).toBe(
      'OWNED-PINNED'
    )
    expect(existsSync(join(outside, 'owned-result'))).toBe(false)
  }, 30000)
  it('pins reviewed runtime bytes across a name swap after preparation', () => {
    const asset = join(base, 'runtime-asset')
    writeFileSync(asset, 'OWNED-A')
    const profile = assetProfile(asset)
    const input = request(
      profile,
      'process.stdout.write(require("node:fs").readFileSync("/opt/owned-runtime.txt","utf8"))'
    )
    const launch = prepareProcessLaunch({
      profile,
      argv: input.argv,
      handle: input.handle
    })
    renameSync(asset, join(base, 'original-asset'))
    writeFileSync(asset, 'OWNED-B')
    const actual = startPrepared(launch)
    expect(actual.error).toBeUndefined()
    expect(actual.status, actual.stderr).toBe(0)
    expect(actual.stdout).toBe('OWNED-A')
  }, 30000)
  it('binds the shell version and fingerprint to the exact immutable profile', () => {
    const asset = join(base, 'runtime-asset')
    writeFileSync(asset, 'OWNED-A')
    const first = assetProfile(asset)
    const a = createShellTool({
      workspaceRoot: workspace,
      processProfile: first
    })
    writeFileSync(asset, 'OWNED-B')
    const second = assetProfile(asset)
    const b = createShellTool({
      workspaceRoot: workspace,
      processProfile: second
    })
    const fingerprint = (tool: ReturnType<typeof createShellTool>) => {
      const { execute, ...descriptor } = tool
      return createCapabilityRegistry([
        {
          descriptor: {
            ...descriptor,
            origin: 'core',
            providerId: 'synthetic',
            providerVersion: '1.0.0'
          },
          implementation: {
            execute,
            validateInput: () => true,
            validateOutput: () => true
          }
        }
      ]).compositionFingerprint()
    }
    expect(Object.isFrozen(first)).toBe(true)
    expect(a.version).toBe('v1:' + first.digest)
    expect(a.version).not.toBe(b.version)
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  }, 30000)
  it('captures the host profile once, rather than following mutable options', async () => {
    const first = reviewedNodeProfile(workspace)
    const otherRoot = join(base, 'other')
    mkdirSync(otherRoot)
    const second = reviewedNodeProfile(otherRoot)
    const options = { workspaceRoot: workspace, processProfile: first }
    const tool = createShellTool(options)
    options.processProfile = second
    const actual = await tool.execute(
      {
        argv: [process.execPath, '-e', 'process.stdout.write("OWNED")'],
        intent: 'owned profile capture'
      },
      context()
    )
    expect(actual.status).toBe('SUCCEEDED')
    expect(tool.version).toBe('v1:' + first.digest)
  }, 30000)
  it('rejects a profile belonging to another configured workspace', () => {
    const profile = reviewedNodeProfile(workspace)
    const other = join(base, 'other')
    mkdirSync(other)
    expect(() =>
      createShellTool({ workspaceRoot: other, processProfile: profile })
    ).toThrow('process_profile_workspace_binding_mismatch')
  }, 30000)
  it('rejects directories or tenant-owned runtime content rather than binding them', () => {
    const options = {
      workspaceRoot: workspace,
      bwrapPath: '/usr/bin/bwrap',
      executablePaths: [process.execPath]
    }
    expect(() =>
      createProcessContainmentProfile({
        ...options,
        runtimeFiles: [{ source: '/', destination: '/runtime' }]
      })
    ).toThrow('process_profile_runtime_file_limit')
    const asset = join(workspace, 'asset')
    writeFileSync(asset, 'OWNED')
    expect(() =>
      createProcessContainmentProfile({
        ...options,
        runtimeFiles: [{ source: asset, destination: '/runtime/asset' }]
      })
    ).toThrow('process_profile_runtime_workspace_or_private_mount_overlap')
  })
  it('rejects an oversized manifest before reading all entries', () => {
    expect(() =>
      createProcessContainmentProfile({
        workspaceRoot: workspace,
        bwrapPath: '/usr/bin/bwrap',
        executablePaths: [process.execPath],
        runtimeFiles: Array.from({ length: 65 }, () => ({
          source: process.execPath
        }))
      })
    ).toThrow('process_profile_runtime_manifest_limit')
  })
  for (const field of [
    'env',
    'mounts',
    'profile',
    'processProfile',
    'bwrapPath',
    'runtimeFiles',
    'executablePaths'
  ]) {
    it(`the model cannot choose ${field} at execution time`, async () => {
      let calls = 0
      const tool = createShellTool({
        workspaceRoot: workspace,
        run: async () => {
          calls++
          return { exitCode: 0, stdout: '', stderr: '', truncated: false }
        }
      })
      const actual = await tool.execute(
        { argv: ['controlled'], intent: 'owned field denial', [field]: {} },
        context()
      )
      expect(actual).toMatchObject({
        status: 'REJECTED',
        error: 'containment configuration belongs to trusted composition'
      })
      expect(calls).toBe(0)
    })
  }
})
