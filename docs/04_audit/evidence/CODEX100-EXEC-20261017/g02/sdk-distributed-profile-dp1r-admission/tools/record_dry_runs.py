"""Records dry-runs-before-freeze.json from the selftest-sandbox runs in the private runtime (DV2 scope: the three own-code DIAG
rows, once each, before the source freeze; no service, no slot). Runs moved to dry/superseded-* are earlier rounds with older host
code and are listed only by name and status.
Usage: python3 -I -B tools/record_dry_runs.py   (cwd = unit folder)
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

UNIT = Path(__file__).resolve().parent.parent
DRY = Path('/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020/dry')


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def row(d, full=True):
    r = json.loads((d / 'result.json').read_text())
    out = {'dir': str(d), 'case': r['case'], 'status': r['status'], 'verdict': r['verdict']}
    if full:
        m = json.loads((d / 'profile-manifest.json').read_text())
        out.update({'mode': 'selftest-sandbox (bwrap sem systemd-run, sem ledger, sem orçamento)', 'diag_checks': r['diag_checks'],
                    'elapsed_s': round(r['elapsed_ns'] / 1e9, 2), 'result_sha256': sha(d / 'result.json'), 'profile_files': m['files']})
    return out


runs = [row(d) for d in sorted(DRY.iterdir()) if d.is_dir() and not d.name.startswith('superseded-')]
superseded = [dict(row(d, False), round=s.name) for s in sorted(DRY.glob('superseded-*')) for d in sorted(s.iterdir())]
host = ['dplane/' + n for n in ('supervisor.py', 'stage.py', 'observer.py', 'acceptance.py', 'bootstrap.py')]
doc = {'kind': 'DRY_RUNS_BEFORE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R',
       'scope': ('DV2 aceito pelo Lead (inputs/dp1/lead-decision-dv1-dv4.json#/deviations/DV2): só as três linhas DIAG de código próprio, antes '
                 'do source freeze; não contam como serviço nem como vaga; a evidência completa fica no runtime privado (fora de docs/)'),
       'runs': runs, 'superseded_rounds': superseded,
       'superseded_note': ('a primeira rodada (todas DIAG_PASS) usou um supervisor anterior ao acréscimo de tools/write_deltas.py ao SOURCE_SET; '
                           'refeita com o código final para que o registro ligue as fontes congeladas'),
       'host_sources_sha256_at_dry_run': {p: sha(UNIT / p) for p in host},
       'binding_rule': ('lição DP2-ADM/R1-F06: cada dry run registra os sha dos arquivos do /profile e este registro os sha do código do host; '
                        'o validador exige que sejam iguais às fontes atuais (e portanto às do source freeze)'),
       'all_pass': bool(runs) and all(r['status'] == 'DIAG_PASS' for r in runs), 'services': 0, 'slots': 0,
       'recorded_at': datetime.now(timezone.utc).isoformat()}
(UNIT / 'dry-runs-before-freeze.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(doc['all_pass'], len(runs), 'runs;', len(superseded), 'superseded')
