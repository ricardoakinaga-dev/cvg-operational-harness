import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readlink } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { parseStrictJson } from '../qualification/strict-json.mjs'
import { CAPTURE_SOURCE_PATHS } from '../reference-port/bootstrap.mjs'
import {
  CASES,
  LIMITS,
  OWNER,
  PINS,
  TASK,
  argvDigest,
  canonical,
  caseOf,
  digestOf,
  envDigest,
  envSet,
  envSetDigest,
  fault,
  ordinalOf,
  processInvocation,
  sha256
} from './constants.mjs'
import { DockerTransport } from './docker.mjs'
import { binding, createEvidence } from './evidence.mjs'
import {
  createHostMarker as createMarker,
  materializeInputs,
  parseManifest,
  pinEmptyDirectory,
  pinToolchains as pinTools
} from './inputs.mjs'
import {
  ControlStream,
  KeyStore,
  RAW_PIPES,
  Sequencer,
  caseStatus,
  clientKey,
  deriveCase,
  deriveVersion,
  observerKey,
  orphanKeys
} from './model.mjs'
import {
  containerName,
  createArgs,
  makeConfig,
  verifyInspect,
  verifyNamespaces
} from './profile.mjs'
import { KINDS, encodeCommand } from './protocol.mjs'
import {
  PATHS,
  assertEvidence,
  buildReport,
  derivedArtifact,
  expectedDigests
} from './report.mjs'
import { Ledger, Trace, ref } from './trace.mjs'
import { expectedWorkspaceState } from './workspace.mjs'

const ID = /^[a-f0-9]{64}$/
const missing = (result) =>
  result.exitCode === 1 &&
  /no such (?:object|container)/i.test(result.stderr.toString('utf8'))
const decoded = (result) => {
  if (result.exitCode !== 0) throw fault('IO', result.nativeError ?? undefined)
  return parseStrictJson(result.stdout, {
    maxBytes: LIMITS.dockerStreamBytes,
    maxDepth: LIMITS.jsonDepth,
    maxStringBytes: LIMITS.jsonString
  })
}
async function readHostNamespaces() {
  const id = async (type) => {
    const match = /\[(\d+)\]/.exec(await readlink(`/proc/self/ns/${type}`))
    if (!match) throw fault('CONTAINMENT')
    return match[1]
  }
  return { pid: await id('pid'), net: await id('net') }
}
const ABORTED = 'ABORTED'

