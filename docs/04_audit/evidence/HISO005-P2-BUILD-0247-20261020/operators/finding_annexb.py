"""R1-P3-01: records the pre-existing Annex B.3.3 finding (block function in sloppy CJS reassigns the wrapper binding).
Runtime semantics checked in memory with the pinned Node 22 (vm.runInThisContext of Module.wrap; nothing is written or
required), kernel results from probe-extra.json (v6, v7r1b, v6t3ref). Writes finding-annexb-block-function.json."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

code = r'''
const vm = require('node:vm'); const { Module } = require('node:module'); const out = {};
const cases = {
  block: "function f() { return 1 }\n{ function f(s) { return 'inner:' + s } }\nmodule.exports = f\n",
  ifTrue: "function f() { return 1 }\nif (true) { function f(s) { return 'inner:' + s } }\nmodule.exports = f\n",
  strict: "'use strict'\nfunction f() { return 1 }\n{ function f(s) { return 'inner:' + s } }\nmodule.exports = f\n"
};
for (const [k, src] of Object.entries(cases)) {
  const fn = vm.runInThisContext(Module.wrap(src));
  const mod = { exports: {} };
  fn.call(mod.exports, mod.exports, () => { throw Error('no require') }, mod, 'm.js', '.');
  out[k] = mod.exports('./products/x.js');
}
process.stdout.write(JSON.stringify(out));
'''
p = subprocess.run([NODE, '-e', code], capture_output=True, text=True, env={'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'})
runtime = json.loads(p.stdout)
pr = load('probe-extra.json')
fx = {f['id']: f for f in load('fixtures-0247-extra.json')['fixtures']}
rows = {k: {l: {'status': v[l]['normal']['status'], 'unknowns': v[l]['normal']['unknowns'], 'violations': v[l]['normal']['violations']} for l in v}
        for k, v in pr['results'].items() if k.startswith('AnnexB')}
rec = {'task': TASK, 'observedAt': now(), 'id': 'finding-annexb-block-function', 'source': 'review-r1/review.json R1-P3-01 (crítico R1, previsto por leitura); confirmado aqui no engine',
       'scope': 'PRÉ-EXISTENTE (v6 1d40fe51; pela leitura do crítico também v5), FORA do delta da SPEC0247; o delta não muda o resultado (v6 = v7 nos quatro fixtures)',
       'what': 'Em CJS (código sloppy), uma FunctionDeclaration dentro de bloco ou de if reatribui, pelo Annex B.3.3, a ligação de mesmo nome do escopo do wrapper quando a declaração é avaliada. O kernel liga a função interna só no ambiente do bloco e segue resolvendo o nome para a função externa: o valor exportado (ou chamado) é errado, sem raiz em nenhum módulo, e sai PROVEN.',
       'runtimeNode22InMemory': {'exportedCalledWith': './products/x.js', 'results': runtime,
                                 'reading': "block e if(true): a função exportada é a interna (devolveria require('./products/x.js') no fixture real); strict: a externa (devolve 1)"},
       'kernel': rows, 'fixtures': {k: fx[k] for k in rows},
       'falseProven': [k for k, r in rows.items() if r['v7r1b']['status'] == 'PROVEN' and k != 'AnnexB-strict-control'],
       'impact': 'Raiz real 228e7918: B6 segue com 0 provas (os 64 CJS da raiz são .ts/.tsx com sintaxe ESM e já têm raiz); a lacuna só dá prova falsa numa raiz limpa com o padrão.',
       'stopRule': 'não é parada da SPEC0247 §5 (fixture fora do catálogo, pré-existente, fora do delta; nenhuma tupla nem PROVEN muda entre v6 e v7)',
       'proposal': 'achado de recon para o lead antes da SPEC0246: recusar FunctionDeclaration fora do topo de função ou de arquivo em código não strict, ou aplicar a semântica B.3.3 (decisão T3 do usuário)'}
save('finding-annexb-block-function.json', rec)
print(json.dumps({k: rec[k] for k in ('runtimeNode22InMemory', 'falseProven')}, ensure_ascii=False))
assert p.returncode == 0
