// @vitest-environment node
// Containment projection and inspect mutants (RC02); inspect data is synthetic.
import { describe, expect, it } from 'vitest'
import { PINS } from './constants.mjs'
import {
  containerName,
  createArgs,
  makeConfig,
  verifyInspect,
  verifyNamespaces
} from './profile.mjs'

const marker = `/tmp/cvg-claude100-exec-20261017/ref-capture-markers/${'c'.repeat(32)}`
const paths = {
  bundle: '/e/.reference-capture-bootstrap-x',
  workspace: '/e/out/inputs/workspace',
  emptyVolume: '/e/out/inputs/empty-volume',
  runId: 'r1',
  marker
}
const imageEnv = ['PATH=/usr/bin:/bin', 'LANG=en_US.utf8']
function record(role) {
  const config = makeConfig(role, {
    ...paths,
    observerId: role === 'client' ? 'a'.repeat(64) : undefined
  })
  return {
    id: (role === 'client' ? 'b' : 'a').repeat(64),
    name: containerName('d'.repeat(32), role),
    labels: { 'cvg.role': role, 'cvg.nonce': 'd'.repeat(32) },
    config
  }
}
function inspectOf(r) {
  const c = r.config
  return {
    Id: r.id,
    Name: `/${r.name}`,
    Image: PINS.imageId,
    Config: {
      Image: PINS.imageId,
      Labels: { ...r.labels },
      User: '1000:1000',
      WorkingDir: '/workspace',
      Entrypoint: ['/toolchain/node'],
      Cmd: [...c.cmd],
      Tty: false,
      OpenStdin: true,
      Env: [
        'PATH=/usr/bin:/bin',
        'LANG=C.UTF-8',
        'TZ=UTC',
        'HOME=/scratch/home'
      ]
    },
    HostConfig: {
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Devices: [],
      NetworkMode: c.networkMode,
      PidMode: '',
      IpcMode: 'private',
      CgroupnsMode: 'private',
      PortBindings: {},
      PublishAllPorts: false,
      Memory: c.memoryBytes,
      NanoCpus: 1e9,
      PidsLimit: 64,
      Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }],
      LogConfig: { Type: 'none' },
      Tmpfs: Object.fromEntries(
        c.tmpfs.map((t) => [
          t.destination,
          `rw,nosuid,nodev,noexec,size=${t.bytes},uid=1000,gid=1000,mode=0700`
        ])
      )
    },
    Mounts: c.mounts.map((m) => ({
      Type: 'bind',
      Source: m.source,
      Destination: m.destination,
      RW: false
    })),
    State: { Running: true, Pid: 4242 }
  }
}

