// @vitest-environment node
// Docker transport with an injected fake execFile; it never runs Docker.
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { DockerMux, DockerTransport } from './docker.mjs'

const mux = (channel, bytes) => {
  const header = Buffer.alloc(8)
  header[0] = channel
  header.writeUInt32BE(bytes.length, 4)
  return Buffer.concat([header, bytes])
}
function fakeExecute(outcome = {}) {
  const calls = []
  const execute = (binary, argv, options, callback) => {
    calls.push({ binary, argv, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setImmediate(() => {
      const out = outcome.stdout ?? Buffer.from('ok')
      child.stdout.emit('data', out)
      callback(outcome.error ?? null, out, Buffer.alloc(0))
    })
    return child
  }
  return { execute, calls }
}

describe('Docker multiplex demux', () => {
  it('routes channels, keeps a partial envelope pending and rejects bad headers', () => {
    const got = []
    const m = new DockerMux((c, b) => got.push([c, b.toString()]))
    const both = Buffer.concat([
      mux(1, Buffer.from('ctl')),
      mux(2, Buffer.from('raw'))
    ])
    m.feed(both.subarray(0, 12))
    expect(got).toEqual([[1, 'ctl']])
    expect(m.pending.length).toBe(1)
    m.feed(both.subarray(12))
    expect(got).toEqual([
      [1, 'ctl'],
      [2, 'raw']
    ])
    expect(() =>
      new DockerMux(() => {}).feed(mux(3, Buffer.from('x')))
    ).toThrow(expect.objectContaining({ code: 'PROTOCOL' }))
    const bad = mux(1, Buffer.from('x'))
    bad[1] = 1
    expect(() => new DockerMux(() => {}).feed(bad)).toThrow()
  })
  it('caps control at 1MiB and the binary wire at 8MiB before waiting for payload', () => {
    const m = new DockerMux(() => {})
    const header = Buffer.alloc(8)
    header[0] = 1
    header.writeUInt32BE(1024 * 1024 + 1, 4)
    expect(() => m.feed(header)).toThrow(
      expect.objectContaining({ code: 'CAP' })
    )
    const n = new DockerMux(() => {})
    const raw = Buffer.alloc(8)
    raw[0] = 2
    raw.writeUInt32BE(8 * 1024 * 1024 + 1, 4)
    expect(() => n.feed(raw)).toThrow(expect.objectContaining({ code: 'CAP' }))
  })
})

describe('Docker CLI transport', () => {
  const make = (execute, now = () => 0) =>
    new DockerTransport({
      configDir: '/own/empty-config',
      deadline: 90000,
      closeDeadline: () => null,
      now,
      execute
    })
  it('uses the fixed socket, own config, API 1.51 and a closed environment', async () => {
    const { execute, calls } = fakeExecute()
    const result = await make(execute).call(['version'])
    expect(result.exitCode).toBe(0)
    expect(calls[0].binary).toBe('/usr/bin/docker')
    expect(calls[0].argv.slice(0, 4)).toEqual([
      '--host',
      'unix:///var/run/docker.sock',
      '--config',
      '/own/empty-config'
    ])
    expect(calls[0].options.env).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/own/empty-config',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      DOCKER_API_VERSION: '1.51'
    })
    expect(calls[0].options.timeout).toBe(2000)
    expect(calls[0].options.maxBuffer).toBe(256 * 1024)
  })
  it('never renews the 32-call ceiling and rejects the 33rd call as CAP', async () => {
    const { execute } = fakeExecute()
    const t = make(execute)
    for (let i = 0; i < 32; i++) await t.call(['version'])
    await expect(t.call(['version'])).rejects.toMatchObject({ code: 'CAP' })
    expect(t.records).toHaveLength(32)
  })
  it('fails CAP above 256KiB per stream and TIMEOUT past the deadline', async () => {
    const big = fakeExecute({ stdout: Buffer.alloc(256 * 1024 + 1) })
    await expect(make(big.execute).call(['inspect'])).rejects.toMatchObject({
      code: 'CAP'
    })
    const late = fakeExecute()
    await expect(
      make(late.execute, () => 90000).call(['version'])
    ).rejects.toMatchObject({
      code: 'TIMEOUT'
    })
    await expect(make(late.execute).call(['bad\0arg'])).rejects.toMatchObject({
      code: 'PROTOCOL'
    })
  })
  it('keeps a nonzero CLI exit as data, not as success', async () => {
    const failing = fakeExecute({
      error: Object.assign(new Error('x'), { code: 1 }),
      stdout: Buffer.alloc(0)
    })
    const result = await make(failing.execute).call([
      'container',
      'inspect',
      'x'
    ])
    expect(result.exitCode).toBe(1)
  })
})
