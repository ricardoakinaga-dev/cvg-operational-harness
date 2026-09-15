"""Validate the AAA planning DAG; optionally regenerate its Markdown view."""
from pathlib import Path
import argparse
import json

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
args = parser.parse_args()
path = root / 'docs/03_build/tracking/aaa_program_backlog.json'
data = json.loads(path.read_text())
tasks, areas = data['tasks'], data['areas']
ids = [t['id'] for t in tasks]
assert len(ids) == len(set(ids)), 'duplicate task IDs'
assert len(ids) == 42, 'expected 42 tasks'
by_id = {t['id']: t for t in tasks}
visiting, visited = set(), set()
def visit(ident):
    assert ident not in visiting, f'cycle at {ident}'
    if ident in visited:
        return
    assert ident in by_id, f'unknown dependency {ident}'
    visiting.add(ident)
    for dep in by_id[ident]['dependencies']:
        visit(dep)
    visiting.remove(ident)
    visited.add(ident)
for ident in ids:
    visit(ident)
expected_areas = {f'A{i:02}' for i in range(1, 21)}
expected_findings = {f'AUD-20260912-F{i:02}' for i in range(1, 16)}
assert {a['id'] for a in areas} == expected_areas
assert set(x for t in tasks for x in t['areas']) == expected_areas
assert set(x for t in tasks for x in t['findings']) == expected_findings
for a in areas:
    assert set(a['tasks']) == {t['id'] for t in tasks if a['id'] in t['areas']}
for t in tasks:
    for field in ['title', 'phase', 'sprint', 'role', 'status', 'gate', 'inputs',
                  'ownedPaths', 'forbiddenPaths', 'resourceLocks', 'contract',
                  'implementation', 'acceptance', 'validation', 'expectedEvidence',
                  'review', 'risk', 'estimate', 'rollback', 'buildAuthorization']:
        assert t.get(field), f"missing {field} in {t['id']}"
    assert t['sprint'] == 'S' + t['phase'][-1]
    for dep in t['dependencies']:
        assert int(by_id[dep]['phase'][1:]) <= int(t['phase'][1:]), f'phase inversion {dep} -> {t["id"]}'
    if t['status'] == 'READY':
        assert all(by_id[d]['status'] in ['VERIFIED', 'DONE'] for d in t['dependencies'])
for n in [10, 12, 21]:
    assert 'AAA-16' in by_id[f'AAA-{n:02}']['dependencies'], 'PostgreSQL prerequisite omitted'
assert 'AAA-06' in by_id['AAA-19']['dependencies'], 'consumer contract prerequisite omitted'
for t in tasks:
    assert t['gate'] in data['gates'], 'unknown gate'
    if int(t['id'].split('-')[1]) >= 7:
        assert 'AAA-04' in t['dependencies'], 'quality bar prerequisite omitted'
