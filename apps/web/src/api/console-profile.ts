import type { ConsoleLoginProfile } from './origin.ts'

/**
 * SPEC0259 J1 — the compiled console profile. Origins come only from the
 * build (`vite.config.mts` validates them); never from the query, the
 * fragment, `postMessage`, storage or a response.
 */
export const consoleLoginProfile: ConsoleLoginProfile =
  __CVG_OPERATOR_LOGIN__ === 'oidc'
    ? {
        kind: 'oidc',
        consoleOrigin: __CVG_CONSOLE_ORIGIN__,
        apiOrigin: __CVG_API_ORIGIN__
      }
    : { kind: 'current' }
