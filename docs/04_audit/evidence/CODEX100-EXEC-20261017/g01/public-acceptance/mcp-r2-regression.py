#!/usr/bin/env python3
"""Documentary witness for independent MCP timeout/tool-error coverage, not runtime."""
from pathlib import Path
import copy
import json
import sys

HERE = Path(__file__).resolve().parent


def need(ok, why):
    if not ok:
        raise ValueError(why)


def evaluate(d):
    r = next(r for r in d['requirements'] if r['id'] == 'CDX100-13-04')
    axes = {a['axis']:a for a in r['axis_disposition']}
    cases = {v['id']:v for v in r['variants']}
    tid,eid = 'CDX100-13-04:timeout','CDX100-13-04:tool-error'
    need(axes['timeout']['variant_ids'] == [tid] and axes['tool error']['variant_ids'] == [eid],'timeout/error cannot be assigned to cancellation-only case')
    t,e = cases[tid],cases[eid]
    tv,ev = t['fixture']['input_and_state'],e['fixture']['input_and_state']
    need(tv['client_user_cancel'] is False and tv['peer_terminal_response_delay_ms'] > tv['tool_timeout_boundary_ms'] > 0,'timeout needs an expired deadline without user cancel')
    need(ev['client_user_cancel'] is False and ev['deadline_expires'] is False and ev['peer_result_semantic']['isError'] is True,'tool error needs error result without timeout/cancel')
    need(ev['peer_result_semantic']['content'][0]['text'] == 'fixture-mcp-error','tool error payload missing')
    for v in [t,e]:
        need(v['runtime_status'] == 'NOT_RUN' and v['receipt'] is None,'documentary witness cannot qualify runtime')
        need(set(v['known_bad']['rejected_by']) <= {a['id'] for a in v['reference_expectation']['assertions']},'cross-case known-bad')
        need(v['unknowns'] and v['reference_expectation']['basis'] == 'PROPOSED_ORACLE_PENDING_REFERENCE','mapping/outcome falsely closed')


def main():
    current = json.loads((HERE/'interfaces/cases.json').read_text())
    old = json.loads((HERE/'review-r1-inputs/interfaces/cases.json.raw.txt').read_text())
    evaluate(current);results = [{'id':'independent_current_timeout_and_tool_error','result':'PASS_DOCUMENTARY'}]
    try:evaluate(old)
    except ValueError:results.append({'id':'actual_R1_input','result':'REJECTED_CANCELLATION_DOES_NOT_EXERCISE_TIMEOUT_OR_TOOL_ERROR'})
    else:raise ValueError('actual R1 false coverage not rejected')
    mutations = [
        ('timeout_points_to_cancel',lambda r:next(a for a in r['axis_disposition'] if a['axis']=='timeout').update(variant_ids=['CDX100-13-04:edge'])),
        ('error_points_to_cancel',lambda r:next(a for a in r['axis_disposition'] if a['axis']=='tool error').update(variant_ids=['CDX100-13-04:edge'])),
        ('timeout_has_user_cancel',lambda r:next(v for v in r['variants'] if v['id'].endswith(':timeout'))['fixture']['input_and_state'].update(client_user_cancel=True)),
        ('response_before_deadline',lambda r:next(v for v in r['variants'] if v['id'].endswith(':timeout'))['fixture']['input_and_state'].update(peer_terminal_response_delay_ms=100)),
        ('tool_success_instead_of_error',lambda r:next(v for v in r['variants'] if v['id'].endswith(':tool-error'))['fixture']['input_and_state']['peer_result_semantic'].update(isError=False)),
        ('error_is_timeout',lambda r:next(v for v in r['variants'] if v['id'].endswith(':tool-error'))['fixture']['input_and_state'].update(deadline_expires=True)),
    ]
    for name,mutate in mutations:
        bad = copy.deepcopy(current);r = next(r for r in bad['requirements'] if r['id']=='CDX100-13-04');mutate(r)
        try:evaluate(bad)
        except ValueError:results.append({'id':name,'result':'REJECTED_BY_INDEPENDENT_DOCUMENTARY_STIMULUS_CONDITION'});continue
        raise ValueError('ineffective negative '+name)
    report = {'kind':'MCP_DOCUMENTARY_STIMULUS_REGRESSION_NOT_TOOL_EXECUTION','results':results,'positive':1,'actual_failed_R1_rejected':1,'additional_negative_mutants':6,'functional_receipts':0}
    b = (json.dumps(report,indent=2)+'\n').encode();p = HERE/'mcp-r2-regression.json'
    if '--check' in sys.argv:need(p.read_bytes() == b,'regression report drift')
    else:p.write_bytes(b)
    print(json.dumps({'positive':1,'R1_rejected':1,'negative_mutants':6,'functional_receipts':0}))


if __name__ == '__main__':
    main()
