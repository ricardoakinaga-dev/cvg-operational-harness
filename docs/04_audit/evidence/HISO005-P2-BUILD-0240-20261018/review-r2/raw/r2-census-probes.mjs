// Crítica R2 HISO005-P2-BUILD-0240: sondas próprias da correção (census de recusa v2,
// stream de violações, união no pai, prazo único). Somente fixtures sintéticas próprias em
// /mnt/ia/cvg-hiso005-build0240-runtime-20261018/review-r2/fx. Nunca importa/executa os
// módulos-alvo das fixtures: engine/helper só analisam bytes.
// Uso: node r2-census-probes.mjs <cenário>   (C1|C2|C4|C5|C7|C9|C10)
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  NODE,
  V2,
  V3,
  ENV,
  engine,
  freshRoot,
  input,
  link,
  saveRaw,
  summary,
  write
} from './probe-lib.mjs'

const rootPkg = (root) =>
  write(root, 'package.json', {
    name: 'synthetic-root',
    type: 'module',
    workspaces: ['packages/*', 'products/*']
  })
const productAlias = (root, name = 'prodalias', target = 'x') => {
  link(root, 'node_modules/' + name, '../products/' + target)
  write(root, 'products/' + target + '/package.json', {
    name: target,
    type: 'module'
  })
  write(root, 'products/' + target + '/index.mjs', 'export const x=1;\n')
}
// Árvore relativa sem metadados: v2 e census adquirem igualmente (custo de tempo).
const relativeTree = (root, dir, n) => {
  let s = ''
  for (let i = 0; i < n; i++) {
    write(root, `${dir}/f${i}.mjs`, '')
    s += `import './${dir}/f${i}.mjs';\n`
  }
  return s
}
const both = (name, build, extra = {}) => {
  const runs = {}
  for (const [tag, tree] of [
    ['v2', V2],
    ['v3', V3]
  ]) {
    const root = freshRoot(name + '-' + tag)
    build(root)
    const out = engine(tree, root, [input(root, ['entry.mjs'], extra)])
    runs[tag] = {
      ...summary(out),
      telemetry: out.telemetry,
      installed: out.installed
    }
  }
  return runs
}
const canon = (v) => JSON.stringify((v || []).map((x) => JSON.stringify(x)).sort())
const subset = (a, b) => {
  const B = new Set((b || []).map((x) => JSON.stringify(x)))
  return (a || []).every((x) => B.has(JSON.stringify(x)))
}

