import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDifferentialEvidence } from './evidence-lifecycle.mjs'

const original = process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR
const owned = []
afterEach(() => {
  vi.restoreAllMocks()
  if (original === undefined) delete process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR
  else process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR = original
  for (const directory of owned.splice(0))
    fs.rmSync(directory, { recursive: true, force: true })
})
function defaults() {
  delete process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR
  const result = createDifferentialEvidence('failure')
  owned.push(result.directory)
  return result
}
describe('owned differential evidence lifecycle', () => {
  it('collects its own output only after success', () => {
    const result = defaults()
    fs.writeFileSync(
      path.join(result.directory, 'case.command.json'),
      '{"exit":0}\n'
    )
    result.finish()
    expect(fs.existsSync(result.directory)).toBe(false)
  })
  it('retains failed stdout/stderr/metadata independently of session HOME', () => {
    const result = defaults()
    const log = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const files = {
      'case.reference.stdout.log': 'FAULT_STDOUT_SENTINEL\n',
      'case.reference.stderr.log': 'FAULT_STDERR_SENTINEL\n',
      'case.command.json': '{"exit":23}\n'
    }
    for (const [name, content] of Object.entries(files))
      fs.writeFileSync(path.join(result.directory, name), content)
    result.failed()
    result.finish()
    const record = JSON.parse(log.mock.calls[0][0])
    expect(record.retained).toBe(true)
    expect(record.directory).toBe(result.directory)
    for (const [name, content] of Object.entries(files)) {
      expect(fs.readFileSync(path.join(result.directory, name), 'utf8')).toBe(
        content
      )
      expect(record.files.find((file) => file.name === name)).toMatchObject({
        content,
        truncated: false,
        sha256: crypto.createHash('sha256').update(content).digest('hex')
      })
    }
  })
  it('bounds emitted content while retaining complete raw bytes', () => {
    const result = defaults()
    const log = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const bytes = Buffer.alloc(70_000)
    fs.writeFileSync(
      path.join(result.directory, 'case.reference.stdout.log'),
      bytes
    )
    result.failed()
    result.finish()
    const output = log.mock.calls[0][0]
    expect(Buffer.byteLength(output)).toBeLessThan(512 * 1024)
    const record = JSON.parse(output)
    expect(record.files[0].truncated).toBe(true)
    expect(
      fs.readFileSync(path.join(result.directory, 'case.reference.stdout.log'))
    ).toEqual(bytes)
  })
  it('preserves explicit output on success and failure without reading unrelated files', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cvg-explicit-evidence-')
    )
    owned.push(directory)
    process.env.CVG_DIFFERENTIAL_EVIDENCE_DIR = directory
    fs.writeFileSync(path.join(directory, 'unrelated.txt'), 'UNRELATED_CONTENT')
    const result = createDifferentialEvidence('reply')
    result.finish()
    expect(fs.existsSync(directory)).toBe(true)
    const log = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    result.failed()
    result.finish()
    expect(log.mock.calls[0][0]).not.toContain('UNRELATED_CONTENT')
    expect(fs.readFileSync(path.join(directory, 'unrelated.txt'), 'utf8')).toBe(
      'UNRELATED_CONTENT'
    )
  })
})
