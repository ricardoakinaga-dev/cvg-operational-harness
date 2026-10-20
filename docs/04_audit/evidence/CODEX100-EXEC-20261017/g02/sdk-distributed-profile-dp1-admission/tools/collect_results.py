"""Read-only collection of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 after the services.

Usage: python3 -I -B tools/collect_results.py   (cwd = unit folder)
Writes case-results.json (one row per slot, CONTROL first), reevaluation-dp1.json (acceptance.py reevaluate of every case folder:
predicates, outcome and plan binding), resource-receipt-final.json (units, release, load, peaks, budget) and empty-artifact-delta.json
(every empty file with real metadata for the central catalog, merged by the Lead; the catalog is never edited here).
"""
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

U = Path(__file__).resolve().parent.parent
EVIDENCE = U.parents[2]


def load(p):
    return json.loads(Path(p).read_text())


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


ledger = load(U / 'case-ledger.json')
budget = load(U / 'budget.json')
spec = load(U / 'inputs' / 'spec-dp' / 'cases-dp-1.json')
slot_of = {c['id']: c['slot'] for c in spec['cases']}
rows, reev = [], []
order = ['DP1-CTRL01'] + [c['id'] for c in sorted(spec['cases'], key=lambda x: x['slot']) if c['id'] != 'DP1-CTRL01']
for case in order:
    dirs = sorted((U / 'cases').glob(case + '-*'))
    assert len(dirs) == 1, 'exactly one folder per slot: %s' % case
    d = dirs[0]
    acc = load(d / 'acceptance.json')
    res = load(d / 'result.json')
    rows.append({'slot': slot_of[case], 'case': case, 'kind': [c['kind'] for c in spec['cases'] if c['id'] == case][0], 'outcome': acc['outcome'],
                 'composition_rule': acc['composition_rule'], 'capture_form': acc['capture_form'], 'failed_predicates': acc['failed_predicates'],
                 'unit': res.get('unit'), 'dir': str(d.relative_to(U)), 'acceptance_sha256': sha(d / 'acceptance.json'), 'ledger_status': ledger['slots'][case]['status']})
    r = subprocess.run([sys.executable, '-I', '-B', str(U / 'dplane' / 'acceptance.py'), 'reevaluate', str(d)], capture_output=True, text=True)
    doc = json.loads(r.stdout)
    reev.append({k: doc[k] for k in ('case', 'outcome', 'service_outcome', 'predicate_level_equal', 'outcome_equal', 'plan_binding_ok')} | {'exit': r.returncode})
counts = {}
for r in rows:
    if r['kind'] != 'CONTROL':
        counts[r['outcome']] = counts.get(r['outcome'], 0) + 1
(U / 'case-results.json').write_text(json.dumps({'kind': 'CASE_RESULTS_DP1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1',
                                                 'rows': rows, 'counts_excluding_control': counts, 'collected_at': now(), 'functional_receipts': 0,
                                                 'parity_credit': 0}, ensure_ascii=False, indent=2) + '\n')
(U / 'reevaluation-dp1.json').write_text(json.dumps({'kind': 'REEVALUATION_DP1', 'cases': reev, 'all_equal': all(x['predicate_level_equal'] and x['outcome_equal']
                                                                                                            and x['plan_binding_ok'] and x['exit'] == 0 for x in reev),
                                                     'tool': 'dplane/acceptance.py reevaluate (rebuilds the RoleLogs from the preserved raw frames)',
                                                     'reevaluated_at': now()}, ensure_ascii=False, indent=2) + '\n')

units, peaks, loads, waits = [], [], [], []
for res_path in sorted(list((U / 'cases').glob('*/result.json')) + list((U / 'diagnostics').glob('*/result.json'))):
    res = load(res_path)
    if res.get('unit'):
        units.append(res['unit'])
        peaks.append(res.get('cgroup_peaks_sampled') or {})
        cmd = load(res_path.parent / 'command.json')
        lw = cmd.get('load_wait') or {}
        loads.append((lw.get('loadavg_at_start') or [0])[0])
        waits.append(lw.get('waited_s', 0))
