// Test-only harness. SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE:
// in-process wrappers (real observer HTTP/SSE and client cores), a simulated
// Docker engine and a scripted fake native client. It never runs Docker,
// Claude, a container or any external network.
import { EventEmitter } from 'node:events'
import http from 'node:http'
import { PassThrough, Writable } from 'node:stream'
import {
  API_KEY,
  CASES,
  MODEL,
  PINS,
  STDIN_MARKERS,
  canonical,
  processInvocation
} from './constants.mjs'
import { createClient } from './client.mjs'
import { createObserver } from './observer.mjs'
import { encodeFrame, observerBlock, parseHostCommand } from './protocol.mjs'
import { TOOL_USES } from './script.mjs'
import { expectedWorkspaceState } from './workspace.mjs'

const BASE = {
  uid: 1000,
  gid: 1000,
  pid: 1,
  interfaces: ['lo'],
  routes: ['127.0.0.0/8', '::1/128'],
  hostMarkerAbsent: true
}
export const HOST_NAMESPACES = { pid: '4026531836', net: '4026531840' }

function request(port, path, { method = 'POST', headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method, headers, agent: false },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        )
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}
function sse(buffer) {
  return buffer
    .toString('utf8')
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const [event, data] = block.split('\n')
      return { event: event.slice(7), data: JSON.parse(data.slice(6)) }
    })
}
function assemble(events) {
  let block = null,
    json = '',
    text = '',
    stop = null
  for (const { data } of events) {
    if (data.type === 'content_block_start') block = data.content_block
    if (data.type === 'content_block_delta') {
      if (data.delta.type === 'text_delta') text += data.delta.text
      else json += data.delta.partial_json
    }
    if (data.type === 'message_delta') stop = data.delta.stop_reason
  }
  if (block?.type === 'tool_use') block = { ...block, input: JSON.parse(json) }
  else block = { type: 'text', text }
  return { block, stop }
}

/**
 * Scripted stand-in for the native client: real HTTP to the observer with a
 * Claude-like body. Knobs inject the divergences the collector must reject.
 */
export async function fakeNative(env, args, stdin, knobs = {}) {
  const port = Number(env.ANTHROPIC_BASE_URL.split(':').pop())
  const caseId = CASES.find((c) => STDIN_MARKERS[c] === stdin)
  const tools = args.includes('Read,Edit')
    ? [
        { name: 'Edit', description: 'e', input_schema: {} },
        { name: 'Read', description: 'r', input_schema: {} }
      ]
    : []
  if (knobs.extraTools && tools.length)
    tools.push({ name: 'Bash', description: 'b', input_schema: {} })
  // R2 of SPEC0238 rev.2: the run2 inventory, only Read.
  if (knobs.onlyRead && tools.length) tools.splice(0, 1)
  const headers = {
    'content-type': 'application/json',
    'x-api-key': knobs.authValue ?? API_KEY,
    'anthropic-version': '2023-06-01'
  }
  if (knobs.missingKey) delete headers['x-api-key']
  if (knobs.authorization) headers.authorization = 'Bearer not-real-test-only'
  if (knobs.expect) headers.expect = knobs.expect
  // query: true is the admitted literal; any string is sent verbatim (OTHER).
  const path =
    knobs.query === true
      ? '/v1/messages?beta=true'
      : typeof knobs.query === 'string'
        ? knobs.query
        : '/v1/messages'
  if (knobs.probe)
    await request(port, '/api/hello', { method: 'GET', headers: {} })
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: knobs.wrongMarker ? 'OTHER' : stdin,
          cache_control: { type: 'ephemeral' }
        }
      ]
    },
    { role: 'system', content: [], output_config: { effort: 'medium' } }
  ]
  const body = (msgs) =>
    JSON.stringify({
      model: knobs.model ?? MODEL,
      messages: msgs,
      system: [{ type: 'text', text: 'synthetic' }],
      tools,
      max_tokens: 128000,
      stream: true,
      unknown_future_field: { kept: true }
    })
  const first = await request(port, path, { headers, body: body(messages) })
  if (first.status !== 200) {
    return {
      stdout: JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: true,
        api_error_status: first.status,
        result: 'API Error',
        permission_denials: []
      }),
      code: 1
    }
  }
  const one = assemble(sse(first.body))
  if (knobs.extraPost)
    await request(port, path, { headers, body: body(messages) })
  if (one.stop !== 'tool_use') {
    return {
      stdout: JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: knobs.wrongResult ? 'nope' : one.block.text,
        permission_denials: []
      }),
      code: 0
    }
  }
  const denied = one.block.name === 'Edit'
  const tool = TOOL_USES[caseId]
  const result = {
    type: 'tool_result',
    tool_use_id: knobs.wrongToolId ? 'toolu_other' : one.block.id,
    content: denied
      ? "Permission to use Edit has been denied because Claude Code is running in don't ask mode."
      : knobs.tamperedRead
        ? 'TAMPERED'
        : '     1\tCVG_CAPTURE_READ_INPUT_V1\n'
  }
  if (denied && !knobs.writeNotError) result.is_error = true
  const second = await request(port, path, {
    headers,
    body: body([
      ...messages,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: one.block.id,
            name: one.block.name,
            input: one.block.input
          }
        ]
      },
      { role: 'user', content: [result] }
    ])
  })
  const two = assemble(sse(second.body))
  return {
    stdout: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: two.block.text,
      permission_denials:
        knobs.readDenial && caseId === 'READ'
          ? [
              {
                tool_name: 'Read',
                tool_use_id: tool.id,
                tool_input: tool.input
              }
            ]
          : denied && !knobs.noDenial
            ? [
                {
                  tool_name: 'Edit',
                  tool_use_id: tool.id,
                  tool_input: knobs.denialInput ?? tool.input
                }
              ]
            : []
    }),
    code: 0
  }
}

