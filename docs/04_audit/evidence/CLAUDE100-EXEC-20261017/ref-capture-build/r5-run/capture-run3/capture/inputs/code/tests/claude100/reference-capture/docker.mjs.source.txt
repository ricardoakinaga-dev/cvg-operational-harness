import { execFile } from 'node:child_process'
import http from 'node:http'
import { performance } from 'node:perf_hooks'
import { LIMITS, PINS, fault } from './constants.mjs'

/** Docker non-TTY multiplex envelope (stdout=1, stderr=2), capped per stream. */
export class DockerMux {
  constructor(onChunk) {
    this.buffer = Buffer.alloc(0)
    this.onChunk = onChunk
    this.totals = { 1: 0, 2: 0 }
  }
  feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const channel = this.buffer[0]
      if (
        (channel !== 1 && channel !== 2) ||
        this.buffer[1] ||
        this.buffer[2] ||
        this.buffer[3]
      )
        throw fault('PROTOCOL')
      const length = this.buffer.readUInt32BE(4)
      const cap = channel === 1 ? LIMITS.controlBytes : LIMITS.rawWireBytes
      // Checked before allocating or waiting for the declared payload.
      if (this.totals[channel] + length > cap) throw fault('CAP')
      if (this.buffer.length < length + 8) break
      this.totals[channel] += length
      const payload = Buffer.from(this.buffer.subarray(8, length + 8))
      this.buffer = this.buffer.subarray(length + 8)
      this.onChunk(channel, payload)
    }
  }
  get pending() {
    return this.buffer
  }
}

