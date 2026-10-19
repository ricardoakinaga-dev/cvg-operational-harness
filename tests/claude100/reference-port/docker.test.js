// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { DockerMux, DockerTransport } from './docker.mjs'

function frame(channel, bytes) {
  const header = Buffer.alloc(8)
  header[0] = channel
  header.writeUInt32BE(bytes.length, 4)
  return Buffer.concat([header, bytes])
}
const callbacks = () => ({
  onStdout() {},
  onStderr() {},
  onEnd() {},
  onFailure() {}
})
function fakeExecution(result, seen = []) {
  return (binary, args, options, callback) => {
    seen.push({ binary, args, options })
    const child = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill() {}
    }
    queueMicrotask(() =>
      callback(
        result.error ?? null,
        result.stdout ?? Buffer.alloc(0),
        result.stderr ?? Buffer.alloc(0)
      )
    )
    return child
  }
}

describe('NP03 Docker multiplex separation — synthetic protocol data only', () => {
  it('keeps stdout/control and stderr/raw distinct across every byte boundary', () => {
    const chunks = []
    const mux = new DockerMux((channel, bytes) =>
      chunks.push([channel, bytes.toString()])
    )
    const bytes = Buffer.concat([
      frame(2, Buffer.from('untrusted native text')),
      frame(1, Buffer.from('trusted wrapper line'))
    ])
    for (const byte of bytes) mux.feed(Buffer.from([byte]))
    mux.finish()
    expect(chunks).toEqual([
      [2, 'untrusted native text'],
      [1, 'trusted wrapper line']
    ])
  })
  it('rejects malformed stream IDs, reserved header bytes, oversize and incomplete frames', () => {
    const badId = frame(0, Buffer.from('reflected stdin'))
    const reserved = frame(1, Buffer.from('x'))
    reserved[2] = 1
    const oversized = Buffer.alloc(8)
    oversized[0] = 1
    oversized.writeUInt32BE(65537, 4)
    for (const bytes of [badId, reserved, oversized])
      expect(() => new DockerMux(() => {}).feed(bytes)).toThrow()
    const mux = new DockerMux(() => {})
    mux.feed(frame(1, Buffer.from('partial')).subarray(0, 9))
    expect(() => mux.finish()).toThrow()
  })
})

describe('NP01/NP06 fixed Docker call boundary — mocked executor, no daemon', () => {
  const transport = (result, seen = []) =>
    new DockerTransport({
      binary: '/fixed/docker',
      configDir: '/own/empty',
      deadline: 30000,
      now: () => 0,
      execute: fakeExecution(result, seen)
    })
  it('uses a fixed local socket, empty config and constructed environment', async () => {
    const seen = []
    const docker = transport({ stdout: Buffer.from('ok') }, seen)
    expect((await docker.call(['inspect', 'owned-id'])).exitCode).toBe(0)
    expect(seen[0].args).toEqual([
      '--host',
      'unix:///var/run/docker.sock',
      '--config',
      '/own/empty',
      'inspect',
      'owned-id'
    ])
    expect(seen[0].options.env).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/own/empty',
      LANG: 'C.UTF-8',
      TZ: 'UTC'
    })
    expect(seen[0].options.timeout).toBe(2000)
    expect(docker.records[0].complete).toBe(true)
  })
  it('records genuine nonzero command completion and preserves the native error', async () => {
    const cause = Object.assign(new Error('synthetic unavailable identity'), {
      code: 1
    })
    const result = await transport({
      error: cause,
      stderr: Buffer.from('not found')
    }).call(['inspect', 'owned-id'])
    expect(result.exitCode).toBe(1)
    expect(result.nativeError).toBe(cause)
  })
  it('refuses stderr at limit+1 and cumulative output beyond 256KiB', async () => {
    await expect(
      transport({ stderr: Buffer.alloc(16385) }).call(['inspect', 'owned-id'])
    ).rejects.toHaveProperty('code', 'CAP')
    const docker = transport({ stdout: Buffer.alloc(65536) })
    for (let n = 0; n < 4; n++) await docker.call(['inspect', 'owned-id'])
    await expect(docker.call(['inspect', 'owned-id'])).rejects.toHaveProperty(
      'code',
      'CAP'
    )
  })
  it('does not convert killed calls or unknown execution errors into success', async () => {
    const cause = Object.assign(new Error('synthetic command deadline'), {
      killed: true,
      signal: 'SIGKILL'
    })
    await expect(
      transport({ error: cause }).call(['create'])
    ).rejects.toMatchObject({ code: 'TIMEOUT', cause })
  })
  it('limits attempts including failures and never executes an expired call', async () => {
    const docker = transport({})
    for (let n = 0; n < 24; n++) await docker.call(['inspect', 'owned-id'])
    await expect(docker.call(['inspect', 'owned-id'])).rejects.toHaveProperty(
      'code',
      'CAP'
    )
    const expired = new DockerTransport({
      binary: '/fixed/docker',
      configDir: '/own/empty',
      deadline: 0,
      now: () => 0,
      execute: () => {
        throw new Error('must not execute')
      }
    })
    await expect(expired.call(['create'])).rejects.toHaveProperty(
      'code',
      'TIMEOUT'
    )
  })
  it('bounds a single shared cleanup window rather than renewing per command', async () => {
    let now = 10
    const docker = new DockerTransport({
      binary: '/fixed/docker',
      configDir: '/own/empty',
      deadline: 0,
      now: () => now,
      execute: fakeExecution({})
    })
    await docker.call(['stop', 'owned-id'], { cleanup: true })
    now = 5011
    await expect(
      docker.call(['rm', 'owned-id'], { cleanup: true })
    ).rejects.toHaveProperty('code', 'TIMEOUT')
  })
  it('rejects an unbounded or arbitrary attachment identity before connecting', async () => {
    const docker = transport({})
    await expect(docker.attach('../other', callbacks())).rejects.toHaveProperty(
      'code',
      'PROTOCOL'
    )
    expect(docker.calls).toBe(0)
  })
})
