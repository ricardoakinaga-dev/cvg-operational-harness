// @vitest-environment node
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { qualify } from './qualify.mjs'

const fault = vi.hoisted(() => ({ mode: null, used: false, receiptParses: 0 }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    async open(name, ...args) {
      const handle = await actual.open(name, ...args)
      const filename = String(name)
      return new Proxy(handle, {
        get(target, key) {
          if (key === 'sync')
            return async () => {
              await target.sync()
              if (
                !fault.used &&
                fault.mode === 'REPORT_SYNC' &&
                filename.endsWith('/report.pending.json')
              ) {
                fault.used = true
                throw new Error('SYNTHETIC_REPORT_SYNC_FAILURE')
              }
            }
          if (key === 'writeFile')
            return async (...values) => {
              if (
                !fault.used &&
                ['PROJECTION_WRITE', 'PROJECTION_AND_EXPIRE'].includes(
                  fault.mode
                ) &&
                filename.endsWith('/reference.projection')
              ) {
                fault.used = true
                if (fault.mode === 'PROJECTION_AND_EXPIRE')
                  vi.setSystemTime(new Date('2031-01-01T00:00:00.000Z'))
                throw new Error('SYNTHETIC_PROJECTION_WRITE_FAILURE')
              }
              await target.writeFile(...values)
              if (
                !fault.used &&
                fault.mode === 'EXPIRE_DURING_SNAPSHOTS' &&
                filename.endsWith('/input-snapshots.json')
              ) {
                fault.used = true
                vi.setSystemTime(new Date('2031-01-01T00:00:00.000Z'))
              }
            }
          if (key === 'close')
            return async () => {
              await target.close()
              if (
                !fault.used &&
                fault.mode === 'REPORT_CLOSE' &&
                filename.endsWith('/report.pending.json')
              ) {
                fault.used = true
                throw new Error('SYNTHETIC_REPORT_CLOSE_FAILURE')
              }
              if (
                !fault.used &&
                fault.mode === 'DIRECTORY_CLOSE' &&
                filename.endsWith('/result')
              ) {
                fault.used = true
                throw new Error('SYNTHETIC_DIRECTORY_CLOSE_FAILURE')
              }
            }
          const value = Reflect.get(target, key, target)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
    }
  }
})
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    linkSync(...args) {
      if (fault.mode === 'PUBLICATION_LINK') {
        fault.used = true
        throw new Error('SYNTHETIC_LINK_FAILURE')
      }
      return actual.linkSync(...args)
    },
    lstatSync(name, ...args) {
      if (
        !fault.used &&
        fault.mode === 'EXPIRE_AT_PUBLICATION' &&
        String(name).endsWith('/report.blocked.pending.json')
      ) {
        fault.used = true
        vi.setSystemTime(new Date('2031-01-01T00:00:00.000Z'))
      }
      return actual.lstatSync(name, ...args)
    }
  }
})
vi.mock('./strict-json.mjs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    parseStrictJson(...args) {
      const value = actual.parseStrictJson(...args)
      if (value?.captureId) fault.receiptParses++
      return value
    }
  }
})

const fixture = fileURLToPath(new URL('./fixtures/wire-v1/', import.meta.url))
const roots = []
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
afterEach(async () => {
  vi.useRealTimers()
  fault.mode = null
  fault.used = false
  fault.receiptParses = 0
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true })
})
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'claude100-publication-'))
  roots.push(root)
  await cp(fixture, root, { recursive: true })
  const read = async (name) =>
    JSON.parse(await readFile(path.join(root, name), 'utf8'))
  const write = async (name, data) =>
    writeFile(path.join(root, name), JSON.stringify(data))
  return {
    root,
    read,
    write,
    options: {
      evidenceRoot: root,
      manifest: 'manifest.json',
      catalog: 'catalog.json',
      rule: 'rule.json',
      captureIndex: 'capture-index.json',
      authorityIndex: 'authority-index.json',
      out: 'result'
    }
  }
}

