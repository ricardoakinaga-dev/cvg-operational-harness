import path from 'node:path'
import { PINS, canonical } from './protocol.mjs'
import { probeError } from './schema.mjs'

const same = (a, b) => canonical(a) === canonical(b)
const ID = /^[a-f0-9]{64}$/
const FLAGS = ['nosuid', 'nodev', 'noexec']
function requireThat(value) {
  if (!value) throw probeError('CONTAINMENT')
}
function bind(source, destination) {
  if (!path.isAbsolute(source) || /[,\r\n\0]/.test(source))
    throw probeError('INPUT_INVALID')
  return { source, destination, readOnly: true, type: 'bind' }
}
export function makeConfig(
  role,
  { bundle, workspace, emptyVolume, runId, marker, observerId }
) {
  if (
    !['client', 'observer'].includes(role) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(runId)
  )
    throw probeError('INPUT_INVALID')
  if (
    !/^\/tmp\/cvg-claude100-exec-20261017\/ref-port-markers\/[a-f0-9]{32}$/.test(
      marker
    )
  )
    throw probeError('INPUT_INVALID')
  if (role === 'client' && !ID.test(observerId))
    throw probeError('INPUT_INVALID')
  const temporary = (destination, bytes) => ({
    destination,
    bytes,
    uid: 1000,
    gid: 1000,
    mode: 448,
    flags: [...FLAGS]
  })
  return {
    imageId: PINS.imageId,
    entrypoint: ['/toolchain/node'],
    cmd: [`/bundle/tests/claude100/reference-port/${role}.mjs`, runId, marker],
    workingDir: '/workspace',
    user: '1000:1000',
    readOnlyRootfs: true,
    capDrop: ['ALL'],
    securityOpt: ['no-new-privileges'],
    privileged: false,
    devices: [],
    pidMode: 'private',
    ipcMode: 'private',
    cgroupnsMode: 'private',
    networkMode: role === 'observer' ? 'none' : `container:${observerId}`,
    portBindings: {},
    memoryBytes: (role === 'client' ? 768 : 192) * 1024 * 1024,
    nanoCpus: 1e9,
    pidsLimit: 64,
    ulimits: { nofile: { soft: 256, hard: 256 } },
    logDriver: 'none',
    mounts: [
      bind(PINS.nodePath, '/toolchain/node'),
      bind(PINS.claudePath, '/toolchain/claude'),
      bind(bundle, '/bundle'),
      bind(workspace, '/workspace'),
      bind(emptyVolume, '/var/lib/postgresql/data')
    ],
    tmpfs: [
      temporary('/scratch', (role === 'client' ? 64 : 24) * 1024 * 1024),
      temporary('/tmp', (role === 'client' ? 32 : 8) * 1024 * 1024)
    ]
  }
}
const tmpfsString = (t) =>
  `rw,${t.flags.join(',')},size=${t.bytes},uid=${t.uid},gid=${t.gid},mode=0700`
export function createArgs(record) {
  const c = record.config
  const args = [
    'create',
    '--pull=never',
    '--name',
    record.name,
    '--interactive',
    '--user',
    c.user,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--cgroupns=private',
    '--ipc=private',
    '--pids-limit=64',
    '--ulimit=nofile=256:256',
    '--cpus=1',
    `--memory=${c.memoryBytes}`,
    '--log-driver=none',
    '--network',
    c.networkMode,
    '--workdir',
    c.workingDir,
    '--entrypoint',
    c.entrypoint[0],
    '--env=LANG=C.UTF-8',
    '--env=TZ=UTC',
    '--env=HOME=/scratch/home'
  ]
  for (const key of Object.keys(record.labels).sort())
    args.push('--label', `${key}=${record.labels[key]}`)
  for (const m of c.mounts)
    args.push(
      '--mount',
      `type=bind,source=${m.source},destination=${m.destination},readonly`
    )
  for (const t of c.tmpfs)
    args.push('--tmpfs', `${t.destination}:${tmpfsString(t)}`)
  args.push(c.imageId, ...c.cmd)
  return args
}
function inspectTmpfs(actual, expected) {
  requireThat(
    actual &&
      same(
        Object.keys(actual).sort(),
        expected.map((x) => x.destination).sort()
      )
  )
  for (const t of expected) {
    const fields = actual[t.destination].split(',')
    requireThat(new Set(fields).size === fields.length && fields.length === 8)
    for (const flag of ['rw', ...FLAGS]) requireThat(fields.includes(flag))
    for (const field of [
      `size=${t.bytes}`,
      'uid=1000',
      'gid=1000',
      'mode=0700'
    ])
      requireThat(fields.includes(field))
  }
}