assert set(['AAA-36', 'AAA-40']) <= set(by_id['AAA-41']['dependencies'])
assert 'AAA-41' in by_id['AAA-37']['dependencies']
assert data['executionAuthorization'] == 'DOCUMENTATION_AND_PLANNING_ONLY'
assert data['maxActiveAgents'] == 4
assert sum(data['defaultTopology'].values()) == 4
assert all(t['buildAuthorization'] == 'NOT_GRANTED_BY_THIS_PLANNING_DELIVERY' for t in tasks)
if args.render:
    lines=['# 0326 — Backlog executável do programa AAA','','Fonte canônica de IDs, status, dependências e contratos: [aaa_program_backlog.json](tracking/aaa_program_backlog.json). Esta visualização foi gerada a partir do JSON em 2026-09-12; atualizar o JSON primeiro e regenerar o índice para evitar duas fontes de status.','','**42 tasks no programa; status corrente no JSON e no ledger vivo.** Consultar [rodada 2](0327_aaa_round2_coordination.md): AAA-01 VERIFIED apenas no baseline histórico; reviews e implementações observadas não concedem gates de BUILD. A equipe vigente tem três agentes, com revisão alternada. O baseline original de quatro slots permanece histórico.','','## Contrato comum de execução','','Cada entrada JSON especifica objetivo, onde, como, dependências, área/achado de origem, papel, ownership, locks, aceite, validação e destino de evidência. Paths propostos devem ser confirmados antes de congelar a SPEC; um diretório amplo não autoriza escrita concorrente. Gate da task é adicional ao gate de SPEC/revisão humana e autorização de BUILD.','','Estados por task: `PENDING → READY → RUNNING → IMPLEMENTED → REVIEW → VERIFIED → DONE`; `REWORK`, `BLOCKED` e `FAILED` preservam tentativas. Estado operacional global continua seguindo os cinco estados oficiais do AGENTS. Builders só entregam `IMPLEMENTED`; crítico e integrador comprovam os demais.','','Estimativas são classes de esforço provisórias, não prazo prometido. Limite inicial: duas tentativas corretivas por hipótese; depois replanejar com nova evidência, sem diminuir a barra. Todo writer reserva paths reais, schema/porta/banco/artefatos e lockfile antes de começar.','','## Matriz de cobertura das 20 dimensões','','| Área | Baseline | Alvo | Tasks |','|---|---:|---:|---|']
    for a in areas: lines.append(f"| {a['id']} — {a['name']} | {a['baseline']} | {a['target']} | {', '.join(a['tasks'])} |")
    lines+=['','## Tasks detalhadas','']
    for t in tasks:
        lines += [f"### {t['id']} — {t['title']}",'',f"- Fase/sprint: `{t['phase']}/{t['sprint']}`. Papel: `{t['role']}`. Prioridade: `{t['priority']}`.",f"- Origem: {', '.join(t['areas']+t['findings']+t['legacyRefs'])}.",f"- Dependências: {', '.join(t['dependencies']) or 'nenhuma task; ler baseline e instruções'}. Gate adicional: `{t['gate']}`.",f"- Onde: {'; '.join('`'+p+'`' for p in t['ownedPaths'])}.",f"- Como: {t['implementation']}",f"- Aceite: {' '.join(t['acceptance'])}",f"- Verificação: {'; '.join(t['validation'])}.",f"- Evidência esperada: `{t['expectedEvidence']}`.",f"- Locks: {', '.join(t['resourceLocks'])}. Contrato proposto: `{t['contract']}`; congelar SPEC/hash antes da execução.",'']
    lines += ['## Handoff pronto para um agente','','```text','TASK: AAA-XX (copiar entrada completa do JSON canônico)','ROLE: especialista da task; executar diretamente, sem redelegar','INPUTS: AGENTS + estado + SPEC/hash congelado + dependências VERIFIED/DONE','AUTHORITY: citar autorização de BUILD; fixture sintética; sem efeitos reais','OWNERSHIP: paths exatos e recursos reservados pelo lead; restante proibido','OUTPUT: IMPLEMENTED ou BLOCKED; diff + comandos/exit codes + evidências sanitizadas','REVIEW: crítico fresco reexecuta critérios; builder não emite DONE','FAILURE: preservar reprodução; hipótese + tentativa + próximo teste discriminante','```','','Antes de usar tooling `orchestrate` em BUILD, instanciar o ledger vivo no schema exigido pela versão instalada da skill e validá-lo com seu validador. O JSON deste planejamento não finge conter processos em execução, contratos congelados ou provas terminais.','']
    (root/'docs/03_build/0326_aaa_backlog.md').write_text('\n'.join(lines))

text = (root / 'docs/03_build/0326_aaa_backlog.md').read_text()
assert all(('### ' + ident + ' —') in text for ident in ids)
print(json.dumps({'status': 'PASS', 'tasks': len(tasks), 'areas': len(areas),
                  'findings': len(expected_findings), 'dag': 'acyclic',
                  'authority': 'planning only', 'productQualified': False}))
