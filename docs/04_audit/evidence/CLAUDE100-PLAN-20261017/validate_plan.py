"""Read-only structural validation of the documentary Claude100 planning package.

This does not test the harness or qualify functional parity.
"""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[4]
ev = Path(__file__).resolve().parent
catalog_path = root / 'docs/03_build/tracking/claude100_catalog_v1.json'
catalog = json.loads(catalog_path.read_text())
index = json.loads((ev / 'plan-index.json').read_text())
baseline = json.loads((ev / 'baseline.json').read_text())
manifest = json.loads((ev / 'review-inputs.json').read_text())
parents = json.loads((root / 'docs/04_audit/evidence/REA-CLAUDE-20261017/capability-matrix.json').read_text())['features']
backlog_path = root / 'docs/03_build/0383_backlog_paridade_claude_code.md'
backlog = backlog_path.read_text()
par_text = (root / 'docs/03_build/0380_backlog_paridade_100_deepseek.md').read_text()
issues = []

def check(condition, message):
    if not condition:
        issues.append(message)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

parts = re.split(r'^### (PAR-[A-Z]\d+) — (.+)$', par_text, flags=re.M)
pars = {}
for i in range(1, len(parts), 3):
    body = parts[i+2]
    deps = re.search(r'^- Depende de: (.+)$', body, re.M)
    size = re.search(r'tamanho (GG|G|M|P)\b', body)
    pars[parts[i]] = {'dependencies': re.findall(r'PAR-[A-Z]\d+', deps.group(1)) if deps else [], 'size': size.group(1)}
tasks = {t['id']:t for t in index['tasks']}
requirements = catalog['requirements']
families = catalog['families']
check(len(tasks) == len(index['tasks']) == 37, 'Duplicate or missing C100 card')
check(len(requirements) == catalog['mandatory_requirement_count'] == 134, 'Mandatory requirement count mismatch')
comparative=[r for r in requirements if r['verification_class']=='FUNCTIONAL_PARITY']
controls=[r for r in requirements if r['verification_class']=='CVG_CONTROL']
check(len(comparative)==catalog['denominator']==117,'Functional denominator mismatch')
check(len(controls)==catalog['mandatory_cvg_control_count']==17,'Mandatory control count mismatch')
check(len({r['id'] for r in requirements}) == len(requirements), 'Duplicate requirement ID')
check({f['id'] for f in families} == {f['id'] for f in parents}, 'Original 16 families not preserved')
check(catalog['numerator_pass_current'] == 0, 'Unexpected parity qualification claim')
check(catalog['status'] == 'DRAFT_PENDING_REFERENCE_VALIDATION', 'Reference validation represented as already completed')
check(index['catalog_sha256'] == digest(catalog_path), 'Derived index has stale catalog identity')
check(len(pars) == 111, 'Canonical PAR cards altered or unparsable')

for r in requirements:
    check(r['required'] is True, 'Silent scope exclusion: '+r['id'])
    check(r['evidence_status'] == 'NOT_RUN' and not r['evidence_refs'], 'Invented evidence: '+r['id'])
    if r['verification_class']=='FUNCTIONAL_PARITY':
        check(r['source']['reference_validation'] == 'NOT_RUN','Reference qualification invented: '+r['id'])
        check('reference identity and raw observation' in r['evidence_required'],'Missing comparative oracle: '+r['id'])
    else:
        check(r['source']['reference_validation']=='NOT_REQUIRED_CVG_CONTROL','Impossible reference requirement on CVG control: '+r['id'])
        check('reference identity and raw observation' not in r['evidence_required'],'CVG control incorrectly requires Claude internals: '+r['id'])
        check('approved CVG requirement/SPEC' in r['evidence_required'],'CVG control lacks approved normative rule: '+r['id'])
    check(bool(r['source']['anchor']) and bool(r['positive_procedure']) and bool(r['negative_procedure']), 'Missing source/test procedure: '+r['id'])
    owner = r['implementation_owner']
    check(owner in set(tasks) | set(pars), 'Orphan requirement: '+r['id'])
    check(r['id'] in backlog, 'Requirement missing from human backlog: '+r['id'])
    check((root / r['owner_status_ref']).is_file(), 'Owner status source missing: '+r['id'])
