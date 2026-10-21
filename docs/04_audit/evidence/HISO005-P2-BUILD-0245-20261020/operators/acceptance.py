"""Aceites MT01–MT08 da SPEC0245 a partir da evidência gravada (nada é rodado aqui). usage: python3 -B acceptance.py"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

c, cs, cons = load('commit-0245.json'), load('certify-summary.json'), load('conservation-r2.json')
b6, cons_s, r2 = load('b6-final-comparison.json'), load('consumer-precert-summary.json'), load('review-r2/review.json')
fz, prom = load('source-freeze-r2.json'), load('promotion-deltas-prepared.json')
fr0, red5, mts = load('first-red-0245-command.json'), load('red-0245-r2-on-v5.json'), load('red-0245-r2-on-mtsall.json')
vt, ft = load('violation-table-derivation.json'), load('fixture-table.json')
focal, native = load('frozen-r2-focal-b6.vitest.json'), load('frozen-r2-native-profile.vitest.json')
green = load('green-0245-a2.vitest.json')
ok = lambda b: 'PASS' if b else 'FAIL'
title_failed = lambda rep, key: [r for r in rep['results'] if key in r['title'] and r['status'] == 'failed']
mt04 = [r for r in mts['results'] if 'MT04' in r['title']]
inv = b6['mt06Invariants']
acc = [
 {'id': 'MT01', 'status': ok(red5['summary']['numFailedTests'] > 0 and len(title_failed(red5, 'valid .tsx has no UNKNOWN_PARSE')) == 1),
  'evidence': ['first-red-0245-command.json', 'first-red-0245.vitest.json', 'red-0245-r2-on-v5.json', 'fixture-table.json'],
  'summary': 'na v5, .tsx válido dá UNKNOWN_PARSE e tuplas de AST recuperada (UNKNOWN_BINDING de atributo etc.); bytes finais do teste falham 13/18 na v5 (primeira falha a1: 8/11)'},
 {'id': 'MT02', 'status': ok(green['numFailedTests'] == 0 and green['numTotalTests'] == 18),
  'evidence': ['green-0245-a2.vitest.json', 'fixture-table.json'],
  'summary': 'v6: .tsx válido sem UNKNOWN_PARSE; JSX avaliado vira UNKNOWN_UNSUPPORTED_SYNTAX com o SyntaxKind; UNKNOWN_FORMAT mantido; F1/F10b UNKNOWN sem violação, com recusa JsxElement, body COMPLETED e tuplas dos importados; erro real e <T>x (F7) dão UNKNOWN_PARSE; F13 (texto, string de atributo, comentário) sem violação na passagem e no census'},
 {'id': 'MT03', 'status': ok(all(ft['results'][n]['v6:' + m]['status'] == 'VIOLATION' for n in ('MT03-attribute', 'MT03-child', 'F9-target-only-via-tsx-ast') for m in ('normal', 'census'))),
  'evidence': ['green-0245-a2.vitest.json', 'fixture-table.json', 'violation-table-derivation.json'],
  'summary': 'import() finito para products/ em atributo e em filho JSX dá VIOLATION, também no census à parte; F9 dá VIOLATION; require em JSX num .tsx CJS dá VIOLATION'},
 {'id': 'MT04', 'status': ok(vt['derived']['mt04TuplesEqualV5'] and len(mt04) == 2 and sum(r['status'] == 'failed' for r in mt04) == 1 and not title_failed(red5, 'MT04')),
  'evidence': ['fixture-table.json', 'violation-table-derivation.json', 'red-0245-r2-on-mtsall.json', 'red-0245-r2-on-v5.json'],
  'summary': '.ts/.mts/.cts com <T>x e arrow genérica: tuplas iguais às da v5 (execução v5 registrada); o mutante que manda .ts para TSX morre no MT04; a v5 passa no MT04'},
 {'id': 'MT05', 'status': ok(cons['status'] == 'PASS' and cons['v6NormalEqualsStrict'] and vt['status'] == 'PASS'),
  'evidence': ['conservation-r2.json', 'conservation-r2-tuples-normal.json.gz', 'conservation-r2-tuples-strict.json.gz', 'fixture-table.json', 'violation-table-derivation.json', 'b6-final-comparison.json'],
  'summary': '§3.3 tupla a tupla em normal e strict: somem 561 (BINDING 427, UNSUPPORTED 30, PARSE 29, …), aparece 1 (JsxElement em apps/web/src/main.tsx); zero mudança fora dos .tsx; FORMAT/MODULE_FORMAT preservados; PARSE 0; grafo 1.341/2.729 com conjunto igual; 78 a jusante de 2 diretas; violações 0/0 (census na união); nos fixtures, perdas só da classe JsxText; normal = strict; validation true; 0 provas'},
 {'id': 'MT06', 'status': ok(all(v for m in ('normal', 'strict') for k, v in inv[m].items() if isinstance(v, bool)) and inv['normal']['kernelVersion'][1] == 'semantic-kernel-v6-tsx-parse'),
  'evidence': ['b6-final-comparison.json#mt06Invariants', 'source-freeze-r2.json'],
  'summary': 'limites, inputs, instalados, perfil node22-linux-exact-metadata-v1, runtimeResolution e receita compilada (shared-contracts-fresh-force-v2, 121 arquivos) iguais entre v5 e v6; só o engine muda entre os scripts; versão semantic-kernel-v6-tsx-parse'},
 {'id': 'MT07', 'status': ok(focal['numFailedTests'] == 0 and native['numFailedTests'] == 0 and cs['allPass'] and cons_s['status'] == 'FRESH_COMPILED_CONSUMER_PASS' and r2['verdict'] == 'APPROVE' and not r2['required']),
  'evidence': ['frozen-r2-focal-b6.vitest.json', 'frozen-r2-native-profile.vitest.json', 'certify-summary.json', 'consumer-precert-summary.json', 'review-r1/review.json', 'review-r2/review.json', 'certify-r1-summary.json', 'certify-r1-unit-flake-analysis.json', 'certify-r2-summary.json'],
  'summary': 'focal B6 %d/%d e nativo %d/%d nos bytes congelados r2; certify %d gates %s (unit %s, %s/%s); consumidor fresco PASS (%d exports, %d de runtime); crítica R1 REVISE (3 P2 corrigidos), R2 APPROVE sem obrigatórios; certify r1 NO_GO só no unit (3 timeouts de 15 s num teste claude100 sem relação com o delta, sob load ~12–15; isolado 66/66; coverage do mesmo run PASS), r2 16/16' % (
      focal['numPassedTests'], focal['numTotalTests'], native['numPassedTests'], native['numTotalTests'], cs['gates'], 'PASS' if cs['allPass'] else 'FAIL', cs['unit'], cs['decision'], cs['certification'], cons_s['exportRows'], cons_s['runtimeExports'])},
 {'id': 'MT08', 'status': ok(c['allEqualFreeze'] and len(prom['commits']) == 1 and sorted(prom['commits'][0]['paths']) == sorted(f['path'] for f in fz['files'])),
  'evidence': ['commit-0245.json', 'promotion-deltas-prepared.json', 'promotion-%s.json' % c['commit'][:12]],
  'summary': 'commit só com os 7 caminhos do freeze r2, sobre 6c9fc651; promoção preparada e não aplicada; sem push, PR, deploy ou produção'}]
out = {'task': TASK, 'observedAt': now(), 'commit': c['commit'], 'acceptance': acc, 'allPass': all(a['status'] == 'PASS' for a in acc),
       'b6': 'INCOMPLETE (0 provas, 0 violações)'}
save('acceptance-status.json', out)
print([(a['id'], a['status']) for a in acc], out['allPass'])
