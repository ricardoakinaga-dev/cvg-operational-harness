"""SPEC0247 acceptances MC01–MC09 from the recorded evidence (nothing is run here). usage: acceptance.py <final-round>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd = sys.argv[1]
c, cs, cons = load('commit-0247.json'), load('certify-summary.json'), load('conservation-r1.json')
b6, ft, fz = load('b6-final-comparison.json'), load('fixture-table.json'), load('source-freeze-' + rnd + '.json')
mut, red = load('mutants-' + rnd + '.json'), load('first-red-0247-command.json')
lit = load('first-red-0247-version-literal-command.json')
focal, native = load('frozen-' + rnd + '-focal-b6-command.json'), load('frozen-r1-native-profile-command.json')
cons_s, prom, gates = load('consumer-precert-summary.json'), load('promotion-deltas-prepared.json'), load('gates-' + rnd + '.json')
reviews = sorted(p.name for p in EV.glob('review-r*/review.json'))
last = json.loads((EV / ('review-r%d' % len(list(EV.glob('review-r*/review.json')))) / 'review.json').read_text())
ok = lambda b: 'PASS' if b else 'FAIL'
rows = {r['id']: r for r in ft['rows']}
A = [r for r in ft['rows'] if r['group'] == 'A']
F3 = ['F3', 'F3-arrow', 'F3-declaration', 'F3-returned', 'X10-escaped-identifier', 'X11-ts-cjs-function-write']
inv = b6['mc07Invariants']
acc = [
 {'id': 'MC01', 'status': ok(len(A) == 18 and all(r['base'] == 'PROVEN' for r in A) and red['summary']['numFailedTests'] > 0 and mut['baseFails']),
  'evidence': ['first-red-0247-command.json', 'first-red-0247.vitest.json', 'mutants-%s.json (linha v6)' % rnd, 'fixture-table.json'],
  'summary': 'na base v6 os 18 fixtures do grupo A dão PROVEN; o teste novo falha %d/%d na v6 (primeira falha) e de novo nos bytes %s' % (red['summary']['numFailedTests'], red['summary']['numTotalTests'], rnd)},
 {'id': 'MC02', 'status': ok(all(r['vN'] == 'UNKNOWN' for r in A) and all(any(x[1] == 'FUNCTION_BODY_WRITE' for x in rows[i]['c0Categories']) for i in F3)
                            and all(r['newOutsideClosedList'] for r in A if r['id'] not in F3)),
  'evidence': ['fixture-table.json', 'frozen-%s-focal-b6-command.json' % rnd],
  'summary': 'grupo A UNKNOWN na vN: família F3 com UNKNOWN_CJS_EXPORTS FUNCTION_BODY_WRITE no módulo escrito; famílias S10 e INIT com as tuplas do código alcançado (UNKNOWN_DYNAMIC_IMPORT_PROMISE e UNKNOWN_RESOLUTION no arquivo da origem)'},
 {'id': 'MC03', 'status': ok(all(not r['tuplesGone'] for r in ft['rows'] if r['group'] == 'B') and rows['H-top-return']['reachedCause'] == 'C0'
                            and not rows['ESM-unaffected']['tuplesNew'] and ['m.js', 'TOP_LEVEL_ARGUMENTS'] in rows['X04-computed-arguments']['c0Categories']
                            and ['m.js', 'TOP_LEVEL_THIS'] in rows['X05-computed-this']['c0Categories']),
  'evidence': ['fixture-table.json', 'frozen-%s-focal-b6-command.json' % rnd],
  'summary': 'grupo B mantém as tuplas da base e ganha UNKNOWN_CJS_EXPORTS com a categoria certa (as 9 categorias aparecem no catálogo; X04/X05 por nome computado); H-top-return: no importador, as tuplas da regra 2 pelo U da C0; ESM-unaffected sem mudança'},
 {'id': 'MC04', 'status': ok(ft['byGroup']['C']['transitions'] == {'PROVEN->PROVEN': 11} and ft['byGroup']['D']['transitions'] == {'PROVEN->UNKNOWN': 9} and not ft['newProven']),
  'evidence': ['fixture-table.json'], 'summary': 'grupo C 11/11 PROVEN; grupo D 9/9 UNKNOWN; nenhum PROVEN novo nos 76 fixtures (Q3, da R2, também perde PROVEN, como custo da C1)'},
 {'id': 'MC05', 'status': ok(rows['V-literal']['vN'] == 'VIOLATION' and sum(1 for i in ft['violationsLost'] if rows[i]['group'] == 'V') == 5 and ft['allRulesOk']),
  'evidence': ['fixture-table.json', 'frozen-%s-focal-b6-command.json' % rnd],
  'summary': 'V-literal mantém a violação; X03, V-S10-last-branch e V-F3-late-require somem como falsas em runtime; X01 e X02 somem como verdadeiras carregadas pelo U da C0; cada uma leva só a sua tupla de aresta UNKNOWN_PRODUCT_TARGET; fora do catálogo, T2 (C1) e T2b (C2) perdem violação verdadeira e T3 ganha uma nova pela junção (C2)'},
 {'id': 'MC06', 'status': ok(cons['status'] == 'PASS' and cons['vNNormalEqualsStrict'] and load('epoch-r1.json')['sameEpoch']),
  'evidence': ['conservation-r1.json', 'epoch-r1.json', 'guarded-runs.json', 'b6-final-comparison.json', 'eval-root-check-*.json'],
  'summary': 'raiz 228e7918: 11.723 diagnósticos e 10.833 tuplas iguais na base e na vN, payload igual fora a telemetria e semanticBoundary.kernelVersion (única ocorrência do literal), normal = strict, validation true, 0 provas, 0 violações, mesma época; denominadores publicados (1.277 import, 64 require; 64 tocados só por C1; 219 afetados; 0 com escrita, categoria ou junção)'},
 {'id': 'MC07', 'status': ok(all(v for m in ('normal', 'strict') for k, v in inv[m].items() if isinstance(v, bool)) and inv['normal']['kernelVersion'] == [OLD_VERSION, NEW_VERSION]),
  'evidence': ['b6-final-comparison.json#mc07Invariants', 'frozen-%s-focal-b6-command.json' % rnd],
  'summary': 'limites, inputs, instalados, perfil node22-linux-exact-metadata-v1, runtimeResolution e receita compilada (shared-contracts-fresh-force-v2, 121 arquivos) iguais; versão ' + NEW_VERSION},
 {'id': 'MC08', 'status': ok(focal['summary']['numFailedTests'] == 0 and native['summary']['numFailedTests'] == 0 and cs['allPass'] and cons_s['status'] == 'FRESH_COMPILED_CONSUMER_PASS'
                            and last['verdict'] == 'APPROVE' and not last.get('required') and gates['allPass'] and mut['allMutantsKilled']),
  'evidence': ['frozen-%s-focal-b6-command.json' % rnd, 'frozen-r1-native-profile-command.json', 'certify-summary.json', 'certify-r1-analysis.json', 'certify-r2-analysis.json', 'consumer-precert-summary.json', *reviews, 'gates-%s.json' % rnd, 'mutants-%s.json' % rnd],
  'note': 'certify local NO_GO nas duas tentativas (r1 14/16: coverage por timeouts alheios e security; r2 13/16: unit e coverage por tempo sob carga e security). Nenhum FAIL é do delta: security é o lock da base 1d40fe51 (vite 8.2.2; corrigido na main pelo PR #11 05d4a30a) e unit/coverage são tempo. Requalificação com o lead: portar 783ef6d0 para a main atual e rodar o certify lá.',
  'summary': 'focal B6 %d/%d (0228–0247) e nativo %d/%d; certify %d gates %s (unit %s, %s); consumidor fresco PASS (%d exports, %d de runtime); gates estáticos PASS; mutantes C0/C0r/C1/C1s/C2/C3 mortos; última crítica %s sem obrigatórios' % (
      focal['summary']['numPassedTests'], focal['summary']['numTotalTests'], native['summary']['numPassedTests'], native['summary']['numTotalTests'], cs['gates'],
      'PASS' if cs['allPass'] else 'FAIL', cs['unit'], cs['decision'], cons_s['exportRows'], cons_s['runtimeExports'], last['verdict'])},
 {'id': 'MC09', 'status': ok(c['allEqualFreeze'] and len(prom['commits']) == 1 and sorted(prom['commits'][0]['paths']) == sorted(f['path'] for f in fz['files'])),
  'evidence': ['commit-0247.json', 'promotion-deltas-prepared.json', 'promotion-%s.json' % c['commit'][:12]],
  'summary': 'commit só com os %d caminhos do freeze %s, sobre 1d40fe51; promoção preparada e não aplicada; sem push, PR, deploy ou produção' % (len(fz['files']), rnd)}]
out = {'task': TASK, 'observedAt': now(), 'commit': c['commit'], 'acceptance': acc, 'allPass': all(a['status'] == 'PASS' for a in acc), 'b6': 'INCOMPLETE (0 provas, 0 violações)'}
save('acceptance-status.json', out)
print([(a['id'], a['status']) for a in acc], out['allPass'])
