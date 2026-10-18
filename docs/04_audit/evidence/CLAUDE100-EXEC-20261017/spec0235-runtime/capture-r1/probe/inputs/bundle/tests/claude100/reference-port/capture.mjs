import { parseControlLine, decodeRawFrames, sha256 } from './protocol.mjs'
import { probeError } from './schema.mjs'

/** Origin is assigned by the protected attachment, never read from native bytes. */
export class Capture {
  constructor(
    role,
    runId,
    { shared, record, change, failure, frame, rawFrame = () => {} }
  ) {
    this.role = role
    this.runId = runId
    this.shared = shared
    this.record = record
    this.change = change
    this.failure = failure
    this.onFrame = frame
    this.onRawFrame = rawFrame
    this.lastTag = 0
    this.control = Buffer.alloc(0)
    this.raw = Buffer.alloc(0)
    this.controlWire = []
    this.rawFrames = []
    this.frames = []
    this.rawInventory = []
    this.parts = new Map()
    this.terminals = new Set()
    this.sequence = 0
    this.closed = false
    this.failed = false
    this.bodySizes = new Map()
    this.stdoutBytes = 0
    this.stderrBytes = 0
    this.bodyBytes = 0
  }
  feedControl(bytes) {
    if (this.failed) return
    try {
      this.shared.control += bytes.length
      if (this.shared.control > 512 * 1024) throw probeError('CAP')
      this.controlWire.push(Buffer.from(bytes))
      this.control = Buffer.concat([this.control, bytes])
      let newline
      while ((newline = this.control.indexOf(10)) !== -1) {
        const line = Buffer.from(this.control.subarray(0, newline + 1))
        this.control = this.control.subarray(newline + 1)
        if (line.length > 8192 || this.sequence >= 256) throw probeError('CAP')
        const frame = parseControlLine(
          line,
          this.role,
          this.runId,
          this.sequence++
        )
        const ordinal = this.record(this.role, 'FRAME', {
          frame,
          rawBase64: line.toString('base64')
        })
        this.frames.push({ frame, ordinal })
        this.onFrame(frame, ordinal)
      }
      if (this.control.length > 8192) throw probeError('CAP')
      this.change()
    } catch (cause) {
      this.failed = true
      this.failure(cause, this.role)
    }
  }
  feedRaw(bytes) {
    if (this.failed) return
    try {
      this.shared.raw += bytes.length
      if (this.shared.raw > 8 * 1024 * 1024) throw probeError('CAP')
      this.raw = Buffer.concat([this.raw, bytes])
      const headerSize = this.role === 'client' ? 11 : 10
      while (this.raw.length >= headerSize) {
        const header = this.raw.subarray(0, headerSize)
        if (
          !header
            .subarray(0, 5)
            .equals(Buffer.from(this.role === 'client' ? 'CVGN1' : 'CVGB1'))
        )
          throw probeError('PROTOCOL')
        const tag = header[5],
          channel = this.role === 'client' ? header[6] : null
        const length = header.readUInt32BE(this.role === 'client' ? 7 : 6)
        if (length > 4096) throw probeError('CAP')
        if (this.raw.length < headerSize + length) break
        if (
          this.role === 'client'
            ? ![0, 1].includes(tag) || ![1, 2].includes(channel)
            : tag > 3
        )
          throw probeError('PROTOCOL')
        if (tag < this.lastTag) throw probeError('PROTOCOL')
        this.lastTag = tag
        this.onRawFrame({ tag, channel, bytes: length })
        const complete = Buffer.from(this.raw.subarray(0, headerSize + length))
        const payload = Buffer.from(
          this.raw.subarray(headerSize, headerSize + length)
        )
        this.raw = this.raw.subarray(headerSize + length)
        const key = this.role === 'client' ? `${tag}/${channel}` : String(tag)
        if (this.terminals.has(key)) throw probeError('PROTOCOL')
        if (length === 0) this.terminals.add(key)
        if (!this.parts.has(key)) this.parts.set(key, [])
        this.parts.get(key).push(payload)
        this.rawFrames.push(complete)
        this.rawInventory.push({
          tag,
          channel,
          bytes: length,
          sha256: sha256(payload),
          terminal: length === 0
        })
        if (this.role === 'client') {
          if (channel === 1) this.stdoutBytes += length
          else this.stderrBytes += length
          if (this.stdoutBytes > 1024 * 1024 || this.stderrBytes > 1024 * 1024)
            throw probeError('CAP')
        } else {
          this.bodyBytes += length
          this.bodySizes.set(key, (this.bodySizes.get(key) ?? 0) + length)
          if (
            this.bodyBytes > 2 * 1024 * 1024 ||
            this.bodySizes.get(key) > 512 * 1024
          )
            throw probeError('CAP')
        }
      }
      this.change()
    } catch (cause) {
      this.failed = true
      this.failure(cause, this.role)
    }
  }
  bytesFor(key) {
    return Buffer.concat(this.parts.get(key) ?? [])
  }
  nativeBytes(phase, channel) {
    return this.bytesFor(
      `${phase === 'version' ? 0 : 1}/${channel === 'stdout' ? 1 : 2}`
    )
  }
  nativeComplete(phase) {
    const tag = phase === 'version' ? 0 : 1
    return this.terminals.has(`${tag}/1`) && this.terminals.has(`${tag}/2`)
  }
  bodyComplete(ordinal) {
    return this.terminals.has(String(ordinal))
  }
  body(ordinal) {
    return this.bytesFor(String(ordinal))
  }
  end() {
    if (this.closed) return
    this.closed = true
    if (this.failed) return
    try {
      if (this.control.length || this.raw.length) throw probeError('PROTOCOL')
      decodeRawFrames(Buffer.concat(this.rawFrames), this.role)
      this.change()
    } catch (cause) {
      this.failed = true
      this.failure(cause, this.role)
    }
  }
}
