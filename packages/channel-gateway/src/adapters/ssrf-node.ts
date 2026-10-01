import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

/**
 * Node-only transport for the composed SSRF guard. The URL hostname remains
 * the authority used for HTTP Host and TLS SNI, while lookup pins the socket
 * to an address already checked by the guard for this exact hop.
 */
export async function fetchWithResolvedAddress(
  rawUrl: string,
  init: Record<string, unknown>,
  resolvedAddresses: readonly string[]
): Promise<Response> {
  const url = new URL(rawUrl)
  const address = resolvedAddresses[0]
  if (!address) throw new Error('No resolved address available')

  const hostname = stripBrackets(url.hostname)
  const family = isIP(stripBrackets(address))
  if (family === 0) throw new Error('Resolved address is not an IP literal')
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported transport protocol: ${url.protocol}`)
  }

  const body = await encodeBody(init.body)
  const headers = toHeaders(init.headers)
  headers.delete('host')
  headers.set('host', url.host)
  if (body !== undefined && !headers.has('content-length')) {
    headers.set('content-length', String(body.byteLength))
  }

  const method = typeof init.method === 'string' ? init.method : 'GET'
  const requestOptions = {
    agent: false,
    hostname,
    port: url.port || undefined,
    path: `${url.pathname || '/'}${url.search}`,
    method,
    headers: Object.fromEntries(headers.entries()),
    lookup: pinnedLookup(stripBrackets(address)),
    ...(url.protocol === 'https:' ? { servername: hostname } : {})
  }

  return new Promise<Response>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    const request =
      url.protocol === 'https:'
        ? httpsRequest(requestOptions, (response) => {
            void readResponse(response, method).then(
              (result) => finish(() => resolve(result)),
              (error: unknown) => finish(() => reject(error))
            )
          })
        : httpRequest(requestOptions, (response) => {
            void readResponse(response, method).then(
              (result) => finish(() => resolve(result)),
              (error: unknown) => finish(() => reject(error))
            )
          })

    request.once('error', (error) => finish(() => reject(error)))

    const signal = asAbortSignal(init.signal)
    const abort = () => {
      const reason = signal?.reason
      const error =
        reason instanceof Error
          ? reason
          : new DOMException('Request aborted', 'AbortError')
      request.destroy(error)
    }
    if (signal) {
      if (signal.aborted) {
        abort()
      } else {
        signal.addEventListener('abort', abort, { once: true })
        request.once('close', () => signal.removeEventListener('abort', abort))
      }
    }

    request.end(body === undefined ? undefined : Buffer.from(body))
  })
}

function stripBrackets(value: string): string {
  return value.replace(/^\[|\]$/g, '')
}

function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address)
  if (family === 0) throw new Error('Resolved address is not an IP literal')
  // Node 22+ connect lookup asks for every address (`all: true`, used by
  // autoSelectFamily); answer in the shape requested, always with the pin.
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address, family }])
      return
    }
    callback(null, address, family)
  }
}

function toHeaders(value: unknown): Headers {
  const headers = new Headers()
  if (value instanceof Headers) {
    value.forEach((entry, name) => headers.set(name, entry))
    return headers
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (Array.isArray(entry) && entry.length >= 2) {
        headers.set(String(entry[0]), String(entry[1]))
      }
    }
    return headers
  }
  if (value && typeof value === 'object') {
    for (const [name, entry] of Object.entries(value)) {
      if (Array.isArray(entry)) {
        headers.set(name, entry.map(String).join(', '))
      } else if (entry !== undefined) {
        headers.set(name, String(entry))
      }
    }
  }
  return headers
}

async function encodeBody(value: unknown): Promise<Uint8Array | undefined> {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  if (value instanceof URLSearchParams) {
    return new TextEncoder().encode(value.toString())
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer())
  }
  throw new Error('Unsupported request body for bound Node transport')
}

function asAbortSignal(value: unknown): AbortSignal | undefined {
  if (
    value &&
    typeof value === 'object' &&
    'aborted' in value &&
    'addEventListener' in value &&
    'removeEventListener' in value
  ) {
    return value as AbortSignal
  }
  return undefined
}

async function readResponse(
  response: import('node:http').IncomingMessage,
  method: string
) {
  const chunks: Buffer[] = []
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry)
    } else if (value !== undefined) {
      headers.append(name, value)
    }
  }
  const status = response.statusCode
  if (!status) throw new Error('Response did not include an HTTP status')
  // The Fetch Response constructor rejects a body for these statuses, and a
  // HEAD response never has one.
  const bodyless =
    method.toUpperCase() === 'HEAD' ||
    status === 204 ||
    status === 205 ||
    status === 304
  return new Response(bodyless ? null : Buffer.concat(chunks), {
    status,
    statusText: response.statusMessage ?? '',
    headers
  })
}
