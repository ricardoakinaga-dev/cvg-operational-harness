// @vitest-environment node
/**
 * SPEC0259 Q7 — `vite build` real do console: o perfil OIDC sai sem o caminho
 * do token de bootstrap, o perfil atual não muda e os perfis inválidos não
 * produzem artefato. Origens sintéticas; a saída vai para um diretório
 * temporário removido no fim.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const root = process.cwd()
const directories: string[] = []
const FORBIDDEN = ['__CVG_OPERATOR_BOOTSTRAP_TOKEN', 'x-cvg-operator-token']
const OIDC = {
  VITE_CVG_OPERATOR_LOGIN: 'oidc',
  VITE_CVG_CONSOLE_ORIGIN: 'https://console.cvg.test',
  VITE_CVG_API_ORIGIN: 'https://api.cvg.test',
  VITE_CVG_WEB_IDENTITY_MODE: 'trusted',
  NODE_ENV: 'production'
}

afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function build(env: Record<string, string | undefined>) {
  const outDir = mkdtempSync(join(tmpdir(), 'cvg-0259-bundle-'))
  directories.push(outDir)
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) childEnv[key] = value
  }
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/vite/bin/vite.js'),
      '--config',
      'vite.config.mts',
      'build',
      'apps/web',
      '--outDir',
      outDir,
      '--emptyOutDir',
      '--logLevel',
      'error'
    ],
    { cwd: root, env: childEnv, encoding: 'utf8', timeout: 120_000 }
  )
  return {
    status: result.status,
    outDir,
    output: `${result.stdout}${result.stderr}`
  }
}

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

function text(directory: string): string {
  return files(directory)
    .filter((file) => /\.(js|html|css)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
}

describe('SPEC0259 Q7 — console bundle profiles', () => {
  it('builds the OIDC profile without the bootstrap token path', () => {
    const result = build(OIDC)
    expect(result.status, result.output).toBe(0)
    const bundle = text(result.outDir)
    expect(bundle.length).toBeGreaterThan(1_000)
    for (const forbidden of FORBIDDEN) {
      expect(bundle.includes(forbidden), forbidden).toBe(false)
    }
    expect(bundle).toContain('https://api.cvg.test')
    expect(bundle).toContain('https://console.cvg.test')
  }, 180_000)

  it('keeps the current profile building as today', () => {
    const result = build({ NODE_ENV: 'production' })
    expect(result.status, result.output).toBe(0)
    const bundle = text(result.outDir)
    expect(bundle).not.toContain('https://api.cvg.test')
    expect(bundle).toContain('/v1/session')
  }, 180_000)

  it.each([
    [
      'without origins',
      {
        ...OIDC,
        VITE_CVG_CONSOLE_ORIGIN: undefined,
        VITE_CVG_API_ORIGIN: undefined
      }
    ],
    [
      'with an http: API',
      { ...OIDC, VITE_CVG_API_ORIGIN: 'http://api.cvg.test' }
    ],
    [
      'with a path',
      { ...OIDC, VITE_CVG_CONSOLE_ORIGIN: 'https://console.cvg.test/app' }
    ],
    [
      'with the same host',
      { ...OIDC, VITE_CVG_API_ORIGIN: 'https://console.cvg.test:8443' }
    ],
    [
      'partial (origin without the OIDC login)',
      { NODE_ENV: 'production', VITE_CVG_API_ORIGIN: 'https://api.cvg.test' }
    ],
    ['with NODE_ENV=test', { ...OIDC, NODE_ENV: 'test' }]
  ])(
    'refuses the build %s and leaves no artifact',
    (_name, env) => {
      const result = build(env)
      expect(result.status, result.output).not.toBe(0)
      expect(existsSync(join(result.outDir, 'index.html'))).toBe(false)
    },
    180_000
  )
})
