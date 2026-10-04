import { z } from 'zod'

export const TRUSTED_PROXY_HOPS_MIGRATION_ERROR =
  'API_TRUSTED_PROXY_HOPS is deprecated; configure API_TRUSTED_PROXY_ADDRESSES with explicit IP addresses'

const EnvBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .default(false)
  .transform((value) => value === true || value === 'true')

const EnvTrustedProxyHopsSchema = z.preprocess((value) => {
  if (value === undefined || value === '0' || value === 0) return 0
  throw new Error(TRUSTED_PROXY_HOPS_MIGRATION_ERROR)
}, z.literal(0))

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PERSISTENCE_MODE: z.enum(['memory', 'postgres']).default('memory'),
  CVG_IDENTITY_MODE: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === ''
        ? undefined
        : typeof value === 'string'
          ? value.trim()
          : value,
    z.enum(['simulation', 'trusted']).optional()
  ),
  CVG_OPERATOR_IDENTITY_KEYRING: z.string().optional(),
  CVG_RATE_LIMIT_KEYRING: z.string().optional(),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_MIGRATION_URL: z.string().url().optional(),
  INBOUND_TENANT_ID: z.string().optional(),
  INBOUND_AGENT_ID: z.string().optional(),
  WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  API_ALLOWED_ORIGINS: z.string().optional(),
  API_REQUIRE_HTTPS: EnvBooleanSchema,
  API_TRUSTED_PROXY_ADDRESSES: z.string().optional(),
  API_TRUSTED_PROXY_HOPS: EnvTrustedProxyHopsSchema,
  POSTGRES_AUTO_MIGRATE: EnvBooleanSchema,
  POSTGRES_RLS_ENFORCEMENT: EnvBooleanSchema,
  POSTGRES_SCHEMA: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,62}$/)
      .optional()
  ),
  OUTBOX_DURABLE_INBOUND: EnvBooleanSchema,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CVG_API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  /**
   * Optional: the neutral core composes no external model provider. When a
   * deployment sets it, a placeholder is still refused in production.
   */
  OPENAI_API_KEY: z.string().optional(),
  ENABLE_REAL_CHANNELS: EnvBooleanSchema,
  ENABLE_REAL_RAG: EnvBooleanSchema,
  ENABLE_REAL_PAYMENTS: EnvBooleanSchema,
  ENABLE_REAL_MEDICAL_RECORDS: EnvBooleanSchema
})

export type AppEnv = z.infer<typeof EnvSchema>

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const env = EnvSchema.parse(input)
  if (
    env.NODE_ENV === 'production' &&
    env.OPENAI_API_KEY !== undefined &&
    (env.OPENAI_API_KEY.trim() === '' ||
      /replace[_-]?me|change[_-]?me|example/i.test(env.OPENAI_API_KEY))
  ) {
    throw new Error('A production provider secret must be configured')
  }
  if (env.NODE_ENV === 'production') {
    if (env.CVG_IDENTITY_MODE === 'simulation') {
      throw new Error(
        'Production requires trusted operator identity mode; simulation is forbidden'
      )
    }
    const webhookSecret = env.WEBHOOK_SIGNING_SECRET?.trim() ?? ''
    if (
      webhookSecret.length < 32 ||
      /replace[_-]?me|change[_-]?me|example/i.test(webhookSecret)
    ) {
      throw new Error(
        'A production webhook signing secret of at least 32 characters must be configured'
      )
    }
  }
  if (env.NODE_ENV === 'production' && !env.POSTGRES_RLS_ENFORCEMENT) {
    throw new Error(
      'Production requires tenant-scoped PostgreSQL RLS enforcement'
    )
  }
  if (
    env.NODE_ENV === 'production' &&
    !/^tenant_[0-9a-f-]{36}$/.test(env.INBOUND_TENANT_ID?.trim() ?? '')
  ) {
    throw new Error(
      'A trusted INBOUND_TENANT_ID is required by the production bootstrap'
    )
  }
  if (
    env.NODE_ENV === 'production' &&
    !/^agent_[0-9a-f-]{36}$/.test(env.INBOUND_AGENT_ID?.trim() ?? '')
  ) {
    throw new Error(
      'A trusted INBOUND_AGENT_ID is required by the production bootstrap'
    )
  }
  if (env.NODE_ENV === 'production' && !env.API_ALLOWED_ORIGINS?.trim()) {
    throw new Error(
      'A production API_ALLOWED_ORIGINS allowlist must be configured'
    )
  }
  if (env.NODE_ENV === 'production' && !env.API_REQUIRE_HTTPS) {
    throw new Error('Production requires API_REQUIRE_HTTPS=true')
  }
  return env
}

export function realWorldActionsDisabled(env: AppEnv): boolean {
  return (
    !env.ENABLE_REAL_CHANNELS &&
    !env.ENABLE_REAL_RAG &&
    !env.ENABLE_REAL_PAYMENTS &&
    !env.ENABLE_REAL_MEDICAL_RECORDS
  )
}