const scenarios = {
  // C1: produto conhecido cedo pelo census; o PRÓPRIO census é morto pelo prazo depois.
  // Espera: v3 VIOLATION via stream do census morto; tempo total ~ timeoutMs (prazo único).
  C1() {
    const N = 1500,
      timeoutMs = 3000
    const runs = both(
      'c1-census-killed-after-discovery',
      (root) => {
        rootPkg(root)
        write(root, 'entry.mjs', "import 'prodalias';\n" + relativeTree(root, 't', N))
        productAlias(root)
      },
      { limits: { timeoutMs } }
    )
    return {
      N,
      timeoutMs,
      runs,
      check: {
        v3Violation: runs.v3.status === 'VIOLATION' && runs.v3.violations.length === 1,
        v3Proofs0: runs.v3.proofs === 0,
        v3ElapsedWithinSingleDeadline: runs.v3.telemetry.elapsedMs < timeoutMs + 1500,
        v2RetainedSubset: subset(runs.v2.violations, runs.v3.violations)
      }
    }
  },
  // C2: prazo antes de conhecer o alvo (árvore grande antes do alias). Espera: UNKNOWN,
  // zero provas, sem violação inventada; prazo único (não 2x timeoutMs).
  C2() {
    // N=1500 (1ª execução, out/r2-C2-n1500-census-reached-alias.json): o census chegou ao
    // alias antes do prazo (v3 VIOLATION, v2 UNKNOWN). Para o caso sem conhecimento: N=6000.
    const N = Number(process.argv[3] || 6000),
      timeoutMs = 3000
    const runs = both(
      'c2-deadline-before-knowledge',
      (root) => {
        rootPkg(root)
        write(root, 'entry.mjs', relativeTree(root, 't', N) + "import 'prodalias';\n")
        productAlias(root)
      },
      { limits: { timeoutMs } }
    )
    return {
      N,
      timeoutMs,
      runs,
      check: {
        v3Unknown: runs.v3.status === 'UNKNOWN',
        v3Proofs0: runs.v3.proofs === 0,
        v3NoViolation: runs.v3.violations.length === 0,
        v3ElapsedWithinSingleDeadline: runs.v3.telemetry.elapsedMs < timeoutMs + 1500,
        v2RetainedSubset: subset(runs.v2.violations, runs.v3.violations)
      }
    }
  },
  // C4: census nunca é autoridade de prova (chamada direta, perfil, revalidação).
  async C4() {
    const root = freshRoot('c4-census-authority')
    rootPkg(root)
    write(root, 'packages/demo/package.json', {
      name: 'demo',
      type: 'module',
      imports: { '#u/x': { a: [1] } },
      exports: { '.': './chosen.mjs', './u/*': null }
    })
    write(root, 'packages/demo/chosen.mjs', 'export const a=1;')
    link(root, 'node_modules/demo', '../packages/demo')
    write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    const root2 = freshRoot('c4-census-authority-nometa')
    rootPkg(root2)
    write(root2, 'packages/demo/package.json', {
      name: 'demo',
      type: 'module',
      exports: { '.': './chosen.mjs' }
    })
    write(root2, 'packages/demo/chosen.mjs', 'export const a=1;')
    link(root2, 'node_modules/demo', '../packages/demo')
    write(root2, 'entry.mjs', "import {a} from 'demo';export const r=a;")
    const res = {}
    for (const [tag, r] of [
      ['eligibleMetadata', root],
      ['noMetadata', root2]
    ]) {
      const census = engine(V3, r, [input(r, ['entry.mjs']), { refusalCensus: true }], 'analyzeSemanticBoundary')
      const refinement = engine(V3, r, [input(r, ['entry.mjs'])], 'analyzeSemanticBoundary')
      const revalCensus = engine(V3, r, [r, census, []], 'revalidateSemanticInputs')
      const revalRefinement = engine(V3, r, [r, refinement, []], 'revalidateSemanticInputs')
      // Lavagem: snapshot do census no lugar do snapshot da refinação.
      const laundered = { ...refinement, runtimeResolution: census.runtimeResolution }
      const revalLaundered = engine(V3, r, [r, laundered, []], 'revalidateSemanticInputs')
      // Opção truthy não-booleana não ativa census (=== true) — e o helper exige boolean.
      const truthy = engine(V3, r, [input(r, ['entry.mjs']), { refusalCensus: 1 }], 'analyzeSemanticBoundary')
      res[tag] = {
        census: {
          status: census.status,
          proofs: census.proofs.length,
          unknowns: census.unknowns.map((u) => u.reason),
          profile: census.runtimeResolution?.profile
        },
        refinement: {
          status: refinement.status,
          proofs: refinement.proofs.length,
          profile: refinement.runtimeResolution?.profile
        },
        revalCensus,
        revalRefinement,
        revalLaundered,
        truthyOption: { status: truthy.status, proofs: truthy.proofs.length }
      }
    }
    return {
      res,
      check: {
        censusNeverProven:
          res.eligibleMetadata.census.proofs === 0 &&
          res.noMetadata.census.proofs === 0 &&
          res.noMetadata.census.status === 'UNKNOWN',
        censusProfileDistinct:
          res.noMetadata.census.profile === 'node22-linux-v2-refusal-census-v1',
        censusSnapshotRejected:
          res.eligibleMetadata.revalCensus === false &&
          res.noMetadata.revalCensus === false &&
          res.noMetadata.revalLaundered === false,
        refinementControl:
          res.eligibleMetadata.refinement.status === 'PROVEN' &&
          res.eligibleMetadata.revalRefinement === true
      }
    }
  },
  // C4b: igual a C4, mas census pelo worker real (--experimental-vm-modules, como o pai o
  // executa) e refinação pelo caminho completo; a refinação é PROVEN, o census nunca.
  C4b() {
    const engineFile = path.join(V3, 'scripts/boundary-semantic-engine.mjs')
    const res = {}
    for (const [tag, meta] of [
      ['eligibleMetadata', { imports: { '#u/x': { a: [1] } }, exports: { '.': './chosen.mjs', './u/*': null } }],
      ['noMetadata', { exports: { '.': './chosen.mjs' } }]
    ]) {
      const r = freshRoot('c4b-' + tag)
      rootPkg(r)
      write(r, 'packages/demo/package.json', { name: 'demo', type: 'module', ...meta })
      write(r, 'packages/demo/chosen.mjs', 'export const a=1;')
      link(r, 'node_modules/demo', '../packages/demo')
      write(r, 'entry.mjs', "import {a} from 'demo';export const r=a;")
      const inp = input(r, ['entry.mjs'])
      const w = spawnSync(NODE, ['--experimental-vm-modules', engineFile, '--semantic-worker', '--refusal-census'], { input: JSON.stringify(inp), env: ENV, encoding: 'utf8', cwd: path.dirname(engineFile), timeout: 60000 })
      const census = JSON.parse(w.stdout)
      const full = engine(V3, r, [inp])
      const revalCensus = engine(V3, r, [r, census, []], 'revalidateSemanticInputs')
      const revalFull = engine(V3, r, [r, full, []], 'revalidateSemanticInputs')
      const laundered = engine(V3, r, [r, { ...full, runtimeResolution: census.runtimeResolution }, []], 'revalidateSemanticInputs')
      res[tag] = {
        census: { status: census.status, proofs: census.proofs.length, validation: census.validation, unknowns: census.unknowns.map((u) => u.reason), profile: census.runtimeResolution?.profile },
        full: { status: full.status, proofs: full.proofs.length, unknowns: full.unknowns.map((u) => u.reason), telemetry: full.telemetry },
        revalCensus,
        revalFull,
        laundered
      }
    }
    return {
      res,
      check: {
        fullProvenBoth: res.eligibleMetadata.full.status === 'PROVEN' && res.noMetadata.full.status === 'PROVEN',
        censusNeverProven: Object.values(res).every((x) => x.census.proofs === 0 && x.census.status === 'UNKNOWN' && x.census.validation.valid === false),
        censusRefusesEligibleImports: res.eligibleMetadata.census.unknowns.includes('UNKNOWN_AMBIGUOUS_RESOLUTION'),
        censusSnapshotNotAuthority: Object.values(res).every((x) => x.revalCensus === false && x.laundered === false && x.revalFull === true)
      }
    }
  },
  // C5: positivos MS01 pelo caminho completo (census + refinação + união): PROVEN preservado.
  C5() {
    const IMPORTS = { '#unused/tools': { arbitrary: [null, 17, false] } }
    const out = {}
    for (const [tag, type, manifest, files, entry] of [
      ['esm-both', 'module', { imports: IMPORTS, exports: { '.': './chosen.mjs', './unused/*': { u: [null] } } }, { 'chosen.mjs': 'export const a=1;' }, ['entry.mjs', "import {a} from 'demo';export const r=a;"]],
      ['cjs-both', 'commonjs', { imports: IMPORTS, exports: { '.': { require: './chosen.cjs' }, './unused/*': null } }, { 'chosen.cjs': 'module.exports=1;' }, ['entry.cjs', "const p=require('demo');module.exports=p;"]]
    ]) {
      const row = {}
      for (const [t, tree] of [
        ['v2', V2],
        ['v3', V3]
      ]) {
        const root = freshRoot('c5-' + tag + '-' + t)
        write(root, 'package.json', { name: 'synthetic-root', type, workspaces: ['packages/*', 'products/*'] })
        write(root, 'packages/demo/package.json', { name: 'demo', type, ...manifest })
        for (const [f, b] of Object.entries(files)) write(root, 'packages/demo/' + f, b)
        link(root, 'node_modules/demo', '../packages/demo')
        write(root, entry[0], entry[1])
        const o = engine(tree, root, [input(root, [entry[0]])])
        row[t] = { ...summary(o), telemetry: o.telemetry, kernel: o.proofs?.[0]?.derivation?.profile?.kernelVersion, resolutionProfile: o.proofs?.[0]?.derivation?.profile?.resolutionProfile }
      }
      out[tag] = row
    }
    return {
      out,
      check: {
        v3Proven: Object.values(out).every((r) => r.v3.status === 'PROVEN' && r.v3.proofs > 0),
        v2Red: Object.values(out).every((r) => r.v2.status !== 'PROVEN'),
        censusTelemetry: Object.values(out).every((r) => typeof r.v3.telemetry.negativeCensusElapsedMs === 'number')
      }
    }
  },
  // C7: argv do worker é fechado; census direto emite stream e nunca valida/prova.
  C7() {
    const root = freshRoot('c7-worker-args')
    rootPkg(root)
    write(root, 'entry.mjs', "import 'prodalias';\n")
    productAlias(root)
    const engineFile = path.join(V3, 'scripts/boundary-semantic-engine.mjs')
    const inp = JSON.stringify(input(root, ['entry.mjs']))
    const run = (extra) => {
      const r = spawnSync(NODE, ['--experimental-vm-modules', engineFile, '--semantic-worker', ...extra], { input: inp, env: ENV, encoding: 'utf8', cwd: path.dirname(engineFile), timeout: 60000 })
      let parsed = null
      try {
        const o = JSON.parse(r.stdout)
        parsed = { status: o.status, proofs: o.proofs.length, validation: o.validation, violations: o.violations, unknowns: o.unknowns.map((u) => u.reason) }
      } catch {}
      return { exit: r.status, stdoutBytes: r.stdout.length, parsed, streamLines: r.stderr.split('\n').filter((l) => l.startsWith('CVG_SEMANTIC_VIOLATION_V1 ')) }
    }
    const rows = {
      census: run(['--refusal-census']),
      refinement: run([]),
      doubleCensus: run(['--refusal-census', '--refusal-census']),
      bogus: run(['--refusal-census=1']),
      extraAfter: run(['--refusal-census', 'x'])
    }
    return {
      rows,
      check: {
        censusNoValidationNoProof: rows.census.parsed?.validation?.valid === false && rows.census.parsed?.proofs === 0,
        censusStreams: rows.census.streamLines.length === 1,
        refinementStreamsTwice: rows.refinement.streamLines.length >= 1,
        argvClosed: [rows.doubleCensus, rows.bogus, rows.extraAfter].every((r) => r.exit === 2 && r.stdoutBytes === 0)
      }
    }
  },
  // C9: produto só alcançável dentro do corpo que a v2 recusa, e orçamento esgotado ANTES
  // de alcançá-lo: falta de conhecimento => UNKNOWN/zero provas; v2 também não o conhece.
  C9() {
    const N = 6000
    const runs = both('c9-unknowable-after-budget', (root) => {
      rootPkg(root)
      write(root, 'entry.mjs', "import 'pkg';\n")
      write(root, 'node_modules/pkg/package.json', { name: 'pkg', type: 'module', imports: {}, exports: { '.': './index.mjs' } })
      let index = ''
      for (let i = 0; i < N; i++) {
        index += `import './f${i}.mjs';\n`
        write(root, `node_modules/pkg/f${i}.mjs`, '')
      }
      index += "import 'prodalias';\n"
      write(root, 'node_modules/pkg/index.mjs', index)
      productAlias(root)
    })
    return {
      N,
      runs,
      check: {
        v3UnknownZeroProofs: runs.v3.status === 'UNKNOWN' && runs.v3.proofs === 0,
        v2NoViolationLost: subset(runs.v2.violations, runs.v3.violations)
      }
    }
  },
  // C10: multiset v2 com TRÊS violações por percursos distintos (alias direto, alias
  // relativo de segundo produto, alvo negativo de pacote com nome divergente) sob o mesmo
  // esgotamento de maxFiles provocado pela refinação. Espera: v3 ⊇ v2.
  C10() {
    const N = 6000
    const runs = both('c10-multiset', (root) => {
      rootPkg(root)
      write(
        root,
        'entry.mjs',
        "import 'pkg';\nimport 'prodalias';\nimport './rel/link/index.mjs';\nimport 'misnamed';\n"
      )
      write(root, 'node_modules/pkg/package.json', { name: 'pkg', type: 'module', imports: {}, exports: { '.': './index.mjs' } })
      let index = ''
      for (let i = 0; i < N; i++) {
        index += `import './f${i}.mjs';\n`
        write(root, `node_modules/pkg/f${i}.mjs`, '')
      }
      write(root, 'node_modules/pkg/index.mjs', index)
      productAlias(root)
      productAlias(root, '__unused_alias_y', 'y')
      fs.rmSync(path.join(root, 'node_modules/__unused_alias_y'))
      fs.mkdirSync(path.join(root, 'rel'), { recursive: true })
      fs.symlinkSync('../products/y', path.join(root, 'rel/link'))
      // Pacote instalado com nome divergente: a v2 recusa (UNKNOWN_PACKAGE_NAME) mas
      // preserva o census negativo do alvo selecionado (alias para produto z).
      write(root, 'node_modules/misnamed/package.json', { name: 'other', type: 'module', exports: { '.': './lib/index.mjs' } })
      write(root, 'products/z/package.json', { name: 'z', type: 'module' })
      write(root, 'products/z/index.mjs', 'export const z=1;\n')
      fs.symlinkSync('../../products/z', path.join(root, 'node_modules/misnamed/lib'))
    })
    return {
      N,
      runs,
      check: {
        v2Violations: runs.v2.violations.length,
        v3Violations: runs.v3.violations.length,
        v2SubsetOfV3: subset(runs.v2.violations, runs.v3.violations),
        sameMultiset: canon(runs.v2.violations) === canon(runs.v3.violations),
        v3Proofs0: runs.v3.proofs === 0
      }
    }
  }
}

const id = process.argv[2]
if (!scenarios[id]) throw Error('cenário desconhecido: ' + id)
const started = Date.now()
const result = { id, startedAt: new Date(started).toISOString(), ...(await scenarios[id]()) }
result.wallMs = Date.now() - started
console.log(JSON.stringify(result.check ?? result, null, 2))
saveRaw('r2-' + id + (process.argv[3] ? '-n' + process.argv[3] : ''), result)