/** Fake child process: EventEmitter with stdio streams and a real lifecycle. */
function fakeSpawn(knobs, pids) {
  let next = 41
  return (file, args, options) => {
    const child = new EventEmitter()
    child.pid = next++
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    const input = []
    let killed = null,
      closed = false
    child.stdin = new Writable({
      write(chunk, _e, cb) {
        input.push(chunk)
        cb()
      }
    })
    const close = (code, signal) => {
      if (closed) return
      closed = true
      child.stdout.end()
      child.stderr.end()
      setImmediate(() => child.emit('close', code, signal))
    }
    child.kill = () => {}
    pids.kill = (pid, signal) => {
      if (pid === -child.pid || pid === child.pid) {
        killed = signal
        close(null, signal)
      }
    }
    if (knobs.spawnError && args[0] !== '--version') {
      setImmediate(() => child.emit('error', new Error('ENOENT')))
      return child
    }
    setImmediate(() => child.emit('spawn'))
    child.stdin.on('finish', async () => {
      const stdin = Buffer.concat(input).toString('utf8')
      if (args[0] === '--version') {
        child.stdout.write(knobs.versionText ?? '2.1.302 (Claude Code)\n')
        return close(0, null)
      }
      if (knobs.hang) return
      try {
        const out = await fakeNative(options.env, args, stdin, knobs)
        if (killed) return
        child.stdout.write(out.stdout)
        if (knobs.stderrText) child.stderr.write(knobs.stderrText)
        close(knobs.signal ? null : out.code, knobs.signal ?? null)
      } catch {
        close(2, null)
      }
    })
    return child
  }
}

/**
 * Simulated engine: lifecycle calls return inspect-shaped data; attach wires
 * the real wrapper cores through the same framing used inside containers.
 */
