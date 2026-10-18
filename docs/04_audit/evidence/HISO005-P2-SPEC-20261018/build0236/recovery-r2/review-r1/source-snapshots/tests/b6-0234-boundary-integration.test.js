import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createInstalledPackageVerifier } from '../scripts/boundary-manifests.mjs'

const roots = []
const fixture = () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cvg-b6-0234-integration-')
  )
  roots.push(root)
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({ lockfileVersion: 3, packages: {} })
  )
  return root
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('SPEC0234 boundary opt-in is structural and conservative', () => {
  it('refuses a missing reference file instead of ignoring the opt-in', () => {
    const root = fixture()
    expect(() =>
      createInstalledPackageVerifier(root, {
        installedReference: {
          manifestPath: path.join(root, 'missing.json'),
          expectedSha256: '0'.repeat(64)
        }
      })
    ).toThrow()
  })
  it('rejects a supplied identity object without the expected digest', () => {
    const root = fixture()
    expect(() =>
      createInstalledPackageVerifier(root, {
        installedReference: { manifestPath: path.join(root, 'missing.json') }
      })
    ).toThrow()
  })
  it.each([
    ['--installed-reference=x'],
    ['--installed-reference-sha256=' + 'a'.repeat(64)],
    [
      '--installed-reference=x',
      '--installed-reference-sha256=' + 'A'.repeat(64)
    ],
    [
      '--installed-reference=x',
      '--installed-reference=x',
      '--installed-reference-sha256=' + 'a'.repeat(64)
    ]
  ])('CLI rejects malformed or unpaired identity arguments: %j', (...flags) => {
    const child = spawnSync(
      process.execPath,
      ['scripts/check-product-boundary.mjs', ...flags],
      { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' }
    )
    expect(child.status).toBe(2)
  })
})

// Independent synthetic roots are populated from declared fixture literals.
// They exercise the comparator/checker boundary; production provenance is
// separately demonstrated through the offline runner and reviewed artifacts.
async function identityFixture({
  source = 'module.exports = 1\n',
  version = '1.0.0',
  nested = false
} = {}) {
  const {
    canonicalJson,
    sha256File,
    fingerprintResolution,
    fingerprintToolchain,
    collectPackageInventory,
    INSTALLED_IDENTITY_LIMITS
  } = await import('../scripts/boundary-installed-identity.mjs')
  const { createHash } = await import('node:crypto')
  const hash = (value) => createHash('sha256').update(value).digest('hex')
  const evaluated = fixture(),
    reference = fixture()
  const sri = 'sha512-' + Buffer.alloc(64, 1).toString('base64')
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', version: '1.0.0' },
      'node_modules/vendor': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
        integrity: sri
      },
      ...(nested
        ? {
            'node_modules/vendor/node_modules/inner': {
              version: '1.0.0',
              resolved: 'https://registry.npmjs.org/inner/-/inner-1.0.0.tgz',
              integrity: sri
            }
          }
        : {})
    }
  }
  const write = (root, file, body) => {
    const p = path.join(root, file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
  }
  for (const root of [evaluated, reference]) {
    write(
      root,
      'package.json',
      JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        private: true,
        workspaces: ['packages/*', 'products/*']
      })
    )
    write(root, 'package-lock.json', JSON.stringify(lock))
    write(
      root,
      'packages/core/package.json',
      JSON.stringify({
        name: 'core',
        version: '1.0.0',
        dependencies: { vendor: '1.0.0' }
      })
    )
    write(
      root,
      'packages/core/src/index.ts',
      "import value from 'vendor';export {value}\n"
    )
    write(
      root,
      'products/shift-assistant/package.json',
      JSON.stringify({ name: '@cvg/shift-assistant', version: '1.0.0' })
    )
    write(
      root,
      'products/shift-assistant/src/index.ts',
      'export const product=1\n'
    )
    write(
      root,
      'node_modules/vendor/package.json',
      JSON.stringify({
        name: 'vendor',
        version: root === evaluated ? version : '1.0.0',
        main: 'index.js'
      })
    )
    write(root, 'node_modules/vendor/index.js', source)
    write(
      root,
      'node_modules/vendor/.hidden.unknown-extension',
      'all bytes included\n'
    )
    if (nested) {
      write(
        root,
        'node_modules/vendor/node_modules/inner/package.json',
        JSON.stringify({ name: 'inner', version: '1.0.0', main: 'index.js' })
      )
      write(
        root,
        'node_modules/vendor/node_modules/inner/index.js',
        'module.exports=2\n'
      )
    }
  }
  const packages = Object.keys(lock.packages)
    .filter((k) => k.includes('node_modules/'))
    .sort()
    .map((key) => ({
      key,
      name: key.endsWith('/inner') ? 'inner' : 'vendor',
      version: '1.0.0',
      ...collectPackageInventory(path.join(reference, key))
    }))
  const toolchain = fingerprintToolchain()
  const receipt = {
    schemaVersion: 1,
    kind: 'cvg-installed-content-reference',
    commit: 'f'.repeat(40),
    root: fs.realpathSync(reference),
    ...fingerprintResolution(reference),
    toolchain,
    toolchainSha256: hash(canonicalJson(toolchain)),
    recipe: {
      argv: [
        'ci',
        '--offline',
        '--ignore-scripts',
        '--audit=false',
        '--fund=false',
        '--include=dev',
        '--include=optional',
        '--cache',
        path.join(reference, 'cache')
      ],
      exitCode: 0,
      offline: true,
      ignoreScripts: true,
      completed: true
    },
    selection: {
      platform: process.platform,
      arch: process.arch,
      dev: true,
      optional: true
    },
    limits: { ...INSTALLED_IDENTITY_LIMITS },
    usage: {
      entries: packages.reduce((s, p) => s + p.usage.entries, 0),
      regularBytes: packages.reduce((s, p) => s + p.usage.regularBytes, 0),
      maxDepth: Math.max(...packages.map((p) => p.usage.maxDepth))
    },
    packages
  }
  const manifestPath = path.join(reference, 'reference.json')
  const save = () => {
    fs.writeFileSync(manifestPath, canonicalJson(receipt))
    return { manifestPath, expectedSha256: sha256File(manifestPath) }
  }
  const installedReference = save()
  return { evaluated, reference, receipt, installedReference, write, save }
}

