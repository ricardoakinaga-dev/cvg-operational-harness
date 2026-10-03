export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class EgressDeniedError extends Error {
  constructor(url: string) {
    super(`Egress denied for ${safeOrigin(url)}`)
    this.name = 'EgressDeniedError'
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'invalid URL'
  }
}

/**
 * Fetch restricted to an explicit list of origins (scheme + host + port).
 * Redirects are never followed, so a configured service cannot bounce the
 * assistant to an unlisted destination.
 */
export function allowlistedFetch(
  allowedOrigins: readonly string[],
  fetchImpl: FetchLike = globalThis.fetch as FetchLike
): FetchLike {
  const allowed = new Set(
    allowedOrigins.map((origin) => new URL(origin).origin)
  )
  return async (input, init) => {
    let origin: string
    try {
      origin = new URL(input).origin
    } catch {
      throw new EgressDeniedError(input)
    }
    if (!allowed.has(origin)) throw new EgressDeniedError(input)
    return fetchImpl(input, { ...init, redirect: 'manual' })
  }
}
