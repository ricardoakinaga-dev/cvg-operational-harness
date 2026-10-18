// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { freezeHostGraph } from './bootstrap.mjs'
import { createProbeRunner } from './controller.mjs'
import {
  PINS,
  nativeInvocation,
  sha256,
  canonical,
  encodeRawFrames,
  parseHostCommand,
  RESPONSE_HEADERS,
  RESPONSE_BODY,
  STDIN_TEXT
} from './protocol.mjs'
import { probeError } from './schema.mjs'
import { assertEvidenceBindings } from './report.mjs'
import { createEvidence } from './evidence.mjs'

const result = (stdout = '', exitCode = 0, stderr = '') => ({
  stdout: Buffer.from(stdout),
  stderr: Buffer.from(stderr),
  exitCode,
  nativeError: null
})
const value = (args, flag) =>
  args.includes(flag)
    ? args[args.indexOf(flag) + 1]
    : args.find((s) => s.startsWith(`${flag}=`))?.slice(flag.length + 1)
const repeated = (args, flag) =>
  args.flatMap((s, i) => (s === flag ? [args[i + 1]] : []))

/** Explicit in-memory Engine peer. It never invokes Docker, HTTP or Claude. */
class SimulatedDocker {
  constructor(knobs = {}) {
    this.knobs = knobs
    this.containers = new Map()
    this.records = []
    this.calls = []
    this.starts = []
    this.sourceCause = probeError('TIMEOUT')
    this.budgets = {}
  }
  async call(args) {
    this.calls.push([...args])
    if (args[0] === 'version') return result('1.52 1.44\n')
    if (args[0] === 'image')
      return result(
        JSON.stringify([
          {
            Id: PINS.imageId,
            Config: { Labels: {}, Env: ['PATH=/usr/bin:/bin'] }
          }
        ])
      )
    if (args[0] === 'create') {
      const labels = Object.fromEntries(
        repeated(args, '--label').map((s) => {
          const i = s.indexOf('=')
          return [s.slice(0, i), s.slice(i + 1)]
        })
      )
      const role = labels['cvg.role'],
        id = (role === 'observer' ? 'a' : 'b').repeat(64)
      const mounts = repeated(args, '--mount').map((s) => {
        const pairs = Object.fromEntries(s.split(',').map((f) => f.split('=')))
        return {
          Type: pairs.type,
          Source: pairs.source,
          Destination: pairs.destination,
          RW: !s.endsWith(',readonly')
        }
      })
      const tmpfs = Object.fromEntries(
        repeated(args, '--tmpfs').map((s) => {
          const i = s.indexOf(':')
          return [s.slice(0, i), s.slice(i + 1)]
        })
      )
      const raw = {
        Id: id,
        Name: `/${value(args, '--name')}`,
        Image: PINS.imageId,
        Config: {
          Image: PINS.imageId,
          Labels: labels,
          User: value(args, '--user'),
          WorkingDir: value(args, '--workdir'),
          Entrypoint: [value(args, '--entrypoint')],
          Cmd: args.slice(args.indexOf(PINS.imageId) + 1),
          Tty: false,
          OpenStdin: true
        },
        HostConfig: {
          ReadonlyRootfs: args.includes('--read-only'),
          Privileged: false,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          Devices: [],
          DeviceRequests: [],
          CapAdd: [],
          NetworkMode: value(args, '--network'),
          PidMode: '',
          IpcMode: 'private',
          CgroupnsMode: 'private',
          PortBindings: {},
          PublishAllPorts: false,
          ExtraHosts: [],
          Memory: Number(value(args, '--memory')),
          NanoCpus: Number(value(args, '--cpus')) * 1e9,
          PidsLimit: Number(value(args, '--pids-limit')),
          Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }],
          LogConfig: { Type: 'none' },
          Tmpfs: tmpfs
        },
        Mounts: mounts,
        State: {
          Running: false,
          Pid: role === 'observer' ? 10001 : 10002,
          ExitCode: 0
        }
      }
      this.containers.set(id, {
        role,
        id,
        raw,
        callbacks: null,
        seq: 0,
        commandSeq: 0,
        runId: raw.Config.Cmd[1],
        port: 34567
      })
      if (this.knobs.lostReply && role === 'observer') throw this.sourceCause
      return result(`${id}\n`)
    }
    if (args[0] !== 'container') throw new Error('Unexpected simulated command')
    const sub = args[1],
      identity = args[2]
    if (sub === 'inspect') {
      const record = [...this.containers.values()].find(
        (r) => r.id === identity || r.raw.Name === `/${identity}`
      )
      if (!record)
        return result('\n', 1, `error: no such container: ${identity}\n`)
      const raw = structuredClone(record.raw)
      if (this.knobs.writableMount && record.role === 'client')
        raw.Mounts[0].RW = true
      return result(JSON.stringify([raw]))
    }
    if (sub === 'start') {
      const record = this.containers.get(identity)
      record.raw.State.Running = true
      if (record.role === 'observer')
        this.emit(record, 'READY', {
          ...this.preflight(record),
          port: record.port
        })
      return result(`${identity}\n`)
    }
    if (sub === 'top') return result('PID PPID COMMAND\n10002 1 node\n')
    if (sub === 'stop') {
      const record = this.containers.get(args.at(-1))
      if (record) record.raw.State.Running = false
      return result()
    }
    if (sub === 'rm') {
      const record = this.containers.get(args.at(-1))
      if (this.knobs.cleanupUnavailable) throw probeError('CLEANUP')
      if (record) this.containers.delete(record.id)
      return result()
    }
    throw new Error('Unexpected simulated lifecycle operation')
  }
  preflight(record) {
    return {
      uid: 1000,
      gid: 1000,
      pid: 1,
      pidNamespace: record.role === 'observer' ? '101' : '102',
      netNamespace: '201',
      interfaces: ['lo'],
      routes: [],
      hostMarkerAbsent: true
    }
  }
  emit(record, type, payload = {}) {
    if (this.knobs.orphanBody && ['REQUEST', 'RESPONSE'].includes(type)) return
    record.callbacks.onStdout(
      Buffer.from(
        JSON.stringify({
          version: 1,
          runId: record.runId,
          role: record.role,
          seq: record.seq++,
          type,
          payload
        }) + '\n'
      )
    )
  }
  raw(record, bytes, phaseOrOrdinal, channel) {
    for (const frame of encodeRawFrames(
      Buffer.from(bytes),
      record.role,
      phaseOrOrdinal,
      channel
    ))
      record.callbacks.onStderr(frame)
  }
  async attach(id, callbacks) {
    const record = this.containers.get(id)
    record.callbacks = callbacks
    return {
      send: async (bytes) => {
        const command = parseHostCommand(
          bytes,
          record.role,
          record.runId,
          record.commandSeq++
        )
        await this.knobs.beforeCommand?.(record, command, this)
        if (command.type === 'CONFIGURE') {
          record.port = command.payload.port
          this.emit(record, 'READY', {
            ...this.preflight(record),
            ...command.payload,
            ...(this.knobs.wrongEcho ? { port: record.port + 1 } : {})
          })
        } else if (command.type === 'ARM_PORT')
          this.emit(record, 'ARMED', { phase: 'port', port: record.port })
        else if (
          command.type === 'START_NATIVE' ||
          command.type === 'START_PORT'
        ) {
          const phase = command.type === 'START_NATIVE' ? 'version' : 'port'
          this.starts.push(phase)
          const invocation = nativeInvocation(record.port),
            argv =
              phase === 'version' ? invocation.versionArgs : invocation.args
          this.emit(record, 'NATIVE_START', {
            phase,
            pid: phase === 'version' ? 7 : 8,
            ppid: 1,
            argvSha256: sha256(canonical([invocation.file, ...argv])),
            envSha256: sha256(canonical(invocation.env)),
            stdinSha256: sha256(
              phase === 'version' ? Buffer.alloc(0) : invocation.stdin
            )
          })
          if (phase === 'version') {
            this.raw(
              record,
              this.knobs.wrongVersion
                ? '0.0.0 (Claude Code)\n'
                : '2.1.302 (Claude Code)\n',
              phase,
              'stdout'
            )
          } else if (!this.knobs.noPort) {
            const observer = [...this.containers.values()].find(
              (r) => r.role === 'observer'
            )
            const body = Buffer.from(
              JSON.stringify({
                messages: [{ role: 'user', content: STDIN_TEXT }]
              })
            )
            this.raw(observer, body, 0)
            this.raw(observer, '', 0)
            this.emit(observer, 'REQUEST', {
              phase: 'port',
              ordinal: 0,
              method: 'POST',
              path: '/v1/messages',
              bodySha256: sha256(body),
              bytes: body.length,
              markerVerified: true,
              contentType: 'JSON',
              contentEncoding: 'IDENTITY'
            })
            this.emit(observer, 'RESPONSE', {
              phase: 'port',
              ordinal: 0,
              status: 503,
              headersSha256: sha256(canonical(RESPONSE_HEADERS)),
              bodySha256: sha256(RESPONSE_BODY),
              outcome: this.knobs.responseFailed ? 'FAILED' : 'FINISHED'
            })
            if (this.knobs.forbiddenAuth)
              this.emit(observer, 'REJECTED', {
                reason: 'FORBIDDEN_AUTH',
                ordinal: 1
              })
          }
          this.raw(record, '', phase, 'stdout')
          this.raw(record, '', phase, 'stderr')
          this.emit(record, 'NATIVE_END', {
            phase,
            exitCode: phase === 'version' ? 0 : 1,
            signal: null,
            timeout: false
          })
          if (phase === 'version' && this.knobs.wrongVersion) {
            record.raw.State.Running = false
            record.raw.State.ExitCode = 1
            callbacks.onEnd()
          }
        } else if (command.type === 'STOP') {
          this.emit(record, 'CLOSED')
          record.raw.State.Running = false
          if (this.knobs.nonzeroWrapper && record.role === 'client')
            record.raw.State.ExitCode = 1
          callbacks.onEnd()
        }
      },
      close() {}
    }
  }
  async closeAttachments() {}
}