describe('closed containment profile', () => {
  it('fixes five read-only binds, private namespaces and the published limits', () => {
    const observer = makeConfig('observer', paths)
    const client = makeConfig('client', {
      ...paths,
      observerId: 'a'.repeat(64)
    })
    expect(observer.mounts.map((m) => m.destination)).toEqual([
      '/toolchain/node',
      '/toolchain/claude',
      '/bundle',
      '/workspace',
      '/var/lib/postgresql/data'
    ])
    expect(observer.mounts.every((m) => m.readOnly && m.type === 'bind')).toBe(
      true
    )
    expect(observer.networkMode).toBe('none')
    expect(client.networkMode).toBe(`container:${'a'.repeat(64)}`)
    expect([observer.memoryBytes, client.memoryBytes]).toEqual([
      192 * 1024 * 1024,
      768 * 1024 * 1024
    ])
    expect(client.tmpfs.map((t) => t.bytes)).toEqual([64 << 20, 32 << 20])
    expect(observer.tmpfs.map((t) => t.bytes)).toEqual([24 << 20, 8 << 20])
    expect(client.cmd[0]).toBe(
      '/bundle/tests/claude100/reference-capture/client.mjs'
    )
    expect(containerName('e'.repeat(32), 'observer')).toBe(
      `cvg-c100-capture-${'e'.repeat(32)}-observer`
    )
    for (const bad of [
      { ...paths, runId: 'x y' },
      { ...paths, marker: marker.replace('ref-capture', 'ref-port') },
      { ...paths, workspace: 'relative' },
      { ...paths, bundle: '/a,b' }
    ])
      expect(() => makeConfig('observer', bad)).toThrow()
    expect(() => makeConfig('client', paths)).toThrow()
  })
  it('builds create argv without shell, publish, privileges or extra mounts', () => {
    const args = createArgs({ ...record('client'), labels: { a: 'b' } })
    expect(args.slice(0, 2)).toEqual(['create', '--pull=never'])
    for (const forbidden of [
      '--privileged',
      '-p',
      '--publish',
      '--rm',
      'sh',
      '-c',
      '--device'
    ])
      expect(args).not.toContain(forbidden)
    expect(args.filter((a) => a === '--mount')).toHaveLength(5)
    expect(
      args.filter((a) => a.startsWith('type=bind') && a.endsWith(',readonly'))
    ).toHaveLength(5)
    expect(args).toContain('--read-only')
    expect(args).toContain('--cap-drop=ALL')
  })
  it('accepts the exact inspect projection', () => {
    for (const role of ['observer', 'client']) {
      const r = record(role)
      expect(verifyInspect(inspectOf(r), r, imageEnv)).toBe(true)
    }
  })
  it.each([
    ['writable bind', (x) => (x.Mounts[3].RW = true)],
    [
      'extra volume',
      (x) => x.Mounts.push({ Type: 'volume', Destination: '/data', RW: true })
    ],
    [
      'docker socket bind',
      (x) => (x.Mounts[2].Source = '/var/run/docker.sock')
    ],
    ['privileged', (x) => (x.HostConfig.Privileged = true)],
    ['cap add', (x) => (x.HostConfig.CapAdd = ['NET_ADMIN'])],
    ['host network', (x) => (x.HostConfig.NetworkMode = 'host')],
    ['bridge network', (x) => (x.HostConfig.NetworkMode = 'bridge')],
    ['published port', (x) => (x.HostConfig.PortBindings = { '80/tcp': [{}] })],
    ['host pid', (x) => (x.HostConfig.PidMode = 'host')],
    ['shared ipc', (x) => (x.HostConfig.IpcMode = 'host')],
    ['writable rootfs', (x) => (x.HostConfig.ReadonlyRootfs = false)],
    ['missing no-new-privileges', (x) => (x.HostConfig.SecurityOpt = [])],
    ['device', (x) => (x.HostConfig.Devices = [{ PathOnHost: '/dev/kvm' }])],
    ['memory', (x) => (x.HostConfig.Memory = 1)],
    ['pids', (x) => (x.HostConfig.PidsLimit = 0)],
    ['log driver', (x) => (x.HostConfig.LogConfig.Type = 'json-file')],
    [
      'exec tmpfs',
      (x) =>
        (x.HostConfig.Tmpfs['/tmp'] =
          'rw,nosuid,nodev,size=1,uid=1000,gid=1000,mode=0700,exec')
    ],
    ['env injection', (x) => x.Config.Env.push('DOCKER_HOST=tcp://x')],
    ['env override', (x) => (x.Config.Env[1] = 'LANG=xx')],
    ['tty', (x) => (x.Config.Tty = true)],
    ['user root', (x) => (x.Config.User = '0:0')],
    ['labels', (x) => (x.Config.Labels['cvg.nonce'] = 'other')],
    ['image', (x) => (x.Image = 'sha256:' + '1'.repeat(64))],
    ['name', (x) => (x.Name = '/other')],
    ['cmd', (x) => (x.Config.Cmd = ['/bin/sh', '-c', 'x'])],
    ['stopped', (x) => (x.State.Running = false)]
  ])('rejects %s as CONTAINMENT', (_name, mutate) => {
    const r = record('client')
    const raw = inspectOf(r)
    mutate(raw)
    expect(() => verifyInspect(raw, r, imageEnv)).toThrow(
      expect.objectContaining({ code: 'CONTAINMENT' })
    )
  })
  it('requires distinct private PIDs, one shared loopback and the absent marker', () => {
    const ready = (pid, net) => ({
      uid: 1000,
      gid: 1000,
      pid: 1,
      pidNamespace: pid,
      netNamespace: net,
      interfaces: ['lo'],
      routes: ['127.0.0.0/8', '::1/128'],
      hostMarkerAbsent: true
    })
    const host = { pid: '9', net: '8' }
    expect(verifyNamespaces(ready('1', '3'), ready('2', '3'), host)).toBe(true)
    for (const [o, c] of [
      [ready('1', '3'), ready('1', '3')],
      [ready('1', '3'), ready('2', '4')],
      [ready('9', '3'), ready('2', '3')],
      [ready('1', '8'), ready('2', '8')],
      [{ ...ready('1', '3'), interfaces: ['lo', 'eth0'] }, ready('2', '3')],
      [{ ...ready('1', '3'), routes: ['0.0.0.0/0'] }, ready('2', '3')],
      [{ ...ready('1', '3'), hostMarkerAbsent: false }, ready('2', '3')],
      [{ ...ready('1', '3'), uid: 0 }, ready('2', '3')],
      [{ ...ready('1', '3'), pid: 7 }, ready('2', '3')]
    ])
      expect(() => verifyNamespaces(o, c, host)).toThrow(
        expect.objectContaining({ code: 'CONTAINMENT' })
      )
  })
})
