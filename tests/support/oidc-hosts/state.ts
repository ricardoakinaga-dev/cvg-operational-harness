/**
 * SPEC0259 §4.11 — what the three-host environment publishes to the proof
 * (test support only). Secrets never go into this file: users, cookies and
 * TOTP codes travel only in memory through the loopback control channel.
 */
export interface ProofState {
  readonly edgePort: number
  readonly apiPort: number
  readonly nginxPort: number
  readonly idpPort: number
  readonly origins: {
    readonly console: string
    readonly api: string
    readonly mirror: string
    readonly reports: string
    readonly sibling: string
    readonly evil: string
    readonly idp: string
  }
  readonly spki: readonly string[]
  readonly caFile: string
  readonly control: { readonly url: string; readonly tokenFile: string }
  readonly nginx: { readonly image: string; readonly container: string }
  readonly consoleBundle: { readonly files: number }
}

export const STATE_ENV = 'CVG_OIDC_HOSTS_STATE'
export const READY_LINE = 'CVG_OIDC_HOSTS_READY'
/** SPEC0259 §4.11: never the ports of the CLOSE-CI-LOCAL environment. */
export const FORBIDDEN_PORTS = new Set([3483, 4483, 56383])

export interface ProofUser {
  readonly username: string
  readonly password: string
  readonly totpSecretHex: string
  readonly operatorId: string
}
