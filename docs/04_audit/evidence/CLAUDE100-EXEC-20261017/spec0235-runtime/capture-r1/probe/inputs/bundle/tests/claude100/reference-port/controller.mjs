import { randomBytes } from 'node:crypto'
import { readlink } from 'node:fs/promises'
import { createEvidence, closePins, pinFile, sha256 } from './evidence.mjs'
import path from 'node:path'
import { prepareInputs, pinToolchains, createHostMarker } from './inputs.mjs'
import { parseManifest, probeError } from './schema.mjs'
import {
  PINS,
  nativeInvocation,
  encodeCommand,
  versionMatches,
  canonical,
  RESPONSE_BODY,
  RESPONSE_HEADERS
} from './protocol.mjs'
import {
  makeConfig,
  createArgs,
  verifyInspect,
  verifyNamespaces
} from './profile.mjs'
import { DockerTransport } from './docker.mjs'
import { Capture } from './capture.mjs'
import { RunState } from './run-state.mjs'
import { BUILTIN_ALLOWLIST } from './bootstrap.mjs'
import { expectedDigests, persistReport } from './report.mjs'
import { parseStrictJson } from '../qualification/strict-json.mjs'

const ID = /^[a-f0-9]{64}$/
const equal = (a, b) => canonical(a) === canonical(b)
const missing = (result) =>
  result.exitCode === 1 &&
  /no such (?:object|container)/i.test(result.stderr.toString('utf8'))
const decoded = (result) => {
  if (result.exitCode !== 0) throw probeError('IO', result.nativeError)
  return parseStrictJson(result.stdout, {
    maxBytes: 65536,
    maxDepth: 64,
    maxStringBytes: 65536
  })
}
function ownership(raw, role) {
  return (
    raw?.Id === role.id &&
    raw.Name === `/${role.name}` &&
    raw.Image === PINS.imageId &&
    equal(raw.Config?.Labels ?? {}, role.labels)
  )
}
const hostNamespaces = async () => {
  const id = async (kind) => {
    const match = /\[(\d+)\]/.exec(await readlink(`/proc/self/ns/${kind}`))
    if (!match) throw probeError('CONTAINMENT')
    return match[1]
  }
  return { pid: await id('pid'), net: await id('net') }
}

