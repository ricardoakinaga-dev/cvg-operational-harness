"""Compare checked-in source exports with the REA-generated companion schemas.

Decompresses JSON as data; no build, target execution, or dynamic imports.
JSON differences are structural observations, not a compatibility judgment.
"""
from pathlib import Path, PurePosixPath
import collections
import hashlib
import json
import re
import subprocess

OUT=Path(__file__).resolve().parent/'exports'
OUT.mkdir(exist_ok=True)
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
COMPANION=Path('/tmp/cvg-codex100-exec-20261017/experimental-schemas')
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'
ARCHIVE='codex-rs/app-server-protocol/schema/precomputed/app-server-exports-experimental.json.zst'
EXPORT='codex-rs/app-server-protocol/src/export.rs'
PRECOMPUTED='codex-rs/app-server-protocol/src/precomputed_exports.rs'

def sha(data):return hashlib.sha256(data).hexdigest()
def src(path,marker=None):
    p=UP/path;text=p.read_text() if marker else None
    row={'path':path,'sha256':sha(p.read_bytes()),'url':f'https://github.com/openai/codex/blob/{PIN}/{path}'}
    if marker:
        hits=[i for i,line in enumerate(text.splitlines()) if marker in line]
        assert len(hits)==1,(path,marker)
        row.update(line=hits[0]+1,url=row['url']+f'#L{hits[0]+1}',anchor=marker)
    return row
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN
assert subprocess.check_output(['git','-C',str(UP),'ls-files','--error-unmatch',ARCHIVE],text=True).strip()==ARCHIVE
payload=subprocess.check_output(['/usr/bin/zstd','-d','-c',str(UP/ARCHIVE)])
assert len(payload)<64*1024*1024,'Unexpected archive expansion'
archive=json.loads(payload)
assert set(archive)=={'typescript','json_schema','internal_json_schema'}
for mapping in archive.values():
    for name,value in mapping.items():
        path=PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts and '.' not in path.parts
        assert isinstance(value,str)

export_text=(UP/EXPORT).read_text()
policy={}
for constant in ['V1_CLIENT_REQUEST_METHODS','EXCLUDED_SERVER_NOTIFICATION_METHODS_FOR_JSON']:
    match=re.search(r'const '+constant+r':[^=]+?=\s*&\[(.*?)\];',export_text,re.S)
    assert match,constant
    policy[constant]=re.findall(r'"([^"\n]+)"',match[1])
assert policy['V1_CLIENT_REQUEST_METHODS']==['getConversationSummary','gitDiffToRemote','getAuthStatus']
assert policy['EXCLUDED_SERVER_NOTIFICATION_METHODS_FOR_JSON']==['rawResponseItem/completed','rawResponse/completed']

def differences(before,after,pointer=''):
    if type(before)!=type(after):
        yield {'pointer':pointer,'kind':'JSON_TYPE_CHANGED','source':before,'companion':after};return
    if isinstance(before,dict):
        for key in sorted(before.keys()|after.keys()):
            dest=pointer+'/'+key.replace('~','~0').replace('/','~1')
            if key not in before:yield {'pointer':dest,'kind':'COMPANION_ONLY','companion':after[key]}
            elif key not in after:yield {'pointer':dest,'kind':'SOURCE_ONLY','source':before[key]}
            else:yield from differences(before[key],after[key],dest)
    elif isinstance(before,list):
        if len(before)!=len(after):
            yield {'pointer':pointer,'kind':'ARRAY_LENGTH_OR_MEMBERS_CHANGED','source_length':len(before),'companion_length':len(after)}
        for i,(left,right) in enumerate(zip(before,after)):
            yield from differences(left,right,pointer+'/'+str(i))
    elif before!=after:yield {'pointer':pointer,'kind':'VALUE_CHANGED','source':before,'companion':after}

rows=[];summary=collections.Counter();snap=OUT/'reference';snap.mkdir(exist_ok=True)
for name,text in sorted(archive['json_schema'].items()):
    data=text.encode();p=COMPANION/name
    row={'path':name,'source_sha256':sha(data),'companion_sha256':sha(p.read_bytes()) if p.exists() else None}
    if not p.exists():row['comparison']='MISSING_COMPANION_SCHEMA'
    elif p.read_bytes()==data:row['comparison']='BYTE_IDENTICAL'
    else:
        source_obj=json.loads(text);other=json.loads(p.read_text())
        row['comparison']='STRUCTURALLY_DIFFERENT_JSON' if source_obj!=other else 'JSON_EQUAL_BYTES_DIFFERENT'
        diffs=list(differences(source_obj,other))
        # Keep pointers/value scalars; large changed schema objects remain in
        # their hash-bound archive rather than bloating this comparison.
        for d in diffs:
            for side in ['source','companion']:
                if side in d and isinstance(d[side],(dict,list)):
                    raw=json.dumps(d[side],sort_keys=True,separators=(',',':')).encode()
                    d[side]={'json_type':type(d[side]).__name__,'canonical_sha256':sha(raw),'members':len(d[side])}
        row['difference_count']=len(diffs);row['differences']=diffs
    rows.append(row);summary[row['comparison']]+=1
    if name in ['ClientRequest.json','ServerRequest.json','ServerNotification.json','ClientNotification.json']:
        (snap/('pinned-'+name)).write_bytes(data)
legacy_names=['GetConversationSummaryParams','GetConversationSummaryResponse',
              'GetAuthStatusParams','GetAuthStatusResponse','GitDiffToRemoteParams','GitDiffToRemoteResponse']
legacy=[]
for name in legacy_names:
    member=name+'.ts';text=archive['typescript'][member]
    (snap/member).write_text(text)
    legacy.append({'member':member,'sha256':sha(text.encode()),'snapshot':'reference/'+member,
                   'authority':'PINNED_PRECOMPUTED_TYPESCRIPT; source types remain authoritative'})
extra=sorted(str(p.relative_to(COMPANION)) for p in COMPANION.rglob('*.json') if str(p.relative_to(COMPANION)) not in archive['json_schema'])
write(OUT/'comparison.json',{'pin':PIN,'archive':src(ARCHIVE),'archive_payload_sha256':sha(payload),
 'archive_counts':{k:len(v) for k,v in archive.items()},'comparison_counts':dict(summary),'schemas':rows,
 'extra_companion_schemas':extra,'legacy_typescript_snapshots':legacy,
 'export_policy':policy,'policy_sources':[src(EXPORT,'const V1_CLIENT_REQUEST_METHODS:'),
 src(EXPORT,'const EXCLUDED_SERVER_NOTIFICATION_METHODS_FOR_JSON:'),
 src(EXPORT,'fn strip_v1_client_request_variants_from_json_schema('),
 src(EXPORT,'fn strip_v1_server_notification_variants_from_json_schema('),
 src(PRECOMPUTED,'pub fn generate_json_with_experimental(')],
 'conclusion':'Five source contracts are excluded deliberately by JSON generation policy. The installed companion also differs structurally in29 schema files; do not authenticate source/build identity or transfer functional semantics from schema counts.',
 'next_action':'Build a source-authoritative matrix from the pinned precomputed exports; reconcile all29 structural differences without deleting source-only obligations.',
 'functional_receipts':0,'g01_closure':False,'g02_source_binary_binding':'NOT_AUTHENTICATED'})
assert summary=={'BYTE_IDENTICAL':423,'STRUCTURALLY_DIFFERENT_JSON':29} and not extra
print(json.dumps({'schemas':len(rows),'comparison':dict(summary),'source_contract_exclusions':sum(map(len,policy.values())),'functional_receipts':0}))
