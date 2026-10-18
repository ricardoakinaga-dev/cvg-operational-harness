// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  mkdtemp,
  writeFile,
  chmod,
  mkdir,
  symlink,
  rm,
  readFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseManifest, statusFor, safeRelative, closed } from './schema.mjs'
import { pinFile, createEvidence, sha256 } from './evidence.mjs'

const raw = (text) => Buffer.from(text)
const manifest =
  '{"version":1,"runId":"probe_01","fixtureId":"NATIVE_PORT_503_V1"}'
async function temporary(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'native-port-foundation-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('NP01 closed native port inputs', () => {
  it('accepts only the inert fixed fixture and bounded run identifier', () => {
    expect(parseManifest(raw(manifest))).toEqual({
      version: 1,
      runId: 'probe_01',
      fixtureId: 'NATIVE_PORT_503_V1'
    })
  })
  it.each([
    '{"version":1,"version":1,"runId":"a","fixtureId":"NATIVE_PORT_503_V1"}',
    manifest.replace('probe_01', '../escape'),
    manifest.replace('probe_01', 'á'),
    manifest.replace('probe_01', 'a'.repeat(65)),
    manifest.replace('NATIVE_PORT_503_V1', 'CUSTOM_URL'),
    manifest.replace('"version":1', '"version":1e999'),
    manifest.replace('"version":1', '"version":2'),
    manifest.replace('"version":1', '"version":1,"command":"arbitrary"'),
    manifest.replace('"version":1', '"__proto__":{},"version":1')
  ])(
    'rejects hostile or ambiguous raw input before any runtime action: %s',
    (value) => {
      expect(() => parseManifest(raw(value))).toThrow()
    }
  )
  it('rejects invalid UTF-8 and the exact byte limit plus one', () => {
    expect(() => parseManifest(Buffer.from([0xff]))).toThrow()
    expect(() => parseManifest(Buffer.alloc(65537, 32))).toThrow()
  })
  it('does not run accessors or proxy traps while validating data objects', () => {
    let calls = 0
    expect(() =>
      closed(
        {
          get version() {
            calls++
            return 1
          }
        },
        ['version']
      )
    ).toThrow()
    expect(() =>
      closed(
        new Proxy(
          {},
          {
            ownKeys() {
              calls++
              return []
            }
          }
        ),
        []
      )
    ).toThrow()
    expect(calls).toBe(0)
  })
  it.each([
    '../escape',
    '/absolute',
    'a/./b',
    'a//b',
    'a\\b',
    'a\0b',
    'artifact#0'
  ])('refuses unsafe artifact paths %s', (value) => {
    expect(safeRelative(value)).toBe(false)
  })
})

describe('NP05/NP07 deterministic failure priority', () => {
  it.each([
    'PRIVACY',
    'CAP',
    'TIMEOUT',
    'SIGNAL',
    'DRIFT_RUNTIME',
    'CLEANUP',
    'IO',
    'PROTOCOL'
  ])('an earlier POST never overrides %s', (code) => {
    expect(statusFor([{ code }], true)).toBe('INFRA_FAILURE')
  })
  it('retains blocked/input semantics unless infrastructure also failed', () => {
    expect(statusFor([{ code: 'CONTAINMENT' }], false)).toBe(
      'BLOCKED_CONTAINMENT'
    )
    expect(
      statusFor([{ code: 'CONTAINMENT' }, { code: 'CLEANUP' }], true)
    ).toBe('INFRA_FAILURE')
    expect(statusFor([{ code: 'IDENTITY_MISMATCH' }], true)).toBe(
      'INVALID_INPUT'
    )
    expect(statusFor([], false)).toBe('PORT_NOT_OBSERVED')
    expect(statusFor([], true)).toBe('PORT_OBSERVED')
    expect(statusFor([{ code: 'UNRECOGNIZED' }], true)).toBe('INFRA_FAILURE')
  })
})

describe('NP08 retained byte identity and exclusive evidence', () => {
  it('pins a regular file and detects late replacement without adopting its bytes', () =>
    temporary(async (root) => {
      const file = path.join(root, 'fixture')
      await writeFile(file, 'before')
      const pin = await pinFile(file, sha256('before'), 32, true)
      try {
        expect(pin.bytes.toString()).toBe('before')
        await writeFile(file, 'after')
        await expect(pin.verify()).rejects.toHaveProperty(
          'code',
          'DRIFT_RUNTIME'
        )
        expect(pin.bytes.toString()).toBe('before')
      } finally {
        await pin.close()
      }
    }))
  it('rejects symlinks, source digest changes and a byte beyond the bound', () =>
    temporary(async (root) => {
      const file = path.join(root, 'fixture')
      await writeFile(file, 'abcd')
      await symlink(file, path.join(root, 'link'))
      await expect(pinFile(path.join(root, 'link'), null, 4)).rejects.toThrow()
      await expect(pinFile(file, sha256('other'), 4)).rejects.toHaveProperty(
        'code',
        'IDENTITY_MISMATCH'
      )
      await expect(pinFile(file, null, 3)).rejects.toThrow()
      const pin = await pinFile(file, null, 4, true)
      expect(pin.bytes.length).toBe(4)
      await pin.close()
    }))
  it('creates private nested snapshots and refuses directory or file reuse', () =>
    temporary(async (root) => {
      const evidence = await createEvidence(root, 'result')
      try {
        const a = await evidence.add(
          'bundle-source',
          'inputs/bundle/fixture.txt',
          'inert'
        )
        expect(await readFile(path.join(root, a.path), 'utf8')).toBe('inert')
        await expect(
          evidence.add(
            'bundle-source',
            'inputs/bundle/fixture.txt',
            'replacement'
          )
        ).rejects.toThrow()
        await expect(
          evidence.add('bundle-source', '../escape', 'x')
        ).rejects.toThrow()
      } finally {
        await evidence.close()
      }
      await expect(createEvidence(root, 'result')).rejects.toThrow()
    }))
  it('does not accept a group-readable evidence root', () =>
    temporary(async (root) => {
      await chmod(root, 0o755)
      await expect(createEvidence(root, 'result')).rejects.toHaveProperty(
        'code',
        'INPUT_INVALID'
      )
    }))
  it('refuses an existing empty output directory without overwriting it', () =>
    temporary(async (root) => {
      await mkdir(path.join(root, 'result'))
      await expect(createEvidence(root, 'result')).rejects.toThrow()
    }))
})
