import { execFile } from 'node:child_process'
import http from 'node:http'
import { performance } from 'node:perf_hooks'
import { probeError } from './schema.mjs'

export const ENGINE_SOCKET = '/var/run/docker.sock'
export const ATTACH_API = 'v1.51'

/** Docker's non-TTY multiplex envelope, independent of wrapper control framing. */
export class DockerMux {
  constructor(onChunk) {
    this.buffer = Buffer.alloc(0)
    this.onChunk = onChunk
    this.bytes = 0
  }
  feed(chunk) {
    this.bytes += chunk.length
    if (this.bytes > 8 * 1024 * 1024) throw probeError('CAP')
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const channel = this.buffer[0]
      const length = this.buffer.readUInt32BE(4)
      if (
        (channel !== 1 && channel !== 2) ||
        this.buffer[1] ||
        this.buffer[2] ||
        this.buffer[3]
      )
        throw probeError('PROTOCOL')
      if (length > 65536) throw probeError('CAP')
      if (this.buffer.length < length + 8) break
      this.onChunk(channel, Buffer.from(this.buffer.subarray(8, length + 8)))
      this.buffer = this.buffer.subarray(length + 8)
    }
  }
  finish() {
    if (this.buffer.length) throw probeError('PROTOCOL')
  }
}

