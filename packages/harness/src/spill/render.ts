import { createHash, randomBytes } from 'node:crypto'

/**
 * SPEC 0293 §3.3: pure rendering of a tool output for the model. Nothing here
 * does IO; the marker is the only randomness and is injected for tests.
 */

export interface SerializedOutput {
  readonly text: string
  readonly mediaType: 'text/plain' | 'application/json'
  /** The tool itself reported that it had already cut its output. */
  readonly truncatedAtSource: boolean
}

/** What the model reads when a tool output cannot be serialised. */
export const UNSERIALIZABLE_OUTPUT = '[saída não serializável]'

export function serializeToolOutput(output: unknown): SerializedOutput {
  if (typeof output === 'string') {
    return { text: output, mediaType: 'text/plain', truncatedAtSource: false }
  }
  let text: string
  try {
    text = JSON.stringify(output) ?? ''
  } catch {
    // never a silent empty result (SPEC 0293 I1)
    text = UNSERIALIZABLE_OUTPUT
  }
  const truncatedAtSource =
    typeof output === 'object' &&
    output !== null &&
    (output as { truncated?: unknown }).truncated === true
  return { text, mediaType: 'application/json', truncatedAtSource }
}

export function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

const isContinuation = (byte: number): boolean =>
  (byte & 0b1100_0000) === 0b1000_0000

/** First `limit` bytes, cut on a code point boundary (I8). */
export function utf8Head(text: string, limit: number): string {
  const buffer = Buffer.from(text, 'utf8')
  if (buffer.length <= limit) return text
  let end = limit
  while (end > 0 && isContinuation(buffer[end] as number)) end -= 1
  return buffer.subarray(0, end).toString('utf8')
}

/** Last `limit` bytes, cut on a code point boundary (I8). */
export function utf8Tail(text: string, limit: number): string {
  const buffer = Buffer.from(text, 'utf8')
  if (buffer.length <= limit) return text
  let start = buffer.length - limit
  while (start < buffer.length && isContinuation(buffer[start] as number)) {
    start += 1
  }
  return buffer.subarray(start).toString('utf8')
}

/** A per-block marker the content could not have known (I12). */
export function newBlockMarker(
  content: string,
  random: (size: number) => Buffer = randomBytes
): string {
  for (;;) {
    const marker = random(8).toString('hex')
    if (!content.includes(marker)) return marker
  }
}

export interface PreviewBlockInput {
  readonly toolId: string
  readonly text: string
  readonly headBytes: number
  readonly tailBytes: number
  readonly stored: { readonly locator: string } | null
  readonly truncatedAtSource: boolean
  readonly commitUncertain: boolean
  readonly marker: string
}

/** Header, delimiters and the two slices of the preview block. */
export function renderPreviewBlock(input: PreviewBlockInput): string {
  const total = utf8Bytes(input.text)
  const head = utf8Head(input.text, input.headBytes)
  const tail = utf8Tail(input.text, input.tailBytes)
  const headLen = utf8Bytes(head)
  const tailLen = utf8Bytes(tail)
  const omitted = Math.max(0, total - headLen - tailLen)
  const m = input.marker
  const header = [
    `[resultado de ferramenta cortado:${m}]`,
    `ferramenta=${input.toolId}`,
    `bytes=${total}`,
    `sha256=${sha256Hex(input.text).slice(0, 16)}`,
    `previewHeadBytes=${headLen}`,
    `previewTailBytes=${tailLen}`,
    `omitidos=${omitted}`,
    `armazenado=${input.stored ? 'sim' : 'não'}`,
    ...(input.stored ? [`locator=${input.stored.locator}`] : []),
    ...(input.truncatedAtSource ? ['cortadoNaOrigem'] : []),
    ...(input.commitUncertain ? ['commitIncerto'] : [])
  ].join(' ')
  return [
    header,
    `--- início:${m} ---`,
    head,
    `--- meio:${m} ---`,
    tail,
    `--- fim:${m} ---`
  ].join('\n')
}

export interface InlineBlockInput {
  readonly toolId: string
  readonly text: string
  readonly marker: string
}

/**
 * A result that fits is framed too (SPEC 0293 §3.3, I12): the prompt joins
 * items as plain text, so the frame is what keeps one result from imitating
 * the header of the next.
 */
export function renderInlineBlock(input: InlineBlockInput): string {
  const m = input.marker
  return [
    `[resultado de ferramenta:${m}] ferramenta=${input.toolId} bytes=${utf8Bytes(input.text)} sha256=${sha256Hex(input.text).slice(0, 16)}`,
    `--- início:${m} ---`,
    input.text,
    `--- fim:${m} ---`
  ].join('\n')
}

export interface AlignedSlice {
  readonly text: string
  /** Bytes advanced from the requested offset to reach a code point boundary. */
  readonly skippedBytes: number
  /** Whole code points only. */
  readonly bytesRead: number
}

/** Only asked for the lead byte of a multibyte character (>= 0xC0): ASCII is never split. */
const sequenceLength = (lead: number): number =>
  lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2

/**
 * SPEC 0293 slice 2 review: cut a byte window on code point boundaries. `window`
 * holds the bytes from the requested offset (up to `length` plus 4 more, or the
 * end of the content). A start that falls inside a character moves to the next
 * boundary; an end that falls inside one moves back to the last whole character
 * (or, if not even one fits, takes that character whole). The next read starts at
 * the effective offset plus `bytesRead` and so continues exactly.
 */
export function alignUtf8Slice(window: Buffer, length: number): AlignedSlice {
  let start = 0
  while (
    start < window.length &&
    start < 3 &&
    isContinuation(window[start] as number)
  ) {
    start += 1
  }
  let end = Math.min(start + length, window.length)
  if (end < window.length && isContinuation(window[end] as number)) {
    let boundary = end
    while (boundary > start && isContinuation(window[boundary] as number)) {
      boundary -= 1
    }
    end =
      boundary > start
        ? boundary
        : Math.min(
            start + sequenceLength(window[start] as number),
            window.length
          )
  }
  return {
    text: window.subarray(start, end).toString('utf8'),
    skippedBytes: start,
    bytesRead: end - start
  }
}
