import { Buffer } from 'node:buffer'
import { ProcessServiceError } from './errors.ts'
import type { ProcessConsumer } from './types.ts'

// SPEC 0286 I2: the child gets a closed map. Uppercase-only names are part of the format on
// purpose: `http_proxy` and friends are refused by shape, so nobody loosens the pattern later.
const NAME = /^[A-Z_][A-Z0-9_]{0,63}$/
export const ENV_MAX_ENTRIES = 64
export const ENV_MAX_VALUE_BYTES = 4096
export const ENV_MAX_TOTAL_BYTES = 16 * 1024
/** Set by the sandbox profile itself; a consumer can never override them. */
const PROFILE_OWNED = new Set([
  'HOME',
  'TMPDIR',
  'PATH',
  'PWD',
  'LANG',
  'LC_ALL',
  'TZ'
])
/** Loader, interpreter and shell injection names, refused even if a consumer is allowed them. */
const FORBIDDEN =
  /^(LD_|DYLD_|NODE_|PYTHON|PERL5|RUBY|JAVA_TOOL|_JAVA|GCONV_|LOCPATH$|NLSPATH$|HOSTALIASES$|RES_OPTIONS$|BASH_ENV$|ENV$|IFS$|SHELLOPTS$|BASHOPTS$|PS4$|PROMPT_COMMAND$|CDPATH$|GLOBIGNORE$|TERMINFO|LC_)|_PROXY$|^PROXY$/

export type EnvAllowlist = Readonly<Record<ProcessConsumer, readonly string[]>>

/**
 * Validates the consumer's env map against the host-owned allowlist and returns a frozen copy.
 * Never reads `process.env`; refuses format, forbidden, profile-owned and undeclared names.
 */
export function validateProcessEnv(
  consumer: ProcessConsumer,
  env: Readonly<Record<string, string>> | undefined,
  allowlist: EnvAllowlist
): Readonly<Record<string, string>> {
  if (env === undefined) return Object.freeze({})
  if (env === null || typeof env !== 'object' || Array.isArray(env))
    throw new ProcessServiceError('invalid_env', 'env must be a plain map')
  const proto = Object.getPrototypeOf(env)
  if (proto !== Object.prototype && proto !== null)
    throw new ProcessServiceError('invalid_env', 'env must be a plain map')
  const names = Object.keys(env)
  if (names.length > ENV_MAX_ENTRIES)
    throw new ProcessServiceError('invalid_env', 'too many env entries')
  const allowed = new Set(allowlist[consumer] ?? [])
  const out: Record<string, string> = {}
  let total = 0
  for (const name of names) {
    if (!NAME.test(name))
      throw new ProcessServiceError(
        'invalid_env',
        'env name has an invalid shape'
      )
    if (PROFILE_OWNED.has(name) || FORBIDDEN.test(name))
      throw new ProcessServiceError('invalid_env', 'env name is never allowed')
    if (!allowed.has(name))
      throw new ProcessServiceError(
        'invalid_env',
        'env name is not allowed for this consumer'
      )
    const value = env[name]
    if (typeof value !== 'string' || value.includes('\0'))
      throw new ProcessServiceError(
        'invalid_env',
        'env value must be a string without NUL'
      )
    const bytes = Buffer.byteLength(value, 'utf8')
    if (
      bytes > ENV_MAX_VALUE_BYTES ||
      Buffer.from(value, 'utf8').toString('utf8') !== value
    )
      throw new ProcessServiceError(
        'invalid_env',
        'env value is too large or not valid UTF-8'
      )
    total += bytes + name.length
    if (total > ENV_MAX_TOTAL_BYTES)
      throw new ProcessServiceError('invalid_env', 'env is too large')
    out[name] = value
  }
  return Object.freeze(out)
}

/** The allowlists themselves are validated when the service is composed. */
export function checkEnvAllowlist(allowlist: EnvAllowlist): EnvAllowlist {
  for (const names of Object.values(allowlist))
    for (const name of names)
      if (!NAME.test(name) || PROFILE_OWNED.has(name) || FORBIDDEN.test(name))
        throw new ProcessServiceError(
          'invalid_env',
          'allowlist has a name that is never allowed'
        )
  return allowlist
}