export class SimulatedDocker {
  constructor(knobs = {}) {
    this.knobs = knobs
    this.containers = new Map()
    this.records = []
    this.calls = 0
    this.attachments = new Set()
  }
  result(stdout = '', exitCode = 0, stderr = '') {
    return {
      exitCode,
      stdout: Buffer.from(stdout),
      stderr: Buffer.from(stderr),
      nativeError: null
    }
  }
  async call(args) {
    this.calls++
    const record = (r) => {
      this.records.push({
        ordinal: this.calls,
        args: [...args],
        elapsedMs: 0,
        exitCode: r.exitCode,
        signal: null,
        complete: true,
        stdoutBase64: r.stdout.toString('base64'),
        stderrBase64: r.stderr.toString('base64')
      })
      return r
    }
    if (this.knobs.dockerDown && args[0] === 'version')
      return record(this.result('', 1, 'cannot connect'))
    if (args[0] === 'version') return record(this.result('1.52 1.44\n'))
    if (args[0] === 'image')
      return record(
        this.result(
          JSON.stringify([
            {
              Id: this.knobs.imageId ?? PINS.imageId,
              Config: {
                Labels: {},
                Env: ['PATH=/usr/bin:/bin', 'LANG=en_US.utf8']
              }
            }
          ])
        )
      )
    if (args[0] === 'create') {
      const role = args
        .filter((a, i) => args[i - 1] === '--label')
        .find((a) => a.startsWith('cvg.role='))
        ?.slice(9)
      if (this.knobs.refusedCreate === role)
        return record(this.result('', 1, 'Error response from daemon: refused'))
      if (this.knobs.uncertainCreate?.role === role) {
        // Recorded like the real transport: killed CLI, incomplete, no exit.
        this.records.push({
          ordinal: this.calls,
          args: [...args],
          elapsedMs: 2005,
          exitCode: null,
          signal: 'SIGKILL',
          complete: false,
          stdoutBase64: '',
          stderrBase64: ''
        })
        if (this.knobs.uncertainCreate.late) this.create(args)
        throw Object.assign(new Error('killed'), { code: 'TIMEOUT' })
      }
      return record(this.create(args))
    }
    const [, sub] = args
    if (sub === 'inspect') {
      const c = [...this.containers.values()].find(
        (x) => x.raw.Id === args[2] || x.raw.Name === `/${args[2]}`
      )
      if (!c)
        return record(
          this.result('[]\n', 1, `Error: No such container: ${args[2]}\n`)
        )
      const raw = structuredClone(c.raw)
      if (this.knobs.writableMount && c.role === 'client')
        raw.Mounts[0].RW = true
      return record(this.result(JSON.stringify([raw])))
    }
    if (sub === 'start') {
      const c = this.containers.get(args[2])
      c.raw.State.Running = true
      c.raw.State.Pid = c.role === 'observer' ? 9001 : 9002
      await this.boot(c)
      return record(this.result(`${args[2]}\n`))
    }
    if (sub === 'stop' || sub === 'rm') {
      const c = this.containers.get(args.at(-1))
      if (sub === 'rm' && this.knobs.rmFails)
        return record(this.result('', 1, 'busy'))
      if (c) {
        c.raw.State.Running = false
        await c.shutdown?.()
        if (sub === 'rm') this.containers.delete(args.at(-1))
      }
      return record(this.result(''))
    }
    throw new Error('Unexpected simulated Docker call')
  }
  create(args) {
    const value = (flag) => args[args.indexOf(flag) + 1]
    const repeated = (flag) =>
      args.flatMap((s, i) => (s === flag ? [args[i + 1]] : []))
    const labels = Object.fromEntries(
      repeated('--label').map((s) => [
        s.slice(0, s.indexOf('=')),
        s.slice(s.indexOf('=') + 1)
      ])
    )
    const role = labels['cvg.role']
    const id = (role === 'observer' ? 'a' : 'b').repeat(64)
    const image = args.indexOf(PINS.imageId)
    const env = args
      .filter((s) => s.startsWith('--env='))
      .map((s) => s.slice(6))
    const raw = {
      Id: id,
      Name: `/${value('--name')}`,
      Image: PINS.imageId,
      Config: {
        Image: PINS.imageId,
        Labels: labels,
        User: value('--user'),
        WorkingDir: value('--workdir'),
        Entrypoint: [value('--entrypoint')],
        Cmd: args.slice(image + 1),
        Tty: false,
        OpenStdin: true,
        Env: ['PATH=/usr/bin:/bin', ...env]
      },
      HostConfig: {
        ReadonlyRootfs: true,
        Privileged: false,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Devices: [],
        DeviceRequests: null,
        CapAdd: null,
        Binds: null,
        NetworkMode: value('--network'),
        PidMode: '',
        IpcMode: 'private',
        CgroupnsMode: 'private',
        PortBindings: {},
        PublishAllPorts: false,
        ExtraHosts: null,
        Memory: Number(args.find((s) => s.startsWith('--memory=')).slice(9)),
        NanoCpus: 1e9,
        PidsLimit: 64,
        Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }],
        LogConfig: { Type: 'none' },
        Tmpfs: Object.fromEntries(
          repeated('--tmpfs').map((s) => [
            s.slice(0, s.indexOf(':')),
            s.slice(s.indexOf(':') + 1)
          ])
        )
      },
      Mounts: repeated('--mount').map((s) => {
        const f = Object.fromEntries(
          s
            .split(',')
            .filter((x) => x.includes('='))
            .map((x) => x.split('='))
        )
        return {
          Type: 'bind',
          Source: f.source,
          Destination: f.destination,
          RW: false
        }
      }),
      State: { Running: false, Pid: 0, ExitCode: 0 }
    }
    this.containers.set(id, { role, raw, runId: raw.Config.Cmd[1] })
    return this.result(`${id}\n`)
  }
  async attach(id, callbacks) {
    const c = this.containers.get(id)
    c.callbacks = callbacks
    c.commandSeq = 0
    const owner = {
      send: async (bytes) => {
        const command = parseHostCommand(bytes, c.role, c.runId, c.commandSeq++)
        setImmediate(() => this.deliver(c, command))
      },
      close: async () => {
        this.attachments.delete(owner)
      }
    }
    this.attachments.add(owner)
    return owner
  }
  async closeAttachments() {
    for (const owner of [...this.attachments]) await owner.close()
  }
  async boot(c) {
    let seq = 0
    let held = null
    const send = async (type, payload) => {
      const frame = encodeFrame(c.runId, c.role, seq++, type, payload)
      const bytes = this.knobs.mutateFrame?.(c.role, type, frame) ?? frame
      // Test-only reordering across pipes: the REJECTED control frame is
      // delivered after the next binary block, in the same synchronous turn.
      if (this.knobs.reorderRejected && type === 'REJECTED') held = bytes
      else c.callbacks.onStdout(bytes)
    }
    let blocks = 0
    const raw = async (bytes) => {
      c.callbacks.onStderr(Buffer.from(bytes))
      if (held) {
        const late = held
        held = null
        c.callbacks.onStdout(late)
      }
      blocks++
      // Test-only physical mutants: a key without its own control frame.
      if (c.role === 'observer' && this.knobs.unbacked && blocks === 12)
        c.callbacks.onStderr(
          observerBlock(
            { caseTag: 1, requestTag: 0, kind: 3, segmentTag: 9 },
            Buffer.from('UNBACKED')
          )
        )
      if (c.role === 'observer' && this.knobs.orphanNull && blocks === 1)
        c.callbacks.onStderr(
          observerBlock(
            { caseTag: 0, requestTag: 11, kind: 2, segmentTag: 65535 },
            Buffer.from('ORPHAN')
          )
        )
    }
    const base = {
      ...BASE,
      pidNamespace: c.role === 'observer' ? '4026533001' : '4026533002',
      netNamespace: '4026533100'
    }
    c.base = base
    if (c.role === 'observer') {
      c.core = createObserver({
        send,
        raw,
        observeState: async () =>
          this.knobs.driftAfter && c.ended
            ? { ...expectedWorkspaceState(), sha256: '0'.repeat(64) }
            : expectedWorkspaceState()
      })
      await c.core.listen()
      this.port = c.core.port
      await c.core.initialState(base)
    } else {
      const pids = { kill: () => {} }
      c.core = createClient({
        send,
        raw,
        spawn: fakeSpawn(this.knobs, pids),
        listPids: async () =>
          this.knobs.descendants && c.started > 1 ? [77] : [],
        executableDigest: async () =>
          this.knobs.executableSha256 ?? PINS.claudeSha256,
        executableIdentity: async () => 'stable',
        workspaceState: async () => expectedWorkspaceState(),
        prepareScratch: async () => {},
        invocation: processInvocation,
        kill: (pid, signal) => pids.kill(pid, signal),
        selfPid: () => 1
      })
    }
    c.shutdown = async () => {
      if (!c.stopped) await this.deliver(c, { type: 'STOP', payload: {} })
    }
    c.send = send
  }
  async deliver(c, command) {
    const { type, payload } = command
    try {
      if (type === 'STOP') {
        if (c.stopped) return
        c.stopped = true
        if (c.role === 'observer') await c.core.stop()
        else await c.core.stop()
        if (!this.knobs.noClosed) await c.send('CLOSED', {})
        if (this.knobs.residue === c.role) {
          c.callbacks.onStdout(Buffer.from('{"partial'))
          c.callbacks.onStderr(Buffer.from('CVGO2'))
        }
        c.callbacks.onEnd(Buffer.alloc(0))
        return
      }
      if (c.role === 'observer') {
        if (type === 'END_CASE') c.ended = true
        await c.core.command(command)
      } else if (type === 'CONFIGURE') await c.core.configure(payload, c.base)
      else {
        c.started = (c.started ?? 0) + 1
        c.core.startNative(payload).catch(async (cause) => {
          await c.send('ERROR', {
            code: cause.code ?? 'PROTOCOL',
            caseId: payload.caseId,
            processOrdinal: payload.processOrdinal,
            requestOrdinal: null
          })
        })
      }
    } catch (cause) {
      await c.send('ERROR', {
        code: cause.code ?? 'PROTOCOL',
        caseId: null,
        processOrdinal: null,
        requestOrdinal: null
      })
    }
  }
}
export const simulatedTransport = (knobs) => {
  const engine = new SimulatedDocker(knobs)
  return {
    engine,
    factory: () => engine
  }
}
export const canonicalOf = canonical
