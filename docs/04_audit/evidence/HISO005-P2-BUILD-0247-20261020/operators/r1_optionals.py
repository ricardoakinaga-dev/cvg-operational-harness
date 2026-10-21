"""Treatment of the R1 optionals (review-r1/review.json: APPROVE, no required item). None changes code: the frozen r1b
bytes are the ones committed. Writes r1-optionals.json. usage: r1_optionals.py"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rv = load('review-r1/review.json')
assert rv['verdict'] == 'APPROVE' and not rv['required']
m1 = load('red-0247-r1-on-mc1-r1.json'); m1b = load('red-0247-r1b-on-mc1-r1b.json'); m1r = load('red-0247-r1b-on-mc1-r1b-rerun.json')
fails = lambda r: sorted(x['title'] for x in r['results'] if x['status'] != 'passed')
extra = [x for x in m1b['results'] if x['status'] != 'passed' and x['title'] not in fails(m1)]
pe = load('probe-extra.json')['results']
main_has = {r: subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, r], cwd=PROJECT).returncode == 0 for r in ('main', 'origin/main')}
items = [
 {'id': 'R1-P3-01', 'treatment': 'EVIDÊNCIA', 'codeChanged': False, 'record': 'finding-annexb-block-function.json',
  'result': 'confirmado no engine: AnnexB-block-export, AnnexB-if-export e AnnexB-top-call dão PROVEN na v6, na v7r1b e na referência t3 (iguais); em runtime (Node 22, em memória) a função exportada é a interna. Prova falsa pré-existente, fora do delta da SPEC0247; o controle strict dá PROVEN correto. Levado ao lead como achado de recon antes da SPEC0246.'},
 {'id': 'R1-P3-02', 'treatment': 'EVIDÊNCIA', 'codeChanged': False, 'record': 'red-0247-r1b-on-mc1-r1b-rerun.json',
  'result': 'mc1-r1b deu 19 falhas (as 2 a mais com UNKNOWN_INVALID_WORKER_RESULT) quando rodou junto com o focal r1b, com load até ~16; repetido sozinho (load ~9): %d falhas, mesmo conjunto do mc1-r1 (%s). Mutante morto nas duas. O certify roda sozinho.' % (m1r['summary']['numFailedTests'], fails(m1r) == fails(m1)),
  'flakeTests': [{'title': x['title'], 'firstMessage': x['firstMessage'][:200]} for x in extra]},
 {'id': 'R1-P3-03', 'treatment': 'EVIDÊNCIA', 'codeChanged': False, 'record': 'fixture-table.json#touchedCriterion, conservation-r1.json#touchedCriterion',
  'result': 'critério declarado: C2 marca junção que mudou o valor em algum ponto, superconjunto da definição da §3.6; só alarga tocados e afetados (conservador). Regras 1–4 seguem ok nos 76 fixtures; na raiz real nenhum módulo tem junção.'},
 {'id': 'R1-P3-04', 'treatment': 'EVIDÊNCIA (sem mudar o teste depois da APPROVE)', 'codeChanged': False, 'record': 'fixtures-0247-extra.json, probe-extra.json',
  'result': {'a': 'REQUIRE-resolve-called: v7 sem UNKNOWN_CJS_EXPORTS (tuplas iguais à v6: UNKNOWN_PROPERTY e UNKNOWN_CALL, porque a leitura de require.resolve já é recusada); REQUIRE-resolve-not-called: v7 acrescenta LOADER_REFERENCE. A exceção só tira um U; o mutante que a removesse seria só mais conservador. PROVEN não é possível nesse fixture em nenhuma versão.',
             'b': 'ESM-undecided-if: PROVEN e sem tupla na v6, na v7 e na referência; a guarda join só em CJS é equivalente (em ESM o valor CJS fica VOID e a união de VOID com VOID é VOID), como o crítico notou.',
             'c': 'as classes de violação perdida do MC05 são documentais (declaredByHand em test-generation.json); a verdade em runtime de cada classe está no catálogo da SPEC (§1.2) e na R2 dela (T2, T2b).'},
  'probe': {k: {l: v[l]['normal']['unknowns'] for l in v} for k, v in pe.items() if not k.startswith('AnnexB')}},
 {'id': 'R1-P3-05', 'treatment': 'REGRA DE PROMOÇÃO', 'codeChanged': False, 'record': 'promotion-<sha12>.json#applyRule',
  'result': 'hoje nem main (%s) nem origin/main (%s) contêm 1d40fe51 (main local %s; origin/main %s). O patch de promoção é sobre 1d40fe51 e só se aplica depois que o BUILD0245 entrar, conferindo as pré-imagens; se a 0245 não entrar antes, vale a alternativa da §3.7 (semantic-kernel-v6-cjs-export-value, com a 0245 migrada para semantic-kernel-v7-tsx-parse), e a promoção volta ao lead.' % (
      main_has['main'], main_has['origin/main'], git('rev-parse', 'main', cwd=PROJECT)[:12], git('rev-parse', 'origin/main', cwd=PROJECT)[:12])}]
out = {'task': TASK, 'observedAt': now(), 'review': 'review-r1/review.json', 'verdict': rv['verdict'], 'required': 0,
       'decision': 'sem segunda rodada: a R1 aprovou sem obrigatórios e nenhum P3 pede código no engine; o P3-04 (único com needsCode) foi tratado só na evidência para não mudar bytes depois da aprovação. Os bytes congelados r1b são os do commit.',
       'items': items}
save('r1-optionals.json', out)
print(json.dumps([(i['id'], i['treatment']) for i in items], ensure_ascii=False), items[1]['result'])