describe('SPEC0229 R1 corrections at real file IO boundary, synthetic faults only', () => {
  it('retains comparator INFRA when projection writing fails and authority expires', async () => {
    const s = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2029-01-01T00:00:00.000Z'))
    const authorities = await s.read('authority-index.json')
    authorities.entries[0].expiresAt = '2030-01-01T00:00:00.000Z'
    await s.write('authority-index.json', authorities)
    fault.mode = 'PROJECTION_AND_EXPIRE'
    const report = await qualify(s.options)
    expect(fault.used).toBe(true)
    expect(report.status).toBe('INFRA_FAILURE')
    expect(report.exitCode).toBe(1)
    expect(await s.read('result/report.json')).toEqual(report)
  })
  it.each([
    'REPORT_SYNC',
    'REPORT_CLOSE',
    'DIRECTORY_CLOSE',
    'PUBLICATION_LINK'
  ])('never publishes completed MATCH after %s failure', async (mode) => {
    const s = await setup()
    fault.mode = mode
    const report = await qualify(s.options)
    expect(fault.used).toBe(true)
    expect(report.status).toBe('INFRA_FAILURE')
    expect(report.exitCode).toBe(1)
    await expect(
      readFile(path.join(s.root, 'result/report.json'))
    ).rejects.toHaveProperty('code', 'ENOENT')
    // The staging bytes are retained and explicitly named pending, never a
    // completed report, including faults after their entire JSON was written.
    expect((await s.read('result/report.pending.json')).reviewStatus).toBe(
      'PENDING'
    )
  })
  it('classifies generated projection write failure as infrastructure, not malformed input', async () => {
    const s = await setup()
    fault.mode = 'PROJECTION_WRITE'
    const report = await qualify(s.options)
    expect(fault.used).toBe(true)
    expect(report.status).toBe('INFRA_FAILURE')
    expect(report.exitCode).toBe(1)
    expect(await s.read('result/report.json')).toEqual(report)
  })
  it.each(['EXPIRE_DURING_SNAPSHOTS', 'EXPIRE_AT_PUBLICATION'])(
    'rechecks expiry at the final synchronous publication boundary: %s',
    async (mode) => {
      const s = await setup()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2029-01-01T00:00:00.000Z'))
      const authorities = await s.read('authority-index.json')
      authorities.entries[0].expiresAt = '2030-01-01T00:00:00.000Z'
      await s.write('authority-index.json', authorities)
      fault.mode = mode
      const report = await qualify(s.options)
      expect(fault.used).toBe(true)
      expect(report.status).toBe('BLOCKED_CVG_SPEC')
      expect(report.exitCode).toBe(1)
      expect(await s.read('result/report.json')).toEqual(report)
    }
  )
  it('retains matching control for unexpired authority at publication', async () => {
    const s = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2029-01-01T00:00:00.000Z'))
    const authorities = await s.read('authority-index.json')
    authorities.entries[0].expiresAt = '2030-01-01T00:00:00.000Z'
    await s.write('authority-index.json', authorities)
    const report = await qualify(s.options)
    expect(report.status).toBe('MATCH_REQUIRES_REVIEW')
    expect(await s.read('result/report.json')).toEqual(report)
  })
  it('parses a repeated attestation receipt once before rejecting cardinality/uniqueness', async () => {
    const s = await setup()
    const manifest = await s.read('manifest.json')
    const captures = await s.read('capture-index.json')
    const receipt = await s.read('reference/receipt.json')
    receipt.captureId = 'r'
    const data = JSON.stringify(receipt)
    const padded = data + ' '.repeat(1024 * 1024 - Buffer.byteLength(data))
    await writeFile(path.join(s.root, 'reference/receipt.json'), padded)
    captures.entries[0].captureId = 'r'
    captures.entries[0].receiptSha256 = hash(padded)
    manifest.captureAttestations = Array.from({ length: 40000 }, () => 'r')
    await s.write('manifest.json', manifest)
    await s.write('capture-index.json', captures)
    const report = await qualify(s.options)
    expect(report.status).toBe('INVALID_INPUT')
    expect(fault.receiptParses).toBe(1)
  })
})