/** Fixed local Docker access: unix socket, API v1.51, own empty config. */
export class DockerTransport {
  constructor({
    binary = PINS.dockerPath,
    configDir,
    deadline,
    closeDeadline = () => null,
    horizon = deadline + LIMITS.closeMs,
    now = () => performance.now(),
    execute = execFile,
    request = http.request,
    socketPath = PINS.dockerSocket
  }) {
    this.binary = binary
    this.configDir = configDir
    this.deadline = deadline
    this.closeDeadline = closeDeadline
    this.horizon = horizon
    this.now = now
    this.execute = execute
    this.request = request
    this.socketPath = socketPath
    this.calls = 0
    this.records = []
    this.attachments = new Set()
  }
  budget(closing) {
    // A retry never renews the cap; every attempt consumes one call.
    if (++this.calls > LIMITS.dockerCalls) throw fault('CAP')
    const limit = closing
      ? (this.closeDeadline() ?? this.deadline)
      : this.deadline
    const remaining = limit - this.now()
    if (remaining <= 0) throw fault('TIMEOUT')
    return Math.max(1, Math.floor(Math.min(LIMITS.dockerCallMs, remaining)))
  }
  async call(args, { closing = false } = {}) {
    if (
      !Array.isArray(args) ||
      args.some((x) => typeof x !== 'string' || x.includes('\0'))
    )
      throw fault('PROTOCOL')
    const timeout = this.budget(closing)
    const ordinal = this.calls
    const argv = [
      '--host',
      `unix://${this.socketPath}`,
      '--config',
      this.configDir,
      ...args
    ]
    const started = this.now()
    return new Promise((resolve, reject) => {
      let cap = false,
        child
      const seen = { out: 0, err: 0 }
      try {
        child = this.execute(
          this.binary,
          argv,
          {
            // Closed environment: no inherited DOCKER_HOST/context/proxy/Node.
            env: {
              PATH: '/usr/bin:/bin',
              HOME: this.configDir,
              LANG: 'C.UTF-8',
              TZ: 'UTC',
              DOCKER_API_VERSION: PINS.dockerApi
            },
            timeout,
            killSignal: 'SIGKILL',
            maxBuffer: LIMITS.dockerStreamBytes,
            encoding: 'buffer',
            windowsHide: true
          },
          (error, stdout, stderr) => {
            const out = Buffer.from(stdout ?? [])
            const err = Buffer.from(stderr ?? [])
            if (
              out.length > LIMITS.dockerStreamBytes ||
              err.length > LIMITS.dockerStreamBytes
            )
              cap = true
            const record = {
              ordinal,
              args: [...args],
              elapsedMs: Math.max(0, Math.round(this.now() - started)),
              exitCode: error
                ? Number.isInteger(error.code)
                  ? error.code
                  : null
                : 0,
              signal: error?.signal ?? null,
              complete: !cap && (!error || Number.isInteger(error.code)),
              stdoutBase64: out.toString('base64'),
              stderrBase64: err.toString('base64')
            }
            this.records.push(record)
            if (cap || error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
              return reject(fault('CAP', error ?? undefined))
            if (error && !Number.isInteger(error.code))
              return reject(fault(error.killed ? 'TIMEOUT' : 'IO', error))
            resolve({
              exitCode: record.exitCode,
              stdout: out,
              stderr: err,
              nativeError: error ?? null
            })
          }
        )
        child.stdout?.on('data', (bytes) => {
          seen.out += bytes.length
          if (seen.out > LIMITS.dockerStreamBytes && !cap) {
            cap = true
            child.kill('SIGKILL')
          }
        })
        child.stderr?.on('data', (bytes) => {
          seen.err += bytes.length
          if (seen.err > LIMITS.dockerStreamBytes && !cap) {
            cap = true
            child.kill('SIGKILL')
          }
        })
      } catch (cause) {
        reject(fault('IO', cause))
      }
    })
  }

  /** <=2s attach handshake; the stream itself is bounded by the run deadline. */
  async attach(id, { onStdout, onStderr, onEnd, onFailure }) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw fault('PROTOCOL')
    const timeout = Math.min(this.budget(false), LIMITS.attachHandshakeMs)
    return new Promise((resolve, reject) => {
      let connected = false,
        finished = false,
        socket = null,
        observation = null
      const fail = (cause) => {
        if (finished) return
        finished = true
        clearTimeout(handshake)
        clearTimeout(observation)
        socket?.destroy()
        request.destroy()
        if (connected) onFailure(cause)
        else reject(cause)
      }
      const mux = new DockerMux((channel, bytes) =>
        (channel === 1 ? onStdout : onStderr)(bytes)
      )
      const request = this.request({
        socketPath: this.socketPath,
        method: 'POST',
        path: `/v${PINS.dockerApi}/containers/${id}/attach?logs=0&stream=1&stdin=1&stdout=1&stderr=1`,
        maxHeaderSize: 8192,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'tcp',
          'Content-Length': '0'
        }
      })
      const handshake = setTimeout(() => fail(fault('TIMEOUT')), timeout)
      request.on('error', (cause) => fail(fault('IO', cause)))
      request.on('response', (response) => {
        response.resume()
        fail(fault('IO'))
      })
      request.on('upgrade', (response, upgraded, head) => {
        if (finished) {
          upgraded.destroy()
          return
        }
        // Same admitted media types as the qualified 0235 demultiplexer; the
        // stream is always parsed as the non-TTY multiplex and fails closed.
        if (
          response.statusCode !== 101 ||
          ![
            'application/vnd.docker.multiplexed-stream',
            'application/vnd.docker.raw-stream'
          ].includes(response.headers?.['content-type'])
        ) {
          upgraded.destroy()
          fail(fault('PROTOCOL'))
          return
        }
        clearTimeout(handshake)
        connected = true
        socket = upgraded
        const owner = {
          send: (bytes) =>
            new Promise((yes, no) => {
              if (
                finished ||
                !Buffer.isBuffer(bytes) ||
                bytes.length > LIMITS.controlFrameBytes
              ) {
                no(fault('PROTOCOL'))
                return
              }
              socket.write(bytes, (cause) =>
                cause ? no(fault('IO', cause)) : yes()
              )
            }),
          close: () =>
            new Promise((done) => {
              clearTimeout(observation)
              finished = true
              if (socket.closed) {
                done()
                return
              }
              socket.once('close', done)
              socket.destroy()
            }),
          get pending() {
            return mux.pending
          }
        }
        this.attachments.add(owner)
        // The stream lives until the absolute controller+close horizon only.
        observation = setTimeout(
          () => fail(fault('TIMEOUT')),
          Math.max(1, this.horizon - this.now())
        )
        socket.on('data', (bytes) => {
          if (finished) return
          try {
            mux.feed(bytes)
          } catch (cause) {
            fail(cause)
          }
        })
        socket.on('error', (cause) => fail(fault('IO', cause)))
        socket.on('close', () => {
          clearTimeout(observation)
          this.attachments.delete(owner)
          if (finished) return
          finished = true
          // A multiplex tail is partial evidence, never a completed frame.
          if (mux.pending.length) onFailure(fault('PROTOCOL'))
          onEnd(mux.pending)
        })
        resolve(owner)
        if (head?.length) {
          try {
            mux.feed(head)
          } catch (cause) {
            fail(cause)
          }
        }
      })
      request.end()
    })
  }
  async closeAttachments() {
    await Promise.all([...this.attachments].map((owner) => owner.close()))
  }
}