/** Reject every security/resource projection mismatch; retain the full raw inspect. */
export function verifyInspect(raw, record, running = true) {
  const c = record.config,
    h = raw?.HostConfig,
    config = raw?.Config
  requireThat(
    raw &&
      ID.test(raw.Id) &&
      raw.Id === record.id &&
      raw.Name === `/${record.name}`
  )
  requireThat(
    raw.Image === c.imageId && config?.Image === c.imageId && h && config
  )
  requireThat(
    same(config.Labels ?? {}, record.labels) &&
      config.User === c.user &&
      config.WorkingDir === c.workingDir
  )
  requireThat(
    same(config.Entrypoint, c.entrypoint) &&
      same(config.Cmd, c.cmd) &&
      config.Tty === false &&
      config.OpenStdin === true
  )
  requireThat(
    h.ReadonlyRootfs === true &&
      h.Privileged === false &&
      same(h.CapDrop, c.capDrop) &&
      same(h.SecurityOpt, c.securityOpt)
  )
  requireThat(
    (h.Devices?.length ?? 0) === 0 &&
      (h.DeviceRequests?.length ?? 0) === 0 &&
      (h.CapAdd?.length ?? 0) === 0
  )
  requireThat(
    h.NetworkMode === c.networkMode &&
      ['', 'private'].includes(h.PidMode) &&
      h.IpcMode === 'private' &&
      h.CgroupnsMode === 'private'
  )
  requireThat(
    same(h.PortBindings ?? {}, {}) &&
      h.PublishAllPorts === false &&
      (h.ExtraHosts?.length ?? 0) === 0
  )
  requireThat(
    h.Memory === c.memoryBytes &&
      h.NanoCpus === c.nanoCpus &&
      h.PidsLimit === c.pidsLimit
  )
  requireThat(
    same(h.Ulimits, [{ Name: 'nofile', Soft: 256, Hard: 256 }]) &&
      h.LogConfig?.Type === 'none'
  )
  inspectTmpfs(h.Tmpfs, c.tmpfs)
  const mounts = raw.Mounts
  requireThat(
    Array.isArray(mounts) &&
      mounts.length >= c.mounts.length &&
      mounts.length <= c.mounts.length + c.tmpfs.length
  )
  requireThat(new Set(mounts.map((m) => m.Destination)).size === mounts.length)
  for (const m of mounts) {
    const intended = c.mounts.find((x) => x.destination === m.Destination)
    if (intended)
      requireThat(
        m.Type === 'bind' && m.Source === intended.source && m.RW === false
      )
    else
      requireThat(
        m.Type === 'tmpfs' &&
          c.tmpfs.some((x) => x.destination === m.Destination)
      )
  }
  for (const m of c.mounts)
    requireThat(mounts.some((x) => x.Destination === m.destination))
  requireThat(raw.State && raw.State.Running === running)
  if (running)
    requireThat(Number.isSafeInteger(raw.State.Pid) && raw.State.Pid > 0)
  return true
}

export function verifyNamespaces(observer, client, hostNamespaces) {
  const loopbackRoute = (value) => {
    if (value === '::1/128') return true
    if (typeof value !== 'string' || !/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(value))
      return false
    const [address, prefix] = value.split('/'),
      parts = address.split('.').map(Number)
    return (
      parts[0] === 127 &&
      parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
      Number(prefix) >= 8 &&
      Number(prefix) <= 32
    )
  }
  for (const ready of [observer, client]) {
    requireThat(
      ready.uid === 1000 &&
        ready.gid === 1000 &&
        ready.pid === 1 &&
        ready.hostMarkerAbsent === true
    )
    requireThat(
      same(ready.interfaces, ['lo']) && ready.routes.every(loopbackRoute)
    )
    requireThat(
      ready.pidNamespace !== hostNamespaces.pid &&
        ready.netNamespace !== hostNamespaces.net
    )
  }
  requireThat(
    observer.pidNamespace !== client.pidNamespace &&
      observer.netNamespace === client.netNamespace
  )
  return true
}
