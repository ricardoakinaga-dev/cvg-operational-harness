"""AB01 first red: the new test run on the base v7 (engine 7f25da7d) in two rounds (r1: worktree unchanged, before the
engine change; r1b: the test after the code review r1, with the v7 bytes swapped in by red_on_base.py) and the base
status of the AB01 positives measured by catalog.py. Writes first-red.json. usage: first_red.py"""
import gzip, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rounds = {}
for rnd, label in (('r1', 'first-red-0252'), ('r1b', 'first-red-0252-r1b')):
    c = load(label + '-command.json')
    assert c['sourceSha256'][ENGINE] == V7_ENGINE_SHA
    rounds[rnd] = {'command': label + '-command.json', 'report': label + '.vitest.json.gz', 'test': {'path': TEST, 'sha256': c['sourceSha256'][TEST]},
                   'summary': {k: c['summary'][k] for k in ('numTotalTests', 'numPassedTests', 'numFailedTests', 'success')}}
cmd = load('first-red-0252-r1b-command.json')
rep = json.loads(gzip.decompress((EV / 'first-red-0252-r1b.vitest.json.gz').read_bytes()))
passed, failed = [], []
for tf in rep['testResults']:
    for a in tf['assertionResults']:
        (passed if a['status'] == 'passed' else failed).append(a['fullName'])
cat = load('fixture-catalog-r1b.json')
by = {fx['id']: fx for fx in cat['fixtures']}
AB01 = ['P01-block', 'P02-if-true', 'P03-if-true-no-braces', 'P04-if-undecided', 'P05-top-call', 'P12-nested-in-function',
        'P13-nested-wrapper-function', 'P14-nested-wrapper-const', 'P16b-special-undefined-indirect', 'P17-late-use-strict',
        'P20-escaped-use-strict', 'P21-nested-iffalse-shadows-const', 'P22-nested-read-before-block',
        'P23-nested-iffalse-undefined-primitive', 'P24-object-method-sloppy', 'P25-nested-outer-param', 'P26-else-no-braces',
        'P27-parenthesized-directive', 'C01-own-strict-body', 'C02-sibling-strict-function', 'C03-sloppy-arrow', 'C11-cts-sloppy',
        'C12-block-leading-use-strict', 'C13-expression-before-directive', 'C14-template-use-strict', 'C15-late-use-strict-in-function']
DFP = ['D01-empty-before-directive-file', 'D02-empty-before-directive-fn', 'D03a-string-plus', 'D03e-string-eq', 'D03f-string-cond',
       'D04-ts-sloppy', 'D05-escape-in-fn', 'D06-parens-in-fn', 'D07-class-sibling-uncalled', 'D08-expr-before-directive-fn', 'D09-template-in-fn']
ab01 = {i: {'node22ProductLoaded': by[i]['node22']['productLoaded'], 'v7': by[i]['v7']['status']} for i in AB01}
dfp = {i: {'node22ProductLoaded': by[i]['node22']['productLoaded'], 'v7': by[i]['v7']['status']} for i in DFP}
assert all(v == {'node22ProductLoaded': True, 'v7': 'PROVEN'} for v in [*ab01.values(), *dfp.values()])
false_proven = sorted(i for i, fx in by.items() if fx['positive'] and fx['v7']['status'] == 'PROVEN')
XFP = ['X06-computed-key-call', 'X07-computed-key-call-fnexpr', 'X08-plain-arrow-control', 'X10-computed-key-nested-fn',
       'X13-nested-block-functions', 'X14-nested-in-strict-block-function']
assert false_proven == sorted(AB01 + DFP + XFP), false_proven
failed_fixtures = sorted(t.rsplit(') ', 1)[1] for t in failed if t.startswith('SPEC0252 catalog') and ') ' in t)
save('first-red.json', {
    'task': TASK, 'observedAt': now(), 'acceptance': 'AB01',
    'engine': {'path': ENGINE, 'sha256': cmd['sourceSha256'][ENGINE], 'version': OLD_VERSION},
    'rounds': rounds, 'detailOf': 'r1b',
    'ab01PositivesProvenOnV7': {'count': len(ab01), 'fixtures': ab01},
    'dFalseProvenOnV7': {'count': len(dfp), 'fixtures': dfp, 'note': 'notas R3-O1..O3: D01, D02, D03a, D03e, D03f, D04-D09'},
    'xFalseProvenOnV7': {'count': len(XFP), 'fixtures': XFP, 'note': 'revisão de código r1: M1 (X06, X07, X10) e controles (X08, X13, X14)'},
    'falseProvenOnV7AmongAll88': {'count': len(false_proven), 'equalsAb01PlusDPlusX': True},
    'catalogFixturesFailingOnV7': {'count': len(failed_fixtures), 'ids': failed_fixtures},
    'passedOnV7': passed,
    'tableRowsFailingOnV7': sum(t.startswith('SPEC0252 §5.2') for t in failed),
    'otherFailingOnV7': sorted(t for t in failed if not t.startswith('SPEC0252 catalog') and not t.startswith('SPEC0252 §5.2')),
    'reading': 'Na v7 falham os fixtures com tupla esperada, as linhas sloppy da tabela do prólogo, AB01/AB02/AB04, os controles e o census da AB06 e a versão; passam só os casos em que a v7 já tem o comportamento esperado (negativos strict e sem tupla, multiset sem a tupla nova, violações mantidas, limites).'})
print(len(passed), len(failed), len(failed_fixtures))
