#!/usr/bin/env python3
"""Read-only source checks; --capture creates this lane's documentary snapshot."""
import argparse
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
SOURCE_PATHS = [
    'AGENTS.md', 'docs/07_agents/AGENTS.md', 'docs/99_runtime_state.md',
    'docs/20_master_execution_log.md', 'docs/30_backlog_master.md',
    'docs/08_runtime/agent_coordination.md',
    'docs/00_discovery/0009_discovery_master.md',
    'docs/00_discovery/0010_plat-s48_controlled_baseline_gate_discovery.md',
    'docs/00_discovery/0011_rem0539_r0_revalidation.md',
    'docs/00_discovery/0012_rem0539_r2_durability.md',
    'docs/00_discovery/0013_rem0539_r3_journeys.md',
    'docs/00_discovery/0014_rem0539_r4_integrations_ops.md',
    'docs/00_discovery/0015_rem0539_r5_qualification.md',
    'docs/00_discovery/0016_harness_refoundation.md',
    'docs/00_discovery/0017_m07_package_dependencies.md',
    'docs/00_discovery/0018_m05_public_harness_composition.md',
    'docs/00_discovery/0019_platform_first_consumer_pilot.md',
    'docs/00_discovery/0090_discovery_validation.md',
    'docs/01_prd/0020_prd_master.md',
    'docs/01_prd/0021_plat-s48_controlled_baseline_gate_hygiene.md',
    'docs/01_prd/0022_rem0539_r1_safety_integrity.md',
    'docs/01_prd/0023_rem0539_r2_durability.md',
    'docs/01_prd/0024_rem0539_r3_journeys.md',
    'docs/01_prd/0025_rem0539_r4_integrations_ops.md',
    'docs/01_prd/0026_rem0539_r5_qualification.md',
    'docs/01_prd/0027_harness_refoundation.md',
    'docs/01_prd/0028_m07_package_dependencies.md',
    'docs/01_prd/0090_prd_validation.md',
    'docs/platform/00-current-state-discovery.md',
    'docs/platform/05-platform-prd.md',
    'docs/platform/08-security-release-boundary.md',
    'docs/platform/09-personal-data-inventory.md',
    'docs/platform/10-ripd-template.md',
    'docs/refoundation/PHASE_0_1_TASK.md',
    'docs/refoundation/PHASE_0_1_REPORT.md',
    'docs/architecture/PUBLIC_API.md',
    'docs/02_spec/0149_operator_auth_purge.md',
    'docs/03_build/0354_production_executive_plan_2026-09-26.md',
    'docs/03_build/0355_production_roadmap_2026-09-26.md',
    'docs/03_build/0356_production_backlog_2026-09-26.md',
    'docs/03_build/0357_production_decision_packet_2026-09-26.md',
    'docs/03_build/0363_program_roadmap_2026-09-30.md',
    'docs/03_build/0364_program_backlog_2026-09-30.md',
    'docs/04_audit/0591_repository_audit_2026-09-30.md',
    'docs/04_audit/evidence/AUD-20260923/P1-S1/human-decisions-20260923.md',
    'docs/04_audit/evidence/AUD-20260923/M07-PRD/human-decision-20260923.md',
    'docs/04_audit/evidence/AUD0591-PLAN-20260930/README.md',
    'packages/contracts/src/contracts.ts',
    'packages/harness/src/createOperationalHarness.ts',
    'packages/harness/src/execution-spine.ts',
    'apps/worker/src/operational-harness-worker.ts',
]
FROZEN = [
    'docs/02_spec/0166_governed_context_response_budget.md',
    'docs/02_spec/0167_policy_prompt_approval_knowledge_audit.md',
    'docs/04_audit/evidence/UP91-EXEC-20260930/spec-packets/review-packet.md',
]


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    return digest_bytes((ROOT / path).read_bytes())


