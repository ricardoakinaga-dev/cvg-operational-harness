// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { parseStrictJson } from '../../claude100/qualification/strict-json.mjs'
const options = { numericDomain: 'CODEX_EXACT_DECIMAL' }
describe('CodeX exact decimal domain, QK07/QK08', () => {
  it.each([
    '9007199254740992',
    '9007199254740993',
    '-9007199254740992',
    '-0',
    '-0.0',
    '-0e0',
    '0.1000000000000000000001',
    '1.0000000000000001',
    '1e-1000000',
    '1e9999999999999999999999999999999999999999',
    '1e-9999999999999999999999999999999999999999',
    '1e309'
  ])('rejects %s before canonicalization', (token) => {
    expect(() => parseStrictJson('{"unused":' + token + '}', options)).toThrow()
  })
  it.each([
    '1e0',
    '1.2300e2',
    '0.1',
    '9007199254740991',
    '-9007199254740991',
    '5e-324',
    '1e-100',
    '0e9999999999999999999999999999999999999999'
  ])('accepts exact decimal roundtrip %s', (token) => {
    expect(parseStrictJson(token, options)).toBe(JSON.parse(token))
  })
  it('does not change the legacy default domain', () => {
    expect(parseStrictJson('9007199254740993')).toBe(9007199254740992)
    expect(Object.is(parseStrictJson('-0'), -0)).toBe(true)
    expect(parseStrictJson('0.1000000000000000000001')).toBe(0.1)
  })
  it('handles bounded but huge exponent spellings without exponential allocation', () => {
    expect(parseStrictJson('0e' + '9'.repeat(200000), options)).toBe(0)
    expect(() => parseStrictJson('1e-' + '9'.repeat(200000), options)).toThrow()
    expect(parseStrictJson('1e' + '0'.repeat(200000), options)).toBe(1)
  })
  it('keeps option descriptors data-only and the domain closed', () => {
    expect(() => parseStrictJson('1', { numericDomain: 'anything' })).toThrow()
    expect(() =>
      parseStrictJson('1', {
        get numericDomain() {
          throw Error('must not run')
        }
      })
    ).toThrow('data properties')
  })
})

it('rejects a long interior-zero coefficient within a bounded process deadline (R1-01)', () => {
  const module = new URL(
    '../../claude100/qualification/strict-json.mjs',
    import.meta.url
  ).href
  const code = `const {parseStrictJson}=await import(${JSON.stringify(module)});try{parseStrictJson('1'+'0'.repeat(200000)+'1e-200002',{numericDomain:'CODEX_EXACT_DECIMAL'});process.exitCode=7}catch(e){if(e.status!=='INVALID_INPUT')throw e}`
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 2000 }
  )
  expect(child.error).toBeUndefined()
  expect(child.signal).toBeNull()
  expect(child.status).toBe(0)
})
