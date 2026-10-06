"""Validate this planning snapshot; writes only its own validation evidence."""
from pathlib import Path
import json
import re
import hashlib
from datetime import datetime, timezone

EVIDENCE = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[4]
model = json.loads((EVIDENCE / 'execution-map.json').read_text())
backlog = (ROOT / 'docs/03_build/0364_program_backlog_2026-09-30.md').read_text()
roadmap = (ROOT / 'docs/03_build/0363_program_roadmap_2026-09-30.md').read_text()
audit = (ROOT / 'docs/04_audit/0591_repository_audit_2026-09-30.md').read_text()
canonical = (ROOT / 'docs/03_build/0356_production_backlog_2026-09-26.md').read_text()
scorecard = json.loads((ROOT / 'docs/04_audit/evidence/AUD0591-REPOSITORY-20260930/scorecard.json').read_text())
errors = []

def require(condition, description):
    if not condition:
        errors.append(description)

cards = re.split(r'(?=^### UP91-\d{3} — )', backlog, flags=re.M)[1:]
require(len(cards) == 52, 'backlog must contain exactly 52 task contracts')
by_id = {}
for card in cards:
    identifier = re.match(r'### (UP91-\d{3})', card).group(1)
    card = card.split('\n## Encaminhamento')[0]
    require(identifier not in by_id, f'duplicate task {identifier}')
    dependency = re.search(r'\*\*Dependências:\*\*([^\n]*)', card)
    require(dependency is not None, f'missing dependency field: {identifier}')
    by_id[identifier] = {
        'text': card,
        'dependencies': re.findall(r'UP91-\d{3}', dependency.group(1)) if dependency else []
    }

source_ids = set(re.findall(r'^### (PR-[A-Z0-9-]+) — ', canonical, re.M))
expected_ids = {row['id'] for row in model['tasks']}
require(set(by_id) == expected_ids, 'task IDs differ from published planning snapshot')
require(len(source_ids) == 83, 'canonical source must contain 83 original task IDs')
require(source_ids == {row['id'] for row in model['existingSourceTasks']}, 'original task map incomplete')
for row in model['tasks']:
    identifier = row['id']
    current = by_id.get(identifier, {'text': '', 'dependencies': []})
    require(current['dependencies'] == row['dependencies'], f'dependency snapshot mismatch: {identifier}')
    require(all(dependency in by_id for dependency in current['dependencies']), f'unknown prerequisite: {identifier}')
    require(identifier not in current['dependencies'], f'self dependency: {identifier}')
    require(row['status'] == 'PROPOSED' and f"`{row['status']}`" in current['text'], f'initial status mismatch: {identifier}')
    require(re.search(r'`'+re.escape(row['status'])+r'`\s*·\s*'+re.escape(row['priority'])+r'\s*·\s*'+re.escape(row['phase'])+r'\b', current['text']) is not None, f'priority/phase mismatch: {identifier}')
    for field in ['Responsável sugerido', 'O quê/onde', 'Como', 'Gate/autoridade', 'Próxima ação', 'Pronto/prova específica', 'Rastreio']:
        require(f'**{field}:**' in current['text'], f'missing executable field {field}: {identifier}')
    for field in ['sourceTasks', 'findings', 'criteria', 'releaseGates']:
        require(all(item in current['text'] for item in row[field]), f'trace references missing: {identifier}/{field}')
    require(all(item in source_ids for item in row['sourceTasks']), f'unknown original source task: {identifier}')

order, visited, active = [], set(), set()
def visit(identifier):
    if identifier in active:
        errors.append(f'dependency cycle at {identifier}')
        return
    if identifier in visited:
        return
    active.add(identifier)
    for dependency in by_id[identifier]['dependencies']:
        if dependency in by_id:
            visit(dependency)
    active.remove(identifier)
    visited.add(identifier)
    order.append(identifier)
for identifier in by_id:
    visit(identifier)

expected_findings = set(re.findall(r'^### (A91-\d{2}) — ', audit, re.M))
expected_criteria = {item['id'] for item in scorecard['criteria']}
expected_gates = {item['id'] for item in scorecard['productionGates']}
for field, expected in [('findings', expected_findings), ('criteria', expected_criteria), ('releaseGates', expected_gates), ('sourceTasks', source_ids)]:
    observed = {item for task in model['tasks'] for item in task[field]}
    require(observed == expected, f'coverage missing or unknown for {field}: {sorted(expected-observed)} / {sorted(observed-expected)}')
for row in model['existingSourceTasks']:
    require(f"| {row['id']} " in backlog, f'original task missing from crosswalk: {row["id"]}')
    require(bool(row['mappedWork']), f'original task not assigned: {row["id"]}')
    require(all(item in by_id for item in row['mappedWork']), f'unknown crosswalk target: {row["id"]}')
require(set(task['phase'] for task in model['tasks']) == {f'M{n}' for n in range(10)}, 'must cover all 10 roadmap milestones')
for gate in expected_gates:
    require(re.search(r'\| '+gate+r'\s*\|', roadmap) is not None, f'gate not represented in roadmap: {gate}')
require('NO_GO' in roadmap and 'NO_GO' in backlog, 'planning must not grant release')
require('UP91-021' in by_id['UP91-045']['dependencies'], 'original P1 refactors must remain release qualification prerequisite')
require('Zero itens P0/P1 abertos em' in roadmap, 'G03 original zero P0/P1 requirement must remain explicit')
require('não novas execuções' in roadmap, 'runtime checks must remain attributed to earlier audit')
result = {
    'task': 'AUD0591-PLAN-001',
    'checkedUtc': datetime.now(timezone.utc).isoformat(),
    'verdict': 'PASS' if not errors else 'FAIL',
    'kind': 'planning structure and traceability, not product execution or release qualification',
    'counts': {'tasks': len(by_id), 'milestones': 10, 'findings': len(expected_findings), 'criteria': len(expected_criteria), 'releaseGates': len(expected_gates), 'originalSourceTasks': len(source_ids)},
    'acyclic': not any('cycle' in error for error in errors),
    'topologicalOrder': order,
    'inputs': [{'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in [ROOT/'docs/03_build/0363_program_roadmap_2026-09-30.md', ROOT/'docs/03_build/0364_program_backlog_2026-09-30.md', EVIDENCE/'execution-map.json']],
    'errors': errors
}
(EVIDENCE / 'traceability-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'verdict': result['verdict'], 'counts': result['counts'], 'acyclic': result['acyclic'], 'errors': errors}, ensure_ascii=False))
raise SystemExit(0 if not errors else 1)