listed = subprocess.run(['systemctl', '--user', 'list-units', '--all', 'cvg-dx100-dp1-*', '--no-legend'], capture_output=True, text=True).stdout.strip()
receipt = {'kind': 'RESOURCE_RECEIPT_FINAL_DP1', 'units': len(units), 'unit_prefix': 'cvg-dx100-dp1-', 'all_released': listed == '', 'listed_now': listed,
           'services_used': budget['services_used'], 'services_max': budget['services_max'], 'case_slots_used': ledger['used'], 'case_slots_max': ledger['slots_max'],
           'evaluator_only_slots': ['DP-PK09A'], 'max_loadavg_at_service_start': max(loads), 'load_waits_s': sum(waits),
           'max_pids_peak': max(p.get('pids.peak', 0) for p in peaks), 'max_memory_peak_bytes': max(p.get('memory.peak', 0) for p in peaks),
           'service_properties': {'MemoryMax': '1073741824', 'TasksMax': '256'}, 'pg': 'nenhum', 'tcp_ports': 'nenhuma', 'network': 'nenhuma (namespace só com lo)',
           'kept': ['worktree /mnt/dados/cvg-work/cvg-codex100-dp1-20261019 (HEAD destacado)', 'runtime /mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019 (/dist staged, attempts)'],
           'checked_at': now()}
(U / 'resource-receipt-final.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')


def setenv(argv):
    env = {}
    for i, a in enumerate(argv):
        if a == '--setenv' and i + 2 < len(argv):
            env[argv[i + 1]] = argv[i + 2]
    return env


records = []
for f in sorted(p for p in U.rglob('*') if p.is_file() and p.stat().st_size == 0):
    d = f.parent
    cmd = load(d / 'command.json')
    res = load(d / 'result.json')
    status, reason = 'capture_missing', 'contadores do result.json não provam o vazio'
    if f.name in ('service-stdout.txt', 'service-stderr.txt'):
        stream = f.name[len('service-'):-len('.txt')]
        if res['service_output_bytes'][stream] == 0:
            status = 'expected_empty'
            reason = ('O serviço %s não escreveu em %s (result.json service_output_bytes.%s = 0): o driver só emite telemetria no FIFO do '
                      'observador; saída do serviço vazia é o esperado.' % (res['unit'], stream, stream))
    for role in ('adapter', 'peer'):
        if f.name in ('events-%s.bin' % role, 'events-%s.jsonl' % role, 'events-%s.recv.jsonl' % role):
            if res['raw_frame_bytes'][role] == 0 and res['frames'][role] == 0 and res.get('topology') == 'driver_only':
                status = 'expected_empty'
                reason = ('Topologia driver_only (errata DP-SPEC/R2-F01): o FIFO %s.events ficou montado e não recebeu nenhum byte '
                          '(result.json raw_frame_bytes.%s = 0, frames.%s = 0); o arquivo vazio é a prova de que não houve quadro de %s.' % (role, role, role, role))
    records.append({'path': f.relative_to(EVIDENCE).as_posix(), 'bytes': 0, 'status': status, 'command': cmd['argv'], 'exitCode': res['systemd_run_rc'],
                    'timestamp': res['observed_at'], 'environment': setenv(cmd['argv']),
                    'environment_scope': 'sandbox: env dos processos que produziram o arquivo (bwrap --clearenv + --setenv do command)',
                    'systemd_run_caller_env_keys': cmd.get('env_keys'), 'reason': reason})
doc = {'schemaVersion': 1, 'kind': 'EMPTY_ARTIFACT_DELTA_FOR_CENTRAL_CATALOG',
       'target': 'docs/04_audit/evidence/empty-artifact-status.json (merge pelo Lead; esta unidade não edita o catálogo central)',
       'unit': U.relative_to(EVIDENCE).as_posix(), 'count': len(records),
       'by_status': {s: sum(1 for r in records if r['status'] == s) for s in sorted({r['status'] for r in records})}, 'files': records}
(U / 'empty-artifact-delta.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'rows': len(rows), 'counts': counts, 'reevaluation_all_equal': all(x['predicate_level_equal'] and x['outcome_equal'] for x in reev),
                  'units': len(units), 'released': receipt['all_released'], 'empty': doc['by_status']}))
