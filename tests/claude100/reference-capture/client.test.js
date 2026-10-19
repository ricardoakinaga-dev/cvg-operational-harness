// @vitest-environment node
// Client core with an injected fake child; no Docker, Claude or container.
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import {
  PINS,
  argvDigest,
  envDigest,
  envSetDigest,
  processInvocation,
  sha256
} from './constants.mjs'
import { createClient } from './client.mjs'
import { KeyStore } from './model.mjs'
import { expectedWorkspaceState } from './workspace.mjs'

const BASE = {
  uid: 1000,
  gid: 1000,
  pid: 1,
  pidNamespace: '1',
  netNamespace: '2',
  interfaces: ['lo'],
  routes: [],
  hostMarkerAbsent: true
}
function child(behaviour) {
  return (file, args, options) => {
    const c = new EventEmitter()
    c.pid = 200 + Math.floor(Math.random() * 1000)
    c.stdout = new PassThrough()
    c.stderr = new PassThrough()
    const input = []
    c.stdin = new Writable({
      write(chunk, _e, cb) {
        input.push(chunk)
        cb()
      }
    })
    let closed = false
    c.close = (code, signal) => {
      if (closed) return
      closed = true
      c.stdout.end()
      c.stderr.end()
      setImmediate(() => c.emit('close', code, signal))
    }
    c.spawnedWith = { file, args, options }
    setImmediate(() => c.emit('spawn'))
    c.stdin.on('finish', () =>
      behaviour(c, Buffer.concat(input), args, options)
    )
    return c
  }
}
function harness(behaviour, overrides = {}) {
  const frames = [],
    keys = new KeyStore('client'),
    kills = [],
    spawned = []
  const spawn = child(behaviour)
  const client = createClient({
    send: async (type, payload) => {
      frames.push({ type, payload })
    },
    raw: async (bytes) => {
      keys.feed(bytes)
    },
    spawn: (...a) => {
      const c = spawn(...a)
      spawned.push(c)
      return c
    },
    listPids: async () => [],
    executableDigest: async () => PINS.claudeSha256,
    executableIdentity: async () => 'same',
    workspaceState: async () => expectedWorkspaceState(),
    prepareScratch: async () => {},
    kill: (pid, signal) => {
      kills.push([pid, signal])
      for (const c of spawned)
        if (pid === -c.pid || pid === c.pid) c.close(null, signal)
    },
    selfPid: () => 1,
    ...overrides
  })
  return { client, frames, keys, kills, spawned }
}
const version = (c) => {
  c.stdout.write('2.1.302 (Claude Code)\n')
  c.close(0, null)
}
const configure = (client, port = 3456) =>
  client.configure(
    { port, profileSha256: 'a'.repeat(64), envSetSha256: envSetDigest(port) },
    BASE
  )

