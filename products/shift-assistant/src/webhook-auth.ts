import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Signed webhook envelope (SPEC 0317 section 7, docs/webhook-assinado.md).
 * No WhatsApp provider supported here signs its body in this format: a real
 * channel needs a dedicated ingress that authenticates the provider and signs
 * this envelope, and config.ts refuses the real mode until that exists.
 */
export const WEBHOOK_ENVELOPE = 'cvg-shift-webhook-v1'
export const WEBHOOK_SIGNATURE_VERSION = 'v1'
/** Largest distance, either way, between the envelope and the server clock. */
export const WEBHOOK_MAX_SKEW_SECONDS = 300
/** Largest time two keys of one provider/tenant may be valid together. */
export const WEBHOOK_MAX_ROTATION_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000
const MAX_KEYS = 32
const MIN_KEY_BYTES = 32

export const WEBHOOK_HEADERS = {
  tenant: 'x-cvg-webhook-tenant',
  keyId: 'x-cvg-webhook-key-id',
  timestamp: 'x-cvg-webhook-timestamp',
  deliveryId: 'x-cvg-webhook-delivery-id',
  signature: 'x-cvg-webhook-signature'
} as const

// None of these alphabets holds a newline, so the signed text is unambiguous.
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const DELIVERY_ID = /^[A-Za-z0-9._:-]{8,128}$/
const TIMESTAMP = /^[0-9]{10}$/
const SIGNATURE = /^v1=([0-9a-f]{64})$/
const KEY_MATERIAL = /^[A-Za-z0-9_-]+$/

export type WebhookProvider = 'waha' | 'evolution'

export interface WebhookKey {
  provider: WebhookProvider
  tenant: string
  keyId: string
  /** Absent only on a revoked entry: its material is gone from the config. */
  secret?: Buffer
  notBeforeMs: number
  notAfterMs: number
  revoked: boolean
}

export interface WebhookAuth {
  /** The one tenant this process serves. */
  tenant: string
  keys: WebhookKey[]
}

export interface WebhookEnvelope {
  tenant: string
  keyId: string
  timestamp: string
  deliveryId: string
  signature: Buffer
  key: WebhookKey & { secret: Buffer }
}

/** Content-free reason of a refusal: the only thing that reaches a log. */
export type WebhookRefusal =
  | 'query_refused'
  | 'envelope_invalid'
  | 'tenant_mismatch'
  | 'timestamp_outside_window'
  | 'key_unknown'
  | 'key_revoked'
  | 'key_outside_validity'
  | 'signature_invalid'

const KeySchema = z
  .object({
    provider: z.enum(['waha', 'evolution']),
    tenant: z.string().regex(NAME),
    keyId: z.string().regex(NAME),
    secret: z.string().regex(KEY_MATERIAL).optional(),
    notBefore: z.iso.datetime({ offset: true }),
    notAfter: z.iso.datetime({ offset: true }),
    revoked: z.boolean().optional()
  })
  .strict()

export const isWebhookName = (value: string): boolean => NAME.test(value)

/**
 * Parses SHIFT_WEBHOOK_KEYS. Every message is static: a value from the
 * configuration never reaches an error, not even the JSON parser's excerpt.
 */
export function parseWebhookKeys(
  raw: string
): { keys: WebhookKey[] } | { error: string } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { error: 'SHIFT_WEBHOOK_KEYS is not valid JSON' }
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_KEYS) {
    return { error: `SHIFT_WEBHOOK_KEYS must list 1 to ${MAX_KEYS} keys` }
  }
  const keys: WebhookKey[] = []
  const names = new Set<string>()
  const materials = new Set<string>()
  for (const entry of value) {
    const parsed = KeySchema.safeParse(entry)
    if (!parsed.success) {
      return { error: 'SHIFT_WEBHOOK_KEYS has a malformed key' }
    }
    const { provider, tenant, keyId, notBefore, notAfter } = parsed.data
    const revoked = parsed.data.revoked === true
    const notBeforeMs = Date.parse(notBefore)
    const notAfterMs = Date.parse(notAfter)
    if (notAfterMs <= notBeforeMs) {
      return { error: 'SHIFT_WEBHOOK_KEYS has a key with an empty validity' }
    }
    const name = `${provider}\n${tenant}\n${keyId}`
    if (names.has(name)) {
      return { error: 'SHIFT_WEBHOOK_KEYS repeats a key id' }
    }
    names.add(name)
    const key: WebhookKey = {
      provider,
      tenant,
      keyId,
      notBeforeMs,
      notAfterMs,
      revoked
    }
    if (parsed.data.secret !== undefined) {
      const secret = Buffer.from(parsed.data.secret, 'base64url')
      if (secret.byteLength < MIN_KEY_BYTES) {
        return { error: 'SHIFT_WEBHOOK_KEYS has a key under 32 bytes' }
      }
      const material = secret.toString('hex')
      if (materials.has(material)) {
        return { error: 'SHIFT_WEBHOOK_KEYS reuses key material' }
      }
      materials.add(material)
      key.secret = secret
    } else if (!revoked) {
      return { error: 'SHIFT_WEBHOOK_KEYS has a key without material' }
    }
    keys.push(key)
  }
  const live = keys.filter((key) => !key.revoked)
  for (const [index, left] of live.entries()) {
    for (const right of live.slice(index + 1)) {
      if (left.provider !== right.provider || left.tenant !== right.tenant) {
        continue
      }
      const overlap =
        Math.min(left.notAfterMs, right.notAfterMs) -
        Math.max(left.notBeforeMs, right.notBeforeMs)
      if (overlap > WEBHOOK_MAX_ROTATION_OVERLAP_MS) {
        return { error: 'SHIFT_WEBHOOK_KEYS rotation overlap exceeds 7 days' }
      }
    }
  }
  return { keys }
}

