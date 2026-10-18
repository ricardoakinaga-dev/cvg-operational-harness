// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  makeConfig,
  createArgs,
  verifyInspect,
  verifyNamespaces
} from './profile.mjs'

const opts = {
  bundle: '/own/snapshot/bundle',
  workspace: '/own/snapshot/workspace',
  emptyVolume: '/own/snapshot/empty',
  runId: 'synthetic_profile',
  marker: `/tmp/cvg-claude100-exec-20261017/ref-port-markers/${'a'.repeat(32)}`,
  observerId: 'b'.repeat(64)
}
function record(role = 'observer') {
  return {
    id: 'c'.repeat(64),
    name: 'cvg-c100-rp-obs-0123456789abcdef',
    labels: { task: 'C100-Q01-REF-PORT-001', role, nonce: 'a'.repeat(32) },
    config: makeConfig(role, opts)
  }
}
function fakeInspect(r) {
  const c = r.config
  return {
    Id: r.id,
    Name: `/${r.name}`,
    Image: c.imageId,
    Config: {
      Image: c.imageId,
      Labels: { ...r.labels },
      User: c.user,
      WorkingDir: c.workingDir,
      Entrypoint: c.entrypoint,
      Cmd: c.cmd,
      Tty: false,
      OpenStdin: true
    },
    HostConfig: {
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Devices: [],
      DeviceRequests: [],
      CapAdd: [],
      NetworkMode: c.networkMode,
      PidMode: '',
      IpcMode: 'private',
      CgroupnsMode: 'private',
      PortBindings: {},
      PublishAllPorts: false,
      ExtraHosts: [],
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
    State: { Running: true, Pid: 12345 }
  }
}

describe('NP02 expected confinement projection — synthetic inspect fixtures, not runtime proof', () => {
  it.each(['observer', 'client'])(
    'constructs fixed %s resources and readonly volume override',
    (role) => {
      const r = record(role)
      expect(verifyInspect(fakeInspect(r), r)).toBe(true)
      const args = createArgs(r)
      expect(args).toContain('--pull=never')
      expect(args).toContain('--entrypoint')
      expect(
        r.config.mounts.find(
          (m) => m.destination === '/var/lib/postgresql/data'
        ).readOnly
      ).toBe(true)
      expect(r.config.tmpfs.reduce((n, t) => n + t.bytes, 0)).toBe(
        (role === 'client' ? 96 : 32) * 1024 * 1024
      )
      expect(r.config.networkMode).toBe(
        role === 'client' ? `container:${opts.observerId}` : 'none'
      )
    }
  )
  it.each([
    [
      'host network',
      (r) => {
        r.HostConfig.NetworkMode = 'host'
      }
    ],
    [
      'host PID',
      (r) => {
        r.HostConfig.PidMode = 'host'
      }
    ],
    [
      'host IPC',
      (r) => {
        r.HostConfig.IpcMode = 'host'
      }
    ],
    [
      'host cgroup',
      (r) => {
        r.HostConfig.CgroupnsMode = 'host'
      }
    ],
    [
      'writable root',
      (r) => {
        r.HostConfig.ReadonlyRootfs = false
      }
    ],
    [
      'privileged',
      (r) => {
        r.HostConfig.Privileged = true
      }
    ],
    [
      'extra capability',
      (r) => {
        r.HostConfig.CapAdd = ['SYS_ADMIN']
      }
    ],
    [
      'missing no-new-privileges',
      (r) => {
        r.HostConfig.SecurityOpt = []
      }
    ],
    [
      'unbounded memory',
      (r) => {
        r.HostConfig.Memory = 0
      }
    ],
    [
      'unbounded PIDs',
      (r) => {
        r.HostConfig.PidsLimit = 0
      }
    ],
    [
      'daemon logs enabled',
      (r) => {
        r.HostConfig.LogConfig.Type = 'json-file'
      }
    ],
    [
      'writable anonymous image volume',
      (r) => {
        r.Mounts[4] = {
          Type: 'volume',
          Destination: '/var/lib/postgresql/data',
          RW: true
        }
      }
    ],
    [
      'extra Docker socket',
      (r) => {
        r.Mounts.push({
          Type: 'bind',
          Source: '/var/run/docker.sock',
          Destination: '/var/run/docker.sock',
          RW: true
        })
      }
    ],
    [
      'published port',
      (r) => {
        r.HostConfig.PortBindings = { '80/tcp': [{ HostPort: '8080' }] }
      }
    ],
    [
      'wrong user',
      (r) => {
        r.Config.User = '0:0'
      }
    ],
    [
      'unreviewed image',
      (r) => {
        r.Image = `sha256:${'0'.repeat(64)}`
      }
    ],
    [
      'wrong ownership label',
      (r) => {
        r.Config.Labels.nonce = 'foreign'
      }
    ],
    [
      'TTY raw stream',
      (r) => {
        r.Config.Tty = true
      }
    ],
    [
      'tmpfs without noexec',
      (r) => {
        r.HostConfig.Tmpfs['/tmp'] = r.HostConfig.Tmpfs['/tmp'].replace(
          'noexec,',
          ''
        )
      }
    ]
  ])('rejects %s before allowing native launch', (_, mutate) => {
    const r = record(),
      observed = fakeInspect(r)
    mutate(observed)
    expect(() => verifyInspect(observed, r)).toThrow()
  })
  it('rejects comma-based mount option injection and non-owned marker paths', () => {
    expect(() =>
      makeConfig('observer', { ...opts, bundle: '/own/data,readonly=false' })
    ).toThrow()
    expect(() =>
      makeConfig('observer', { ...opts, marker: '/home/real-profile' })
    ).toThrow()
  })
  it('requires distinct private PID namespaces and a shared non-host loopback namespace', () => {
    const ready = {
      uid: 1000,
      gid: 1000,
      pid: 1,
      hostMarkerAbsent: true,
      interfaces: ['lo'],
      routes: [],
      pidNamespace: '11',
      netNamespace: '21'
    }
    expect(
      verifyNamespaces(
        ready,
        { ...ready, pidNamespace: '12' },
        { pid: '1', net: '2' }
      )
    ).toBe(true)
    expect(() =>
      verifyNamespaces(ready, { ...ready }, { pid: '1', net: '2' })
    ).toThrow()
    expect(() =>
      verifyNamespaces(
        ready,
        { ...ready, pidNamespace: '12', netNamespace: '2' },
        { pid: '1', net: '2' }
      )
    ).toThrow()
  })
})
