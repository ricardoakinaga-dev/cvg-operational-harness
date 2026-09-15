import { z } from 'zod'
import type { Role } from './enums.ts'

const permissionsByRole: Record<Role, string[]> = {
  Operator: [
    'approval:view',
    'approval:execute',
    'audit:view_limited',
    'conversation:view_assigned',
    'conversation:update',
    'conversation:assume',
    'task:view',
    'task:update'
  ],
  Approver: [
    'approval:view',
    'approval:decide',
    'audit:view_limited',
    'conversation:view_assigned',
    'conversation:update',
    'task:view'
  ],
  Supervisor: [
    'approval:view',
    'approval:decide',
    'audit:view_full',
    'conversation:view_assigned',
    'conversation:update',
    'conversation:assume',
    'safety:review',
    'task:view'
  ],
  Admin: [
    'approval:view',
    'audit:view_full',
    'channel:configure',
    'conversation:view_assigned',
    'conversation:update',
    'conversation:assume',
    'agent:view',
    'agent:configure',
    'plugin:configure',
    'policy:configure',
    'test:run',
    'task:view'
  ],
  System: ['tool:execute_policy_allowed', 'audit:create']
}

export function roleHasPermission(role: Role, permission: string): boolean {
  return permissionsByRole[role].includes(permission)
}

export function requirePermission(role: Role, permission: string): void {
  if (!roleHasPermission(role, permission)) {
    throw new Error(`Role ${role} cannot perform ${permission}`)
  }
}

export const OperatorRoleSchema = z.enum([
  'Operator',
  'Approver',
  'Supervisor',
  'Admin'
])
export type OperatorRole = z.infer<typeof OperatorRoleSchema>

export const OperatorIdentitySchema = z.object({
  operatorId: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[A-Za-z0-9._:-]+$/),
  role: OperatorRoleSchema,
  tenantId: z
    .string()
    .trim()
    .regex(/^tenant_[0-9a-f-]{36}$/)
    .optional()
})
export type OperatorIdentity = z.infer<typeof OperatorIdentitySchema>

function readHeaderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value[0]
  return value
}

export function parseOperatorIdentity(
  headers: Record<string, unknown>
): OperatorIdentity {
  const tenantId = readHeaderValue(headers['x-tenant-id'])
  return OperatorIdentitySchema.parse({
    operatorId: readHeaderValue(headers['x-operator-id']),
    role: readHeaderValue(headers['x-operator-role']),
    ...(tenantId === undefined ? {} : { tenantId })
  })
}

/**
 * Trusted identity port. Implementations resolve an operator identity from the
 * request (claims/tokens), never from self-asserted simulation headers.
 */
export type OperatorIdentityResolver = (
  headers: Record<string, unknown>
) => OperatorIdentity

export const IdentityModeSchema = z.enum(['simulation', 'trusted'])
export type IdentityMode = z.infer<typeof IdentityModeSchema>

export const IDENTITY_MODE_ENV = 'CVG_IDENTITY_MODE'

/**
 * Explicit identity mode. `simulation` is the controlled header-based flow and
 * is only a default for `NODE_ENV=test`; every other environment fails closed
 * to `trusted` unless an operator opts in explicitly.
 */
export function parseIdentityMode(
  raw: string | null | undefined,
  nodeEnv: string | undefined
): IdentityMode {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return nodeEnv === 'test' ? 'simulation' : 'trusted'
  const parsed = IdentityModeSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('CVG_IDENTITY_MODE must be simulation or trusted')
  }
  return parsed.data
}

export interface IdentitySigningKey {
  keyId: string
  /** Local/synthetic key material only; production secrets stay in runtime env. */
  secret: string
}

/**
 * Rotation port for trusted identity signing keys. Implementations must return
 * only the keys usable at `nowSeconds`: revoked keys and previous keys past the
 * bounded rotation window are omitted, so a stale or revoked key never
 * authorizes a request.
 */
export interface IdentityKeyRingPort {
  keysAt(nowSeconds: number): readonly IdentitySigningKey[]
}