for f in families:
    actual = {r['id'] for r in requirements if r['family_id'] == f['id']}
    check(bool(actual) and actual == set(f['requirements']), 'Family membership differs: '+f['id'])
    check(f['verified_current'] == 0, 'Family verification invented: '+f['id'])

sections = re.split(r'^### (C100-[A-Z]\d+) — (.+)$', backlog, flags=re.M)
human = {sections[i]:sections[i+2] for i in range(1,len(sections),3)}
check(set(human) == set(tasks), 'Human/machine task set mismatch')
for ident, t in tasks.items():
    body = human[ident]
    human_deps = re.search(r'^- Depende C100: (.+)$', body, re.M)
    check(human_deps is not None, 'Missing dependencies in '+ident)
    check(set(re.findall(r'C100-[A-Z]\d+',human_deps.group(1))) == set(t['dependencies']), 'Dependency projection mismatch: '+ident)
    for value in ['Onde:', 'Como:', 'Aceite:', 'Próxima ação:', 'Dono proposto:', 'Prova:']:
        check(value in body, 'Missing task contract '+value+' in '+ident)
    check(all(d in tasks for d in t['dependencies']), 'Unknown C100 dependency '+ident)
    check(all(p in pars for p in t['reuse']+t.get('optional_reuse',[])), 'Unknown PAR dependency '+ident)
    check(not set(t['reuse']) & set(t.get('optional_reuse',[])), 'Optional carrier also mandatory: '+ident)

direct = {r['implementation_owner'] for r in requirements if r['implementation_owner'].startswith('PAR-')} | {p for t in tasks.values() for p in t['reuse']}
closure = set(direct)
queue = list(closure)
while queue:
    for dep in pars[queue.pop()]['dependencies']:
        if dep not in closure:
            closure.add(dep); queue.append(dep)
check(direct == set(index['direct_reuse']) and len(direct)==53,'Direct reuses differ')
check(closure == set(index['inherited_dependency_closure']) and len(closure)==58,'Dependency closure differs')

graph={p:pars[p]['dependencies'] for p in closure}
graph.update({key:t['dependencies']+t['reuse'] for key,t in tasks.items()})
visited=set(); visiting=set()
def walk(node):
    if node in visiting:
        raise ValueError('Cycle at '+node)
    if node in visited:
        return
    visiting.add(node)
    for dep in graph[node]:
        walk(dep)
    visiting.remove(node);visited.add(node)
try:
    walk('C100-Q05')
except (ValueError, KeyError) as error:
    issues.append(str(error))
check(visited==set(graph),'Final qualification has unconnected mandatory task/dependency')
def ancestors(node):
    values=set()
    def collect(key):
        for dep in graph[key]:
            if dep not in values:
                values.add(dep);collect(dep)
    collect(node)
    return values
for task_id,t in tasks.items():
    if t['phase']>=2:
        check('C100-Q01' in ancestors(task_id),'Consumer does not inherit M1 gate: '+task_id)
check({'PAR-K01','PAR-K03','PAR-S01','PAR-X01','PAR-X02','PAR-X03','PAR-X04'} <= ancestors('C100-Q01'),'M1 foundation is not encoded')
check('C100-W01' in ancestors('C100-O02'),'Background removal precedes worktree ownership')
check('conhecido correto PASS' in tasks['C100-Q01']['acceptance'],'Comparator lacks known-good acceptance')
check('referência ausente FAIL' in tasks['C100-Q01']['acceptance'],'Comparator lacks known-bad rejection')
ownership={r['id']:r['implementation_owner'] for r in requirements}
check(ownership['CC100-03-08']=='PAR-S05' and ownership['CC100-03-09']=='PAR-S07' and ownership['CC100-03-10']=='C100-S01','Query/export/retention owners incorrect')
original=json.loads((ev/'catalog-draft-r1.json').read_text())
check({r['id'] for r in original['requirements']} <= {r['id'] for r in requirements},'Original acceptance ID silently removed')
sizes={'P':3,'M':8,'G':22,'GG':45}
par_days=sum(sizes[pars[p]['size']] for p in closure)
delta=[sum(t['estimate_days'][i] for t in tasks.values()) for i in (0,1)]
check(par_days==index['inherited_full_card_estimate_days']==625,'Inherited effort differs')
check(delta==index['delta_estimate_days']==[230,472],'Delta effort differs')
check(index['planning_envelope_days']==[round(par_days*.65)+delta[0],round(par_days*1.35)+delta[1]],'Envelope arithmetic differs')

