/**
 * SPEC 0315 C4 — characterization of the registered route inventory.
 *
 * The refactor that splits `server.ts` by route domain must not add, drop or
 * reorder a route. The fixture was captured from the monolithic `server.ts`
 * before any route moved; hooks depend on registration order, so the order is
 * part of the contract. Regenerate only for an intentional route change:
 *   UPDATE_ROUTE_ORDER=1 npx vitest run apps/api/src/__tests__/server-route-order.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTrustedOperatorIdentityResolver } from '../operator-identity.ts'
import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import { SYNTHETIC_AUTHORITY_VERSION } from './case-authorization-fixtures.ts'
import type { RegisteredRoute } from '../operator-route-class.ts'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'server-route-order.json'
)

type Inventory = { operatorRouteInventory: RegisteredRoute[] }

function lines(app: unknown): string[] {
  return (app as Inventory).operatorRouteInventory.map(
    (route) => `${route.method} ${route.template} ${route.class}`
  )
}

async function capture() {
  const simulation = buildServer()
  await simulation.ready()
  const trusted = buildServer({
    identityMode: 'trusted',
    operatorIdentityResolver: createTrustedOperatorIdentityResolver({
      secret: 'route-order-synthetic-signing-key-abcdefghijklmnop',
      now: () => 1_800_000_000_000
    }),
    operatorSessionStore: createInMemoryOperatorSessionStore(),
    casePrincipalAuthority: { authorityVersion: SYNTHETIC_AUTHORITY_VERSION }
  } as never)
  await trusted.ready()
  const result = { simulation: lines(simulation), trusted: lines(trusted) }
  await simulation.close()
  await trusted.close()
  return result
}

describe('SPEC 0315 C4 route registration order', () => {
  it('keeps the exact ordered route inventory of the monolithic server', async () => {
    const actual = await capture()
    if (process.env.UPDATE_ROUTE_ORDER === '1') {
      writeFileSync(fixturePath, `${JSON.stringify(actual, null, 2)}\n`)
    }
    const expected = JSON.parse(readFileSync(fixturePath, 'utf8'))
    expect(actual.simulation.length).toBeGreaterThan(60)
    expect(actual.trusted.length).toBeGreaterThan(60)
    expect(actual).toEqual(expected)
  })
})