describe('SPEC0234 identity adds evidence without semantic approval', () => {
  it('reports full identical content while preserving the complete default report', async () => {
    const f = await identityFixture()
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const baseline = auditProductBoundary(f.evaluated, { graph: true })
    const opt = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(opt.status).toBe('INCOMPLETE')
    expect(opt.passed).toBe(false)
    expect(opt.exceptionsApplied).toBe(false)
    expect(opt.diagnostics).toEqual(baseline.diagnostics)
    expect(opt.violations).toEqual(baseline.violations)
    expect(opt.graph.nodes).toEqual(baseline.graph.nodes)
    expect(opt.graph.edges).toEqual(baseline.graph.edges)
    const vendor = opt.graph.installed.find(
      (p) => p.node === 'node_modules/vendor/package.json'
    )
    expect(vendor.verified).toBe(false)
    expect(vendor.reason).toBe('UNVERIFIED_INSTALLED_CONTENT')
    expect(vendor.contentIdentity.status).toBe('MATCH')
    expect(
      vendor.contentIdentity.inventory.evaluated.entries.some(
        (e) => e.path === '.hidden.unknown-extension'
      )
    ).toBe(true)
  })
  it('never turns byte-identical computed product loading into a semantic PASS', async () => {
    const f = await identityFixture({
      source:
        "module.exports=import('products/'+['shift','assistant'].join('-')+'/src/index.js')\n"
    })
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    // Installed code is opaque to the semantic analyzer even with byte identity.
    expect(report.status).toBe('INCOMPLETE')
    expect(report.graph.installed[0].contentIdentity.status).toBe('MATCH')
    expect(report.graph.installed[0].verified).toBe(false)
  })
  it('preserves literal product FAIL and all default diagnostics with identity MATCH', async () => {
    const f = await identityFixture({
      source: "module.exports=require('@cvg/shift-assistant')\n"
    })
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const baseline = auditProductBoundary(f.evaluated, { graph: true })
    const opt = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(opt.status).toBe('FAIL')
    expect(opt.diagnostics).toEqual(baseline.diagnostics)
    expect(opt.graph.installed[0].contentIdentity.status).toBe('MATCH')
    expect(opt.graph.installed[0].verified).toBe(false)
  })
  it('preserves version drift and exception request independently of byte evidence', async () => {
    const f = await identityFixture({ version: '1.0.1' })
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const baseline = auditProductBoundary(f.evaluated, {
      graph: true,
      exceptions: true
    })
    const opt = auditProductBoundary(f.evaluated, {
      graph: true,
      exceptions: true,
      installedReference: f.installedReference
    })
    expect(opt.status).toBe('INCOMPLETE')
    expect(opt.diagnostics).toEqual(baseline.diagnostics)
    expect(opt.installedLockDrift).toEqual(baseline.installedLockDrift)
    expect(opt.installedLockDrift).toHaveLength(1)
    expect(opt.graph.installed[0].contentIdentity.status).toBe('MISMATCH')
  })
  it('does not reuse a MATCH when installed bytes change on the same verifier', async () => {
    const f = await identityFixture()
    const verifier = createInstalledPackageVerifier(f.evaluated, {
      installedReference: f.installedReference
    })
    const context = path.join(f.evaluated, 'node_modules/vendor')
    expect(
      verifier.verify(context, 'node_modules/vendor').contentIdentity.status
    ).toBe('MATCH')
    f.write(f.evaluated, 'node_modules/vendor/index.js', 'module.exports=99\n')
    expect(
      verifier.verify(context, 'node_modules/vendor').contentIdentity.status
    ).toBe('MISMATCH')
  })
  it('expands an otherwise undeclared physical nested package and preserves its product tripwire', async () => {
    const f = await identityFixture({ nested: true })
    f.write(
      f.evaluated,
      'node_modules/vendor/node_modules/inner/index.js',
      "module.exports=require('@cvg/shift-assistant')\n"
    )
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(report.installedPackageCount).toBe(2)
    expect(report.status).toBe('FAIL')
    expect(report.graph.installed.map((x) => x.node)).toContain(
      'node_modules/vendor/node_modules/inner/package.json'
    )
    expect(report.graph.installed.every((x) => x.verified === false)).toBe(true)
    expect(
      report.graph.installed.find((x) => x.node.endsWith('/inner/package.json'))
        .contentIdentity.status
    ).toBe('MISMATCH')
  })
  it('keeps a nested product witness when the parent has an unsupported dangling link', async () => {
    const f = await identityFixture({ nested: true })
    fs.symlinkSync(
      'missing',
      path.join(f.evaluated, 'node_modules/vendor/.dangling')
    )
    f.write(
      f.evaluated,
      'node_modules/vendor/node_modules/inner/index.js',
      "module.exports=require('@cvg/shift-assistant')\n"
    )
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(report.status).toBe('FAIL')
    expect(report.installedPackageCount).toBe(2)
    expect(
      report.graph.installed.find(
        (x) => x.node === 'node_modules/vendor/package.json'
      ).contentIdentity.status
    ).toBe('UNSUPPORTED')
    expect(
      report.graph.installed.find((x) => x.node.endsWith('/inner/package.json'))
        .contentIdentity.status
    ).toBe('MISMATCH')
  })
  it('exposes per-package identity without requiring graph output', async () => {
    const f = await identityFixture()
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      installedReference: f.installedReference
    })
    expect(report.status).toBe('INCOMPLETE')
    expect(report.installedContentIdentity).toHaveLength(1)
    expect(report.installedContentIdentity[0].verified).toBe(false)
    expect(report.installedContentIdentity[0].contentIdentity.status).toBe(
      'MATCH'
    )
    expect(report.graph).toBeUndefined()
  })
  it('classifies a nested directory link to product sources by canonical destination', async () => {
    const f = await identityFixture()
    const link = path.join(
      f.evaluated,
      'node_modules/vendor/node_modules/bridge'
    )
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(path.join(f.evaluated, 'products/shift-assistant/src'), link)
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(report.status).toBe('FAIL')
    expect(report.violations.length).toBeGreaterThan(0)
    expect(
      report.violations.some(
        (v) =>
          v.reason === 'CORE_DEPENDS_ON_PRODUCT' &&
          v.trail.at(-1) === 'products/shift-assistant/src'
      )
    ).toBe(true)
  })
  it('keeps non-package files under node_modules in the parent inventory and product tripwire', async () => {
    const f = await identityFixture()
    f.write(
      f.evaluated,
      'node_modules/vendor/node_modules/orphan.opaque',
      'products/shift-assistant/src/index.ts\n'
    )
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(report.status).toBe('FAIL')
    expect(report.installedPackageCount).toBe(1)
    expect(report.graph.installed[0].contentIdentity.status).toBe('MISMATCH')
    expect(
      report.diagnostics.some(
        (d) =>
          d.reason === 'INSTALLED_PACKAGE_REFERENCES_PRODUCT' &&
          d.file.endsWith('/orphan.opaque')
      )
    ).toBe(true)
  })
  it('records a cyclic nested dependency as unsupported without crashing the graph', async () => {
    const f = await identityFixture()
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(f.evaluated, 'node_modules/vendor/package.json'),
        'utf8'
      )
    )
    manifest.dependencies = { inner: '1.0.0' }
    f.write(
      f.evaluated,
      'node_modules/vendor/package.json',
      JSON.stringify(manifest)
    )
    const link = path.join(
      f.evaluated,
      'node_modules/vendor/node_modules/inner'
    )
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync('inner', link)
    const { auditProductBoundary } =
      await import('../scripts/check-product-boundary.mjs')
    const report = auditProductBoundary(f.evaluated, {
      graph: true,
      installedReference: f.installedReference
    })
    expect(report.status).toBe('INCOMPLETE')
    expect(report.graph.installed[0].contentIdentity.status).toBe('UNSUPPORTED')
    expect(
      report.diagnostics.some((d) => d.detail === 'CYCLIC_INSTALLED_LINK')
    ).toBe(true)
  })
  it('normal and strict CLI produce identical diagnostics and identity graph', async () => {
    const f = await identityFixture()
    const commands = [[], ['--strict']].map((extra, i) => {
      const graph = path.join(f.evaluated, `graph-${i}.json`)
      const child = spawnSync(
        process.execPath,
        [
          'scripts/check-product-boundary.mjs',
          f.evaluated,
          `--installed-reference=${f.installedReference.manifestPath}`,
          `--installed-reference-sha256=${f.installedReference.expectedSha256}`,
          `--graph=${graph}`,
          ...extra
        ],
        { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' }
      )
      expect(child.status).toBe(1)
      return {
        report: JSON.parse(child.stdout),
        graph: JSON.parse(fs.readFileSync(graph, 'utf8'))
      }
    })
    expect(commands[0]).toEqual(commands[1])
  })
})
