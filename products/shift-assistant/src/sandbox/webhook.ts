import { randomBytes, randomUUID } from 'node:crypto'
import {
  parseWebhookKeys,
  signWebhook,
  type WebhookAuth,
  type WebhookProvider
} from '../webhook-auth.ts'

const TENANT = 'synthetic-tenant'
const KEY_ID = 'synthetic-key-1'

/** Random per process and per provider: no key lives in the repository. */
const keys = new Map<WebhookProvider, Buffer>()

function syntheticKey(provider: WebhookProvider): Buffer {
  const key = keys.get(provider) ?? randomBytes(32)
  keys.set(provider, key)
  return key
}

/**
 * Stands in for the signing ingress of docs/webhook-assinado.md in demos and
 * tests. Never imported by main.ts, so it is not part of the operational
 * bundle.
 */
export function syntheticWebhook(provider: WebhookProvider = 'waha') {
  const secret = syntheticKey(provider)
  return {
    tenant: TENANT,
    keyId: KEY_ID,
    secret,
    env: {
      SHIFT_CHANNEL_MODE: 'synthetic',
      SHIFT_WEBHOOK_TENANT: TENANT,
      SHIFT_WEBHOOK_KEYS: JSON.stringify([
        {
          provider,
          tenant: TENANT,
          keyId: KEY_ID,
          secret: secret.toString('base64url'),
          notBefore: '2020-01-01T00:00:00Z',
          notAfter: '2100-01-01T00:00:00Z'
        }
      ])
    },
    /** Headers of one delivery of `body` at `now` (the server's clock). */
    headers(body: string, now: Date, deliveryId = `d-${randomUUID()}`) {
      return {
        'content-type': 'application/json',
        ...signWebhook({
          provider,
          tenant: TENANT,
          keyId: KEY_ID,
          secret,
          deliveryId,
          timestamp: Math.floor(now.getTime() / 1000),
          body: Buffer.from(body)
        })
      }
    }
  }
}

/** The keyring a server built directly (without config.ts) receives. */
export function webhookAuthOf(
  signer: ReturnType<typeof syntheticWebhook>
): WebhookAuth {
  const parsed = parseWebhookKeys(signer.env.SHIFT_WEBHOOK_KEYS)
  if ('error' in parsed) throw new Error(parsed.error)
  return { tenant: signer.tenant, keys: parsed.keys }
}