/** Fixed local transport. Test substitutions are private constructor dependencies. */
export class DockerTransport {
  constructor({
    binary,
    configDir,
    deadline,
    now = () => performance.now(),
    execute = execFile,
    request = http.request,
    socketPath = ENGINE_SOCKET
  }) {
    this.binary = binary
    this.configDir = configDir
    this.deadline = deadline
    this.now = now
    this.execute = execute
    this.request = request
    this.socketPath = socketPath
    this.calls = 0
    this.bytes = 0
    this.records = []
    this.attachments = new Set()
    this.cleanupDeadline = null
  }
  budget(cleanup = false) {
    if (++this.calls > 24) throw probeError('CAP')
    if (cleanup && this.cleanupDeadline === null)
      this.cleanupDeadline = this.now() + 5000
    const remaining =
      (cleanup ? this.cleanupDeadline : this.deadline) - this.now()
    if (remaining <= 0) throw probeError('TIMEOUT')
    return Math.max(1, Math.floor(Math.min(2000, remaining)))
  }
  account(bytes) {
    this.bytes += bytes
    if (this.bytes > 256 * 1024) throw probeError('CAP')
  }
  async call(args, { cleanup = false } = {}) {
    if (
      !Array.isArray(args) ||
      args.some((x) => typeof x !== 'string' || x.includes('\0'))
    )
      throw probeError('PROTOCOL')
    const timeout = this.budget(cleanup)
    const ordinal = this.calls
    const argv = [
      '--host',
      `unix://${this.socketPath}`,
      '--config',
      this.configDir,
      ...args
    ]
    const start = this.now()
    const result = await new Promise((resolve, reject) => {
      let observedOut = 0
      let observedErr = 0
      let cap = false
      let child
      try {
        child = this.execute(
          this.binary,
          argv,
          {
            env: {
              PATH: '/usr/bin:/bin',
              HOME: this.configDir,
              LANG: 'C.UTF-8',
              TZ: 'UTC'
            },
            timeout,
            killSignal: 'SIGKILL',
            maxBuffer: 65536,
            encoding: 'buffer',
            windowsHide: true
          },
          (error, stdout, stderr) => {
            const out = Buffer.from(stdout ?? [])
            const err = Buffer.from(stderr ?? [])
            if (out.length > 65536 || err.length > 16384) cap = true
            let accountFailure
            try {
              this.account(out.length + err.length)
            } catch (cause) {
              accountFailure = cause
            }
            const record = {
              ordinal,
              args: [...args],
              elapsedMs: Math.max(0, Math.round(this.now() - start)),
              stdoutBase64: out.toString('base64'),
              stderrBase64: err.toString('base64'),
              complete: !cap && (!error || Number.isInteger(error.code)),
              exitCode: error
                ? Number.isInteger(error.code)
                  ? error.code
                  : null
                : 0,
              signal: error?.signal ?? null
            }
            this.records.push(record)
            if (accountFailure)
              return reject(
                probeError(
                  'CAP',
                  new AggregateError(
                    error ? [accountFailure, error] : [accountFailure]
                  )
                )
              )
            if (cap || error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
              return reject(probeError('CAP', error))
            if (error && !Number.isInteger(error.code))
              return reject(probeError(error.killed ? 'TIMEOUT' : 'IO', error))
            resolve({
              exitCode: record.exitCode,
              stdout: out,
              stderr: err,
              nativeError: error ?? null
            })
          }
        )
        child.stdout?.on('data', (bytes) => {
          observedOut += bytes.length
          if (observedOut > 65536) {
            cap = true
            child.kill('SIGKILL')
          }
        })
        child.stderr?.on('data', (bytes) => {
          observedErr += bytes.length
          if (observedErr > 16384) {
            cap = true
            child.kill('SIGKILL')
          }
        })
      } catch (cause) {
        reject(probeError('IO', cause))
      }
    })
    return result
  }

  /** The <=2s attach handshake returns an owned stream, bounded by run deadline.
   * It does not keep an unbounded `docker attach` CLI command alive. */
  async attach(id, { onStdout, onStderr, onEnd, onFailure }) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw probeError('PROTOCOL')
    if (
      ![onStdout, onStderr, onEnd, onFailure].every(
        (v) => typeof v === 'function'
      )
    )
      throw probeError('PROTOCOL')
    const timeout = this.budget()
    return new Promise((resolve, reject) => {
      let connected = false
      let finished = false
      let ended = false
      let socket
      let timer
      let observationTimer
      const fail = (cause) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        clearTimeout(observationTimer)
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
        path: `/${ATTACH_API}/containers/${id}/attach?logs=0&stream=1&stdin=1&stdout=1&stderr=1`,
        maxHeaderSize: 8192,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'tcp',
          'Content-Length': '0'
        }
      })
      timer = setTimeout(() => fail(probeError('TIMEOUT')), timeout)
      request.on('error', (cause) => fail(probeError('IO', cause)))
      request.on('response', (response) => {
        response.resume()
        fail(
          probeError(
            'IO',
            new Error(
              `Docker attach requires HTTP101, observed ${response.statusCode}`
            )
          )
        )
      })
      request.on('upgrade', (response, upgraded, head) => {
        if (finished) {
          upgraded.destroy()
          return
        }
        if (response.statusCode !== 101) {
          upgraded.destroy()
          fail(probeError('PROTOCOL'))
          return
        }
        try {
          this.account(
            Buffer.byteLength(JSON.stringify(response.rawHeaders ?? []))
          )
        } catch (cause) {
          upgraded.destroy()
          fail(cause)
          return
        }
        if (
          ![
            'application/vnd.docker.multiplexed-stream',
            'application/vnd.docker.raw-stream'
          ].includes(response.headers?.['content-type'])
        ) {
          upgraded.destroy()
          fail(probeError('PROTOCOL'))
          return
        }
        clearTimeout(timer)
        connected = true
        socket = upgraded
        const owner = {
          send: (bytes) =>
            new Promise((yes, no) => {
              if (finished || !Buffer.isBuffer(bytes) || bytes.length > 8192) {
                no(probeError('PROTOCOL'))
                return
              }
              socket.write(bytes, (cause) =>
                cause ? no(probeError('IO', cause)) : yes()
              )
            }),
          close: () =>
            new Promise((done) => {
              clearTimeout(observationTimer)
              if (socket.closed) {
                done()
                return
              }
              socket.once('close', done)
              socket.destroy()
            })
        }
        this.attachments.add(owner)
        observationTimer = setTimeout(
          () => fail(probeError('TIMEOUT')),
          Math.max(1, this.deadline - this.now())
        )
        socket.on('data', (bytes) => {
          if (finished) return
          try {
            mux.feed(bytes)
          } catch (cause) {
            fail(cause)
          }
        })
        socket.on('error', (cause) => fail(probeError('IO', cause)))
        socket.on('end', () => {
          if (finished) return
          clearTimeout(observationTimer)
          try {
            mux.finish()
            ended = true
            onEnd()
          } catch (cause) {
            fail(cause)
          }
        })
        socket.on('close', () => {
          clearTimeout(observationTimer)
          this.attachments.delete(owner)
          if (!finished) {
            finished = true
            if (!ended) {
              try {
                mux.finish()
                ended = true
                onEnd()
              } catch (cause) {
                onFailure(cause)
              }
            }
          }
        })
        resolve(owner)
        if (head.length) {
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
    await Promise.all(
      [...this.attachments].map((attachment) => attachment.close())
    )
  }
}
