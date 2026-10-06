import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateRuntimeImageManifest } from '../scripts/runtime-image-contract.mjs'

const root = path.resolve(import.meta.dirname, '..')

function fixture(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'cvg-runtime-image',
    contract: 'rem21-016-v1',
    runId: 'run-rem21-016-fixture',
    candidateId: 'a'.repeat(64),
    imageId: `sha256:${'b'.repeat(64)}`,
    baseImageRef: `node:22.23.2-bookworm-slim@sha256:${'c'.repeat(64)}`,
    configUser: 'cvg',
    cmd: ['node', 'apps/api/dist/main.js'],
    smoke: { status: 'PASS', live: 200, ready: 200 },
    ...overrides
  }
}

describe('REM21-016 runtime image contract', () => {
  it('requires compiled entrypoint, runtime build and no npx TypeScript startup', () => {
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    )
    expect(packageJson.scripts['build:runtime']).toBeTypeOf('string')
    expect(dockerfile).toContain('npm run build:runtime')
    expect(dockerfile).toContain('apps/api/dist/main.js')
    expect(dockerfile).not.toContain('npx tsx apps/api/src/main.ts')
    expect(validateRuntimeImageManifest(fixture())).toEqual({ pass: true })
  })

  it('runs on a pinned distroless base without shell, as cvg, with an exec healthcheck (barra 0373, condição 7)', () => {
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
    const runtime = dockerfile.slice(
      dockerfile.lastIndexOf('\nFROM ', dockerfile.indexOf(' AS runtime')),
      dockerfile.lastIndexOf('\nFROM ', dockerfile.indexOf(' AS web'))
    )
    expect(runtime).toMatch(
      /gcr\.io\/distroless\/cc-debian12:nonroot@sha256:[0-9a-f]{64} AS runtime/
    )
    expect(runtime).not.toMatch(/^RUN /m)
    expect(runtime).toContain('USER cvg')
    expect(runtime).toMatch(
      /HEALTHCHECK[\s\S]*CMD \["node", "scripts\/runtime-healthcheck\.mjs"\]/
    )
    expect(runtime).toContain('CMD ["node", "apps/api/dist/main.js"]')
    const build = fs.readFileSync(
      path.join(root, 'scripts/build-runtime.mjs'),
      'utf8'
    )
    expect(build).toContain("'apps/worker'")
  })

  it('rejects image evidence from another run or candidate', () => {
    expect(() =>
      validateRuntimeImageManifest(fixture({ candidateId: 'c'.repeat(64) }), {
        candidateId: 'a'.repeat(64),
        runId: 'run-rem21-016-fixture'
      })
    ).toThrow(/candidate/i)
    expect(() =>
      validateRuntimeImageManifest(fixture({ runId: 'run-other' }), {
        candidateId: 'a'.repeat(64),
        runId: 'run-rem21-016-fixture'
      })
    ).toThrow(/run/i)
    expect(() =>
      validateRuntimeImageManifest(
        fixture({ cmd: ['npx', 'tsx', 'apps/api/src/main.ts'] })
      )
    ).toThrow(/entrypoint|cmd/i)
    expect(() =>
      validateRuntimeImageManifest(fixture({ imageId: 'sha256:wrong' }))
    ).toThrow(/image/i)
  })
})
