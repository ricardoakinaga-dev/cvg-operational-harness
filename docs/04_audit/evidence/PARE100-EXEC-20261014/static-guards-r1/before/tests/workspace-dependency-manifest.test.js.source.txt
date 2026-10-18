/**
 * AUD19-011 — workspace dependency manifest guard.
 *
 * Every external import used directly by a workspace must be declared in
 * that workspace's own manifest (no silent reliance on root hoisting).
 * Test-only imports belong in devDependencies; everything else in
 * dependencies. Node builtins and relative imports are ignored.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib'
])

function packageNameOf(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:')
  ) {
    return null
  }
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1]}`
  }
  return specifier.split('/')[0]
}

function isBuiltin(name) {
  return BUILTINS.has(name) || name.startsWith('node:')
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(full, out)
    } else if (/\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const IMPORT_PATTERN =
  /(?:import\s+(?:[^'"]*?\sfrom\s+)?|import\(|require\()\s*['"]([^'"]+)['"]/g

function workspaceImports(workspaceDir) {
  const src = path.join(rootDir, workspaceDir, 'src')
  if (!fs.existsSync(src)) return { runtime: new Set(), test: new Set() }
  const runtime = new Set()
  const test = new Set()
  for (const file of collectFiles(src)) {
    const text = fs.readFileSync(file, 'utf8')
    const bucket = /\.test\.[jt]sx?$/.test(file) ? test : runtime
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const name = packageNameOf(match[1])
      if (name && !isBuiltin(name)) bucket.add(name)
    }
  }
  return { runtime, test }
}

function workspaceDirs() {
  const dirs = []
  for (const scope of ['apps', 'packages']) {
    const scopeDir = path.join(rootDir, scope)
    for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = path.join(scopeDir, entry.name, 'package.json')
      if (fs.existsSync(manifest)) dirs.push(`${scope}/${entry.name}`)
    }
  }
  return dirs.sort()
}

describe('workspace dependency manifests (AUD19-011)', () => {
  it('declares every directly imported external package', () => {
    const violations = []
    for (const dir of workspaceDirs()) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(rootDir, dir, 'package.json'), 'utf8')
      )
      const dependencies = manifest.dependencies ?? {}
      const devDependencies = manifest.devDependencies ?? {}
      const { runtime, test } = workspaceImports(dir)
      for (const name of [...runtime].sort()) {
        if (!dependencies[name]) {
          violations.push(
            `${dir}: runtime import '${name}' is not declared in dependencies`
          )
        }
      }
      for (const name of [...test].sort()) {
        if (!dependencies[name] && !devDependencies[name]) {
          violations.push(
            `${dir}: test import '${name}' is not declared in dependencies or devDependencies`
          )
        }
      }
    }
    expect(violations).toEqual([])
  })
})
