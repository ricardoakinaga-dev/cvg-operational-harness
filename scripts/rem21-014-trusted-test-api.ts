/**
 * Controlled-test API for the REM21-014 browser proof (SPEC 0262, receipt 12).
 *
 * The HMAC trusted profile without the OIDC login answers 503 on every
 * operator route outside a test profile. This entrypoint is that test profile:
 * it composes a synthetic `casePrincipalAuthority` and provisions the
 * principals the spec signs tokens for, through the same internal port a
 * verified adapter uses. It refuses to start outside NODE_ENV=test.
 */
import { fileURLToPath } from 'node:url'
import {
  buildServerFromEnv,
  type BuildServerFromEnvOptions
} from '../apps/api/src/server.ts'
import { createConfiguredOperatorIdentityResolver } from '../apps/api/src/operator-identity.ts'
import { serializeStartupFailure } from '../apps/api/src/startup-failure.ts'

export const REM21_014_AUTHORITY_VERSION = 'rem21-014-synthetic-authority-v1'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000a21'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000b21'

type Role = 'Operator' | 'Approver' | 'Supervisor' | 'Admin'

export const REM21_014_PRINCIPALS: readonly {
  tenantId: string
  operatorId: string
  role: Role
}[] = [
  { tenantId: tenantA, operatorId: 'operator.rem21.014', role: 'Operator' },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.keyboard',
    role: 'Supervisor'
  },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.expiry',
    role: 'Operator'
  },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.reload',
    role: 'Operator'
  },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.operator',
    role: 'Operator'
  },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.approver',
    role: 'Approver'
  },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.supervisor',
    role: 'Supervisor'
  },
  { tenantId: tenantA, operatorId: 'operator.rem21.014.admin', role: 'Admin' },
  {
    tenantId: tenantA,
    operatorId: 'operator.rem21.014.tenant-a',
    role: 'Operator'
  },
  {
    tenantId: tenantB,
    operatorId: 'operator.rem21.014.tenant-b',
    role: 'Operator'
  }
]

/** Refuses anything but the explicit test profile. */
export function assertControlledTestProfile(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('rem21-014 trusted test API starts only with NODE_ENV=test')
  }
}

export async function buildRem21014TrustedTestApi(
  env: NodeJS.ProcessEnv,
  options: BuildServerFromEnvOptions = {}
) {
  assertControlledTestProfile(env)
  const operatorIdentityResolver = createConfiguredOperatorIdentityResolver(env)
  if (!operatorIdentityResolver) {
    throw new Error('rem21-014 trusted test API requires the HMAC keyring')
  }
  const app = await buildServerFromEnv(env, {
    ...options,
    operatorIdentityResolver,
    casePrincipalAuthority: { authorityVersion: REM21_014_AUTHORITY_VERSION }
  })
  try {
    for (const principal of REM21_014_PRINCIPALS) {
      await app.caseAuthority.applyVerifiedPrincipalState({
        tenantId: principal.tenantId as never,
        operatorId: principal.operatorId,
        role: principal.role,
        active: true,
        expectedRevision: 0,
        authorityVersion: REM21_014_AUTHORITY_VERSION,
        proofRef: `synthetic-proof:${principal.operatorId}`,
        identitySource: 'synthetic_fixture'
      })
    }
  } catch (error) {
    await app.close()
    throw error
  }
  return app
}

async function start(): Promise<void> {
  const app = await buildRem21014TrustedTestApi(process.env)
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: '127.0.0.1'
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    console.error(serializeStartupFailure(error))
    process.exit(1)
  })
}