async function scenario(knobs, fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'native-port-simulated-'))
  const docker = new SimulatedDocker(knobs)
  docker.evidenceRoot = root
  const graph = knobs.frozenGraph ? await freezeHostGraph(root) : null
  const factory = graph
    ? (
        await import(
          pathToFileURL(
            path.join(
              graph.root,
              'tests/claude100/reference-port/controller.mjs'
            )
          ).href
        )
      ).createProbeRunner
    : createProbeRunner
  const runner = factory({
    pinToolchains: async (_pins, observed) =>
      Object.assign(observed, {
        claudeSha256: PINS.claudeSha256,
        nodeSha256: PINS.nodeSha256,
        dockerSha256: PINS.dockerSha256
      }),
    transportFactory: () => docker,
    hostNamespaces: async () => ({ pid: '1', net: '2' }),
    ...(knobs.failIntentWrite
      ? {
          createEvidence: async (...args) => {
            const evidence = await createEvidence(...args),
              add = evidence.addJson.bind(evidence)
            evidence.addJson = async (role, ...rest) => {
              if (role === 'create-intents') throw probeError('IO')
              return add(role, ...rest)
            }
            return evidence
          }
        }
      : {})
  })
  try {
    await writeFile(
      path.join(root, 'manifest.json'),
      knobs.manifestBytes ??
        JSON.stringify({
          version: 1,
          runId: 'synthetic_full_flow',
          fixtureId: 'NATIVE_PORT_503_V1'
        })
    )
    const result = await runner(
      {
        manifest: 'manifest.json',
        evidenceRoot: root,
        out: 'result'
      },
      graph,
      knobs.onSignalOwnership
    )
    return await fn(result, docker, root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('NP01–NP08 controller integration — entirely simulated Engine/native peer', () => {
  it('rejects duplicate raw input before any Engine call or native launch', () =>
    scenario(
      {
        manifestBytes:
          '{"version":1,"version":1,"runId":"a","fixtureId":"NATIVE_PORT_503_V1"}'
      },
      (r, docker) => {
        expect(r.report?.status, r.error?.stack).toBe('INVALID_INPUT')
        expect(docker.calls).toEqual([])
        expect(docker.starts).toEqual([])
      }
    ))
  it('publishes exact recon evidence and preserves actual nonzero native port exit', () =>
    scenario({}, async (r, docker, root) => {
      expect(r.report?.status, r.error?.stack).toBe('PORT_OBSERVED')
      expect(r.exitCode).toBe(0)
      expect(r.report.nativeExecution.portProbe.exitCode).toBe(1)
      expect(r.report.limitations).toContain(
        'SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE'
      )
      expect(docker.starts).toEqual(['version', 'port'])
      expect(docker.containers.size).toBe(0)
      expect(
        JSON.parse(
          await readFile(path.join(root, 'result/report.json'), 'utf8')
        )
      ).toEqual(r.report)
      const retained = new Map(
        await Promise.all(
          r.report.artifacts.map(async (a) => [
            a.path,
            await readFile(path.join(root, a.path))
          ])
        )
      )
      expect(assertEvidenceBindings(r.report, retained)).toBe(r.report)
      const body = r.report.observations[0].bodyPath
      retained.set(
        body,
        Buffer.from('rehashed claims cannot replace the retained bytes')
      )
      expect(() => assertEvidenceBindings(r.report, retained)).toThrow()
    }))
  it('blocks configuration mismatch before either native spawn', () =>
    scenario({ wrongEcho: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('BLOCKED_CONTAINMENT')
      expect(docker.starts).toEqual([])
      expect(docker.containers.size).toBe(0)
    }))
  it('rejects actual inspect projection divergence before native launch', () =>
    scenario({ writableMount: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('BLOCKED_CONTAINMENT')
      expect(docker.starts).toEqual([])
      expect(docker.containers.size).toBe(0)
    }))
  it('does not infer a successful version or launch the prompt after a mismatch', () =>
    scenario({ wrongVersion: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INVALID_INPUT')
      expect(docker.starts).toEqual(['version'])
      expect(docker.containers.size).toBe(0)
    }))
  it('classifies a clean absence without manufacturing an HTTP observation', () =>
    scenario({ noPort: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('PORT_NOT_OBSERVED')
      expect(r.report.observations).toEqual([])
      expect(docker.containers.size).toBe(0)
    }))
  it('never lets an earlier eligible POST override forbidden authentication', () =>
    scenario({ forbiddenAuth: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(
        r.report.containmentChecks.find((c) => c.id === 'PRIVACY_CAPS').status
      ).toBe('FAIL')
      expect(docker.containers.size).toBe(0)
    }))
  it('reconciles a lost create reply once and cleans only the proven identity', () =>
    scenario({ lostReply: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(docker.calls.filter((a) => a[0] === 'create').length).toBe(1)
      expect(docker.starts).toEqual([])
      expect(docker.containers.size).toBe(0)
      expect(r.error.errors).toContain(docker.sourceCause)
    }))
  it('rejects an unfinished response despite an eligible request', () =>
    scenario({ responseFailed: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(
        r.report.containmentChecks.find((c) => c.id === 'HTTP_EXCHANGE').status
      ).toBe('FAIL')
      expect(docker.containers.size).toBe(0)
    }))
  it('preserves privacy and cleanup failures together', () =>
    scenario({ forbiddenAuth: true, cleanupUnavailable: true }, (r) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(r.error.errors[0].code).toBe('PRIVACY')
      expect(r.error.errors.some((e) => e.code === 'CLEANUP')).toBe(true)
      for (const id of ['PRIVACY_CAPS', 'CLEANUP'])
        expect(r.report.containmentChecks.find((c) => c.id === id).status).toBe(
          'FAIL'
        )
    }))
  it('retains unresolved owned resources and denies success when cleanup is unavailable', () =>
    scenario({ cleanupUnavailable: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(
        r.report.containmentChecks.find((c) => c.id === 'CLEANUP').status
      ).toBe('FAIL')
      expect(docker.containers.size).toBe(2)
    }))
})

describe('R1 mandatory counterexamples — regression controls', () => {
  it('transfers entry signal ownership after copied controller handlers exist', async () => {
    const entry = () => {},
      before = process.listenerCount('SIGINT')
    let transferred = false
    process.on('SIGINT', entry)
    try {
      await scenario(
        {
          frozenGraph: true,
          onSignalOwnership: () => {
            expect(process.listenerCount('SIGINT')).toBe(before + 2)
            process.off('SIGINT', entry)
            transferred = true
          }
        },
        (r) => {
          expect(r.report?.status, r.error?.stack).toBe('PORT_OBSERVED')
          expect(transferred).toBe(true)
          expect(process.listenerCount('SIGINT')).toBe(before)
        }
      )
    } finally {
      process.off('SIGINT', entry)
    }
  })
  it('proves cleanup of an unattempted create without requiring a future durable intent', () =>
    scenario({ failIntentWrite: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(docker.calls.filter((a) => a[0] === 'create')).toHaveLength(0)
      expect(docker.containers.size).toBe(0)
      expect(
        r.report.containmentChecks.find((c) => c.id === 'CLEANUP').status
      ).toBe('PASS')
    }))
  it('executes the frozen host module graph and disposes it before publication', () =>
    scenario({ frozenGraph: true }, async (r, docker, root) => {
      expect(r.report?.status, r.error?.stack).toBe('PORT_OBSERVED')
      expect(docker.containers.size).toBe(0)
      const cleanup = r.report.artifacts.find((a) => a.role === 'cleanup')
      expect(
        JSON.parse(await readFile(path.join(root, cleanup.path)))
          .bootstrapDisposed
      ).toBe(true)
      const trace = r.report.artifacts.find((a) => a.role === 'control-trace')
      const records = JSON.parse(
        await readFile(path.join(root, trace.path))
      ).records
      expect(
        records.find((r) => r.type === 'BOOTSTRAP_GRAPH').data.entries
      ).toHaveLength(20)
    }))
  it.each([
    'inputs/workspace/settings.json',
    'inputs/workspace/mcp.json',
    'inputs/profile.json',
    'inputs/consumed-inputs.json',
    'inputs/bundle-inventory.json',
    'inputs/stdin.txt'
  ])(
    'rejects physical mutation of %s despite the unchanged retained memory',
    (relative) =>
      scenario(
        {
          beforeCommand: async (_record, command, docker) => {
            if (command.type === 'START_NATIVE')
              await writeFile(
                path.join(docker.evidenceRoot, 'result', relative),
                'CVG_SYNTHETIC_DRIFT'
              )
          }
        },
        (r, docker) => {
          expect(r.exitCode).toBe(1)
          expect(r.report?.status).not.toBe('PORT_OBSERVED')
          expect(r.error.errors.some((e) => e.code === 'DRIFT_RUNTIME')).toBe(
            true
          )
          expect(docker.containers.size).toBe(0)
        }
      )
  )
  it('invalidates the empty bind inventory when a new file appears', () =>
    scenario(
      {
        beforeCommand: async (_record, command, docker) => {
          if (command.type === 'START_NATIVE')
            await writeFile(
              path.join(
                docker.evidenceRoot,
                'result/inputs/empty-volume/unlisted'
              ),
              'synthetic'
            )
        }
      },
      (r, docker) => {
        expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
        expect(
          r.report.containmentChecks.find((c) => c.id === 'DRIFT').status
        ).toBe('FAIL')
        expect(docker.containers.size).toBe(0)
      }
    ))
  it('classifies body without trusted events as protocol failure', () =>
    scenario({ orphanBody: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(r.error.errors.some((e) => e.code === 'PROTOCOL')).toBe(true)
      expect(docker.containers.size).toBe(0)
    }))
  it('removes both owned identities after observing a nonzero wrapper exit', () =>
    scenario({ nonzeroWrapper: true }, (r, docker) => {
      expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
      expect(r.error.errors.some((e) => e.code === 'IO')).toBe(true)
      expect(docker.containers.size).toBe(0)
      expect(
        docker.calls.filter((a) => a[0] === 'container' && a[1] === 'rm')
      ).toHaveLength(2)
      expect(
        r.report.containmentChecks.find((c) => c.id === 'CLEANUP').status
      ).toBe('PASS')
    }))
  it.each([
    { knobs: {}, expected: 'PORT_OBSERVED' },
    { knobs: { forbiddenAuth: true }, expected: 'INFRA_FAILURE' },
    { knobs: { nonzeroWrapper: true }, expected: 'INFRA_FAILURE' }
  ])(
    'recomputes every reached containment proof for $expected',
    ({ knobs, expected }) =>
      scenario(knobs, async (r, _docker, root) => {
        expect(r.report?.status, r.error?.stack).toBe(expected)
        const original = new Map(
          await Promise.all(
            r.report.artifacts.map(async (a) => [
              a.path,
              await readFile(path.join(root, a.path))
            ])
          )
        )
        const changes = [
          [
            'cleanup.json',
            (v) => {
              v.markerRemoved = false
            }
          ],
          [
            'control-trace.json',
            (v) => {
              v.records.find(
                (r) => r.type === 'PINNED_TOOLCHAINS'
              ).data.observed.nodeSha256 = 'd'.repeat(64)
            }
          ],
          [
            'control-trace.json',
            (v) => {
              v.records.find(
                (r) => r.type === 'NO_VERSION_DESCENDANTS'
              ).data.stdoutBase64 = Buffer.from(
                'PID PPID COMMAND\n10002 1 node\n10003 10002 unexpected\n'
              ).toString('base64')
            },
            'NATIVE_LINEAGE'
          ],
          [
            'control-trace.json',
            (v) => {
              for (const i of v.records.find(
                (r) => r.type === 'FINAL_INPUT_IDENTITIES'
              ).data)
                if (i.path.endsWith('/inputs/workspace/settings.json'))
                  i.sha256 = 'd'.repeat(64)
            }
          ],
          [
            'inspect-client.json',
            (v) => {
              v.HostConfig.Privileged = true
            }
          ],
          [
            'preflight-client.json',
            (v) => {
              v.uid = 0
            }
          ],
          [
            'preflight-observer.json',
            (v) => {
              v.hostMarkerAbsent = false
            }
          ],
          [
            'preflight-client.json',
            (v) => {
              v.pidNamespace = '1'
            }
          ]
        ]
        expect(assertEvidenceBindings(r.report, original)).toBe(r.report)
        for (const [suffix, mutate, requiresPass] of changes) {
          if (
            requiresPass &&
            r.report.containmentChecks.find((c) => c.id === requiresPass)
              .status !== 'PASS'
          )
            continue
          const report = structuredClone(r.report),
            retained = new Map(original)
          const artifact = report.artifacts.find((a) =>
            a.path.endsWith('/' + suffix)
          )
          const value = JSON.parse(retained.get(artifact.path))
          mutate(value)
          const bytes = Buffer.from(canonical(value))
          retained.set(artifact.path, bytes)
          artifact.bytes = bytes.length
          artifact.sha256 = sha256(bytes)
          expect(() => assertEvidenceBindings(report, retained)).toThrow()
        }
        const badVersion = structuredClone(r.report)
        badVersion.nativeExecution.versionProbe.exitCode = 3
        expect(() => assertEvidenceBindings(badVersion, original)).toThrow()
      })
  )
  it.each(['SIGINT', 'SIGTERM'])(
    'routes %s through cleanup and restores signal listeners',
    (signal) => {
      const before = process.listenerCount(signal)
      return scenario(
        {
          beforeCommand: async (_record, command) => {
            if (command.type === 'START_PORT') process.emit(signal)
          }
        },
        (r, docker) => {
          expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
          expect(r.error.errors[0].code).toBe('SIGNAL')
          expect(docker.containers.size).toBe(0)
          expect(process.listenerCount(signal)).toBe(before)
        }
      )
    }
  )
})

async function failureLedgerSpecimen(r, root) {
  expect(r.report?.status, r.error?.stack).toBe('INFRA_FAILURE')
  const retained = new Map(
    await Promise.all(
      r.report.artifacts.map(async (a) => [
        a.path,
        await readFile(path.join(root, a.path))
      ])
    )
  )
  expect(assertEvidenceBindings(r.report, retained)).toBe(r.report)
  const artifact = r.report.artifacts.find((a) => a.role === 'failures')
  const failures = JSON.parse(retained.get(artifact.path))
  expect(failures[0].code).toBe('PRIVACY')
  expect(failures.slice(1).every((f) => f.code === 'CLEANUP')).toBe(true)
  return { retained, failures }
}
function replaceProofArtifact(report, retained, role, document) {
  const artifact = report.artifacts.find((a) => a.role === role),
    bytes = Buffer.from(canonical(document))
  retained.set(artifact.path, bytes)
  artifact.sha256 = sha256(bytes)
  artifact.bytes = bytes.length
}
const ledgerMutations = [
  ['drop_primary', (f) => f.slice(1)],
  ['drop_additional', (f) => f.slice(0, -1)],
  ['reverse_chronology', (f) => [...f].reverse()],
  ['duplicate_primary', (f) => [f[0], ...f]],
  [
    'unrelated_reference',
    (f) => [{ ...f[0], artifactRef: f[1].artifactRef }, ...f.slice(1)]
  ],
  ['nonconsecutive_order', (f) => [{ ...f[0], order: 99 }, ...f.slice(1)]],
  [
    'unknown_field',
    (f) => [{ ...f[0], invented: 'CVG_SYNTHETIC_FIELD' }, ...f.slice(1)]
  ],
  ['unknown_code', (f) => [{ ...f[0], code: 'CVG_UNKNOWN' }, ...f.slice(1)]],
  [
    'unknown_source',
    (f) => [{ ...f[0], source: 'CVG_UNKNOWN' }, ...f.slice(1)]
  ],
  ['unknown_phase', (f) => [{ ...f[0], phase: 'CVG_UNKNOWN' }, ...f.slice(1)]]
]
describe('LR01–LR03 exact ordered failure-ledger recovery', () => {
  it.each(ledgerMutations)(
    'rejects rehashed %s while preserving the original trusted trace',
    (_name, mutate) =>
      scenario(
        { forbiddenAuth: true, cleanupUnavailable: true },
        async (r, _docker, root) => {
          const { retained, failures } = await failureLedgerSpecimen(r, root)
          const changed = structuredClone(r.report)
          replaceProofArtifact(changed, retained, 'failures', mutate(failures))
          expect(() => assertEvidenceBindings(changed, retained)).toThrow()
        }
      )
  )
  it.each([
    { records: 1024, kind: 'tail', accepts: true },
    { records: 1023, kind: 'tail', accepts: false },
    { records: 1025, kind: 'tail', accepts: false },
    { records: 1024, kind: 'replace_primary', accepts: false },
    { records: 1024, kind: 'interleave', accepts: false },
    { records: 1024, kind: 'unknown_code', accepts: false },
    { records: 1024, kind: 'unknown_source', accepts: false },
    { records: 1024, kind: 'unknown_phase', accepts: false }
  ])(
    'handles explicit synthetic record-cap/null data: $records/$kind',
    ({ records: count, kind, accepts }) =>
      scenario(
        { forbiddenAuth: true, cleanupUnavailable: true },
        async (r, _docker, root) => {
          const { retained, failures } = await failureLedgerSpecimen(r, root),
            changed = structuredClone(r.report)
          const control = JSON.parse(
            retained.get(
              changed.artifacts.find((a) => a.role === 'control-trace').path
            )
          )
          const observer = JSON.parse(
            retained.get(
              changed.artifacts.find((a) => a.role === 'observer-trace').path
            )
          )
          const all = [...control.records, ...observer.records].sort(
            (a, b) => a.ordinal - b.ordinal
          )
          for (let ordinal = all.length; ordinal < count; ordinal++)
            control.records.push({
              ordinal,
              offsetMs: all.at(-1).offsetMs,
              source: 'HOST',
              type: 'SYNTHETIC_RECORD_CAP_FIXTURE',
              data: {}
            })
          const tail = {
            code: 'IO',
            source: 'HOST',
            phase: 'PUBLICATION',
            order: failures.length,
            artifactRef: null
          }
          let declared = [...failures, tail]
          if (kind === 'replace_primary')
            declared = [
              { ...failures[0], artifactRef: null },
              ...failures.slice(1)
            ]
          if (kind === 'interleave') declared = [tail, ...failures]
          if (kind === 'unknown_code') tail.code = 'CVG_UNKNOWN'
          if (kind === 'unknown_source') tail.source = 'CVG_UNKNOWN'
          if (kind === 'unknown_phase') tail.phase = 'CVG_UNKNOWN'
          replaceProofArtifact(changed, retained, 'control-trace', control)
          replaceProofArtifact(changed, retained, 'failures', declared)
          if (accepts)
            expect(assertEvidenceBindings(changed, retained)).toBe(changed)
          else expect(() => assertEvidenceBindings(changed, retained)).toThrow()
        }
      )
  )
})

describe('OR01–OR02 physical trace ownership before global chronology', () => {
  it.each([
    'primary_failure',
    'all_failures',
    'client_frame',
    'observer_frame'
  ])(
    'rejects rehashed relocation of %s with byte-identical ledger and unchanged global union',
    (kind) =>
      scenario(
        { forbiddenAuth: true, cleanupUnavailable: true },
        async (r, _docker, root) => {
          const { retained } = await failureLedgerSpecimen(r, root),
            changed = structuredClone(r.report)
          const controls = changed.artifacts.find(
            (a) => a.role === 'control-trace'
          )
          const observers = changed.artifacts.find(
            (a) => a.role === 'observer-trace'
          )
          const failures = changed.artifacts.find((a) => a.role === 'failures')
          const originalLedger = Buffer.from(retained.get(failures.path))
          const control = JSON.parse(retained.get(controls.path)),
            observer = JSON.parse(retained.get(observers.path))
          const before = [...control.records, ...observer.records].sort(
            (a, b) => a.ordinal - b.ordinal
          )
          const from = kind === 'observer_frame' ? observer : control
          const to = kind === 'observer_frame' ? control : observer
          const selected =
            kind === 'all_failures'
              ? from.records.filter(
                  (r) => r.source === 'HOST' && r.type === 'FAILURE'
                )
              : [
                  from.records.find((r) =>
                    kind === 'primary_failure'
                      ? r.source === 'HOST' && r.type === 'FAILURE'
                      : r.source ===
                          (kind === 'client_frame' ? 'client' : 'observer') &&
                        r.type === 'FRAME'
                  )
                ]
          expect(selected.length).toBeGreaterThan(0)
          expect(selected.every(Boolean)).toBe(true)
          from.records = from.records.filter((r) => !selected.includes(r))
          to.records = [...to.records, ...selected].sort(
            (a, b) => a.ordinal - b.ordinal
          )
          expect(
            [...control.records, ...observer.records].sort(
              (a, b) => a.ordinal - b.ordinal
            )
          ).toEqual(before)
          replaceProofArtifact(changed, retained, 'control-trace', control)
          replaceProofArtifact(changed, retained, 'observer-trace', observer)
          expect(retained.get(failures.path)).toEqual(originalLedger)
          expect(() => assertEvidenceBindings(changed, retained)).toThrow()
        }
      )
  )
})
