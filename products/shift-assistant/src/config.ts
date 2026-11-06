import { z } from 'zod'
import { parseMembers, type Member } from './domain.ts'
import { isInternalServiceUrl } from './egress.ts'
import {
  isWebhookName,
  parseWebhookKeys,
  type WebhookAuth
} from './webhook-auth.ts'

/** A deadline in milliseconds, accepted only within [1 s, `max`]. */
function ms(max: number) {
  return z.coerce.number().int().min(1000).max(max).default(max)
}

const EnvSchema = z
  .object({
    SHIFT_PROVIDER: z.enum(['waha', 'evolution']),
    SHIFT_MEMBERS: z.string().min(1),
    /** Retired static secret: its presence refuses the start, no fallback. */
    SHIFT_WEBHOOK_SECRET: z.never().optional(),
    /**
     * `real` is refused in this build: it needs the dedicated signing ingress
     * of docs/webhook-assinado.md, which does not exist yet.
     */
    SHIFT_CHANNEL_MODE: z.enum(['synthetic', 'real']),
    SHIFT_WEBHOOK_TENANT: z.string().refine(isWebhookName),
    SHIFT_WEBHOOK_KEYS: z.string().min(1),
    SHIFT_DATA_DIR: z.string().min(1),
    SHIFT_PORT: z.coerce.number().int().min(0).max(65535).default(3400),
    SHIFT_HOST: z.string().default('0.0.0.0'),
    SHIFT_TICK_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    // Transport deadlines and queue bounds (SPEC 0179 section 8.2). Byte
    // ceilings are constants in transport-limits.ts and cannot be raised.
    SHIFT_SEND_TIMEOUT_MS: ms(10_000),
    SHIFT_MEDIA_TIMEOUT_MS: ms(15_000),
    SHIFT_WHISPER_TIMEOUT_MS: ms(120_000),
    SHIFT_MODEL_TIMEOUT_MS: ms(60_000),
    SHIFT_JOB_TIMEOUT_MS: ms(210_000),
    SHIFT_SHUTDOWN_TIMEOUT_MS: ms(10_000),
    SHIFT_MAX_MEDIA_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(10_485_760)
      .default(10_485_760),
    SHIFT_MAX_PENDING_MESSAGES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(1000),
    WAHA_URL: z.url().optional(),
    WAHA_API_KEY: z.string().optional(),
    WAHA_SESSION: z.string().default('default'),
    EVOLUTION_URL: z.url().optional(),
    EVOLUTION_API_KEY: z.string().optional(),
    EVOLUTION_INSTANCE: z.string().optional(),
    /** Local Whisper only: loopback, private address or internal service name. */
    WHISPER_URL: z.url(),
    WHISPER_MODEL: z.string().default('whisper-1'),
    LLM_BASE_URL: z.url(),
    LLM_API_KEY: z.string().optional(),
    /** `local` only for a model on loopback (demo, self-hosted); default external HTTPS. */
    LLM_LOCATION: z.enum(['external', 'local']).default('external'),
    LLM_MODEL: z.string().min(1)
  })
  .superRefine((env, ctx) => {
    if (env.SHIFT_CHANNEL_MODE === 'real') {
      ctx.addIssue({
        code: 'custom',
        message:
          'CHANNEL_REAL_BLOCKED: a real channel requires the signed ingress composition'
      })
    }
    if (!isInternalServiceUrl(env.WHISPER_URL)) {
      // Value never echoed: only the field name reaches the error.
      ctx.addIssue({
        code: 'custom',
        path: ['WHISPER_URL'],
        message: 'must be a local or internal destination'
      })
    }
    if (env.LLM_LOCATION === 'external' && !env.LLM_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'LLM_API_KEY is required' })
    }
    if (env.SHIFT_PROVIDER === 'waha' && (!env.WAHA_URL || !env.WAHA_API_KEY)) {
      ctx.addIssue({
        code: 'custom',
        message: 'WAHA_URL and WAHA_API_KEY are required'
      })
    }
    if (
      env.SHIFT_PROVIDER === 'evolution' &&
      (!env.EVOLUTION_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'EVOLUTION_URL, EVOLUTION_API_KEY and EVOLUTION_INSTANCE are required'
      })
    }
  })

export type ShiftEnv = z.infer<typeof EnvSchema>

export interface ShiftConfig {
  env: ShiftEnv
  members: Member[]
  webhook: WebhookAuth
}

/** Fails closed on any missing or malformed setting; values are never logged. */
export function loadShiftConfig(
  source: Record<string, string | undefined>
): ShiftConfig {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const fields = parsed.error.issues.map(
      (issue) => issue.path.join('.') || issue.message
    )
    throw new Error(
      `Invalid shift assistant configuration: ${fields.join(', ')}`
    )
  }
  const members = parseMembers(parsed.data.SHIFT_MEMBERS)
  if (members.length === 0) throw new Error('SHIFT_MEMBERS has no members')
  const { SHIFT_PROVIDER: provider, SHIFT_WEBHOOK_TENANT: tenant } = parsed.data
  const keyring = parseWebhookKeys(parsed.data.SHIFT_WEBHOOK_KEYS)
  if ('error' in keyring) {
    throw new Error(`Invalid shift assistant configuration: ${keyring.error}`)
  }
  const served = keyring.keys.some(
    (key) => key.provider === provider && key.tenant === tenant && !key.revoked
  )
  if (!served) {
    throw new Error(
      'Invalid shift assistant configuration: SHIFT_WEBHOOK_KEYS has no live key for this provider and tenant'
    )
  }
  return {
    env: parsed.data,
    members,
    webhook: { tenant, keys: keyring.keys }
  }
}