function signedDigest(
  provider: WebhookProvider,
  fields: Pick<
    WebhookEnvelope,
    'tenant' | 'keyId' | 'timestamp' | 'deliveryId'
  >,
  secret: Buffer,
  body: Uint8Array
): Buffer {
  return createHmac('sha256', secret)
    .update(
      `${WEBHOOK_ENVELOPE}\n${provider}\n${fields.tenant}\n${fields.keyId}\n` +
        `${fields.timestamp}\n${fields.deliveryId}\n`
    )
    .update(body)
    .digest()
}

export interface SignWebhookInput {
  provider: WebhookProvider
  tenant: string
  keyId: string
  secret: Buffer
  deliveryId: string
  /** Unix seconds. */
  timestamp: number
  body: Uint8Array
}

/** The headers an ingress sends: reference signer for the envelope. */
export function signWebhook(input: SignWebhookInput): Record<string, string> {
  const timestamp = String(input.timestamp)
  const digest = signedDigest(
    input.provider,
    { ...input, timestamp },
    input.secret,
    input.body
  )
  return {
    [WEBHOOK_HEADERS.tenant]: input.tenant,
    [WEBHOOK_HEADERS.keyId]: input.keyId,
    [WEBHOOK_HEADERS.timestamp]: timestamp,
    [WEBHOOK_HEADERS.deliveryId]: input.deliveryId,
    [WEBHOOK_HEADERS.signature]: `${WEBHOOK_SIGNATURE_VERSION}=${digest.toString('hex')}`
  }
}

type Headers = Record<string, string | string[] | undefined>

/**
 * Everything that can be refused without the body, so a request without a
 * current envelope for a live key never takes a body read. `nowMs` is the
 * server clock; the header is a claim to check, never a time source.
 */
export function checkEnvelope(
  headers: Headers,
  auth: WebhookAuth,
  provider: WebhookProvider,
  nowMs: number
): { envelope: WebhookEnvelope } | { refusal: WebhookRefusal } {
  // A repeated header arrives joined or as a list and fails these patterns.
  const tenant = headers[WEBHOOK_HEADERS.tenant]
  const keyId = headers[WEBHOOK_HEADERS.keyId]
  const timestamp = headers[WEBHOOK_HEADERS.timestamp]
  const deliveryId = headers[WEBHOOK_HEADERS.deliveryId]
  const signature = headers[WEBHOOK_HEADERS.signature]
  if (
    typeof tenant !== 'string' ||
    typeof keyId !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof deliveryId !== 'string' ||
    typeof signature !== 'string' ||
    !NAME.test(tenant) ||
    !NAME.test(keyId) ||
    !TIMESTAMP.test(timestamp) ||
    !DELIVERY_ID.test(deliveryId)
  ) {
    return { refusal: 'envelope_invalid' }
  }
  const digest = SIGNATURE.exec(signature)?.[1]
  if (!digest) return { refusal: 'envelope_invalid' }
  if (tenant !== auth.tenant) return { refusal: 'tenant_mismatch' }
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > WEBHOOK_MAX_SKEW_SECONDS) {
    return { refusal: 'timestamp_outside_window' }
  }
  const key = auth.keys.find(
    (candidate) =>
      candidate.provider === provider &&
      candidate.tenant === tenant &&
      candidate.keyId === keyId
  )
  if (!key) return { refusal: 'key_unknown' }
  if (key.revoked || !key.secret) return { refusal: 'key_revoked' }
  if (nowMs < key.notBeforeMs || nowMs >= key.notAfterMs) {
    return { refusal: 'key_outside_validity' }
  }
  return {
    envelope: {
      tenant,
      keyId,
      timestamp,
      deliveryId,
      signature: Buffer.from(digest, 'hex'),
      key: { ...key, secret: key.secret }
    }
  }
}

/** Constant-time check over the original bytes, before any parsing. */
export function verifyWebhookBody(
  envelope: WebhookEnvelope,
  provider: WebhookProvider,
  body: Uint8Array
): boolean {
  return timingSafeEqual(
    signedDigest(provider, envelope, envelope.key.secret, body),
    envelope.signature
  )
}

export function bodySha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex')
}
