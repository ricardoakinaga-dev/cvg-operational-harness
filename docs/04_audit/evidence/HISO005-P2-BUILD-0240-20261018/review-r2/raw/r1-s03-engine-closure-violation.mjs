// S03 (RC2/RC3, MS01/MS04/MS05): engine v3 vs v2 com fixtures próprias.
// Corpo/sucessores sob imports elegível precisam fechar K0–K7; produto selecionado vira VIOLATION.
import { V2, V3, engine, freshRoot, input, link, saveRaw, summary, write } from './probe-lib.mjs'

const IMPORTS = { '#unused/tools': { arbitrary: [null, 17, false] } }
// Pacote de workspace (packages/demo + node_modules/demo -> ../packages/demo), como as
// fixtures 0240: evita confundir o resultado com UNKNOWN_INSTALLED_IDENTITY.
function pkg(root, manifest, filesMap, type = 'module') {
  write(root, 'package.json', { name: 'synthetic-root', type, workspaces: ['packages/*', 'products/*'] })
  write(root, 'packages/demo/package.json', { name: 'demo', type, ...manifest })
  for (const [f, b] of Object.entries(filesMap)) write(root, 'packages/demo/' + f, b)
  link(root, 'node_modules/demo', '../packages/demo')
}
const scenarios = [
  {
    id: 'E1-positive-esm-both', criterion: 'MS01', expect: 'PROVEN',
    build(root) {
      pkg(root, { imports: IMPORTS, exports: { '.': './chosen.mjs', './unused/*': { u: [null] } } }, { 'chosen.mjs': 'export const a=1;', 'other.mjs': 'export const a=0;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E2-positive-cjs-both', criterion: 'MS01', expect: 'PROVEN',
    build(root) {
      pkg(root, { imports: IMPORTS, exports: { '.': { require: './chosen.cjs' }, './unused/*': null } }, { 'chosen.cjs': 'module.exports=1;' }, 'commonjs')
      write(root, 'entry.cjs', "const p=require('demo');module.exports=p;")
    },
    starts: ['entry.cjs']
  },
  {
    id: 'E3-body-active-hash-edge', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: { '#unused/tools': './tools.mjs' }, exports: { '.': './chosen.mjs' } }, { 'chosen.mjs': "import '#unused/tools';export const a=1;", 'tools.mjs': 'export const t=1;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E4-body-dead-hash-dynamic', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: { '#unused/tools': './tools.mjs' }, exports: { '.': './chosen.mjs' } }, { 'chosen.mjs': "if (false) import('#unused/tools');export const a=1;", 'tools.mjs': 'export const t=1;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E5-body-reflection-dynamic-import', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: { '#unused/tools': './tools.mjs' }, exports: { '.': './chosen.mjs' } }, { 'chosen.mjs': "const k=globalThis.k;export const a=1;export const l=()=>import(k);", 'tools.mjs': 'export const t=1;' })
      write(root, 'entry.mjs', "import {a,l} from 'demo';export const r=a;l();")
    }
  },
  {
    id: 'E6-body-import-meta-resolve-hash', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: { '#unused/tools': './tools.mjs' }, exports: { '.': './chosen.mjs' } }, { 'chosen.mjs': "export const u=import.meta.resolve('#unused/tools');export const a=1;", 'tools.mjs': 'export const t=1;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E7-body-createRequire-hash', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: { '#unused/tools': './tools.cjs' }, exports: { '.': './chosen.mjs' } }, { 'chosen.mjs': "import {createRequire} from 'node:module';const r=createRequire(import.meta.url);export const t=r('#unused/tools');export const a=1;", 'tools.cjs': 'module.exports=1;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E8-cjs-module-require-hash', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: { '#unused/tools': './tools.cjs' }, exports: { '.': './chosen.cjs' } }, { 'chosen.cjs': "const t=module.require('#unused/tools');module.exports=1;", 'tools.cjs': 'module.exports=1;' }, 'commonjs')
      write(root, 'entry.cjs', "const p=require('demo');module.exports=p;")
    },
    starts: ['entry.cjs']
  },
  {
    id: 'E9-browser-plus-imports', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { browser: { './chosen.mjs': './other.mjs' }, imports: IMPORTS, exports: { '.': './chosen.mjs' } }, { 'chosen.mjs': 'export const a=1;', 'other.mjs': 'export const a=0;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E10-dist-without-receipt', criterion: 'MS04', expect: 'UNKNOWN',
    build(root) {
      pkg(root, { imports: IMPORTS, exports: { '.': './dist/index.mjs', './x/*': './dist/*.mjs' } }, { 'dist/index.mjs': 'export const a=1;' })
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E11-product-selected-alias-both-metadata', criterion: 'MS05', expect: 'VIOLATION',
    build(root) {
      pkg(root, { imports: IMPORTS, exports: { '.': './lib/index.mjs', './unused/*': './nope/*.mjs' } }, {})
      link(root, 'packages/demo/lib', '../../products/p')
      write(root, 'products/p/package.json', { name: 'p', type: 'module' })
      write(root, 'products/p/index.mjs', 'export const a=1;')
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E12-product-selected-direct-both-metadata', criterion: 'MS05', expect: 'VIOLATION',
    build(root) {
      pkg(root, { imports: IMPORTS, exports: { '.': '../../products/p/index.mjs', './unused/*': './nope/*.mjs' } }, {})
      write(root, 'products/p/package.json', { name: 'p', type: 'module' })
      write(root, 'products/p/index.mjs', 'export const a=1;')
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    }
  },
  {
    id: 'E13-product-intermediate-then-cap-maxLinks0', criterion: 'MS05', expect: 'VIOLATION',
    build(root) {
      pkg(root, { imports: IMPORTS, exports: { '.': './lib/deep/index.mjs', './unused/*': './nope/*.mjs' } }, {})
      link(root, 'packages/demo/lib', '../../products/p')
      write(root, 'products/p/package.json', { name: 'p', type: 'module' })
      write(root, 'products/p/deep/index.mjs', 'export const a=1;')
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    },
    extra: { resolutionLimits: { maxLinks: 0, maxOpenDescriptors: 8 } }
  },
  {
    id: 'E14-workspace-alias-to-product-both-metadata', criterion: 'MS05', expect: 'VIOLATION',
    build(root) {
      write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
      write(root, 'packages/demo/package.json', { name: 'demo', type: 'module', imports: IMPORTS, exports: { '.': './src/index.mjs', './unused/*': './x/*.mjs' } })
      link(root, 'packages/demo/src', '../../products/p/src')
      write(root, 'products/p/package.json', { name: 'p', type: 'module' })
      write(root, 'products/p/src/index.mjs', 'export const a=1;')
      link(root, 'node_modules/demo', '../packages/demo')
      write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    },
    extra: { resolutionLimits: { maxWorkspaces: 0 } }
  }
]
const results = []
for (const s of scenarios) {
  const row = { id: s.id, criterion: s.criterion, expect: s.expect, runs: {} }
  for (const [tag, tree] of [['v2', V2], ['v3', V3]]) {
    const root = freshRoot('s03-' + s.id + '-' + tag)
    s.build(root)
    const out = engine(tree, root, [input(root, s.starts || ['entry.mjs'], s.extra || {})])
    row.runs[tag] = summary(out)
    if (tag === 'v3' && out.status === 'PROVEN') {
      const k5 = out.proofs.find((p) => p.rule === 'K5' && p.file === (s.starts || ['entry.mjs'])[0])
      row.v3K5 = { closure: k5?.derivation.closure, rules: k5?.derivation.rules, resolutionProfile: k5?.derivation.profile.resolutionProfile, kernelVersion: k5?.derivation.profile.kernelVersion }
      row.v3Traces = out.runtimeResolution.resolutions.map((t) => ({ specifier: t.specifier, branch: t.branch, metadataSelection: t.metadataSelection, canonicalFile: t.canonicalFile }))
    }
  }
  const v3 = row.runs.v3
  row.v2ViolationsRetained = (row.runs.v2.violations || []).every((v) => (v3.violations || []).some((w) => JSON.stringify(w) === JSON.stringify(v)))
  row.pass = v3.status === s.expect && row.v2ViolationsRetained && (s.expect !== 'PROVEN' || v3.validation?.valid === true) && (s.expect === 'PROVEN' || v3.proofs === 0)
  results.push(row)
  console.log(s.id, '=>', 'v2:', row.runs.v2.status, 'v3:', v3.status, JSON.stringify(v3.violations), JSON.stringify(v3.unknowns).slice(0, 300), 'pass', row.pass)
}
saveRaw('s03-engine-closure-violation', results)
