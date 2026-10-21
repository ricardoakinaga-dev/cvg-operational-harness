"""Finding outside SPEC0245/0246: the CommonJS export value is the LAST write of module.exports, not the union of the
reachable writes. F3 (critic R1-01 of SPEC0245): reassigned inside a function body, escapes checkExport (K0). S10
(critic R2-03 of SPEC0246): two top-level branches of an `if` with a non-primitive condition, the export seen is the
else branch. In both, a function that does import(x) is never evaluated and the run is PROVEN (K5, and K7 for the
import(x) origin). Reproduced with the v4 (1073a9dd) and v5 (16dd0ce6) engines. usage: k0_gap_probe.py"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

CASES = {'F3-function-body': {'package.json': '{}', 'entry.js': "const m = require('./m.js');\nmodule.exports = 1;\n",
                              'm.js': 'module.exports = function f() { module.exports = function g(x) { return import(x) } }\n'},
         'S10-top-level-branches': {'package.json': '{}', 'entry.js': "const m = require('./m.js')\nmodule.exports = 1",
                                    'm.js': 'if ({}) module.exports = function g(x) { return import(x) }\nelse module.exports = 1'}}
code = ('const fs=require("node:fs"); const e=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8"));'
        'process.stdout.write(JSON.stringify(e.runSemanticBoundary(...r.args)));')
tmpbase = RUNTIME / 'probe' / 'tmp'; tmpbase.mkdir(parents=True, exist_ok=True)
res = {}
for case, FILES in CASES.items():
  for label in ('v4', 'v5'):
    eng = RUNTIME / ('tools-' + label) / 'scripts/boundary-semantic-engine.mjs'
    root = Path(os.path.realpath(tempfile.mkdtemp(dir=tmpbase)))
    for f, b in FILES.items(): (root / f).write_text(b)
    src = FILES['m.js']; text = 'import(x)'; start = src.index(text)
    origin = {'file': 'm.js', 'fileSha256': hashlib.sha256(src.encode()).hexdigest(), 'kind': 'CallExpression', 'start': start, 'end': start + len(text),
              'reason': 'NON_LITERAL_MODULE_REFERENCE', 'ordinal': 0, 'expression': text}
    ido = subprocess.run([NODE, '-e', 'const e=require(process.argv[1]); process.stdout.write(e.semanticOriginId(JSON.parse(process.argv[2])))', str(eng), json.dumps(origin)],
                         capture_output=True, text=True, env={'PATH': NODEBIN + ':/usr/bin:/bin'}).stdout
    origin['id'] = ido
    inp = {'root': str(root), 'starts': ['entry.js'], 'origins': [origin], 'installed': [], 'compiled': {'status': 'UNAVAILABLE', 'files': []}}
    p = subprocess.run([NODE, '-e', code, str(eng)], input=json.dumps({'args': [inp]}), capture_output=True, text=True, env={'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'TZ': 'UTC'})
    shutil.rmtree(root)
    o = json.loads(p.stdout) if p.returncode == 0 else {'error': p.stderr[-800:]}
    res.setdefault(case, {})[label] = {'engineSha256': sha(eng), 'status': o.get('status'), 'unknowns': o.get('unknowns'), 'proofs': [[x['rule'], x['file'], x.get('kind')] for x in o.get('proofs', [])],
                  'validation': o.get('validation'), 'error': o.get('error')}
save('finding-k0-cjs-exports-gap.json', {'task': TASK, 'observedAt': now(), 'severity': 'soundness gap in the current kernel (outside SPEC0245/0246)',
     'source': 'review-0245-r1/review.json (R1-01, F3) e review-0246-r2/review.json (R2-03, S10), reproduzidos aqui', 'fixtures': CASES, 'results': res,
     'reading': 'o valor CJS é a última escrita de module.exports, não a união das escritas alcançáveis: reatribuída dentro de função (F3) ou em ramos de if de condição não primitiva no topo (S10); g nunca é avaliado e a execução sai PROVEN, com K7 para a origem import(x)',
     'scope': 'toda escrita de module.exports que não seja uma única atribuição incondicional no topo (ramos com condição não primitiva, corpos de função, repetição); correção esperada: união das escritas alcançáveis verificada por checkExport, ou UNKNOWN_MUTATION; F3 e S10 como aceites',
     'notInDelta': 'nenhuma das SPEC0244/0245/0246 introduz a lacuna; ela precede a v5', 'recommendation': 'tarefa própria (T3) antes de qualquer BUILD da SPEC0246; até lá, nenhuma prova emitida pela v5 em raiz com esse padrão é confiável'})
print(json.dumps(res, indent=1)[:2000])