/** Dependency substitutions are internal tests only; the CLI uses runCapture. */
export function createCaptureRunner(dependencies = {}) {
  const simulated = Object.keys(dependencies).length !== 0
  return async function runCapture(options, graph, onSignalOwnership = null) {
    const now = dependencies.now ?? (() => performance.now())
    const trace = new Trace({ now })
    const ledger = new Ledger(trace)
    const events = new EventEmitter()
    events.setMaxListeners(64)
    const started = now()
    const deadlines = {
      main: started + LIMITS.controllerMs,
      close: null,
      horizon: started + LIMITS.controllerMs + LIMITS.closeMs
    }
    const concluded = new Map()
    const dispatched = new Map()
    const ctx = {
      phase: 'VALIDATE',
      openCase: null,
      evidence: null,
      runId: null,
      observed: {
        claudeSha256: null,
        nodeSha256: null,
        dockerSha256: null,
        imageId: null
      },
      image: null,
      hostNamespaces: null,
      pins: [],
      inputs: null,
      nonce: randomBytes(16).toString('hex'),
      marker: null,
      docker: null,
      profile: null,
      roles: {},
      control: {},
      keys: {},
      tails: {},
      seq: new Sequencer(),
      commandSeq: { client: 0, observer: 0 },
      cleanup: {
        markerRemoved: false,
        attachmentsClosed: false,
        pinsClosed: false,
        bootstrapDisposed: false,
        revalidated: false
      }
    }

    // A cause belongs to the open case until that case has its own result.
    function fail(error, { caseId } = {}) {
      const candidate = caseId === undefined ? ctx.openCase : caseId
      const attributed =
        candidate && !concluded.has(candidate) ? candidate : null
      const order = ledger.add(error, { phase: ctx.phase, caseId: attributed })
      events.emit('change')
      return order
    }
    const handlers = new Map(
      ['SIGHUP', 'SIGINT', 'SIGTERM'].map((s) => [
        s,
        () => fail(Object.assign(fault('SIGNAL'), { signal: s }))
      ])
    )
    for (const [s, h] of handlers) process.on(s, h)
    const releaseSignals = () => {
      for (const [s, h] of handlers) process.off(s, h)
    }
    // Entry handlers are released only after these are installed.
    if (onSignalOwnership) onSignalOwnership()

    /** Resolve on predicate; a new cause or the deadline aborts the wait. */
    async function wait(predicate, until, { tolerate = false } = {}) {
      const baseline = ledger.length
      while (!predicate()) {
        if (!tolerate && ledger.length > baseline) throw fault(ABORTED)
        const remaining = until - now()
        if (remaining <= 0) throw fault('TIMEOUT')
        await new Promise((resolve) => {
          const timer = setTimeout(done, Math.max(1, Math.ceil(remaining)))
          function done() {
            clearTimeout(timer)
            events.off('change', done)
            resolve()
          }
          events.once('change', done)
        })
      }
      if (!tolerate && ledger.length > baseline) throw fault(ABORTED)
    }
    async function store(role, relative, bytes, owner = 'HOST', dims = {}) {
      const artifact = await ctx.evidence.add(
        role,
        relative,
        bytes,
        binding(owner, dims)
      )
      try {
        trace.record('HOST', 'HOST_ARTIFACT', {
          phase: ctx.phase,
          caseId: dims.caseId ?? null,
          artifactPath: artifact.path,
          sha256: artifact.sha256,
          bytes: artifact.bytes
        })
      } catch (cause) {
        fail(cause)
      }
      return artifact
    }
    const storeJson = (role, relative, value, owner, dims) =>
      store(role, relative, Buffer.from(canonical(value)), owner, dims)
    async function call(args, closing = false) {
      try {
        return await ctx.docker.call(args, { closing })
      } catch (cause) {
        fail(cause)
        throw fault(ABORTED)
      }
    }
    async function inspect(target, closing = false) {
      const result = await call(['container', 'inspect', target], closing)
      if (missing(result)) return null
      const list = decoded(result)
      if (!Array.isArray(list) || list.length !== 1) throw fault('PROTOCOL')
      return list[0]
    }
    /** The intent is recorded before any write; its result separately after. */
    async function command(to, type, payload, onRecorded = () => {}) {
      const seqNo = ctx.commandSeq[to]++
      const bytes = encodeCommand(ctx.runId, to, seqNo, type, payload)
      const ordinal = trace.record('HOST', 'HOST_COMMAND', {
        to,
        commandSeq: seqNo,
        frameBase64: bytes.toString('base64')
      })
      ctx.seq.command(to, type, payload, ordinal)
      onRecorded(ordinal)
      let outcome = 'WRITTEN'
      try {
        if (!ctx.roles[to]?.attachment) throw fault('PROTOCOL')
        await ctx.roles[to].attachment.send(bytes)
      } catch (cause) {
        outcome = 'FAILED'
        fail(cause?.code ? cause : fault('IO', cause))
      }
      trace.record('HOST', 'HOST_COMMAND_RESULT', {
        to,
        commandSeq: seqNo,
        outcome
      })
      if (outcome === 'FAILED') throw fault(ABORTED)
      return ordinal
    }

    // Protected attachment sinks: origin is the pipe, never the bytes.
    function onControl(role, chunk) {
      const stream = ctx.control[role]
      const had = stream.error
      for (const { raw, frame } of stream.feed(chunk)) {
        let ordinal
        try {
          ordinal = trace.record(role, 'FRAME', {
            rawBase64: raw.toString('base64'),
            frame
          })
        } catch (cause) {
          stream.error ??= cause
          break
        }
        const violation = ctx.seq.frame(role, frame, ordinal)
        if (violation) fail(fault(violation))
        else consequence(frame)
      }
      if (stream.error && !had) fail(stream.error)
      events.emit('change')
    }
    function consequence(frame) {
      const p = frame.payload
      if (frame.type === 'ERROR')
        fail(fault(p.code), { caseId: p.caseId ?? undefined })
      if (frame.type === 'REJECTED') {
        const code = {
          CAP: 'CAP',
          FORBIDDEN_AUTH: 'PRIVACY',
          EARLY_PHASE: 'PROTOCOL',
          MISSING_SENTINEL: 'INCOMPATIBLE_TRANSCRIPT'
        }[p.reason]
        if (code) fail(fault(code), { caseId: p.caseId ?? undefined })
      }
    }
    function onRaw(role, chunk) {
      const keys = ctx.keys[role]
      const had = keys.error
      for (const frame of keys.feed(chunk)) {
        try {
          trace.record(role, 'RAW', {
            wireArtifactPath: RAW_PIPES[role],
            wireOffset: frame.offset,
            headerBytes: frame.headerBytes,
            payloadBytes: frame.payloadBytes,
            frameSha256: sha256(frame.frame),
            key: frame.key
          })
        } catch (cause) {
          fail(cause)
          break
        }
        if (
          role === 'client' &&
          !ctx.seq.issued.start.has(frame.key.processOrdinal)
        )
          fail(fault('PROTOCOL'))
      }
      if (keys.error && !had) fail(keys.error)
      events.emit('change')
    }
    async function attach(role) {
      const record = ctx.roles[role]
      ctx.control[role] = new ControlStream(role, ctx.runId)
      ctx.keys[role] = new KeyStore(role)
      record.attachment = await ctx.docker.attach(record.id, {
        onStdout: (bytes) => onControl(role, bytes),
        onStderr: (bytes) => onRaw(role, bytes),
        onFailure: (cause) => fail(cause),
        onEnd: (pending) => {
          record.ended = true
          if (pending?.length)
            ctx.tails[`${role}-docker`] = Buffer.from(pending)
          const state = role === 'observer' ? ctx.seq.obs : ctx.seq.cli
          if (!state.closed)
            fail(fault(state.ready ? 'PROTOCOL' : 'CONTAINMENT'))
          events.emit('change')
        }
      })
    }
    async function create(role) {
      const name = containerName(ctx.nonce, role)
      const config = makeConfig(role, {
        bundle: graph.root,
        workspace: ctx.inputs.workspace,
        emptyVolume: ctx.inputs.emptyVolume,
        runId: ctx.runId,
        marker: ctx.marker.path,
        observerId: ctx.roles.observer?.id
      })
      const configSha256 = digestOf(config)
      const labels = {
        ...ctx.image.labels,
        'cvg.owner': OWNER,
        'cvg.task': TASK,
        'cvg.run-id': ctx.runId,
        'cvg.nonce': ctx.nonce,
        'cvg.config-sha256': configSha256,
        'cvg.role': role
      }
      const record = (ctx.roles[role] = {
        role,
        name,
        labels,
        config,
        configSha256,
        id: null,
        attempted: false,
        createOutcome: 'NOT_ATTEMPTED',
        recovered: false,
        unresolved: false,
        attachment: null,
        ended: false
      })
      // The exact name must be absent; a foreign resource is never touched.
      if ((await inspect(name)) !== null) throw fault('IO')
      await storeJson('CLEANUP', PATHS.intent(role), {
        version: 1,
        runId: ctx.runId,
        nonce: ctx.nonce,
        role,
        name,
        imageId: PINS.imageId,
        configSha256,
        labels,
        attempted: true
      })
      record.attempted = true
      let primary = null,
        result = null
      try {
        result = await ctx.docker.call(createArgs(record))
      } catch (cause) {
        // Timeout/kill/IO/CAP: the daemon may still materialize the container.
        primary = cause?.code ? cause : fault('IO', cause)
      }
      if (result) {
        const id = result.stdout.toString('utf8').trim()
        if (result.exitCode === 0 && ID.test(id)) {
          record.id = id
          record.createOutcome = 'CREATED'
          return
        }
        // Only a completed CLI with a nonzero exit is a definitive refusal.
        record.createOutcome = result.exitCode !== 0 ? 'REFUSED' : 'UNCERTAIN'
        primary = fault('IO')
      } else record.createOutcome = 'UNCERTAIN'
      fail(primary)
      // One exact-name reconciliation now; an uncertain attempt is reconciled
      // again in CLEANUP. Never a second create, never removal by name.
      await reconcile(record, true)
      throw fault(ABORTED)
    }
    /** Adopt only an exact own match (name, image, labels incl. nonce/config). */
    async function reconcile(record, closing) {
      try {
        const found = await inspect(record.name, closing)
        if (!found) return false
        if (
          found.Name === `/${record.name}` &&
          found.Image === PINS.imageId &&
          canonical(found.Config?.Labels ?? {}) === canonical(record.labels)
        ) {
          verifyInspect(
            found,
            { ...record, id: found.Id },
            ctx.image.env,
            Boolean(found.State?.Running)
          )
          record.id = found.Id
          record.recovered = true
          return true
        }
        record.unresolved = true
      } catch (recovery) {
        if (recovery?.code !== ABORTED) fail(recovery)
        record.unresolved = true
      }
      return false
    }
    function processDeadline(budget) {
      // No launch without its whole budget left inside the controller deadline.
      if (deadlines.main - now() < budget + 1000) throw fault('TIMEOUT')
      // Waits never pass the controller deadline; closing keeps its own window.
      return Math.min(now() + budget + 2000, deadlines.main)
    }
    function settledProcess(I) {
      if (!ctx.seq.cli.ends.has(I)) return false
      return [1, 2].every(
        (ch) => ctx.keys.client.entry(clientKey(I, ch))?.terminated
      )
    }
    function settledCase(K) {
      const I = ordinalOf(K)
      if (!settledProcess(I) || !ctx.seq.obs.caseEnded.has(K)) return false
      const keys = ctx.keys.observer
      const done = (kind, q = null, s = null) =>
        keys.entry(observerKey(K, q, kind, s))?.terminated
      if (!done(KINDS.WORKSPACE_STATE)) return false
      for (const r of ctx.seq.obs.requests.values()) {
        if (r.begin.caseId !== K) continue
        const q = r.begin.ordinal
        if (r.decision?.type === 'REQUEST' && !done(KINDS.REQUEST_BODY, q))
          return false
        if (r.response) {
          if (!done(KINDS.RESPONSE_HEADERS, q) || !done(KINDS.RESPONSE_BODY, q))
            return false
          for (let i = 0; i < r.segments.length; i++)
            if (!done(KINDS.RESPONSE_SEGMENT, q, i)) return false
        }
      }
      return true
    }
    const model = () => ({ seq: ctx.seq, keys: ctx.keys })
    /** One result per dispatched process (null=version), derived structurally. */
    function conclude(caseId) {
      if (concluded.has(caseId)) return concluded.get(caseId)
      const I = ordinalOf(caseId)
      const outcome =
        caseId === null
          ? deriveVersion(model(), ctx.profile)
          : deriveCase(model(), caseId, ctx.profile)
      for (const code of outcome.derived)
        fail(fault(code), { caseId: caseId ?? null })
      const mine =
        caseId === null
          ? ledger.failures.filter((f) => f.phase === 'VERSION')
          : ledger.failures.filter((f) => f.caseId === caseId)
      const codes = mine.map((f) => f.code)
      const status =
        caseId === null
          ? codes.some((c) => c !== 'INCOMPATIBLE_TRANSCRIPT')
            ? 'FAILED'
            : codes.length
              ? 'INCOMPATIBLE'
              : outcome.accepted && outcome.complete
                ? 'CAPTURED'
                : 'FAILED'
          : caseStatus(outcome, codes)
      trace.record('HOST', 'HOST_CASE_RESULT', {
        caseId,
        status,
        dispatchRef: ref('HOST', dispatched.get(I)),
        failureOrders: mine.map((f) => f.order)
      })
      concluded.set(caseId, status)
      if (ctx.openCase === caseId) ctx.openCase = null
      return status
    }

    try {
      // VALIDATE: graph, exclusive output, manifest, toolchain, API and image.
      if (!graph) throw fault('INPUT_INVALID')
      ctx.evidence = await (dependencies.createEvidence ?? createEvidence)(
        options.evidenceRoot,
        options.out
      )
      const raw = await ctx.evidence.read(
        options.manifest,
        LIMITS.manifestBytes
      )
      const manifestArtifact = await store(
        'INPUT_MANIFEST',
        'inputs/manifest.json',
        raw.bytes
      )
      try {
        ctx.runId = parseManifest(raw.bytes).runId
        await (dependencies.pinToolchains ?? pinTools)(ctx.pins, ctx.observed)
        ctx.hostNamespaces = await (
          dependencies.hostNamespaces ?? readHostNamespaces
        )()
        const configDir = await ctx.evidence.emptyDirectory('docker-config')
        ctx.docker = (
          dependencies.transportFactory ??
          ((config) => new DockerTransport(config))
        )({
          configDir,
          deadline: deadlines.main,
          closeDeadline: () => deadlines.close,
          horizon: deadlines.horizon,
          now
        })
        const version = await call([
          'version',
          '--format',
          '{{.Server.APIVersion}} {{.Server.MinAPIVersion}}'
        ])
        const api = /^1\.(\d+) 1\.(\d+)\s*$/.exec(
          version.stdout.toString('ascii')
        )
        if (
          version.exitCode !== 0 ||
          !api ||
          Number(api[1]) < 51 ||
          Number(api[2]) > 51
        )
          throw fault('TOOLCHAIN_UNAVAILABLE')
        const image = await call(['image', 'inspect', PINS.imageId])
        if (missing(image)) throw fault('IDENTITY_MISMATCH')
        const images = decoded(image)
        if (
          !Array.isArray(images) ||
          images.length !== 1 ||
          images[0].Id !== PINS.imageId
        )
          throw fault('IDENTITY_MISMATCH')
        ctx.observed.imageId = images[0].Id
        const labels = images[0].Config?.Labels ?? {}
        const env = images[0].Config?.Env ?? []
        if (
          Object.entries(labels).some(
            ([k, v]) => /[=\0]/.test(k) || typeof v !== 'string'
          ) ||
          !Array.isArray(env) ||
          env.some((e) => typeof e !== 'string' || !e.includes('='))
        )
          throw fault('TOOLCHAIN_UNAVAILABLE')
        ctx.image = { labels, env }
      } finally {
        if (ctx.runId)
          await storeJson('INPUT_IDENTITIES', PATHS.identities, {
            version: 1,
            simulated,
            toolchain: { expected: expectedDigests(), observed: ctx.observed },
            image: ctx.image,
            hostNamespaces: ctx.hostNamespaces,
            manifest: { path: raw.path, sha256: raw.sha256, bytes: raw.size },
            evidenceRoot: ctx.evidence.root,
            outDir: ctx.evidence.outDir,
            bootstrap: {
              root: graph.root,
              entries: graph.entries,
              builtinAllowlist: graph.builtinAllowlist
            }
          })
      }

      // SNAPSHOT: frozen inputs, inert code copies, scripts and fixtures.
      ctx.phase = 'SNAPSHOT'
      for (const pin of graph.pins) await pin.verify()
      ctx.inputs = await materializeInputs(ctx.evidence, {
        manifestArtifact,
        graph,
        store
      })
      ctx.pins.push(await pinEmptyDirectory(ctx.inputs.emptyVolume))

      // CREATE: own nonce, unmounted marker, intents, then two containers.
      ctx.phase = 'CREATE'
      ctx.marker = await (dependencies.createHostMarker ?? createMarker)(
        ctx.nonce
      )
      await create('observer')
      await create('client')

      // PREFLIGHT: attach, start, READY/STATE, profile, inspect, namespaces.
      ctx.phase = 'PREFLIGHT'
      await attach('observer')
      await attach('client')
      const startRole = async (role) => {
        const result = await call(['container', 'start', ctx.roles[role].id])
        if (result.exitCode !== 0) throw fault('TOOLCHAIN_UNAVAILABLE')
      }
      await startRole('observer')
      await wait(
        () =>
          ctx.seq.obs.before !== null &&
          ctx.keys.observer.entry(
            observerKey(null, null, KINDS.WORKSPACE_STATE)
          )?.terminated,
        deadlines.main
      )
      await startRole('client')
      const ready = ctx.seq.obs.ready.payload
      const port = ready.port
      const expected = expectedWorkspaceState()
      const before = ctx.seq.obs.before.payload
      const beforeKey = ctx.keys.observer.entry(
        observerKey(null, null, KINDS.WORKSPACE_STATE)
      )
      if (
        ready.workspaceStateSha256 !== expected.sha256 ||
        ready.workspaceStateBytes !== expected.bytes.length ||
        before.sha256 !== expected.sha256 ||
        before.bytes !== expected.bytes.length ||
        !beforeKey.bytes.equals(expected.bytes)
      )
        throw fault('DRIFT_RUNTIME')
      const roleProfile = (role) => ({
        id: ctx.roles[role].id,
        name: ctx.roles[role].name,
        labels: ctx.roles[role].labels,
        config: ctx.roles[role].config,
        configSha256: ctx.roles[role].configSha256,
        argv: [
          ...ctx.roles[role].config.entrypoint,
          ...ctx.roles[role].config.cmd
        ],
        pipes: { stdout: 'CONTROL', stderr: 'BINARY' }
      })
      ctx.profile = {
        version: 2,
        task: TASK,
        runId: ctx.runId,
        nonce: ctx.nonce,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        envSetSha256: envSetDigest(port),
        envSet: envSet(port),
        inputDigests: ctx.inputs.digests,
        toolchain: { expected: expectedDigests(), observed: ctx.observed },
        builtinAllowlist: graph.builtinAllowlist,
        sourcePaths: CAPTURE_SOURCE_PATHS,
        bundleRoot: graph.root,
        workspace: ctx.inputs.workspace,
        emptyVolume: ctx.inputs.emptyVolume,
        marker: ctx.marker.path,
        imageEnv: ctx.image.env,
        workspaceStateSha256: expected.sha256,
        observer: roleProfile('observer'),
        client: roleProfile('client'),
        invocations: [0, 1, 2, 3].map((I) => {
          const inv = processInvocation(I, port)
          return {
            processOrdinal: I,
            caseId: inv.caseId,
            file: inv.file,
            args: inv.args,
            env: inv.env,
            cwd: inv.cwd,
            stdinBase64: inv.stdin.toString('base64'),
            argvSha256: argvDigest(inv),
            envSha256: envDigest(inv),
            stdinSha256: sha256(inv.stdin)
          }
        })
      }
      // The profile is frozen (written and later re-read) before CONFIGURE.
      const profileArtifact = await storeJson(
        'PROFILE',
        PATHS.profile,
        ctx.profile
      )
      await command('client', 'CONFIGURE', {
        port,
        profileSha256: profileArtifact.sha256,
        envSetSha256: envSetDigest(port)
      })
      await wait(() => ctx.seq.cli.ready !== null, deadlines.main)
      const echo = ctx.seq.cli.ready.payload
      if (
        echo.port !== port ||
        echo.profileSha256 !== profileArtifact.sha256 ||
        echo.envSetSha256 !== envSetDigest(port)
      )
        throw fault('CONTAINMENT')
      for (const role of ['observer', 'client']) {
        const actual = await inspect(ctx.roles[role].id)
        if (!actual) throw fault('CONTAINMENT')
        await storeJson('INSPECT', PATHS.inspect(role), actual)
        verifyInspect(actual, ctx.roles[role], ctx.image.env)
        const payload = (role === 'observer' ? ctx.seq.obs : ctx.seq.cli).ready
          .payload
        await storeJson('PREFLIGHT', PATHS.preflight(role), payload, role)
      }
      verifyNamespaces(ready, echo, ctx.hostNamespaces)
      try {
        for (const pin of [...graph.pins, ...ctx.pins]) await pin.verify()
      } catch (cause) {
        throw fault('DRIFT_RUNTIME', cause)
      }

      // VERSION: exact `--version`, empty stdin, closed env, own I/O.
      ctx.phase = 'VERSION'
      const versionUntil = processDeadline(LIMITS.versionMs)
      await command(
        'client',
        'START_NATIVE',
        { processOrdinal: 0, caseId: null },
        (ordinal) => dispatched.set(0, ordinal)
      )
      await wait(() => settledProcess(0), versionUntil)
      if (conclude(null) !== 'CAPTURED') throw fault(ABORTED)

      // Cases in fixed order; nothing new after any non-captured case.
      for (const [index, K] of CASES.entries()) {
        const I = index + 1
        ctx.phase = K
        const until = processDeadline(LIMITS.caseMs)
        await command('observer', 'ARM', { caseId: K, processOrdinal: I })
        await wait(() => ctx.seq.obs.armedFrames.has(K), until)
        ctx.openCase = K
        await command(
          'client',
          'START_NATIVE',
          { processOrdinal: I, caseId: K },
          (ordinal) => dispatched.set(I, ordinal)
        )
        await wait(() => ctx.seq.cli.ends.has(I), until)
        await command('observer', 'END_CASE', { caseId: K, processOrdinal: I })
        await wait(
          () => settledCase(K),
          Math.min(until + LIMITS.closeMs, deadlines.main)
        )
        if (conclude(K) !== 'CAPTURED') throw fault(ABORTED)
      }
    } catch (cause) {
      if (cause?.code !== ABORTED) fail(cause)
    }
    // A process interrupted after dispatch is concluded from what was observed.
    for (const caseId of [null, ...CASES])
      if (dispatched.has(ordinalOf(caseId))) conclude(caseId)
    ctx.openCase = null

    // STOP/CLEANUP/REVALIDATE always run, inside their own finite window.
    deadlines.close = Math.min(now() + LIMITS.closeMs, deadlines.horizon)
    ctx.phase = 'STOP'
    for (const role of ['client', 'observer'])
      if (ctx.roles[role]?.attachment && !ctx.roles[role].ended)
        try {
          await command(role, 'STOP', {})
        } catch {}
    try {
      await wait(
        () =>
          ['client', 'observer'].every(
            (role) =>
              !ctx.roles[role]?.attachment ||
              ctx.roles[role].ended ||
              (role === 'client' ? ctx.seq.cli : ctx.seq.obs).closed
          ),
        Math.min(deadlines.close, now() + 4000),
        { tolerate: true }
      )
    } catch (cause) {
      fail(fault('CLEANUP', cause))
    }
    ctx.phase = 'CLEANUP'
    if (ctx.docker) {
      try {
        await ctx.docker.closeAttachments()
        ctx.cleanup.attachmentsClosed = true
      } catch (cause) {
        fail(fault('CLEANUP', cause))
      }
    } else ctx.cleanup.attachmentsClosed = true
    // No byte arrives after the attachments close. Any residue (partial line,
    // incomplete header, unterminated key) or a key/command without its own
    // admitted frame is a recorded PROTOCOL cause, never a silent tail.
    for (const role of ['client', 'observer']) {
      if (!ctx.control[role]) continue
      if (
        ctx.control[role].tail().length ||
        ctx.keys[role].tail().length ||
        !ctx.keys[role].decoder.settled ||
        ctx.tails[`${role}-docker`]?.length
      )
        fail(fault('PROTOCOL'), { caseId: null })
    }
    if (
      ctx.keys.client &&
      (orphanKeys(model()).length || ctx.seq.commandViolations().length)
    )
      fail(fault('PROTOCOL'), { caseId: null })
    for (const role of ['client', 'observer']) {
      const record = ctx.roles[role]
      if (!record) continue
      record.status = 'UNRESOLVED'
      if (!record.attempted) {
        record.status = 'NOT_CREATED'
        continue
      }
      // A definitive refusal followed by absence by name proves no container.
      if (
        !record.id &&
        record.createOutcome === 'REFUSED' &&
        !record.unresolved
      ) {
        record.status = 'NOT_CREATED'
        continue
      }
      // An uncertain attempt is reconciled again inside the cleanup window.
      if (!record.id && !record.unresolved) await reconcile(record, true)
      if (!record.id) {
        fail(fault('CLEANUP'))
        continue
      }
      try {
        const actual = await inspect(record.id, true)
        if (actual) {
          if (
            actual.Id !== record.id ||
            actual.Name !== `/${record.name}` ||
            actual.Image !== PINS.imageId ||
            canonical(actual.Config?.Labels ?? {}) !== canonical(record.labels)
          )
            throw fault('CLEANUP')
          if (actual.State?.Running) {
            const stopped = await call(
              ['container', 'stop', '--time', '1', record.id],
              true
            )
            if (stopped.exitCode !== 0) throw fault('CLEANUP')
          }
          const removed = await call(
            ['container', 'rm', '--force', record.id],
            true
          )
          if (removed.exitCode !== 0) throw fault('CLEANUP')
          if ((await inspect(record.id, true)) !== null) throw fault('CLEANUP')
        }
        record.status = 'REMOVED'
      } catch (cause) {
        if (cause?.code !== ABORTED) fail(fault('CLEANUP', cause))
        else fail(fault('CLEANUP'))
      }
    }
    if (ctx.marker) {
      try {
        await ctx.marker.close()
        ctx.cleanup.markerRemoved = ctx.marker.removed
      } catch (cause) {
        fail(fault('CLEANUP', cause))
      }
    } else ctx.cleanup.markerRemoved = true

    // REVALIDATE: every retained identity again, then release and dispose.
    ctx.phase = 'REVALIDATE'
    const identities = []
    let revalidated = Boolean(graph)
    for (const pin of [...(graph?.pins ?? []), ...ctx.pins])
      try {
        identities.push(await pin.verify())
      } catch (cause) {
        revalidated = false
        fail(fault('DRIFT_RUNTIME', cause))
      }
    if (ctx.evidence)
      try {
        await ctx.evidence.reread()
      } catch (cause) {
        revalidated = false
        fail(fault('DRIFT_RUNTIME', cause))
      }
    ctx.cleanup.revalidated = revalidated
    const closing = await Promise.allSettled(
      [...(graph?.pins ?? []), ...ctx.pins].map((pin) => pin.close())
    )
    ctx.cleanup.pinsClosed = closing.every((r) => r.status === 'fulfilled')
    if (!ctx.cleanup.pinsClosed) fail(fault('CLEANUP'))
    if (graph)
      try {
        await graph.dispose()
        ctx.cleanup.bootstrapDisposed = true
      } catch (cause) {
        fail(fault('CLEANUP', cause))
      }
    releaseSignals()
    if (!ctx.evidence) return { exitCode: 1, report: null, ledger }

    // PUBLISH: derived physical artifacts, traces, ledger, cleanup, report.
    ctx.phase = 'PUBLISH'
    try {
      if (ctx.runId) {
        await storeJson('INPUT_IDENTITIES', PATHS.revalidation, {
          version: 1,
          revalidated,
          identities
        })
        if (ctx.docker)
          await storeJson('INSPECT', PATHS.dockerCalls, {
            version: 1,
            calls: ctx.docker.records
          })
      }
      for (const role of ['client', 'observer']) {
        const keys = ctx.keys[role]
        if (!keys) continue
        await store('RAW_PIPE', RAW_PIPES[role], keys.wireBytes(), role)
        const tails = [
          ['binary', keys.tail()],
          ['control', ctx.control[role].tail()],
          ['docker', ctx.tails[`${role}-docker`] ?? Buffer.alloc(0)]
        ]
        for (const [pipe, tail] of tails)
          if (tail.length)
            await store('PARTIAL_PIPE', PATHS.partial(role, pipe), tail, role)
        for (const entry of keys.keys.values()) {
          const target = derivedArtifact(entry.key)
          await store(
            target.role,
            target.path,
            Buffer.concat(entry.payloads),
            target.bindings.owner,
            target.bindings
          )
        }
      }
      for (const [I, start] of ctx.seq.cli.starts) {
        const dims = { caseId: caseOf(I), processOrdinal: I }
        await storeJson(
          'NATIVE_START',
          PATHS.nativeStart(I),
          start.payload,
          'client',
          dims
        )
        const end = ctx.seq.cli.ends.get(I)
        if (end)
          await storeJson(
            'NATIVE_END',
            PATHS.nativeEnd(I),
            end.payload,
            'client',
            dims
          )
      }
      // Incompleteness is never silent: no cause and no full capture is PROTOCOL.
      if (!ledger.length && CASES.some((K) => concluded.get(K) !== 'CAPTURED'))
        fail(fault('PROTOCOL'))
    } catch (cause) {
      fail(cause)
    }
    try {
      const traces = trace.documents(ctx.runId)
      traces.control.simulated = simulated
      traces.control.partials = []
      traces.observer.partials = []
      for (const a of ctx.evidence.artifacts.filter(
        (x) => x.role === 'PARTIAL_PIPE'
      ))
        (a.bindings.owner === 'observer'
          ? traces.observer
          : traces.control
        ).partials.push(a.path)
      await storeJson('CONTROL_TRACE', PATHS.control, traces.control)
      if (traces.observer.records.length || ctx.keys.observer)
        await storeJson('OBSERVER_TRACE', PATHS.observer, traces.observer)
      await storeJson('FAILURES', PATHS.failures, ledger.failures)
      const containers = ['observer', 'client'].map((role) => {
        const r = ctx.roles[role]
        return {
          role,
          name: r?.name ?? containerName(ctx.nonce, role),
          id: r?.id ?? null,
          labels: r?.labels ?? null,
          configSha256: r?.configSha256 ?? null,
          attempted: r?.attempted ?? false,
          createOutcome: r?.createOutcome ?? 'NOT_ATTEMPTED',
          recovered: r?.recovered ?? false,
          status: r?.status ?? 'NOT_CREATED'
        }
      })
      await storeJson('CLEANUP', PATHS.cleanup, {
        version: 1,
        nonce: ctx.nonce,
        containers,
        ...ctx.cleanup,
        stagedInventory: ctx.evidence.artifacts.map((a) => ({
          path: a.path,
          role: a.role,
          sha256: a.sha256,
          bytes: a.bytes
        }))
      })
      if (ledger.overflow) throw fault('CAP')
      const files = await ctx.evidence.reread()
      const report = buildReport(files, ctx.evidence.artifacts)
      assertEvidence(report, files, ctx.evidence.artifacts)
      await ctx.evidence.publish(Buffer.from(canonical(report)))
      return { exitCode: report.exitCode, report, ledger }
    } catch (error) {
      // Partial artifacts stay pending; no complete report is claimed.
      try {
        await ctx.evidence.abort()
      } catch {}
      return { exitCode: 1, report: null, ledger, error }
    }
  }
}

export const runCapture = createCaptureRunner()