describe('client wrapper core', () => {
  it('requires CONFIGURE with the derived env-set digest and echoes READY', async () => {
    const { client, frames } = harness(version)
    await expect(
      client.configure(
        {
          port: 3456,
          profileSha256: 'a'.repeat(64),
          envSetSha256: 'b'.repeat(64)
        },
        BASE
      )
    ).rejects.toMatchObject({ code: 'PROTOCOL' })
    await configure(client)
    expect(frames[0]).toEqual({
      type: 'READY',
      payload: {
        ...BASE,
        port: 3456,
        profileSha256: 'a'.repeat(64),
        envSetSha256: envSetDigest(3456)
      }
    })
    await expect(configure(client)).rejects.toMatchObject({ code: 'PROTOCOL' })
  })
  it('launches only the fixed ordered children with exact argv/env/stdin bindings', async () => {
    const { client, frames, keys, spawned } = harness(version)
    await expect(
      client.startNative({ processOrdinal: 0, caseId: null })
    ).rejects.toMatchObject({ code: 'PROTOCOL' })
    await configure(client)
    await expect(
      client.startNative({ processOrdinal: 1, caseId: 'TEXT' })
    ).rejects.toMatchObject({ code: 'PROTOCOL' })
    await client.startNative({ processOrdinal: 0, caseId: null })
    const inv = processInvocation(0, 3456)
    expect(spawned[0].spawnedWith.file).toBe('/toolchain/claude')
    expect(spawned[0].spawnedWith.args).toEqual(['--version'])
    expect(spawned[0].spawnedWith.options).toMatchObject({
      cwd: '/workspace',
      env: inv.env,
      detached: true
    })
    const start = frames.find((f) => f.type === 'NATIVE_START').payload
    expect(start).toMatchObject({
      processOrdinal: 0,
      caseId: null,
      ppid: 1,
      executableSha256: PINS.claudeSha256,
      argvSha256: argvDigest(inv),
      envSha256: envDigest(inv),
      stdinSha256: sha256(Buffer.alloc(0))
    })
    const end = frames.find((f) => f.type === 'NATIVE_END').payload
    expect(end).toMatchObject({
      exitCode: 0,
      signal: null,
      timeout: false,
      descendantsAbsent: true,
      stdoutBytes: 22,
      stdoutSha256: sha256('2.1.302 (Claude Code)\n'),
      stderrBytes: 0
    })
    // Both terminators precede END; raw bytes equal the END digests.
    expect(keys.entry('client/0/1')).toMatchObject({ terminated: true })
    expect(keys.entry('client/0/2')).toMatchObject({ terminated: true })
    await client.startNative({ processOrdinal: 1, caseId: 'TEXT' })
    expect(spawned[1].spawnedWith.args.slice(-2)).toEqual(['--tools', ''])
  })
  it('refuses the first case after a version mismatch', async () => {
    const { client } = harness((c) => {
      c.stdout.write('2.1.301 (Claude Code)\n')
      c.close(0, null)
    })
    await configure(client)
    await client.startNative({ processOrdinal: 0, caseId: null })
    await expect(
      client.startNative({ processOrdinal: 1, caseId: 'TEXT' })
    ).rejects.toMatchObject({ code: 'PROTOCOL' })
  })
  it('does not spawn when the executable or workspace identity drifted', async () => {
    for (const override of [
      { executableDigest: async () => 'c'.repeat(64) },
      {
        workspaceState: async () => ({
          ...expectedWorkspaceState(),
          sha256: 'd'.repeat(64)
        })
      }
    ]) {
      const { client, frames, spawned } = harness(version, override)
      await configure(client)
      await client.startNative({ processOrdinal: 0, caseId: null })
      expect(spawned).toHaveLength(0)
      expect(frames.at(-1)).toMatchObject({
        type: 'ERROR',
        payload: { code: 'DRIFT_RUNTIME', processOrdinal: 0 }
      })
    }
  })
  it('reports surviving descendants and kills them before any next child', async () => {
    let pids = []
    const { client, frames, kills } = harness(
      (c) => {
        pids = [999]
        version(c)
      },
      { listPids: async () => pids }
    )
    await configure(client)
    await client.startNative({ processOrdinal: 0, caseId: null })
    expect(
      frames.find((f) => f.type === 'NATIVE_END').payload.descendantsAbsent
    ).toBe(false)
    expect(kills).toContainEqual([999, 'SIGKILL'])
    await expect(
      client.startNative({ processOrdinal: 1, caseId: 'TEXT' })
    ).rejects.toMatchObject({ code: 'CONTAINMENT' })
  })
  it('fails CAP above 1MiB aggregated stdout without truncating to complete', async () => {
    const { client, frames, kills } = harness((c) => {
      c.stdout.write(Buffer.alloc(1024 * 1024 + 1, 0x61))
    })
    await configure(client)
    await client.startNative({ processOrdinal: 0, caseId: null })
    expect(
      frames.some((f) => f.type === 'ERROR' && f.payload.code === 'CAP')
    ).toBe(true)
    expect(kills.some(([pid, s]) => pid < 0 && s === 'SIGKILL')).toBe(true)
  })
  it('times out the version child after 5s and kills its process group', async () => {
    const { client, frames, kills } = harness(() => {})
    await configure(client)
    await client.startNative({ processOrdinal: 0, caseId: null })
    const end = frames.find((f) => f.type === 'NATIVE_END').payload
    expect(end.timeout).toBe(true)
    expect(end.exitCode).toBeNull()
    expect(end.signal).toBe('SIGTERM')
    expect(kills[0][0]).toBeLessThan(0)
  }, 15000)
  it('records a spawn failure as TOOLCHAIN_UNAVAILABLE without START or END', async () => {
    const { client, frames } = harness(version, {
      spawn: () => {
        const c = new EventEmitter()
        c.stdout = new PassThrough()
        c.stderr = new PassThrough()
        c.stdin = new PassThrough()
        setImmediate(() => c.emit('error', new Error('ENOENT')))
        return c
      }
    })
    await configure(client)
    await client.startNative({ processOrdinal: 0, caseId: null })
    expect(frames.map((f) => f.type)).toEqual(['READY', 'ERROR'])
    expect(frames[1].payload.code).toBe('TOOLCHAIN_UNAVAILABLE')
  })
})
