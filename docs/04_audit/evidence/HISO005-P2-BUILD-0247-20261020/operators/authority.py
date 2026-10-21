"""Authority and task registration of HISO005-P2-BUILD-0247: checks the SPEC0247 contract sha256 (materialized r3) and
the user decision, and writes authority.json and task.json. Stops if the contract diverges. usage: authority.py"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

spec_sha = sha(PROJECT / SPEC[0])
assert spec_sha == SPEC[1], ('SPEC0247 diverge', spec_sha)
dec = json.loads((PROJECT / DECISION).read_text())
assert dec['futureTask'] == TASK and dec['contract']['sha256'] == SPEC[1] and dec['answer'].startswith('Aprovar BUILD local'), dec
reads = {n: sha(SPEC_DIR / n) for n in ('REPORT.txt', 'review-r2/review.json', 'r2-corrections.json', 'lead-review-r3.json', 'fixtures.json',
                                        'operators/cjs_patch_t3.py', 'operators/fixtures.py', 'operators/probe.py', 'variant-v6t3.diff.txt', 'probe-final3.json')}
auth = {'task': TASK, 'observedAt': now(), 'owner': 'Claude Code (executor delegado; lead CONT-20261018-D9EF)',
        'decision': {'path': DECISION, 'sha256': sha(PROJECT / DECISION), 'at': dec['at'], 'channel': dec['channel'], 'answer': dec['answer'],
                     'grants': dec['grants'], 'notGranted': dec['notGranted']},
        'contract': {'materialized': SPEC[0], 'sha256': spec_sha, 'expected': SPEC[1], 'match': spec_sha == SPEC[1], 'target': SPEC_TARGET,
                     'targetInThisCheckout': (PROJECT / SPEC_TARGET).exists()},
        'leadScope': {'covers': ['BUILD local sintético em candidata própria', 'PG/portas próprios (56263, 3449, 4449)', 'certify com claim próprio (registrado pelo lead na coordenação)'],
                      'doesNotCover': ['push', 'PR', 'commit na main ou no checkout compartilhado', 'deploy', 'produção', 'dado real', 'rede externa', 'mudança de lockfile', 'SPEC0246']},
        'coordinationClaim': [l.strip() for l in (PROJECT / 'docs/08_runtime/agent_coordination.md').read_text().splitlines() if 'HISO005-P2-BUILD-0247' in l],
        'readBeforeStart': reads,
        'notes': 'a decisão do usuário também cita promoção por PR; o lead restringiu esta unidade: sem push nem PR, só commit na candidata detached e patch de promoção'}
save('authority.json', auth)
task = {'task': TASK, 'status': 'IN_PROGRESS', 'registeredAt': now(), 'track': 'T3 aprovado pelo usuário em 2026-10-20 (BUILD local)',
        'spec': {'materialized': SPEC[0], 'sha256': SPEC[1], 'target': SPEC_TARGET}, 'decision': DECISION,
        'base': {'commit': BASE, 'what': 'commit do BUILD0245 (kernel v6 semantic-kernel-v6-tsx-parse, engine bcbb49ab…); PR que o leva à main montado em paralelo pelo lead'},
        'candidate': str(CANDIDATE), 'runtime': str(RUNTIME), 'detached': True,
        'evalRoot': {'path': str(EVAL_ROOT), 'commit': EVAL_COMMIT, 'mode': 'só leitura; 1.410 sha256 conferidos antes, durante e depois; medição só com a raiz parada'},
        'resources': {'pg': PG_NAME, 'pgPort': PG_PORT, 'apiPort': API_PORT, 'webPort': WEB_PORT},
        'evidence': 'docs/04_audit/evidence/HISO005-P2-BUILD-0247-20261020/', 'model': 'docs/04_audit/evidence/HISO005-P2-BUILD-0245-20261020/'}
save('task.json', task)
print(json.dumps({'contract': auth['contract'], 'claim': auth['coordinationClaim']}, indent=1, ensure_ascii=False))