critical={}
for label,ratio,ix in [('low',.65,0),('nominal',1,None),('high',1.35,1)]:
    memo={}
    def end(node):
        if node in memo:return memo[node]
        cost=sizes[pars[node]['size']]*ratio if node in pars else sum(tasks[node]['estimate_days'])/2 if ix is None else tasks[node]['estimate_days'][ix]
        memo[node]=cost+max((end(dep) for dep in graph[node]),default=0)
        return memo[node]
    critical[label]=end('C100-Q05')
    check(abs(critical[label]-index['schedule_model']['critical_paths'][label]['critical_days'])<1e-9,'CPM differs: '+label)
for scenario in index['schedule_model']['scenarios']:
    n=scenario['fronts_total_shared_with_PAR']
    totals=[par_days*.65+delta[0],par_days+sum(delta)/2,par_days*1.35+delta[1]]
    weeks=[round(max(total/(n*3.5),critical[label]/3.5),1) for total,label in zip(totals,['low','nominal','high'])]
    check(weeks==scenario['weeks_low_nominal_high'],'Capacity arithmetic differs: '+str(n))

concurrent_ledgers=[]
for p, old_digest in baseline['input_hashes'].items():
    if p == 'docs/03_build/0380_backlog_paridade_100_deepseek.md':
        start=par_text.index('## Extensão Claude100 — 17/10/2026\n')
        end_at=par_text.index('## Como ler\n',start)
        previous=par_text[:start]+par_text[end_at:]
        check(hashlib.sha256(previous.encode()).hexdigest()==old_digest,'Preexisting 0380 content changed')
    elif p in {'docs/99_runtime_state.md','docs/20_master_execution_log.md','docs/30_backlog_master.md'}:
        current=(root/p).read_bytes()
        if hashlib.sha256(current).hexdigest()!=old_digest:
            # Coordination permits another writer to prepend its own entry.
            # Preserve the original hash and require the ENTIRE old body as
            # an exact suffix, never accept arbitrary changed bytes.
            offsets=[match.start() for match in re.finditer(rb'(?m)^# ',current)]
            matching=[offset for offset in offsets if hashlib.sha256(current[offset:]).hexdigest()==old_digest]
            check(len(matching)==1,'Preservation failure: '+p)
            if len(matching)==1:
                concurrent_ledgers.append({'path':p,'prefix_bytes':matching[0],'original_body_sha256':old_digest,'current_sha256':hashlib.sha256(current).hexdigest(),'interpretation':'concurrent prepend observed; complete previous body unchanged'})
    else:
        check(digest(root/p)==old_digest,'Preservation failure: '+p)
for entry in manifest['inputs']:
    check(digest(root/entry['path'])==entry['sha256'],'Review input drift: '+entry['path'])
check(digest(Path(catalog['reference']['path']))==catalog['reference']['sha256'],'Claude artifact changed')
result={'scope':'STRUCTURAL_DOCUMENTARY_ONLY','result':'PASS' if not issues else 'FAIL','issues':issues,
    'families':len(families),'mandatory_requirements':len(requirements),'functional_denominator':len(comparative),'mandatory_controls':len(controls),'c100_cards':len(tasks),
    'direct_par':len(direct),'inherited_par':len(closure),'graph_nodes':len(graph),
    'delta_days':delta,'inherited_nominal_days':par_days,'critical_path_days':critical,
    'shared_ledgers_and_previous_sources_preserved':not any('Preservation' in s for s in issues),
    'concurrent_ledger_prepends':concurrent_ledgers,
    'harness_functional_tests':'NOT_RUN','functional_parity_qualified':False}
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(0 if not issues else 1)
