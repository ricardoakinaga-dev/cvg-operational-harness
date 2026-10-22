"""AB08 mutants of the SPEC0252 rule, one at a time, in the BUILD's own file (scripts/boundary-semantic-engine.mjs of
the worktree): check the committed bytes, apply the exact replacements, run the new suite, restore the bytes
immediately and check them again. Each mutant names the fixture/test that must kill it (SPEC §6 AB08 and build notes
R3-O1..O3; the last three are extra mutants of this BUILD). Writes mutants.json. usage: mutants.py [<id> ...]"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

COMMITTED = 'a1ef8120e316a68ebbbe057b1f814e84aff16455705e89012c92062f7103b6cb'  # 9a571d36 (r1b)
LOOP = 'for (let c = n, a = n.parent; a && !strict; c = a, a = a.parent)'
FILE_STRICT = 'const fileStrict = strictPrologue(sf.statements, sf)'
CLASS = '''          strict =
            ts.isClassLike(a) ||'''
FN_PROLOGUE = '''              ts.isBlock(c) &&
              strictPrologue(c.statements, sf))'''
BODY_CHECK = '''              a.body === c &&
              ts.isBlock(c) &&
              strictPrologue(c.statements, sf))'''
PUSH = '''              (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
          )
      }
      ts.forEachChild(n, visit)'''
HEAD = '''      if (!ts.isExpressionStatement(n) || !ts.isStringLiteral(n.expression))
        return false
      if (n.expression.getText(sf).slice(1, -1) === 'use strict') return true'''
EMIT = '''    if (mode === 'require')
      for (const detail of annexBBlockFunctions(sf))
        unknown(file, 'UNKNOWN_ANNEXB_FUNCTION', detail)'''
PARENT = '''        n.body &&
        !ts.isSourceFile(n.parent) &&
        !ts.isModuleBlock(n.parent) &&
        !functionBody(n.parent)'''
PREDECLARE = '''      if (ts.isFunctionDeclaration(n) && n.name)
        e.bindings.set(n.name.text, functionValue(n, e, file))'''
C = 'SPEC0252 catalog — vN against the base, fixture by fixture (AB02, AB05) '
T = 'SPEC0252 §5.2 — directive prologue table, file and function-body levels '
MUTANTS = [
    ('mut-own', 'busca de strict a partir da própria declaração', [C + 'C01-own-strict-body'],
     [(LOOP, 'for (let c = n.body, a = n; a && !strict; c = a, a = a.parent)')]),
    ('mut-any', "'use strict' em qualquer função do arquivo torna o arquivo strict", [C + 'C02-sibling-strict-function'],
     [(FILE_STRICT, FILE_STRICT + ' || !!(function any(x) { return (ts.isFunctionLike(x) && !!x.body && ts.isBlock(x.body) && strictPrologue(x.body.statements, sf)) || !!ts.forEachChild(x, any) })(sf)')]),
    ('mut-arrow', 'arrow tratada como strict', [C + 'C03-sloppy-arrow'],
     [(CLASS, CLASS + ' ts.isArrowFunction(a) ||')]),
    ('mut-ts', 'arquivo .ts/.cts/.mts tratado como strict', [C + 'C11-cts-sloppy', C + 'D04-ts-sloppy'],
     [(FILE_STRICT, FILE_STRICT + ' || /\\.[cm]?ts$/.test(sf.fileName)')]),
    ('mut-tsonly', 'só .ts tratado como strict (R3-O1)', [C + 'D04-ts-sloppy'],
     [(FILE_STRICT, FILE_STRICT + ' || /\\.ts$/.test(sf.fileName)')]),
    ('mut-single-quote', 'só aceita aspas simples', [C + 'C07-double-quoted-strict'],
     [("if (n.expression.getText(sf).slice(1, -1) === 'use strict') return true", "if (n.expression.getText(sf) === \"'use strict'\") return true")]),
    ('mut-all', 'marca toda FunctionDeclaration, inclusive no topo', [C + 'C08-sloppy-no-block-function'],
     [(PARENT, '        n.body')]),
    ('mut-removed', 'regra removida', ['SPEC0252 AB01/AB02 — no false PROVEN the base proved the 26 fixtures of AB01 and the 11 D false PROVEN; vN proves none and roots each in the declaration file'],
     [(EMIT, EMIT.replace("if (mode === 'require')", "if (mode === 'require' && false)"))]),
    ('mut-normal-only', 'regra só na passagem normal', ['SPEC0252 AB06 — controls of the predicate itself the refusal census emits the same tuples'],
     [(EMIT, EMIT.replace("if (mode === 'require')", "if (mode === 'require' && !census)"))]),
    ('mut-block', 'prólogo em bloco que não é corpo de função', [C + 'C12-block-leading-use-strict'],
     [(CLASS, CLASS + ' (ts.isBlock(a) && strictPrologue(a.statements, sf)) ||')]),
    ('mut-expr', 'prólogo que não termina numa expressão que não é string', [C + 'C13-expression-before-directive'],
     [(HEAD, '''      if (!ts.isExpressionStatement(n)) return false
      if (!ts.isStringLiteral(n.expression)) continue
      if (n.expression.getText(sf).slice(1, -1) === 'use strict') return true''')]),
    ('mut-tpl', 'template aceito como diretiva', [C + 'C14-template-use-strict'],
     [(HEAD, HEAD.replace('!ts.isStringLiteral(n.expression)', '!ts.isStringLiteralLike(n.expression)'))]),
    ('mut-fnlate', "'use strict' tardio em corpo de função aceito", [C + 'C15-late-use-strict-in-function'],
     [(FN_PROLOGUE, '''              ts.isBlock(c) &&
              c.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.getText(sf).slice(1, -1) === 'use strict'))''')]),
    ('mut-evaluated', 'tupla só com bloco avaliado', [C + 'P21-nested-iffalse-shadows-const', C + 'P22-nested-read-before-block'],
     [(EMIT, EMIT.replace("if (mode === 'require')", "if (mode === 'require' && false)")),
      (PREDECLARE, '''      if (ts.isFunctionDeclaration(n) && n.name) {
        e.bindings.set(n.name.text, functionValue(n, e, file))
        const sfm = astFiles.get(file)
        const dm = n.name.text + '@' + (sfm.getLineAndCharacterOfPosition(n.getStart(sfm)).line + 1)
        if (modules.get(file)?.mode === 'require' && annexBBlockFunctions(sfm).includes(dm)) unknown(file, 'UNKNOWN_ANNEXB_FUNCTION', dm)
      }''')]),
    ('mut-cooked', 'texto cozido em vez do cru', [C + 'P20-escaped-use-strict'],
     [("if (n.expression.getText(sf).slice(1, -1) === 'use strict') return true", "if (n.expression.text === 'use strict') return true")]),
    ('mut-parens', 'parênteses aceitos', [C + 'P27-parenthesized-directive'],
     [(HEAD, '''      if (!ts.isExpressionStatement(n) || !ts.isStringLiteral(ts.skipParentheses(n.expression)))
        return false
      if (ts.skipParentheses(n.expression).getText(sf).slice(1, -1) === 'use strict') return true''')]),
    ('mut-outside-prologue', 'diretiva fora do prólogo do arquivo', [C + 'P17-late-use-strict'],
     [(FILE_STRICT, 'const fileStrict = sf.statements.some((s) => strictPrologue([s], sf))')]),
    ('mut-object-method-class', 'método de objeto tratado como classe', [C + 'P24-object-method-sloppy'],
     [(CLASS, CLASS + ' ts.isObjectLiteralExpression(a) ||')]),
    ('mut-import', 'regra em módulo import', [C + 'N03-esm'],
     [(EMIT, EMIT.replace("if (mode === 'require')", "if (true)"))]),
    ('mut-empty', "';' vazio não encerra o prólogo (R3-O2)", [C + 'D01-empty-before-directive-file', C + 'D02-empty-before-directive-fn'],
     [(HEAD, '      if (ts.isEmptyStatement(n)) continue\n' + HEAD)]),
    ('mut-fnsep', 'helper separado no corpo de função, texto cozido e skipParentheses (R3-O2)',
     [C + 'D05-escape-in-fn', C + 'D06-parens-in-fn', C + 'D09-template-in-fn'],
     [(FN_PROLOGUE, '''              ts.isBlock(c) &&
              (() => { for (const s of c.statements) { if (!ts.isExpressionStatement(s)) return false; const x = ts.skipParentheses(s.expression); if (!ts.isStringLiteralLike(x)) return false; if (x.text === 'use strict') return true } return false })())''')]),
    ('mut-textprefix', 'prólogo lido pelo texto da instrução (R3-O3)', [C + 'D03a-string-plus', C + 'D03e-string-eq', C + 'D03f-string-cond'],
     [(HEAD, '''      const tx = n.getText(sf)
      if (!/^['"]/.test(tx)) return false
      if (/^['"]use strict['"]/.test(tx)) return true''')]),
    # Code review r1: M1 (computed name counted as function code) and M2 (raw text not exact).
    ('mut-computed-name', 'nome computado de método conta como código da função (revisão r1, M1)',
     [C + 'X06-computed-key-call', C + 'X07-computed-key-call-fnexpr', C + 'X10-computed-key-nested-fn'],
     [(BODY_CHECK, '''              !!a.body &&
              ts.isBlock(a.body) &&
              strictPrologue(a.body.statements, sf))''')]),
    ('mut-trim', "texto cru comparado com trim (revisão r1, M2)", [T + 'file: trailing space', T + 'function: leading space'],
     [("if (n.expression.getText(sf).slice(1, -1) === 'use strict') return true", "if (n.expression.getText(sf).slice(1, -1).trim() === 'use strict') return true")]),
    ('mut-includes', "texto cru que só contém 'use strict' (revisão r1, M2)", [T + 'file: trailing space', T + 'file: prefix', T + 'function: semicolon inside the quotes'],
     [("if (n.expression.getText(sf).slice(1, -1) === 'use strict') return true", "if (n.expression.getText(sf).includes('use strict')) return true")]),
    # Extra mutants of this BUILD (not in the AB08 list).
    ('extra-no-recurse', 'não desce na declaração já pega (revisão r1, O2)', [C + 'X13-nested-block-functions'],
     [(PUSH, '''              (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
          )
        return
      }
      ts.forEachChild(n, visit)''')]),
    ('extra-cjs-unknown', 'a regra liga module.cjsUnknown (U aos importadores; §5.1 proíbe)',
     ['SPEC0252 AB05 — only the new tuple is added without the new tuple, every fixture keeps the base tuples and violations (multiset)'],
     [(EMIT, EMIT.replace("unknown(file, 'UNKNOWN_ANNEXB_FUNCTION', detail)", "{ module.cjsUnknown = true; unknown(file, 'UNKNOWN_ANNEXB_FUNCTION', detail) }"))]),
    ('extra-pos-line', 'linha por pos em vez de getStart (§5.1)', [C + 'P06-switch-case'],
     [('(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)', '(sf.getLineAndCharacterOfPosition(n.pos).line + 1)')]),
    ('extra-no-generator', 'gerador e async excluídos (§5.2 os inclui)', [C + 'C04-generator-in-block', C + 'C05-async-in-block'],
     [(PARENT, PARENT + ' &&\n        !n.asteriskToken &&\n        !n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)')]),
]
only = set(sys.argv[1:])
engine = CANDIDATE / ENGINE
path = EV / 'mutants.json'
rec = json.loads(path.read_text()) if path.exists() else {'task': TASK, 'observedAt': now(), 'engineCommitted': COMMITTED, 'test': TEST,
                                                           'rule': __doc__.split('usage:')[0].strip(), 'mutants': []}
for mid, what, killers, reps in MUTANTS:
    if only and mid not in only:
        continue
    original = engine.read_bytes()
    assert shab(original) == COMMITTED, 'engine is not the committed bytes'
    text = original.decode()
    for old, new in reps:
        assert text.count(old) == 1, (mid, old[:80])
        text = text.replace(old, new)
    engine.write_text(text)
    mutant_sha = sha(engine)
    try:
        p = subprocess.run(['/usr/bin/python3', '-I', '-B', str(OPS / 'run_vitest.py'), mid, '--no-save', TEST], cwd=str(OPS),
                           capture_output=True, text=True, timeout=14400)
    finally:
        engine.write_bytes(original)
    assert sha(engine) == COMMITTED
    line = next((l for l in p.stdout.splitlines() if l.startswith('@@SUMMARY@@')), None)
    summ = json.loads(line[11:]) if line else None
    failing = [x['title'] for x in (summ or {}).get('nonPassing', [])]
    killed_by_named = {k: k in failing for k in killers}
    row = {'id': mid, 'what': what, 'mutantSha256': mutant_sha, 'replacements': [{'old': o, 'new': n} for o, n in reps],
           'namedKillers': killers, 'killedByNamed': killed_by_named, 'failingTests': len(failing),
           'totalTests': (summ or {}).get('numTotalTests'), 'failingSample': failing[:12],
           'killed': bool(summ) and len(failing) > 0, 'allNamedKill': all(killed_by_named.values()), 'restoredSha256': sha(engine),
           'at': now()}
    rec['mutants'] = [m for m in rec['mutants'] if m['id'] != mid] + [row]
    rec['observedAt'] = now()
    rec['summary'] = {'total': len(rec['mutants']), 'killed': sum(m['killed'] for m in rec['mutants']),
                      'allNamedKill': sum(m['allNamedKill'] for m in rec['mutants'])}
    save('mutants.json', rec)
    print(mid, 'killed' if row['killed'] else 'SURVIVED', row['failingTests'], 'named', killed_by_named, flush=True)
