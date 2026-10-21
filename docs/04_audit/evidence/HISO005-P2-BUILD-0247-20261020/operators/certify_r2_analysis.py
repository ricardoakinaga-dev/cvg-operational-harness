"""Analysis of the certify r2 NO_GO (13/16; unit, coverage and security FAIL), from the recorded logs and reports only
(lead instruction: no further certify or large suite). The gate logs under certification/logs/ of the candidate were
read before certify_post.py restored certification/ (tracked files) to HEAD; the excerpts below are those reads. The
unit report of r2 is kept in certify-r2-artifacts/unit-test-report.json.gz. usage: certify_r2_analysis.py"""
import gzip, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

s2 = load('certify-r2-summary.json'); w = load('certify-r2-wait.json'); rc = load('certify-r2-receipt.json')
delta = git('diff', '--name-only', BASE, load('commit-0247.json')['commit']).splitlines()
api_refs = subprocess.run(['grep', '-rln', 'boundary-semantic\\|check-product-boundary', str(CANDIDATE / 'apps/api/src')], capture_output=True, text=True).stdout.split()
def durations(rep, file_key, titles):
    out = {}
    for f in rep['testResults']:
        if file_key not in f['name']: continue
        for a in f['assertionResults']:
            if a['title'] in titles: out[a['title']] = {'status': a['status'], 'ms': round(a.get('duration') or 0)}
    return out
T236 = ['retains default installed refusal and proves a closed matching JS dependency only on opt-in',
        'captures actual distinct origins for identical same-line diagnostics and consumes each separately']
