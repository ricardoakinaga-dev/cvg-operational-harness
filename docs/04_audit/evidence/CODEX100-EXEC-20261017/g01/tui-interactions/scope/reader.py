"""Pinned TUI source/file/module-candidate census, not Rust compiler reachability."""
from pathlib import Path
import collections
import copy
import hashlib
import importlib.util
import json
import posixpath
import re
import subprocess
import sys

sys.dont_write_bytecode=True
OUT=Path(__file__).resolve().parent
E=OUT.parents[2]
ROOT=next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').exists())
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'
HELPER=E/'g01/entrypoints/cli/generate.py'
PREFIX='codex-rs/tui/'


def require(ok,message):
    if not ok:raise AssertionError(message)
def read(p):return json.loads(p.read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
def encoded(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()

def literal_test_gate(conditions):
    return any(re.fullmatch(r'#\[cfg\(\s*test\s*\)\]',c) for c in conditions)

reviewed=read(E/'g01/entrypoints/manifest.json')
expected=next(r['sha256'] for r in reviewed['files'] if r['path']==str(HELPER.relative_to(ROOT)))
require(sha(HELPER.read_bytes())==expected,'Prior reviewed lexer changed')
spec=importlib.util.spec_from_file_location('reviewed_tui_scope_lexer',HELPER)
cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)
# Local extension of the reviewed lexer: TUI sources contain backslash-newline
# string continuations, Unicode char escapes, byte/C raw strings and raw identifiers.
# The historical helper itself remains byte-exact and is never edited.
cli.TOKEN=re.compile(r'''(?:br|cr|r)(\#*)"|//[^\n]*|/\*|(?:b|c)?"(?:\\.|[^"\\])*"|b?'(?:\\u\{[0-9a-fA-F_]+\}|\\x[0-9a-fA-F]{2}|\\.|[^'\\\n])'|r\#[A-Za-z_]\w*|[A-Za-z_]\w*|::|=>|->|[^\s]''',re.S)
probe=cli.Source('lexer-control','const S: &str = "a\\\n{ not code }"; const B: &[u8] = br#"{ raw }"#; const C: char = \'\\u{1f600}\'; struct Real;')
require(set(probe.defs)=={'Real'},'Extended lexer atomicity failed')


def build():
    tree={}
    for r in subprocess.check_output(['git','-C',str(UP),'ls-tree','-r','-z',PIN]).split(b'\0'):
        if r:
            h,p=r.split(b'\t',1);mode,kind,oid=h.decode().split()
            tree[p.decode()]={'mode':mode,'kind':kind,'git_blob':oid}
    require(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD']).decode().strip()==PIN,'Wrong source pin')
    require(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain']).strip(),'Upstream modified')
    rust_paths=[p for p in sorted(tree) if p.startswith(PREFIX+'src/') and p.endswith('.rs')]
    require(len(rust_paths)==1131,'Tracked source census differs')
    component=read(E/'g01/component-surfaces/rust/inventory.json')
    target_rows=[r for r in component['target_candidates'] if r['manifest']==PREFIX+'Cargo.toml']
    roots=collections.defaultdict(list)
    for target in target_rows:
        for candidate in target['source_candidates']:
            if candidate['path'] in tree:roots[candidate['path']].append({'id':target['id'],'kind':target['kind'],'origin':target['origin']})
    sources={};scans={};edges=[];includes=[];imports=[]
    def load(path):
        require(path in tree and tree[path]['mode'] in ['100644','100755'],'Nonregular/untracked source')
        raw=(UP/path).read_bytes()
        require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==tree[path]['git_blob'],'Git blob differs')
        sources[path]={'path':path,'sha256':sha(raw),'bytes':len(raw),**tree[path]}
        return raw
    def span(s,a,b):
        start=len(s.text[:s.t[a][1]].encode());end=len(s.text[:s.t[b-1][2]].encode());raw=s.text.encode()
        return {'path':s.path,'file_sha256':sha(raw),'start_byte':start,'end_byte_exclusive':end,
                'start_line':raw[:start].count(b'\n')+1,'end_line':max(raw[:start].count(b'\n')+1,raw[:end].count(b'\n')+(not raw[:end].endswith(b'\n'))),
                'sha256':sha(raw[start:end]),'text':raw[start:end].decode()}
    paths=sorted(set(rust_paths)|{p for p in roots if p.endswith('.rs')})
    for path in paths:
        s=cli.Source(path,load(path).decode());scans[path]=s
        root_dir=posixpath.dirname(path)
        default_dir=root_dir if path in roots or Path(path).stem in ['lib','main','mod'] else path[:-3]
        inline=[]
        for i,(word,_,_) in enumerate(s.t):
            if word=='use':
                stop=i+1
                while stop<len(s.t) and s.t[stop][0]!=';':
                    if s.t[stop][0] in ['(','[','{']:stop=s.pairs[stop]
                    stop+=1
                if stop<len(s.t):
                    a=s.before_attrs(i)
                    imports.append({'source_path':path,'lexical_delimiter_depth':s.depths[i],
                                    'status':'LEXICAL_USE_CANDIDATE; alias/glob/module/type resolution OPEN',
                                    'source':span(s,a,stop+1)})
            if word=='mod' and i+2<len(s.t) and re.fullmatch(r'[A-Za-z_]\w*',s.t[i+1][0]) and s.t[i+2][0] in [';','{']:
                parents=[r for r in inline if r['begin']<i<r['end']]
                parent=max(parents,key=lambda r:r['begin']) if parents else None
                allowed_depth=parent['depth'] if parent else 0
                a=s.before_attrs(i);attrs,_=s.attrs(a,i);own_cfg=[r['text'] for r in attrs if r['text'].startswith(('#[cfg(', '#[cfg_attr('))]
                inherited=(parent['cfg'] if parent else [])+own_cfg
                context='MODULE_SCOPE_DECLARATION' if s.depths[i]==allowed_depth and (not parent or parent['context']=='MODULE_SCOPE_DECLARATION') else 'NESTED_NON_MODULE_OR_MACRO_CONTEXT_OPEN'
                name=s.t[i+1][0];body=i+2;base=parent['directory'] if parent else default_dir
                if s.t[body][0]=='{':
                    end=s.pairs[body]+1
                    inline.append({'begin':body,'end':end,'depth':s.depths[body]+1,'cfg':inherited,'context':context,
                                   'directory':posixpath.join(base,name)})
                    edges.append({'source_path':path,'name':name,'kind':'inline','context':context,'cfg':inherited,
                                  'target_candidates':[],'resolution':'INLINE_SOURCE_MODULE_NOT_RUNTIME_PROOF','source':span(s,a,end)})
                else:
                    explicit=[]
                    for attr in attrs:
                        m=re.fullmatch(r'#\[path\s*=\s*("(?:\\.|[^"\\])*")\]',attr['text'],re.S)
                        if m:explicit.append(json.loads(m[1]))
                    candidate_paths=[posixpath.normpath(posixpath.join(base,name+'.rs')),
                                     posixpath.normpath(posixpath.join(base,name,'mod.rs'))]
                    if explicit:
                        candidate_paths=sorted({posixpath.normpath(posixpath.join(d,p)) for d in [root_dir,base] for p in explicit})
                    candidates=sorted({p for p in candidate_paths if p in tree and p.endswith('.rs')})
                    edges.append({'source_path':path,'name':name,'kind':'out_of_line','context':context,'cfg':inherited,
                                  'explicit_path_attributes':explicit,'candidate_paths':candidate_paths,'target_candidates':candidates,
                                  'resolution':'SOURCE_PATH_CANDIDATE_NOT_COMPILER_PROOF' if len(candidates)==1 else 'OPEN_MISSING_OR_AMBIGUOUS_MODULE_PATH',
                                  'source':span(s,a,body+1)})
            if word in ['include','include_str','include_bytes'] and i+3<len(s.t) and s.t[i+1][0]=='!':
                j=i+2
                if s.t[j][0] not in ['(','[','{']:continue
                stop=s.pairs[j]+1;arguments=s.raw(j+1,stop-1)
                literal=re.fullmatch(r'"(?:\\.|[^"\\])*"',arguments.strip())
                target=posixpath.normpath(posixpath.join(root_dir,json.loads(arguments))) if literal else None
                includes.append({'source_path':path,'macro':word,'arguments':arguments,'target_candidate':target,
                                 'status':'LITERAL_SOURCE_CANDIDATE' if target in tree else 'OPEN_DYNAMIC_OR_MISSING_INCLUDE',
                                 'source':span(s,i,stop)})
    # Propagate only module-scope declaration paths. This is a conservative source classification,
    # not a decision that any cfg is enabled or that Cargo compiles an entry point.
    roles=collections.defaultdict(set)
    for path,rows in roots.items():
        for row in rows:roles[path].add('TEST_TARGET_SOURCE_CANDIDATE' if row['kind']=='test' else 'NONTEST_TARGET_SOURCE_CANDIDATE')
    changed=True
    while changed:
        changed=False
        for edge in edges:
            if edge['context']!='MODULE_SCOPE_DECLARATION':continue
            for role in list(roles[edge['source_path']]):
                test=role.startswith('TEST_') or literal_test_gate(edge['cfg'])
                inherited='TEST_MODULE_SOURCE_CANDIDATE' if test else 'NONTEST_MODULE_SOURCE_CANDIDATE'
                for target in edge['target_candidates']:
                    if inherited not in roles[target]:roles[target].add(inherited);changed=True
    inbound=collections.defaultdict(list)
    for n,edge in enumerate(edges):
        for target in edge['target_candidates']:inbound[target].append(n)
    rows=[]
    for path in rust_paths:
        kinds=sorted(roles[path]);non_test=any(r.startswith('NONTEST_') for r in kinds);test=any(r.startswith('TEST_') for r in kinds)
        classification='MIXED_SOURCE_DECLARATION_PATH_CANDIDATE' if non_test and test else 'NONTEST_SOURCE_DECLARATION_PATH_CANDIDATE' if non_test else 'TEST_SOURCE_DECLARATION_PATH_CANDIDATE' if test else 'RETAINED_UNRESOLVED_OR_AUXILIARY_RUST_SOURCE'
        rows.append({'path':path,'classification':classification,'declaration_path_roles':kinds,
                     'inbound_module_edge_indexes':inbound[path],'root_target_candidates':roots.get(path,[]),
                     'test_name_hint_not_exclusion':('/tests/' in path or path.endswith(('_tests.rs','/tests.rs'))),
                     'source':sources[path]})
    other=[{'path':p,'git_blob':tree[p]['git_blob'],'git_mode':tree[p]['mode'],
            'classification':'RETAINED_AUXILIARY_OR_FIXTURE_ASSET_GIT_PATH; no name-based runtime exclusion'}
           for p in sorted(tree) if p.startswith(PREFIX) and p not in rust_paths]
    return {'kind':'T1_TUI_FILE_AND_MODULE_DECLARATION_CANDIDATES_NOT_COMPILED_REACHABILITY','pin':PIN,
            'contract_sha256':sha((OUT.parent/'contract.json').read_bytes()),'helper_sha256':sha(HELPER.read_bytes()),
            'files':rows,'root_target_candidates':dict(roots),'module_edges':edges,'include_candidates':includes,
            'import_candidates':imports,
            'auxiliary_git_paths':other,'sources':sorted(sources.values(),key=lambda r:r['path']),
            'counts':{'tui_src_rust_paths':len(rows),'source_blobs':len(sources),'module_declarations':len(edges),
                      'include_candidates':len(includes),'import_candidates':len(imports),'auxiliary_git_paths':len(other),
                      'file_classes':dict(collections.Counter(r['classification'] for r in rows)),
                      'module_resolution':dict(collections.Counter(r['resolution'] for r in edges))},
            'limits':['Source path candidates preserve cfg/context. No enabled-platform, compilation, Cargo target selection or runtime callgraph is inferred.',
                      'Explicit path attributes retain physical candidate alternatives; Rust compiler module ownership/inline-path semantics remain OPEN.',
                      'Only a literal cfg(test) gate projects test-only context; not(test), cfg_attr and compound conditions remain symbolic and do not justify exclusion.',
                      'Unused/auxiliary/missing/macro module paths remain retained and OPEN, including test-looking paths without a proven declaration route.',
                      'Auxiliary fixtures/assets are Git-path identities, not an executed visual/resource or behavior audit.'],
            'functional_receipts':0,'full_g01_closure':False}


fresh=build();require(fresh==build(),'Source census nondeterministic')
negatives=[]
for name,mutation in [
 ('omitted_rust_path',lambda v:v['files'].pop()),
 ('hidden_unresolved_file',lambda v:v.update(files=[r for r in v['files'] if r['classification']!='RETAINED_UNRESOLVED_OR_AUXILIARY_RUST_SOURCE'])),
 ('lost_module_edge',lambda v:v['module_edges'].pop()),
 ('lost_import_candidate',lambda v:v['import_candidates'].pop()),
 ('lost_cfg',lambda v:next(r for r in v['module_edges'] if r['cfg']).update(cfg=[])),
 ('test_promoted_to_runtime',lambda v:next(r for r in v['files'] if r['classification']=='TEST_SOURCE_DECLARATION_PATH_CANDIDATE').update(classification='COMPILED_PRODUCTION')),
 ('lost_auxiliary_asset',lambda v:v['auxiliary_git_paths'].pop()),
 ('fake_qualification',lambda v:v.update(functional_receipts=1)),
]:
    bad=copy.deepcopy(fresh);mutation(bad)
    try:require(bad==fresh,'Rejected mutated census')
    except AssertionError:negatives.append({'id':name,'result':'REJECTED'})
    else:raise AssertionError('Known-bad census accepted')
source_probes=[]
for syntax,expected_test in [('#[cfg(test)]',True),('#[cfg( test )]',True),
                             ('#[cfg(not(test))]',False),('#[cfg(any(test, windows))]',False),
                             ('#[cfg_attr(test, path="test.rs")]',False),('#[cfg(feature="test")]',False)]:
    require(bool(literal_test_gate([syntax]))==expected_test,'Symbolic test gate misclassified')
    source_probes.append({'syntax':syntax,'literal_test_only_projection':expected_test,'result':'PASS'})
report={'result':'PASS','kind':'SOURCE_FILE_CENSUS_ONLY','counts':fresh['counts'],'negative_controls':negatives,
        'source_cfg_probes':source_probes,
        'functional_receipts':0,'full_g01_closure':False}
for name,value in [('inventory.json',fresh),('verification.json',report)]:
    if '--check' in sys.argv:require((OUT/name).read_bytes()==encoded(value),'Census regeneration differs: '+name)
    else:(OUT/name).write_bytes(encoded(value))
print(json.dumps(report))