def dump(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def parse_cards(path, kind):
    s = (ROOT / path).read_text()
    headers = list(re.finditer(r'^#{2,4} .+$', s, re.M))
    result = []
    for n, header in enumerate(headers):
        match = re.match(r'^### (' + kind + r') — (.+)$', header[0])
        if not match:
            continue
        end = headers[n + 1].start() if n + 1 < len(headers) else len(s)
        # A PR parent owns its H4 subcards; retain those bytes in its snapshot.
        if kind.startswith('PR'):
            end = next((h.start() for h in headers[n + 1:]
                        if not h[0].startswith('#### ')), len(s))
        original = s[header.start():end]
        priority = re.search(r'\bP[012](?:-R)?\b', match[2] if kind.startswith('PR') else original)
        acceptance = re.search(r'^- (?:\*\*)?Pronto[^\n]*(?:\n(?!- |#{2,4} ).*)*', original, re.M)
        result.append(dict(id=match[1], title=match[2], priority=priority[0],
                           path=path, line=s.count('\n', 0, header.start()) + 1,
                           originalText=original, originalSha256=digest_bytes(original.encode()),
                           acceptanceText=acceptance[0] if acceptance else None,
                           acceptanceAbsentInCurrentSource=acceptance is None))
    return result


def cycles(graph):
    active = []
    done = set()
    found = []
    def visit(node):
        if node in active:
            found.append(active[active.index(node):] + [node])
            return
        if node in done:
            return
        active.append(node)
        for dep in graph[node]:
            visit(dep)
        active.pop()
        done.add(node)
    for node in graph:
        visit(node)
    return found


def release_edges(pr):
    c709 = next(c for c in pr if c['id'] == 'PR-709')
    return [
        dict(**{'from': 'GO_D15'}, requires='G03', kind='explicit_gate',
             source='docs/03_build/0354_production_executive_plan_2026-09-26.md:40',
             reason='Candidato só recebe GO quando todas as condições valem.'),
        dict(**{'from': 'G03'}, requires='PR-709_COMPLETE', kind='literal_priority_application',
             source='docs/03_build/0354_production_executive_plan_2026-09-26.md:47',
             reason='Zero itens P0/P1 abertos em0356; PR709 éP1 e não há exceção.'),
        dict(**{'from': 'PR-709_COMPLETE'}, requires='GA', kind='explicit_temporal_order',
             source=c709['path'] + ':' + str(c709['line']), reason=c709['title']),
        dict(**{'from': 'GA'}, requires='GO_D15', kind='grounded_semantic_interpretation',
             source='docs/03_build/0355_production_roadmap_2026-09-26.md:127',
             reason='M-GA: D-15 aprovado. Se GA tiver outro significado, titular precisa definir/revisar o marco.'),
    ]


def capture():
    assert not (OUT / 'source-manifest.json').exists(), 'Never overwrite a captured baseline.'
    sources = [dict(path=p, sha256=sha(p), bytes=(ROOT / p).stat().st_size) for p in SOURCE_PATHS]
    manifest = dict(schemaVersion=1, capturedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    authority='IMMUTABLE_DOCUMENTARY_SNAPSHOT_NOT_APPROVAL_OR_BACKLOG',
                    sources=sources, frozenCriticInputs=[dict(path=p, sha256=sha(p)) for p in FROZEN])
    pr = parse_cards('docs/03_build/0356_production_backlog_2026-09-26.md', r'PR-[A-Z0-9-]+')
    up = parse_cards('docs/03_build/0364_program_backlog_2026-09-30.md', r'UP91-\d{3}')
    assert len(pr) == 83 and len(up) == 52
    for card in up:
        raw = card['originalText']
        dependencies = re.search(r'^- \*\*Dependências:\*\* (.+)$', raw, re.M)[1]
        origins = re.search(r'^- \*\*Rastreio:\*\* tasks de origem([^;]+)', raw, re.M)[1]
        card['dependencies'] = re.findall(r'UP91-\d{3}', dependencies)
        card['origins'] = re.findall(r'PR-[A-Z0-9-]+', origins)
    mapped = {o for c in up for o in c['origins']}
    assert mapped == {c['id'] for c in pr}, (mapped.symmetric_difference({c['id'] for c in pr}))
    graph = {c['id']: c['dependencies'] for c in up}
    assert not cycles(graph)
    supplementary = re.findall(r'^#### (PR-\S+)', (ROOT / pr[0]['path']).read_text(), re.M)
    plan = (ROOT / 'docs/03_build/0354_production_executive_plan_2026-09-26.md').read_text()
    gate_section = plan.split('## 2. Definição de pronto para produção\n')[1].split('\n## 3.')[0]
    gate_matches = list(re.finditer(r'^(\d+)\. (.*(?:\n {3,}.*)*)', gate_section, re.M))
    gates = [dict(id=f'G{int(m[1]):02}', originalText=m[0],
                  sha256=digest_bytes(m[0].encode())) for m in gate_matches]
    assert len(gates) == 13
    dump('source-manifest.json', manifest)
    dump('task-source-proof.json', dict(schemaVersion=1, status='SNAPSHOT_NOT_CANONICAL_STATUS',
         prCards=pr, upCards=up, supplementalH4=supplementary, gates=gates,
         counts=dict(pr=83, up=52, gates=13, priorities=dict(collections.Counter(c['priority'] for c in pr))),
         explicitUpDagCycles=cycles(graph), literalReleaseCycle=['GO_D15', 'G03', 'PR-709_COMPLETE', 'GA', 'GO_D15'],
         releaseDependencyEdges=release_edges(pr),
         cycleInterpretation='Required-before edges; GA means M-GA/D-15 in 0355. Temporal cycle, not a cycle in explicit UP91 DAG.'))
    rows = ['# Matriz imutável das 83 origens e das 52 unidades', '',
            'Fotografia de leitura, não backlog ou adjudicação de estado. Aceites e bytes originais completos estão em [task-source-proof.json](task-source-proof.json). Uma origem concluída pode ser integrada/revalidada sem reabrir sua implementação. Os 52 cartões e dependências constam no mesmo JSON.', '',
            '| Origem | Prioridade da origem | Fonte e linha | Encaminhamento 0364 |',
            '| --- | --- | --- | --- |']
    for c in pr:
        targets = ', '.join(u['id'] for u in up if c['id'] in u['origins'])
        rows.append(f"| {c['id']} | {c['priority']} | [0356:{c['line']}](../../../../03_build/0356_production_backlog_2026-09-26.md:{c['line']}) | {targets} |")
    rows += ['', 'Os H4 PR-301-WEBHOOK-REPLAY-SCHEMA e PR-301-WEBHOOK-CLOCK-GUARD estão preservados dentro do cartão PR-301-WEBHOOK-REPLAY e não são contados de novo. Nove cartões sem linha padronizada `- Pronto` no texto corrente recebem acceptanceText=null; critérios em outras formas e seus bytes completos permanecem na prova, sem inventar aceite histórico.']
    (OUT / 'task-source-matrix.md').write_text('\n'.join(rows) + '\n')


def check():
    manifest = json.loads((OUT / 'source-manifest.json').read_text())
    proof = json.loads((OUT / 'task-source-proof.json').read_text())
    errors = []
    for key, count in [('prCards', 83), ('upCards', 52), ('gates', 13)]:
        if len(proof[key]) != count:
            errors.append(f'{key} count mismatch')
    for card in proof['prCards'] + proof['upCards']:
        if digest_bytes(card['originalText'].encode()) != card['originalSha256']:
            errors.append(f"snapshot bytes changed: {card['id']}")
        if card['acceptanceText'] and card['acceptanceText'] not in card['originalText']:
            errors.append(f"acceptance bytes changed: {card['id']}")
    for gate in proof['gates']:
        if digest_bytes(gate['originalText'].encode()) != gate['sha256']:
            errors.append('gate snapshot bytes changed: ' + gate['id'])
    pr_ids = {c['id'] for c in proof['prCards']}
    up_ids = {c['id'] for c in proof['upCards']}
    origins = {o for c in proof['upCards'] for o in c['origins']}
    if len(pr_ids) != 83 or len(up_ids) != 52 or origins != pr_ids:
        errors.append('duplicate or unrouted IDs')
    graph = {c['id']: c['dependencies'] for c in proof['upCards']}
    if any(d not in graph for ds in graph.values() for d in ds) or cycles(graph):
        errors.append('invalid explicit UP91 DAG')
    if proof['literalReleaseCycle'] != ['GO_D15', 'G03', 'PR-709_COMPLETE', 'GA', 'GO_D15']:
        errors.append('release-cycle witness mismatch')
    c709 = next(c for c in proof['prCards'] if c['id'] == 'PR-709')
    u051 = next(c for c in proof['upCards'] if c['id'] == 'UP91-051')
    g03 = next(g for g in proof['gates'] if g['id'] == 'G03')
    if (c709['priority'] != 'P1' or '30 dias pós-GA' not in c709['title']
            or 'UP91-050' not in u051['dependencies'] or 'PR-709' not in u051['origins']
            or g03['originalText'] != '3. Zero itens P0/P1 abertos em 0356.'
            or proof['releaseDependencyEdges'] != release_edges(proof['prCards'])):
        errors.append('temporal witness not supported by source snapshot')
    temporal = {}
    for edge in proof['releaseDependencyEdges']:
        temporal.setdefault(edge['from'], []).append(edge['requires'])
        temporal.setdefault(edge['requires'], [])
    temporal_cycles = cycles(temporal)
    if temporal_cycles != [proof['literalReleaseCycle']]:
        errors.append('temporal dependency graph lacks recorded cycle')
    structural_errors = list(errors)
    drift = [dict(path=p['path'], captured=p['sha256'], current=sha(p['path']))
             for p in manifest['sources'] if sha(p['path']) != p['sha256']]
    frozen_drift = [p['path'] for p in manifest['frozenCriticInputs'] if sha(p['path']) != p['sha256']]
    if frozen_drift:
        errors.append('frozen critic input drift: ' + ', '.join(frozen_drift))
    result = dict(status='PASS' if not errors else 'FAIL', sourceCount=len(manifest['sources']),
                  documentaryStructure='PASS' if not structural_errors else 'FAIL',
                  frozenInputCheck='FAIL' if frozen_drift else 'PASS',
                  counts=proof['counts'], coveredOrigins=len(origins), explicitUpDagCycles=cycles(graph),
                  releaseTemporalCycle=proof['literalReleaseCycle'], sourceDrift=drift,
                  computedTemporalCycles=temporal_cycles,
                  frozenCriticInputsUnchanged=not frozen_drift, errors=errors,
                  limitations='Static documentary proof only. Source drift requires review before gate use; no product tests or approval.')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--capture', action='store_true')
    args = parser.parse_args()
    if args.capture:
        capture()
    raise SystemExit(check())