/** Dependency substitutions are internal tests; the CLI always uses runProbe. */
export function createProbeRunner(dependencies = {}) {
  const simulated = Object.keys(dependencies).length !== 0
  return async function execute(
    options,
    graph = null,
    onSignalOwnership = null
  ) {
    const state = new RunState({
      now: dependencies.now,
      timestamp: dependencies.timestamp,
      simulated
    })
    const context = {
      state,
      evidence: null,
      inputs: null,
      manifest: null,
      docker: null,
      marker: null,
      observed: {
        claudeSha256: null,
        nodeSha256: null,
        dockerSha256: null,
        imageId: null
      },
      pins: [...(graph?.pins ?? [])],
      captures: {},
      roles: {},
      requests: new Map(),
      responses: new Map(),
      profileSha256: null,
      profile: null,
      commandSeq: { client: 0, observer: 0 },
      sent: { client: new Set(), observer: new Set() },
      cleanup: {
        containers: [],
        markerRemoved: false,
        attachmentsClosed: false,
        pinsClosed: false
      },
      nonce: randomBytes(16).toString('hex')
    }
    state.activeCheck = 'INPUTS'
    const fail = (cause, source = 'HOST', phase) => {
      state.failure(cause, source, phase ?? state.phase)
      const code = cause?.code
      const id = ['PRIVACY', 'CAP'].includes(code)
        ? 'PRIVACY_CAPS'
        : code === 'PROTOCOL'
          ? 'PHASES'
          : code === 'CLEANUP'
            ? 'CLEANUP'
            : code === 'DRIFT_RUNTIME'
              ? 'DRIFT'
              : state.activeCheck
      state.check(
        id,
        'FAIL',
        `Observed failure; see protected trace and cause ledger.`,
        ['control-trace']
      )
    }
    const cancelled = (signal) => {
      fail(probeError('SIGNAL'), 'HOST', state.phase)
      if (state.records.length < 1024)
        state.record('HOST', 'HOST_SIGNAL', { signal })
    }
    const signalHandlers = new Map(
      ['SIGINT', 'SIGTERM'].map((signal) => [signal, () => cancelled(signal)])
    )
    for (const [signal, handler] of signalHandlers) process.on(signal, handler)
    const removeSignalHandlers = () => {
      for (const [signal, handler] of signalHandlers)
        process.off(signal, handler)
    }
    async function verifyInputs() {
      try {
        if (context.inputs) await context.inputs.verifyManifest()
        for (const pin of context.pins) await pin.verify()
        if (context.evidence) await context.evidence.physicalArtifacts()
      } catch (cause) {
        throw probeError('DRIFT_RUNTIME', cause)
      }
    }
    async function call(args, cleanup = false) {
      if (!cleanup && state.errors.length) throw state.errors[0]
      try {
        return await context.docker.call(args, { cleanup })
      } catch (cause) {
        fail(cause, 'DOCKER')
        throw cause
      }
    }
    async function inspect(role, cleanup = false) {
      const result = await call(
        ['container', 'inspect', role.id ?? role.name],
        cleanup
      )
      if (missing(result)) return null
      const list = decoded(result)
      if (!Array.isArray(list) || list.length !== 1)
        throw probeError('PROTOCOL')
      return list[0]
    }
    async function command(role, type, payload = {}) {
      if (type !== 'STOP' && state.errors.length) throw state.errors[0]
      const target = context.roles[role]
      if (!target?.attachment || context.sent[role].has(type))
        throw probeError('PROTOCOL')
      const bytes = encodeCommand(
        context.manifest.runId,
        context.commandSeq[role]++,
        type,
        payload
      )
      state.record('HOST', 'COMMAND', {
        target: role,
        type,
        rawBase64: bytes.toString('base64')
      })
      context.sent[role].add(type)
      await target.attachment.send(bytes)
    }
    function received(role, frame, ordinal) {
      const record = context.roles[role],
        payload = frame.payload
      const fault = (code) =>
        Object.assign(probeError(code), { frameOrdinal: ordinal })
      if (frame.type === 'READY') {
        if (record.ready) throw fault('PROTOCOL')
        if (role === 'client' && !context.sent.client.has('CONFIGURE'))
          throw fault('PROTOCOL')
        record.ready = payload
        return
      }
      if (!record.ready) throw fault('PROTOCOL')
      if (frame.type === 'CLOSED') {
        if (!context.sent[role].has('STOP') || record.closed)
          throw fault('PROTOCOL')
        record.closed = true
        return
      }
      if (role === 'observer') {
        if (frame.type === 'ARMED') {
          if (
            !context.sent.observer.has('ARM_PORT') ||
            record.armed ||
            payload.port !== record.ready.port
          )
            throw fault('PROTOCOL')
          record.armed = true
          return
        }
        if (frame.type === 'REJECTED') {
          if (payload.reason === 'FORBIDDEN_AUTH') throw fault('PRIVACY')
          if (payload.reason === 'CAP') throw fault('CAP')
          if (payload.reason === 'EARLY_PHASE') throw fault('PROTOCOL')
          return
        }
        if (
          !record.armed ||
          !context.sent.client.has('START_PORT') ||
          context.sent.client.has('STOP')
        )
          throw fault('PROTOCOL')
        if (frame.type === 'REQUEST') {
          if (context.requests.has(payload.ordinal)) throw fault('PROTOCOL')
          context.requests.set(payload.ordinal, { frame, ordinal })
          return
        }
        if (frame.type === 'RESPONSE') {
          if (
            !context.requests.has(payload.ordinal) ||
            context.responses.has(payload.ordinal)
          )
            throw fault('PROTOCOL')
          if (
            payload.headersSha256 !== sha256(canonical(RESPONSE_HEADERS)) ||
            payload.bodySha256 !== sha256(RESPONSE_BODY)
          )
            throw fault('PROTOCOL')
          context.responses.set(payload.ordinal, { frame, ordinal })
          if (payload.outcome !== 'FINISHED') {
            state.check(
              'HTTP_EXCHANGE',
              'FAIL',
              'Protected local response did not finish.'
            )
            throw fault('IO')
          }
          return
        }
        throw fault('PROTOCOL')
      }
      if (!['NATIVE_START', 'NATIVE_END'].includes(frame.type))
        throw fault('PROTOCOL')
      const phase = payload.phase,
        expectedCommand = phase === 'version' ? 'START_NATIVE' : 'START_PORT'
      if (!context.sent.client.has(expectedCommand)) throw fault('PROTOCOL')
      const probe =
        state.nativeExecution[
          phase === 'version' ? 'versionProbe' : 'portProbe'
        ]
      if (frame.type === 'NATIVE_START') {
        if (probe.startedAt !== null) throw fault('PROTOCOL')
        const invocation = nativeInvocation(context.roles.observer.ready.port)
        const args =
          phase === 'version' ? invocation.versionArgs : invocation.args
        if (
          payload.ppid !== 1 ||
          payload.pid <= 1 ||
          payload.argvSha256 !==
            sha256(canonical([invocation.file, ...args])) ||
          payload.envSha256 !== sha256(canonical(invocation.env)) ||
          payload.stdinSha256 !==
            sha256(phase === 'version' ? Buffer.alloc(0) : invocation.stdin)
        )
          throw fault('PROTOCOL')
        probe.startedAt = state.timestamp()
        record[`${phase}Pid`] = payload.pid
      } else {
        if (probe.startedAt === null || probe.endedAt !== null)
          throw fault('PROTOCOL')
        Object.assign(probe, {
          endedAt: state.timestamp(),
          exitCode: payload.exitCode,
          timeout: payload.timeout,
          signal: payload.signal
        })
        if (payload.timeout) throw fault('TIMEOUT')
        if (payload.signal !== null) throw fault('SIGNAL')
        if (payload.exitCode === null) throw fault('PROTOCOL')
      }
    }
    async function attach(role) {
      const record = context.roles[role]
      const shared = (context.captureBudget ??= { control: 0, raw: 0 })
      const capture = (context.captures[role] = new Capture(
        role,
        context.manifest.runId,
        {
          shared,
          record: (source, type, data) => state.record(source, type, data),
          change: () => state.events.emit('change'),
          failure: (cause) => fail(cause, role),
          frame: (frame, ordinal) => received(role, frame, ordinal),
          rawFrame: ({ tag }) => {
            if (role === 'client') {
              if (
                !context.sent.client.has(
                  tag === 0 ? 'START_NATIVE' : 'START_PORT'
                )
              )
                throw probeError('PROTOCOL')
            } else if (
              !context.roles.observer.armed ||
              !context.sent.client.has('START_PORT') ||
              context.sent.client.has('STOP')
            )
              throw probeError('PROTOCOL')
          }
        }
      ))
      record.attachment = await context.docker.attach(record.id, {
        onStdout: (bytes) => capture.feedControl(bytes),
        onStderr: (bytes) => capture.feedRaw(bytes),
        onFailure: (cause) => fail(cause, role),
        onEnd: () => {
          capture.end()
          const version = state.nativeExecution.versionProbe
          if (
            role === 'client' &&
            !state.errors.length &&
            version.endedAt &&
            capture.nativeComplete('version') &&
            !versionMatches(capture.nativeBytes('version', 'stdout'), version)
          )
            fail(probeError('IDENTITY_MISMATCH'), role, 'VERSION')
          if (!record.ready) fail(probeError('CONTAINMENT'), role, 'PREFLIGHT')
          else if (!record.closed && !state.errors.length)
            fail(probeError('PROTOCOL'), role)
          state.events.emit('change')
        }
      })
    }
    async function create(role, imageLabels) {
      const suffix = sha256(context.manifest.runId + context.nonce).slice(0, 16)
      const record = (context.roles[role] = {
        role,
        id: null,
        name: `cvg-c100-rp-${role === 'observer' ? 'obs' : 'cli'}-${suffix}`,
        labels: {
          ...imageLabels,
          'cvg.task': 'C100-Q01-REF-PORT-001',
          'cvg.run-id': context.manifest.runId,
          'cvg.nonce': context.nonce,
          'cvg.role': role
        },
        config: makeConfig(role, {
          ...context.inputs,
          runId: context.manifest.runId,
          marker: context.marker.path,
          observerId: context.roles.observer?.id
        }),
        attempted: false,
        ready: null,
        closed: false,
        attachment: null
      })
      const intent = {
        runId: context.manifest.runId,
        nonce: context.nonce,
        role,
        name: record.name,
        imageId: PINS.imageId,
        configSha256: sha256(canonical(record.config)),
        labels: record.labels,
        attempted: true
      }
      state.record('HOST', 'CREATE_PREPARED', { ...intent, attempted: false })
      try {
        await context.evidence.addJson(
          'create-intents',
          `intents/${role}/create-intents.json`,
          intent
        )
      } catch (cause) {
        record.notCreated = true
        throw cause
      }
      state.record('HOST', 'CREATE_INTENT', intent)
      record.attempted = true
      let result
      try {
        result = await call(createArgs(record))
        if (
          result.exitCode !== 0 ||
          !ID.test(result.stdout.toString('utf8').trim())
        )
          throw probeError('IO', result.nativeError)
        record.id = result.stdout.toString('utf8').trim()
        state.record('HOST', 'CREATED', { role, id: record.id })
      } catch (primary) {
        // One exact-name reconciliation. Never repeat an uncertain create.
        try {
          const found = await inspect(record, true)
          if (found) {
            const recovered = { ...record, id: found.Id }
            verifyInspect(found, recovered, Boolean(found.State?.Running))
            record.id = found.Id
            state.record('HOST', 'RECOVERED_FOR_CLEANUP', {
              role,
              id: record.id
            })
          } else record.notCreated = true
        } catch (recovery) {
          fail(recovery, 'DOCKER')
          record.unresolved = true
        }
        throw primary
      }
      return record
    }
    async function cleanupAll() {
      state.phase = 'CLEANUP'
      state.activeCheck = 'CLEANUP'
      const deadline = context.docker?.cleanupDeadline ?? state.now() + 5000
      if (context.docker) context.docker.cleanupDeadline = deadline
      for (const role of ['client', 'observer']) {
        const record = context.roles[role]
        if (
          record?.attachment &&
          !record.closed &&
          !context.captures[role]?.closed
        ) {
          try {
            await command(role, 'STOP')
          } catch (cause) {
            fail(probeError('CLEANUP', cause), role)
          }
        }
      }
      if (context.docker) {
        try {
          await state.wait(
            () =>
              Object.entries(context.captures).every(
                ([role, capture]) =>
                  capture.closed || context.roles[role].closed
              ),
            {
              deadline: Math.min(deadline, state.now() + 700),
              tolerateFailure: true
            }
          )
        } catch (cause) {
          fail(probeError('CLEANUP', cause))
        }
        try {
          await context.docker.closeAttachments()
          context.cleanup.attachmentsClosed = true
        } catch (cause) {
          fail(probeError('CLEANUP', cause))
        }
      } else context.cleanup.attachmentsClosed = true
      for (const role of ['client', 'observer']) {
        const record = context.roles[role]
        if (!record) continue
        const result = {
          role,
          name: record.name,
          id: record.id,
          labels: record.labels,
          imageId: PINS.imageId,
          configSha256: sha256(canonical(record.config)),
          status: 'UNRESOLVED',
          nextAction:
            'Reconcile this exact name, full labels, image and configuration; remove only a proven owned ID.'
        }
        context.cleanup.containers.push(result)
        if (record.notCreated) {
          result.status = 'NOT_CREATED'
          continue
        }
        if (!record.id || record.unresolved) {
          fail(probeError('CLEANUP'))
          continue
        }
        try {
          const raw = await inspect(record, true)
          if (!raw) {
            result.status = 'REMOVED'
            continue
          }
          if (!ownership(raw, record)) throw probeError('CLEANUP')
          state.record('HOST', 'FINAL_CONTAINER_STATE', {
            role,
            id: record.id,
            state: raw.State
          })
          if (
            !raw.State.Running &&
            raw.State.ExitCode !== 0 &&
            !state.errors.length
          ) {
            state.failure(probeError('IO'), role.toUpperCase(), 'CLEANUP')
            state.check('PHASES', 'FAIL', 'Actual wrapper exited nonzero.', [
              'control-trace'
            ])
          }
          if (raw.State.Running) {
            const stopped = await call(
              ['container', 'stop', '--time', '1', record.id],
              true
            )
            if (stopped.exitCode !== 0)
              fail(probeError('CLEANUP', stopped.nativeError), 'DOCKER')
          }
          const removed = await call(
            ['container', 'rm', '--force', record.id],
            true
          )
          if (removed.exitCode !== 0)
            throw probeError('CLEANUP', removed.nativeError)
          if (await inspect(record, true)) throw probeError('CLEANUP')
          result.status = 'REMOVED'
        } catch (cause) {
          fail(probeError('CLEANUP', cause), 'DOCKER')
        }
      }
      if (context.marker) {
        try {
          await context.marker.close()
          context.cleanup.markerRemoved = context.marker.removed
        } catch (cause) {
          fail(probeError('CLEANUP', cause))
        }
      } else context.cleanup.markerRemoved = true
      try {
        if (context.inputs) await context.inputs.verifyManifest()
        const verified = []
        for (const pin of context.pins) verified.push(await pin.verify())
        state.record('HOST', 'FINAL_INPUT_IDENTITIES', verified)
        if (context.inputs)
          state.check(
            'DRIFT',
            'PASS',
            'Original and mounted snapshots match their retained descriptors and digests.',
            ['control-trace']
          )
      } catch (cause) {
        fail(probeError('DRIFT_RUNTIME', cause))
        state.check('DRIFT', 'FAIL', 'Input drift or verification failure.', [
          'control-trace'
        ])
      }
      try {
        await closePins(context.pins)
        context.cleanup.pinsClosed = true
      } catch (cause) {
        fail(cause)
      }
      if (graph) {
        try {
          await graph.dispose()
          context.cleanup.bootstrapDisposed = true
        } catch (cause) {
          context.cleanup.bootstrapDisposed = false
          fail(probeError('CLEANUP', cause))
        }
      }
      const clean =
        context.cleanup.containers.every((r) => r.status !== 'UNRESOLVED') &&
        context.cleanup.markerRemoved &&
        context.cleanup.pinsClosed &&
        context.cleanup.attachmentsClosed &&
        context.cleanup.bootstrapDisposed !== false
      state.check(
        'CLEANUP',
        clean ? 'PASS' : 'FAIL',
        clean
          ? 'Owned resources closed and removal confirmed.'
          : 'Owned resource closure is unresolved; use the explicit handoff.',
        ['cleanup']
      )
    }

    try {
      if (onSignalOwnership) onSignalOwnership()
      if (!simulated && !graph) throw probeError('INPUT_INVALID')
      context.evidence = await (dependencies.createEvidence ?? createEvidence)(
        options.evidenceRoot,
        options.out
      )
      if (graph) {
        context.evidence.reserveBytes(graph.totalBytes)
        state.record('HOST', 'BOOTSTRAP_GRAPH', {
          entries: graph.entries,
          builtinAllowlist: graph.builtinAllowlist
        })
      }
      state.record('HOST', 'EVIDENCE_ROOT', {
        root: context.evidence.root,
        output: context.evidence.outputRelative
      })
      // Retain the parsed identity even if later bundle or output IO fails.
      const seed = await context.evidence.read(options.manifest, 65536)
      state.record('HOST', 'MANIFEST_INPUT', {
        path: path.join(context.evidence.root, seed.path),
        sha256: seed.sha256,
        bytes: seed.size
      })
      context.manifest = parseManifest(seed.bytes)
      state.activeCheck = 'BUNDLE'
      context.inputs = await prepareInputs(
        context.evidence,
        options.manifest,
        context.pins
      )
      state.check(
        'INPUTS',
        'PASS',
        'Closed raw manifest and exact inert fixture retained.',
        ['manifest', 'consumed-inputs']
      )
      state.check(
        'BUNDLE',
        'PASS',
        'Complete static closure snapshotted and retained by descriptor.',
        ['bundle-inventory']
      )
      state.activeCheck = 'TOOLCHAIN'
      await (dependencies.pinToolchains ?? pinToolchains)(
        context.pins,
        context.observed
      )
      state.record('HOST', 'PINNED_TOOLCHAINS', {
        expected: expectedDigests(),
        observed: context.observed
      })
      context.marker = await (
        dependencies.createHostMarker ?? createHostMarker
      )(context.nonce)
      const configDir = await context.evidence.emptyDirectory('docker-config')
      context.docker = (
        dependencies.transportFactory ??
        ((config) => new DockerTransport(config))
      )({
        binary: PINS.dockerPath,
        configDir,
        deadline: state.deadline,
        now: state.now
      })
      const version = await call([
        'version',
        '--format',
        '{{.Server.APIVersion}} {{.Server.MinAPIVersion}}'
      ])
      if (version.exitCode !== 0)
        throw probeError('TOOLCHAIN_UNAVAILABLE', version.nativeError)
      const api = /^1\.(\d+) 1\.(\d+)\s*$/.exec(
        version.stdout.toString('ascii')
      )
      if (!api || Number(api[1]) < 51 || Number(api[2]) > 51)
        throw probeError('TOOLCHAIN_UNAVAILABLE')
      const imageResult = await call(['image', 'inspect', PINS.imageId])
      const images = decoded(imageResult)
      if (
        !Array.isArray(images) ||
        images.length !== 1 ||
        images[0].Id !== PINS.imageId
      )
        throw probeError('IDENTITY_MISMATCH')
      context.observed.imageId = images[0].Id
      const labels = images[0].Config?.Labels ?? {}
      if (
        Object.entries(labels).some(
          ([k, v]) =>
            /[=\0]/.test(k) ||
            typeof v !== 'string' ||
            Buffer.byteLength(v) > 4096
        )
      )
        throw probeError('TOOLCHAIN_UNAVAILABLE')
      state.check(
        'TOOLCHAIN',
        'PASS',
        'Pinned binaries, local API and existing image match.',
        ['control-trace']
      )
      state.phase = 'PREFLIGHT'
      state.activeCheck = 'CONTAINER_PROFILE'
      await create('observer', labels)
      await create('client', labels)
      await attach('observer')
      await attach('client')
      for (const role of ['observer', 'client']) {
        const result = await call([
          'container',
          'start',
          context.roles[role].id
        ])
        if (result.exitCode !== 0)
          throw probeError('TOOLCHAIN_UNAVAILABLE', result.nativeError)
      }
      await state.wait(() => Boolean(context.roles.observer.ready))
      const port = context.roles.observer.ready.port,
        invocation = nativeInvocation(port)
      context.profile = {
        version: 1,
        runId: context.manifest.runId,
        fixtureId: context.manifest.fixtureId,
        nonce: context.nonce,
        driverSha256: context.inputs.driverSha256,
        consumedInputsSha256: context.inputs.consumedInputsSha256,
        builtinAllowlist: graph?.builtinAllowlist ?? BUILTIN_ALLOWLIST,
        toolchainDigests: {
          expected: expectedDigests(),
          observed: { ...context.observed }
        },
        observer: {
          id: context.roles.observer.id,
          name: context.roles.observer.name,
          labels: context.roles.observer.labels,
          config: context.roles.observer.config,
          port,
          argv: [
            ...context.roles.observer.config.entrypoint,
            ...context.roles.observer.config.cmd
          ],
          env: {
            ...Object.fromEntries(
              (images[0].Config?.Env ?? []).map((entry) => {
                const i = entry.indexOf('=')
                return [entry.slice(0, i), entry.slice(i + 1)]
              })
            ),
            LANG: 'C.UTF-8',
            TZ: 'UTC',
            HOME: '/scratch/home'
          },
          cwd: '/workspace',
          pipes: { stdout: 'CONTROL', stderr: 'BODY_BINARY' }
        },
        client: {
          id: context.roles.client.id,
          name: context.roles.client.name,
          labels: context.roles.client.labels,
          config: context.roles.client.config,
          argv: {
            version: [invocation.file, ...invocation.versionArgs],
            port: [invocation.file, ...invocation.args]
          },
          env: invocation.env,
          cwd: invocation.cwd,
          pipes: { stdout: 'CONTROL', stderr: 'NATIVE_BINARY' }
        }
      }
      const profileArtifact = await context.evidence.addJson(
        'profile',
        'inputs/profile.json',
        context.profile
      )
      state.artifacts.set('profile', profileArtifact)
      context.profileSha256 = profileArtifact.sha256
      context.pins.push(
        await pinFile(
          path.join(context.evidence.root, profileArtifact.path),
          profileArtifact.sha256,
          1024 * 1024
        )
      )
      await command('client', 'CONFIGURE', {
        port,
        profileSha256: context.profileSha256,
        envSha256: sha256(canonical(invocation.env))
      })
      await state.wait(() => Boolean(context.roles.client.ready))
      const ready = context.roles.client.ready
      if (
        ready.port !== port ||
        ready.profileSha256 !== context.profileSha256 ||
        ready.envSha256 !== sha256(canonical(invocation.env))
      )
        throw probeError('CONTAINMENT')
      for (const role of ['observer', 'client']) {
        context.roles[role].inspect = await inspect(context.roles[role])
        verifyInspect(context.roles[role].inspect, context.roles[role])
      }
      state.check(
        'CONTAINER_PROFILE',
        'PASS',
        'Actual inspect matches every required ownership, mount, privilege and resource field.',
        ['inspect-client', 'inspect-observer', 'profile']
      )
      state.activeCheck = 'NAMESPACES'
      const actualHostNamespaces = await (
        dependencies.hostNamespaces ?? hostNamespaces
      )()
      state.record('HOST', 'HOST_NAMESPACES', actualHostNamespaces)
      verifyNamespaces(
        context.roles.observer.ready,
        ready,
        actualHostNamespaces
      )
      state.check(
        'NAMESPACES',
        'PASS',
        'Actual wrapper preflights have distinct private PIDs and shared isolated loopback.',
        ['preflight-client', 'preflight-observer', 'control-trace']
      )
      await verifyInputs()
      state.phase = 'VERSION'
      state.activeCheck = 'NATIVE_VERSION'
      await command('client', 'START_NATIVE')
      await state.wait(
        () =>
          state.nativeExecution.versionProbe.endedAt !== null &&
          context.captures.client.nativeComplete('version')
      )
      if (
        !versionMatches(
          context.captures.client.nativeBytes('version', 'stdout'),
          state.nativeExecution.versionProbe
        )
      )
        throw probeError('IDENTITY_MISMATCH')
      state.nativeExecution.versionObserved = PINS.version
      state.check(
        'NATIVE_VERSION',
        'PASS',
        'Actual selected native --version output and child result match.',
        ['control-trace', 'native-version-stdout']
      )
      state.activeCheck = 'NATIVE_LINEAGE'
      const top = await call([
        'container',
        'top',
        context.roles.client.id,
        '-eo',
        'pid,ppid,comm'
      ])
      if (
        top.exitCode !== 0 ||
        top.stdout.toString('utf8').trim().split('\n').length !== 2
      )
        throw probeError('CONTAINMENT')
      if (
        Number(
          top.stdout
            .toString('utf8')
            .trim()
            .split('\n')[1]
            .trim()
            .split(/\s+/)[0]
        ) !== context.roles.client.inspect.State.Pid
      )
        throw probeError('CONTAINMENT')
      state.record('HOST', 'NO_VERSION_DESCENDANTS', {
        stdoutBase64: top.stdout.toString('base64')
      })
      await command('observer', 'ARM_PORT')
      await state.wait(() => Boolean(context.roles.observer.armed))
      state.phase = 'PORT'
      state.activeCheck = 'PHASES'
      await verifyInputs()
      await command('client', 'START_PORT')
      await state.wait(
        () =>
          state.nativeExecution.portProbe.endedAt !== null &&
          context.captures.client.nativeComplete('port')
      )
      await state.wait(() =>
        [...context.requests.keys()].every(
          (ordinal) =>
            context.responses.has(ordinal) &&
            context.captures.observer.bodyComplete(ordinal)
        )
      )
      if (state.nativeExecution.portProbe.exitCode === null)
        throw probeError('PROTOCOL')
      state.check(
        'PHASES',
        'PASS',
        'Protected commands, frame sequences and phase completion are intact.',
        ['control-trace', 'observer-trace']
      )
      state.check(
        'NATIVE_LINEAGE',
        'PASS',
        'Both actual child starts and ends bind pinned argv, environment and stdin.',
        ['control-trace']
      )
      state.check(
        'PRIVACY_CAPS',
        'PASS',
        'No forbidden auth, malformed frame or cap violation observed.',
        ['control-trace', 'observer-trace']
      )
    } catch (cause) {
      fail(cause)
    }
    try {
      await cleanupAll()
    } catch (cause) {
      fail(probeError('CLEANUP', cause))
    }
    removeSignalHandlers()
    if (!state.errors.length && context.captures.observer) {
      try {
        const capture = context.captures.observer
        const ordinals = [...capture.parts.keys()].map(Number)
        if (
          ordinals.length !== context.requests.size ||
          context.requests.size !== context.responses.size ||
          ordinals.some(
            (ordinal) =>
              !context.requests.has(ordinal) || !capture.bodyComplete(ordinal)
          )
        )
          throw probeError('PROTOCOL')
        for (const [ordinal, request] of context.requests) {
          const bytes = capture.body(ordinal)
          if (
            bytes.length !== request.frame.payload.bytes ||
            sha256(bytes) !== request.frame.payload.bodySha256
          )
            throw probeError('PROTOCOL')
        }
      } catch (cause) {
        fail(cause, 'OBSERVER', 'PORT')
      }
    }
    if (!state.errors.length) {
      if (!context.requests.size) {
        state.check('HTTP_EXCHANGE', 'FAIL', 'NO_ELIGIBLE_EXCHANGE', [
          'observer-trace'
        ])
        state.failure(probeError('NO_ELIGIBLE_EXCHANGE'), 'HOST', 'PORT')
      } else
        state.check(
          'HTTP_EXCHANGE',
          'PASS',
          'Protected eligible POST and fixed503 finished locally.',
          ['observer-trace']
        )
    }
    if (!context.evidence)
      return { exitCode: 1, report: null, error: state.cause() }
    try {
      state.phase = 'PUBLICATION'
      state.activeCheck = 'PUBLICATION_PREPARED'
      const report = await persistReport(context)
      return { exitCode: report.exitCode, report, error: state.cause() }
    } catch (primary) {
      fail(primary)
      try {
        await context.evidence.close()
      } catch (cleanup) {
        fail(probeError('IO', cleanup))
      }
      return { exitCode: 1, report: null, error: state.cause() }
    }
  }
}

export const runProbe = createProbeRunner()
