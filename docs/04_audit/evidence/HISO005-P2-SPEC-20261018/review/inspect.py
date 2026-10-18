"""Read only source/evidence inspection; never import or execute target code."""
import collections
import datetime
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
CANDIDATE = Path('/home/ricardo/cvg-candidates/hiso005-0234-20261017')
P2 = ROOT / 'docs/04_audit/evidence/HISO005-P2-SPEC-20261018'
P1 = ROOT / 'docs/04_audit/evidence/HISO005-0234-BUILD-20261017'
OUT = P2 / 'review'
inputs = {}


def read(p):
    p = Path(p)
    data = p.read_bytes()
    inputs[str(p)] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    return data


def emit(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')


fixed = [
    'AGENTS.md', 'docs/07_agents/AGENTS.md', 'docs/08_runtime/agent_coordination.md',
    'docs/99_runtime_state.md', 'docs/20_master_execution_log.md', 'docs/30_backlog_master.md',
    'docs/architecture/adrs/ADR-010-harness-product-isolation.md',
    'docs/02_spec/0228_b6_boundary_fail_closed_remediation.md',
    'docs/02_spec/0234_b6_installed_content_identity.md',
    'docs/02_spec/0236_b6_semantic_boundary_proof.md',
    'docs/03_build/0391_hiso005_semantic_proof_execution.md',
]
for name in fixed:
    read(ROOT / name)
for name in ['REPORT.md', 'consumer-build-receipt.json']:
    read(P1 / name)
for name in [
    'scripts/check-product-boundary.mjs', 'scripts/boundary-code-execution.mjs',
    'scripts/build-public-workspace.mjs', 'packages/shared/src/lifecycle.ts',
    'package.json', 'tsconfig.base.json', 'packages/contracts/tsconfig.json',
    'packages/shared/tsconfig.json', 'packages/contracts/package.json',
]:
    read(CANDIDATE / name)
read(P2 / 'recon.mjs')
r = json.loads(read(P2 / 'recon.json'))
report = json.loads(gzip.decompress(read(P1 / 'boundary-final-normal.json.gz')))
graph = json.loads(gzip.decompress(read(P1 / 'boundary-final-normal-graph.json.gz')))
errors = []
for name, digest in r['inputs'].items():
    if inputs[str(P1 / name)]['sha256'] != digest:
        errors.append('frozen input hash mismatch: ' + name)
read(Path(r['compiler']['path']))
if inputs[r['compiler']['path']]['sha256'] != r['compiler']['sha256']:
    errors.append('compiler hash mismatch')
for row in r['parsedFirstPartySources']:
    data = read(CANDIDATE / row['file'])
    if hashlib.sha256(data).hexdigest() != row['sha256']:
        errors.append('first party source drift: ' + row['file'])
for row in r['firstParty']:
    index = int(row['id'].split('-')[1]) - 1
    if report['diagnostics'][index] != row['diagnostic']:
        errors.append('occurrence index mismatch: ' + row['id'])
    file = row['diagnostic']['file'].rsplit(':', 1)[0]
    source = (CANDIDATE / file).read_text().encode('utf-16-le')
    for node in row['matchingNodes']:
        text = source[node['start'] * 2:node['end'] * 2].decode('utf-16-le')
        digest = hashlib.sha256(' '.join(text.split()).encode()).hexdigest()[:16]
        if text != node['text'] or digest != node['digest']:
            errors.append('recorded node text/digest mismatch: ' + row['id'])
installed_files = 0
installed_bytes = 0
graph_packages = {x['node'][:-len('/package.json')]: x for x in graph['installed']}
for row in r['installed']:
    original = graph_packages[row['key']]
    if original['contentIdentity']['status'] != row['identity'] or original['verified']:
        errors.append('installed identity mismatch: ' + row['key'])
    inventory = {e['path']: e for e in original['contentIdentity']['inventory']['evaluated']['entries']}
    for file in row['files']:
        data = read(CANDIDATE / row['key'] / file['path'])
        installed_files += 1
        installed_bytes += len(data)
        digest = hashlib.sha256(data).hexdigest()
        if digest != file.get('sha256') or digest != inventory[file['path']]['sha256']:
            errors.append('installed source drift: ' + row['key'] + '/' + file['path'])
reasons = dict(sorted(collections.Counter(d['reason'] for d in report['diagnostics']).items()))
ambiguous = [x for x in r['firstParty'] if len(x['matchingNodes']) > 1]
result = {
    'kind': 'read-only-evidence-and-source-recomputation',
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'PASS' if not errors else 'FAIL', 'errors': errors,
    'reportStatus': report['status'], 'diagnostics': len(report['diagnostics']),
    'diagnosticReasons': reasons, 'installedNodes': len(graph['installed']),
    'installedIdentity': dict(collections.Counter(x['identity'] for x in r['installed'])),
    'firstPartyOccurrences': len(r['firstParty']),
    'firstPartyFiles': len(r['parsedFirstPartySources']),
    'installedJsFilesHashed': installed_files, 'installedJsBytesHashed': installed_bytes,
    'ambiguousOccurrenceCount': len(ambiguous),
    'ambiguousOccurrences': [{'id': x['id'], 'diagnostic': x['diagnostic'],
        'candidates': [{k: n[k] for k in ['kind', 'start', 'end']} for n in x['matchingNodes']]}
        for x in ambiguous],
    'duplicateDiagnosticExamples': [x for x in r['firstParty'] if x['id'] in ['DIAG-0002', 'DIAG-0003']],
    'limitations': [
        'No AST parser or installed application code executed; recorded spans/text/digests were checked against source bytes.',
        'Parse counts and syntax observation totals are census observations, not independently reparsed here.',
        'Only the 8036 censused JS files and 42 first party files were rehashed; no new whole-package content-identity proof.',
        'No tests/gates/install/network/PG/Git index/commits; no integration-preflight judgment.',
    ],
}
emit('input-hashes.json', dict(sorted(inputs.items())))
emit('inspection.json', result)
print(json.dumps({k: v for k, v in result.items() if k not in ['ambiguousOccurrences', 'duplicateDiagnosticExamples']}, indent=2))
