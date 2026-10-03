import { z } from 'zod'
import { parseMembers, type Member } from './domain.ts'

const EnvSchema = z
  .object({
    SHIFT_PROVIDER: z.enum(['waha', 'evolution']),
    SHIFT_MEMBERS: z.string().min(1),
    SHIFT_WEBHOOK_SECRET: z.string().min(24),
    SHIFT_DATA_DIR: z.string().min(1),
    SHIFT_PORT: z.coerce.number().int().min(0).max(65535).default(3400),
    SHIFT_HOST: z.string().default('0.0.0.0'),
    SHIFT_TICK_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    WAHA_URL: z.url().optional(),
    WAHA_API_KEY: z.string().optional(),
    WAHA_SESSION: z.string().default('default'),
    EVOLUTION_URL: z.url().optional(),
    EVOLUTION_API_KEY: z.string().optional(),
    EVOLUTION_INSTANCE: z.string().optional(),
    WHISPER_URL: z.url(),
    WHISPER_MODEL: z.string().default('whisper-1'),
    LLM_BASE_URL: z.url(),
    LLM_API_KEY: z.string().optional(),
    /** `local` only for a model on loopback (demo, self-hosted); default external HTTPS. */
    LLM_LOCATION: z.enum(['external', 'local']).default('external'),
    LLM_MODEL: z.string().min(1)
  })
  .superRefine((env, ctx) => {
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
  return { env: parsed.data, members }
}
