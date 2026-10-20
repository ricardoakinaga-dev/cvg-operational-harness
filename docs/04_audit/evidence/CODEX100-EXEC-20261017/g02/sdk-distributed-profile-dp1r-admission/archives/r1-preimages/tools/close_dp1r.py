"""State and next task of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R.

Usage (cwd = unit folder):
  python3 -I -B tools/close_dp1r.py review   -> state.json (EXECUTED_PENDING_REVIEW), next-task.json, review-freeze-r1.json
  python3 -I -B tools/close_dp1r.py final    -> state.json and next-task.json after the review (and the repair, if any)
Status rule (carry-over DP1-ADM/R2-F04): an open P1 blocks (BLOCKED_BY_REVIEW); a P2 without a recorded resolution gives
COMPLETED_LOCAL_WITH_OPEN_P2; P3 carried to the next unit or deviations pending Lead acceptance give
COMPLETED_LOCAL_WITH_CARRIED_FINDINGS; otherwise COMPLETED_LOCAL. A P1 never passes as CARRIED.
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R'


def load(p):
    return json.loads((U / p).read_text())


def sha(p):
    return hashlib.sha256((U / p).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def status_of(review, disposition, deltas):
    if review is None:
        return 'EXECUTED_PENDING_REVIEW'
    findings = review.get('findings', [])
    disp = {i['id']: i['disposition'] for i in (disposition or {}).get('items', [])}
    if any(f['severity'] == 'P1' for f in findings):
        return 'BLOCKED_BY_REVIEW'
    if any(f['severity'] == 'P2' and disp.get(f['id']) not in ('RESOLVED_IN_REPAIR', 'RESOLVED_BY_RECORD') for f in findings):
        return 'COMPLETED_LOCAL_WITH_OPEN_P2'
    carried = any(v.startswith('CARRIED') for v in disp.values())
    pending = any(d.get('lead_acceptance') == 'PENDENTE' for d in deltas.get('deviations', []))
    return 'COMPLETED_LOCAL_WITH_CARRIED_FINDINGS' if (carried or pending) else 'COMPLETED_LOCAL'


def state(phase):
    res = load('case-results.json')
    reev = load('reevaluation-dp1r.json')
    rr = load('resource-receipt-final.json')
    budget = load('budget.json')
    deltas = load('freeze-deltas-dp1r.json')
    review = load('review-r1/review.json') if (phase == 'final' and (U / 'review-r1' / 'review.json').exists()) else None
    disposition = load('review-r1/executor-disposition.json') if (phase == 'final' and (U / 'review-r1' / 'executor-disposition.json').exists()) else None
    repair = load('repair-r1.json') if (U / 'repair-r1.json').exists() else None
    rows = {r['case']: r for r in res['rows']}
    doc = {
        'kind': 'UNIT_STATE', 'program': 'CODEX100', 'task': TASK, 'lead': 'CONT-20261018-D9EF',
        'track': 'T1 com execução local contida (serviços transientes próprios, sem rede, sem provider, sem credencial, sem dado real)',
        'status': status_of(review, disposition, deltas),
        'git': {'candidate_worktree': '/mnt/dados/cvg-work/cvg-codex100-dp1r-20261020', 'base': 'c9b9650bf (recibo do DP-2)', 'branch': 'nenhuma (HEAD destacado)', 'push': 'não', 'pr': 'não'},
        'runtime': '/mnt/dados/cvg-work/cvg-codex100-dp1r-runtime-20261020',
        'claim': {'path': 'claim.json', 'sha256': sha('claim.json')},
        'erratum': {'id': 'EDP1R-01', 'path': 'erratum-dp1r.json', 'sha256': sha('erratum-dp1r.json'), 'cases': {'path': 'cases-dp-1r.json', 'sha256': sha('cases-dp-1r.json')},
                    'text': 'package.json {"type":"commonjs"} declarado nas duas folhas win32 do PK07; local e extensão do arquivo executado preservados (são a observação); nenhum braço marcado como limite de plataforma'},
        'deltas': {'path': 'freeze-deltas-dp1r.json', 'ids': [d['id'] for d in deltas['deltas']], 'new_deviations': deltas['deviations'],
                   'byte_copies_of_dp1': deltas['byte_copies'], 'changed_from_dp1': deltas['changed']},
        'carry_over': [{'id': c['id'], 'disposition': c['disposition']} for c in deltas['carry_over']],
        'preflight': {'path': 'preflight.json', 'result': load('preflight.json')['result']},
        'selftests': {'path': 'selftests/selftest-results.json', 'passed': load('selftests/selftest-results.json')['passed'], 'failed': load('selftests/selftest-results.json')['failed']},
        'validator': {'path': 'validation-unit.json', 'ok': load('validation-unit.json')['ok'], 'checks': len(load('validation-unit.json')['checks']),
                      'negatives_refused': load('validation-unit.json')['negative_controls_refused']},
        'dry_runs': {'path': 'dry-runs-before-freeze.json', 'all_pass': load('dry-runs-before-freeze.json')['all_pass'], 'services': 0},
        'freezes': {'source': {'path': 'source-freeze-dp1r.json', 'sha256': sha('source-freeze-dp1r.json'), 'files': load('source-freeze-dp1r.json')['file_count']},
                    'identity': {'path': 'identity-freeze-dp1r.json', 'sha256': sha('identity-freeze-dp1r.json')}},
        'diagnostics': {'path': 'diag-admission-dp1r.json', 'sha256': sha('diag-admission-dp1r.json'),
                        'passed': sorted(load('diag-admission-dp1r.json')['admission_diagnostics'])},
        'control': {k: rows['DP1R-CTRL01'][k] for k in ('outcome', 'composition_rule', 'failed_predicates', 'unit', 'dir')},
        'case': {k: rows['DP-PK07B'][k] for k in ('outcome', 'composition_rule', 'capture_form', 'failed_predicates', 'unit', 'dir')},
        'adjudication': {'path': 'adjudication-dp1r.json', 'sha256': sha('adjudication-dp1r.json')},
        'reevaluation': {'path': 'reevaluation-dp1r.json', 'all_equal': reev['all_equal']},
        'budget': {'case_slots': '%d/%d' % (rr['case_slots_used'], rr['case_slots_max']), 'services': '%d/%d (DIAG de qualificação)' % (budget['services_used'], budget['services_max']),
                   'reviews': '%d/1' % (1 if review else 0), 'grouped_repairs': '%d/1' % (1 if repair else 0), 'automatic_retries': 0},
        'resources': {k: rr[k] for k in ('units', 'all_released', 'max_loadavg_at_service_start', 'load_waits_s', 'max_pids_peak', 'max_memory_peak_bytes', 'pg', 'tcp_ports', 'network')},
        'empty_artifacts': {'path': 'empty-artifact-delta.json', 'by_status': load('empty-artifact-delta.json')['by_status']},
        'capability': 'nenhuma capability do kernel nem privilégio novo (Q4); bwrap e systemd-run --user como no DP-1',
        'review': ({'R1': '%s (%s) review-r1/review.json; texto sem edição em review-r1/verdict.raw.txt' % (review['verdict'], review['summary_counts']),
                    'critic': 'subagente novo, somente leitura; o executor grava brief e veredito sem edição',
                    'repair': 'repair-r1.json (1/1)' if repair else 'não usado (0/1)',
                    'disposition': 'review-r1/executor-disposition.json'} if review else {'R1': 'pendente'}),
        'functional_receipts': 0, 'parity_credit': 0, 'updated_at': now()}
    return doc, review, disposition


def next_task(review, disposition):
    carried = []
    for f in (review or {}).get('findings', []):
        d = {i['id']: i for i in (disposition or {}).get('items', [])}.get(f['id'], {})
        if d.get('disposition', '').startswith('CARRIED'):
            carried.append({'finding': 'DP1R-ADM/' + f['id'], 'severity': f['severity'], 'text': d.get('note') or f['required_action']})
    return {
        'task': 'DX100-G02:BIND-SDK-DISTRIBUTED-PROFILE (proposta; nome e claim definidos pelo Lead)',
        'previous_task': TASK, 'status': 'READY_PENDING_LEAD_CLAIM',
        'track': 'T1 documental: ligar as observações do perfil distribuído ao v5 (sem serviço, sem vaga)', 't3_required': False, 't4_required': False,
        'why_this_order': 'inputs/dp2/lead-decision-dv-dp2.json#/notes: DP-1R e depois o BIND do perfil distribuído com DP-1, DP-1R e DP-2.',
        'inputs': {'dp1': '../sdk-distributed-profile-dp1-admission (adjudication-dp1.json, case-results.json)',
                   'dp1r': {'adjudication': 'adjudication-dp1r.json', 'case_results': 'case-results.json', 'erratum': 'erratum-dp1r.json'},
                   'dp2': '../sdk-distributed-profile-dp2-admission (adjudication-dp2.json, next-task.json#/record_for_bind)',
                   'coverage_plan': 'inputs/spec-dp/coverage-plan-dp.json'},
        'record_for_bind': [
            {'id': 'DP1R/PK07', 'text': 'PK07.B01 (oito pares, win32 com .exe sob o shim), PK07.B02 e PK07.B03 observados no DP-PK07B (PASS_CLIENT_OBSERVATION, regra 7); o DP-PK07A segue INVALID_CAPTURE adjudicado e não conta.'},
            {'id': 'DP1R/PLATFORM', 'text': 'Os ramos win32 julgam decisões em JavaScript do wrapper sob o shim no Linux; a criação de processo do Windows real fica fora e não é reivindicada (erratum-dp1r.json#/platform_limit).'},
            {'id': 'DP1R/CONTRARY', 'text': 'Contrários que deixam de executar um filho esperado ou executam um não esperado caem em child.program_followed (sanidade) e dariam INVALID_CAPTURE, não MISMATCH (erratum-dp1r.json#/contrary_still_visible); não ocorreram.'},
            {'id': 'DP1R/BUILD', 'text': 'build_link NO_BUILD_LINK_DECLARED; 0 recibos funcionais e 0 crédito de paridade nesta unidade.'}],
        'carry_over': carried,
        'after_this': ['apagar o runtime privado e as worktrees das unidades DP depois do BIND, por decisão do Lead'],
        'not_authorized_now': ['rede ou nova aquisição', 'provider, credencial, login, turn ou chamada a modelo (gate T4)', 'capability do kernel ou privilégio (Q4)',
                               'npm/pip install ou instalação global', 'executar binário do cache fora da contenção', 'push', 'produção'],
        'functional_receipts': 0, 'parity_credit': 0, 'created_at': now()}


def main(argv):
    phase = argv[0] if argv else ''
    assert phase in ('review', 'final'), __doc__
    doc, review, disposition = state(phase)
    (U / 'state.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    (U / 'next-task.json').write_text(json.dumps(next_task(review, disposition), ensure_ascii=False, indent=2) + '\n')
    if phase == 'review':
        files = {}
        for p in sorted(U.rglob('*')):
            rel = p.relative_to(U).as_posix()
            if p.is_file() and not rel.startswith('review-r1/') and rel != 'review-freeze-r1.json':
                files[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
        with open(U / 'review-freeze-r1.json', 'x') as f:
            f.write(json.dumps({'kind': 'REVIEW_FREEZE', 'task': TASK, 'round': 1, 'file_count': len(files), 'files': files, 'frozen_at': now()},
                               ensure_ascii=False, indent=2) + '\n')
    print(doc['status'])
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
