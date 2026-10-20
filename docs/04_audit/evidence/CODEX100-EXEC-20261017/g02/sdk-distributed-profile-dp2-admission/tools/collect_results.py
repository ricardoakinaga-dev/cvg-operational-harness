"""Read-only collection after the single-use slots of the DP-2 (no service, no SDK, no cache write). Run: python3 -I -B tools/collect_results.py

Writes case-results.json (6 slots: DP2-CTRL01, DP-PY19A, DP-PY19B, DP-PY19C, DP-PY02P and the artifact check DP-PY20A, one use each,
with the per-arm record of the frozen arm_discrimination of each slot), reevaluation-dp2.json (every case directory re-judged offline
from the preserved raw frames, recv_ns and gidx, or from the cache by sha for DP-PY20A, compared predicate by predicate with its
acceptance.json, plus the plan binding of the folder, which now records case_plan_file: C32-ADM/DV-C32-02) and
resource-receipt-final.json (every own systemd unit and its cgroup, read-only systemctl show).
"""
import datetime
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2'
OUTCOMES = ('PASS_CLIENT_OBSERVATION', 'MISMATCH', 'INVALID_CAPTURE', 'INCONCLUSIVE')
PREFIX = 'cvg-dx100-dp2-'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def save(name, doc):
    (U / name).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def main():
    pacc = load('collect_dp2_pacc', U / 'python' / 'acceptance.py')
    ledger = json.loads((U / 'case-ledger.json').read_text())
    spec = {c['id']: c for c in json.loads((U / 'inputs' / 'spec-dp' / 'cases-dp-2.json').read_text())['cases']}
    order = ['DP2-CTRL01'] + sorted((c for c in spec if c != 'DP2-CTRL01'), key=lambda c: spec[c]['slot'])
    rows, reevals = [], []
    for case in order:
        slot = ledger['slots'][case]
        row = {'slot': spec[case]['slot'], 'case': case, 'kind': spec[case]['kind'], 'language': spec[case]['language'],
               'ledger_status': slot['status'], 'conditional': case == 'DP-PY02P'}
        if slot['status'] != 'EXECUTED':
            rows.append(dict(row, outcome=None, note='vaga não usada'))
            continue
        d = U / 'cases' / ('%s-%s' % (case, slot['attempt'][:12]))
        res = json.loads((d / 'result.json').read_text())
        acc = json.loads((d / 'acceptance.json').read_text())
        ok_by = {x['id']: x['ok'] for x in acc['predicates']}
        arms = [{'arm': a['arm'], 'steps': a['steps'], 'judged_by': {p: ok_by.get(p) for p in a['judged_by']},
                 'observable_if_contrary': a['observable_if_contrary'],
                 'record': ('predicados de julgamento aprovados na captura: o efeito contrário declarado não foi observado'
                            if all(ok_by.get(p) is True for p in a['judged_by']) else 'predicado de julgamento falhou ou ausente')}
                for a in spec[case].get('arm_discrimination', [])]
        row.update({'outcome': acc['outcome'], 'composition_rule': acc['composition_rule'], 'capture_verdict': acc['capture_verdict'],
                    'capture_form': acc['capture_form'], 'predicates': len(acc['predicates']),
                    'failed_predicates': [[x['id'], x['class']] for x in acc['predicates'] if not x['ok']],
                    'capture_reasons': acc['capture_reasons'], 'evaluator_version': acc['evaluator_version'], 'unit': res['unit'],
                    'attempt_dir': d.relative_to(U).as_posix(), 'elapsed_s': round(res['elapsed_ns'] / 1e9, 3),
                    'load_wait': json.loads((d / 'command.json').read_text()).get('load_wait') if (d / 'command.json').exists() else None,
                    'service': res.get('service', res['unit']), 'topology': acc.get('topology'), 'build_link': acc.get('build_link'),
                    'observed_at': res['observed_at'],
                    'arm_record': arms})
        rows.append(row)
        try:
            r = pacc.reevaluate(d)
        except SystemExit as exc:
            r = {'case': case, 'error': str(exc)}
        # C32-ADM/DV-C32-02 applied: every folder records case_plan_file (profile-manifest.json, or result.json for DP-PY20A).
        rec = json.loads((d / ('profile-manifest.json' if (d / 'profile-manifest.json').exists() else 'result.json')).read_text())
        r['plan_file_record'] = 'present' if (rec.get('case_plan_file') or {}).get('sha256') else 'absent'
        reevals.append(r)
    sdk = [r for r in rows if r['kind'] in ('SDK', 'ARTIFACT_CHECK')]
    counts = {o: sum(1 for r in sdk if r['outcome'] == o) for o in OUTCOMES}
    counts['NOT_RUN'] = sum(1 for r in sdk if r['outcome'] is None)
    control = [r for r in rows if r['kind'] == 'CONTROL'][0]
    save('case-results.json', {'kind': 'DP2_CASE_RESULTS_ONCE_SERIAL', 'task': TASK, 'evaluators': [pacc.EVALUATOR],
                               'control': {'case': control['case'], 'outcome': control['outcome'], 'composition_rule': control.get('composition_rule'),
                                           'failed_predicates': control.get('failed_predicates'),
                                           'gate': 'MISMATCH pela regra 6 só com wire.no_turn_interrupt, sanidades aprovadas, antes das outras vagas',
                                           'gate_passed': control['outcome'] == 'MISMATCH' and control.get('composition_rule') == 6
                                           and control.get('failed_predicates') == [['wire.no_turn_interrupt', 'client']],
                                           'counts_as_sdk_observation': False},
                               'sdk_counts': counts, 'sdk_cases': len(sdk), 'slots_used': sum(1 for r in rows if r['outcome'] is not None),
                               'rows': rows, 'functional_receipts': 0, 'parity_credit': 0, 'collected_at': now(),
                               'note': ('Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade. arm_record só registra o '
                                        'resultado dos predicados de julgamento congelados de cada braço; não estende o que cada PASS pode afirmar.')})
    save('reevaluation-dp2.json', {'kind': 'OFFLINE_REEVALUATION_DP2',
                                   'command': 'python3 -I -B python/acceptance.py reevaluate <case-dir> (via tools/collect_results.py)',
                                   'all_predicate_level_equal': all(r.get('predicate_level_equal') for r in reevals),
                                   'all_outcome_equal': all(r.get('outcome_equal') for r in reevals),
                                   'all_plan_binding_ok': all(r.get('plan_binding_ok') for r in reevals),
                                   'plan_file_record_absent': sorted(r['case'] for r in reevals if r.get('plan_file_record') == 'absent'),
                                   'cases': reevals, 'collected_at': now()})
    units = [h for h in json.loads((U / 'budget.json').read_text())['history']]
    units += [{'case': c, 'unit': s['unit'], 'result': s.get('result')} for c, s in ledger['slots'].items()
              if s['status'] == 'EXECUTED' and not s['unit'].startswith('no-service-')]
    out = []
    uid = os.getuid()
    for u in units:
        r = subprocess.run(['systemctl', '--user', 'show', u['unit'], '-p', 'MainPID,ControlGroup,LoadState,ActiveState,SubState'],
                           capture_output=True, text=True, timeout=30)
        show = dict(x.split('=', 1) for x in r.stdout.splitlines() if '=' in x)
        cg = Path('/sys/fs/cgroup/user.slice/user-%d.slice/user@%d.service/app.slice/%s' % (uid, uid, u['unit']))
        out.append({'unit': u['unit'], 'case': u.get('case'), 'result': u.get('result'), 'show': show, 'rc': r.returncode,
                    'cgroup_dir_exists': cg.exists(), 'released': show.get('LoadState') == 'not-found' and show.get('ActiveState') == 'inactive' and not cg.exists()})
    lu = subprocess.run(['systemctl', '--user', 'list-units', '--all', '--no-legend', PREFIX + '*'], capture_output=True, text=True, timeout=30)
    save('resource-receipt-final.json', {'kind': 'FINAL_OWN_RESOURCE_RECEIPT_READONLY', 'prefix': PREFIX, 'units': out,
                                         'all_released': all(x['released'] for x in out), 'units_listed_with_prefix': [x for x in lu.stdout.splitlines() if x.strip()],
                                         'pg': 'nenhum criado', 'tcp_ports': 'nenhuma aberta', 'network': 'nenhuma (bwrap --unshare-all)',
                                         'mnt_ia': 'não tocado', 'observed_at': now()})
    print(json.dumps({'sdk_counts': counts, 'control': control['outcome'],
                      'reeval_equal': all(r.get('predicate_level_equal') and r.get('outcome_equal') and r.get('plan_binding_ok') for r in reevals),
                      'reeval_verdict_equal': all(r.get('predicate_level_equal') and r.get('outcome_equal') for r in reevals),
                      'units': len(out), 'released': all(x['released'] for x in out)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