u2 = json.loads(gzip.decompress((EV / 'certify-r2-artifacts/unit-test-report.json.gz').read_bytes()))
u1 = json.loads(gzip.decompress((EV / 'certify-r1-artifacts/unit-test-report.json.gz').read_bytes()))
lock_main = subprocess.run(['git', 'show', '05d4a30a:package-lock.json'], cwd=PROJECT, capture_output=True).stdout
vite = lambda b: json.loads(b)['packages']['node_modules/vite']['version']
base_lock = subprocess.run(['git', 'show', BASE + ':package-lock.json'], cwd=PROJECT, capture_output=True).stdout
rows = [
 {'gate': 'security', 'relatedToDelta': False,
  'cause': 'npm audit --audit-level=high: vite 8.2.0–8.2.2 com os advisories launch-editor GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw e GHSA-587h-7wmj-h5pm (1 high); igual na r1',
  'logExcerpt': ['certification/logs/security.log (r2, lido antes da restauração):', '# npm audit report', 'vite  8.2.0 - 8.2.2', 'Severity: high',
                 'launch-editor: escapeCmdArgs() omits % escaping on Windows - https://github.com/advisories/GHSA-698v-4r3x-3vcv',
                 'launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors - https://github.com/advisories/GHSA-r825-w8mm-5pxw',
                 'launch-editor: `fs.existsSync()` existence check can be bypassed on Windows - https://github.com/advisories/GHSA-587h-7wmj-h5pm',
                 'fix available via `npm audit fix`', 'node_modules/vite', '1 high severity vulnerability'],
  'proof': {'baseLock': {'commit': BASE[:12], 'sha256': shab(base_lock)[:12], 'vite': vite(base_lock)},
            'mainFix': {'commit': '05d4a30a', 'subject': git('log', '-1', '--format=%s', '05d4a30a', cwd=PROJECT), 'lockSha256': shab(lock_main)[:12], 'vite': vite(lock_main)},
            'deltaTouchesLock': 'package-lock.json' in delta, 'delta': delta},
  'reading': 'a base 1d40fe51 é anterior ao PR #11; o delta não mexe em dependência. Corrige-se portando o commit 783ef6d0 para a main com o PR #11.'},
 {'gate': 'unit', 'relatedToDelta': False,
  'cause': 'um teste: apps/api/src/__tests__/production-bootstrap-postgres-own.test.ts > own production bootstrap with scheduled PostgreSQL > uses real production data/auth boundaries and preserves HTTP identity controls — Error: Test timed out in 60000ms (duração 66 s); 6224/6225',
  'logExcerpt': ['certification/logs/unit.log (r2, lido antes da restauração):',
                 ' FAIL  apps/api/src/__tests__/production-bootstrap-postgres-own.test.ts > own production bootstrap with scheduled PostgreSQL > uses real production data/auth boundaries and preserves HTTP identity controls',
                 'Error: Test timed out in 60000ms.', ' ❯ apps/api/src/__tests__/production-bootstrap-postgres-own.test.ts:269:5', ' Test Files  1 failed | 468 passed (469)', '      Tests  1 failed | 6224 passed (6225)'],
  'proof': {'unitReport': 'certify-r2-artifacts/unit-test-report.json.gz', 'failed': [{'file': f['name'].split(str(CANDIDATE) + '/')[-1], 'title': a['title'], 'ms': round(a.get('duration') or 0)}
                                                                                    for f in u2['testResults'] for a in f['assertionResults'] if a['status'] != 'passed'],
            'deltaPaths': delta, 'apiSourcesReferencingTheB6Engine': api_refs,
            'imports': 'o teste importa pg, @cvg/persistence, operator-session-migrations, production-bootstrap, operator-identity, webhook-security e server do apps/api; nenhum caminho do delta',
            'sameTestInR1Unit': durations(u1, 'production-bootstrap-postgres-own', ['uses real production data/auth boundaries and preserves HTTP identity controls'])},
  'reading': 'o delta só toca scripts/boundary-semantic-engine.mjs e testes B6; nada em apps/api referencia o engine. Timeout de PG sob carga.'},
 {'gate': 'coverage', 'relatedToDelta': False,
  'cause': 'cinco testes falharam por tempo (5 failed | 6220 passed, 2 arquivos): dois de tests/b6-0236-boundary-integration.test.js (spawnSync ETIMEDOUT do checker com timeout de 30 s, linha 196; e Test timed out in 15000ms, linha 362) e três de tests/claude100/reference-port/controller.test.js (Test timed out in 15000ms, linhas 460, 500 e 587). Nenhuma asserção falhou; o gate não chegou a avaliar os limiares por causa das falhas.',
  'logExcerpt': ['certification/logs/coverage.log (r2, lido antes da restauração):',
                 ' FAIL  tests/b6-0236-boundary-integration.test.js > SPEC0236 real checker/CLI integration > retains default installed refusal and proves a closed matching JS dependency only on opt-in',
                 'Error: spawnSync /home/ricardo/.nvm/versions/node/v22.23.2/bin/node ETIMEDOUT', ' ❯ Object.run tests/b6-0236-boundary-integration.test.js:196:20',
                 ' FAIL  tests/b6-0236-boundary-integration.test.js > SPEC0236 real checker/CLI integration > captures actual distinct origins for identical same-line diagnostics and consumes each separately',
                 'Error: Test timed out in 15000ms.', ' ❯ tests/b6-0236-boundary-integration.test.js:362:3',
                 ' FAIL  tests/claude100/reference-port/controller.test.js > NP01–NP08 controller integration — entirely simulated Engine/native peer > blocks configuration mismatch before either native spawn', 'Error: Test timed out in 15000ms.',
                 ' FAIL  tests/claude100/reference-port/controller.test.js > NP01–NP08 controller integration — entirely simulated Engine/native peer > rejects an unfinished response despite an eligible request', 'Error: Test timed out in 15000ms.',
                 ' FAIL  tests/claude100/reference-port/controller.test.js > R1 mandatory counterexamples — regression controls > rejects physical mutation of inputs/workspace/mcp.json despite the unchanged retained memory', 'Error: Test timed out in 15000ms.',
                 ' Test Files  2 failed | 467 passed (469)', '      Tests  5 failed | 6220 passed (6225)'],
  'proof': {'b6_0236': {'inDeltaBy': 'só a troca do literal de versão (linha 355, campo source de um toMatchObject); as duas falhas pararam no spawnSync/tempo, antes de qualquer asserção',
                        'sameTestsElsewhereSameBytes': {'unit r2 (mesmo run)': durations(u2, 'b6-0236-boundary-integration', T236), 'unit r1': durations(u1, 'b6-0236-boundary-integration', T236),
                                                        'focal r1b': durations(load('frozen-r1b-focal-b6.vitest.json'), 'b6-0236-boundary-integration', T236),
                                                        'focal r1': durations(load('frozen-r1-focal-b6.vitest.json'), 'b6-0236-boundary-integration', T236)},
                        'coverageR1': 'na r1 o coverage não teve falha nesses testes (falhou por outros timeouts, certify-r1-analysis.json)'},
            'claude100': 'tests/claude100/reference-port/controller.test.js também caiu por timeout no coverage r1; arquivo fora do delta',
            'load': {'atStartR2': round(rc['loadAvgAtStart'], 2), 'waitBeforeR2': {k: w[k] for k in ('waitedSeconds', 'startLoad', 'minLoadSeen')},
                     'note': 'a carga subiu durante o run por outras frentes (registro de load por gate não existe; ~6–8 ao fim)'}},
  'reading': 'falhas de tempo sob carga e instrumentação de coverage; os mesmos dois testes da 0236 levam 3,2–4,5 s com os mesmos bytes (inclusive no unit desta r2), contra 30 s/15 s de limite.'}]
out = {'task': TASK, 'observedAt': now(), 'attempt': 'r2', 'decision': s2['decision'], 'gates': [(g['gate'], g['result']) for g in s2['gateResults']], 'unit': s2['unit'],
       'source': 'logs de certification/logs/ da candidata lidos antes de certify_post.py restaurar certification/ (arquivos rastreados); relatório unit da r2 em certify-r2-artifacts/; nenhuma suíte nova (instrução do lead)',
       'failures': rows, 'anyRelatedToDelta': any(r['relatedToDelta'] for r in rows),
       'verdict': 'certify local da 0247 NO_GO nesta base (r1 14/16, r2 13/16). Nenhum FAIL é do delta: security é o lock da base (vite 8.2.2, corrigido na main pelo PR #11 05d4a30a) e unit/coverage são tempo sob carga. A requalificação fica com o lead: portar 783ef6d0 para a main atual e rodar o certify lá.'}
save('certify-r2-analysis.json', out)
print(json.dumps({'decision': out['decision'], 'related': out['anyRelatedToDelta'], 'apiRefs': api_refs, 'b6_0236': rows[2]['proof']['b6_0236']['sameTestsElsewhereSameBytes']}, ensure_ascii=False)[:1500])
