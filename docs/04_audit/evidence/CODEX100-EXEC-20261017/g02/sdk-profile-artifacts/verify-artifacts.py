"""Independent read-only archive-to-tree comparison; never imports artifact code."""
from pathlib import Path
import json, hashlib, base64, zipfile, tarfile, stat, csv, io, email.parser
from datetime import datetime, timezone
import sys

P=Path(__file__).resolve().parent
R=P.parents[5]
E=P.parents[1]
def j(n):return json.loads((P/n).read_text())
def h(b):return hashlib.sha256(b).hexdigest()
checks=[]
def check(name,fn):
    try:detail=fn();checks.append({'id':name,'status':'PASS','detail':detail})
    except Exception as exc:checks.append({'id':name,'status':'FAIL','detail':repr(exc)})

def raw():
    proposed={x['name']:x for x in j('input-dependency-proposal.json')['artifacts']}
    current=j('validation.json')['rows'];assert len(current)==7
    total=0
    for row in current:
        spec=proposed[row['name']];data=Path(row['raw']['raw_path']).read_bytes();total+=len(data)
        assert len(data)==row['raw']['bytes'] and h(data)==row['raw']['sha256']
        if 'expected_sha256' in spec:assert h(data)==spec['expected_sha256'] and len(data)==spec['expected_bytes']
        else:assert 'sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==spec['expected_integrity']
    assert total==7116743
    return {'artifacts':7,'bytes':total,'network_used':False}

def archived_files(row):
    result={}
    if row['name']=='typescript':
        with tarfile.open(row['raw']['raw_path'],mode='r|gz') as archive:
            for member in archive:
                assert member.isfile() or member.isdir();assert not member.issparse()
                if member.isdir():continue
                assert member.name.startswith('package/')
                name=member.name[len('package/'):];assert name not in result
                assert 0<=member.size<=33554432
                result[name]=archive.extractfile(member).read(33554433);assert len(result[name])==member.size
    else:
        with zipfile.ZipFile(row['raw']['raw_path']) as archive:
            for member in archive.infolist():
                assert member.orig_filename==member.filename
                assert stat.S_IFMT(member.external_attr>>16) in [0,stat.S_IFREG,stat.S_IFDIR]
                if member.is_dir():continue
                assert member.filename not in result and not member.flag_bits&1
                assert 0<=member.file_size<=33554432
                result[member.filename]=archive.read(member);assert len(result[member.filename])==member.file_size
    return result

def trees():
    files_count=0;size=0
    for row in j('validation.json')['rows']:
        source=archived_files(row);root=Path(row['tree_root']);actual={str(p.relative_to(root)):p for p in root.rglob('*') if p.is_file()}
        assert set(source)==set(actual)=={f['path'] for f in row['files']}
        for name,data in source.items():
            assert not name.startswith('/') and '\\' not in name and all(x not in ['.','..',''] for x in name.split('/'))
            p=actual[name];assert not p.is_symlink() and p.resolve().is_relative_to(root.resolve())
            assert p.read_bytes()==data and p.stat().st_mode&0o777==0o600
            files_count+=1;size+=len(data)
        if row['name']!='typescript':
            record=next(n for n in source if n.endswith('.dist-info/RECORD')); entries=list(csv.reader(io.StringIO(source[record].decode())))
            assert len(entries)==len(source) and {a[0] for a in entries}==set(source)
            for name,digest,length in entries:
                if name==record:assert digest==length==''
                else:assert int(length)==len(source[name]) and digest=='sha256='+base64.urlsafe_b64encode(hashlib.sha256(source[name]).digest()).decode().rstrip('=')
    assert files_count==301 and size==31259582
    return {'archive_files':files_count,'bytes':size,'every_physical_file_equals_archive':True,'six_RECORDs_recomputed':True}

def merged():
    data=j('validation.json');merge=data['merged_python'];root=Path(merge['root']);wanted={}
    for row in data['rows']:
        if row['name']=='typescript':continue
        for name,b in archived_files(row).items():assert name not in wanted;wanted[name]=b
    actual={str(p.relative_to(root)):p for p in root.rglob('*') if p.is_file()}
    assert set(wanted)==set(actual)=={r['path'] for r in merge['files']}
    for name,b in wanted.items():assert actual[name].read_bytes()==b and not actual[name].is_symlink() and actual[name].stat().st_mode&0o777==0o600
    assert len(wanted)==169
    return {'merged_files':169,'bytes':sum(len(b) for b in wanted.values()),'installer_used':False}

def metadata():
    rows=j('validation.json')['rows'];versions={x['name']:x['version'] for x in rows};active=[];excluded=[]
    for row in rows:
        if row['name']=='typescript':
            pkg=json.loads((Path(row['tree_root'])/'package.json').read_text());assert pkg['name']=='typescript' and pkg['version']=='5.9.2'
            assert all(not pkg.get(f) for f in ['dependencies','peerDependencies','optionalDependencies'])
            continue
        meta=email.parser.BytesParser().parsebytes((Path(row['tree_root'])/row['metadata_path']).read_bytes());assert meta['Version']==row['version']
        for dep in row['dependencies']:
            (active if dep['active'] else excluded).append(dep['literal'])
            if dep['active']:assert dep['selected_version']==versions[dep['name']]
    assert len(active)==6 and len(excluded)==3
    assert j('validation.json')['SDK_imports']==j('validation.json')['Pydantic_imports']==j('validation.json')['compiler_executions']==0
    return {'active_dependencies':6,'marker_excluded_optional_or_older_Python':3,'all_code_imports':0,'limitation':'Full PEP440/508 parser and native library loading are not claimed; actual literals use validated finite numeric/marker grammar.'}

def preservation():
    baseline=json.loads((E/'checkpoint-before-sdk-profile-artifacts-manifest.json').read_text());allowed={'.agent/plans/codex100-exec-20261017.md','docs/03_build/0386_backlog_paridade_codex.md','docs/08_runtime/handoffs/codex100_exec_20261017.md'}|{str((E/n).relative_to(R)) for n in ['state.json','continuation.json','execution-log.jsonl']}
    same=0;changed=[]
    for x in baseline['files']:
        p=R/x['path'];b=p.read_bytes()
        if len(b)==x['bytes'] and h(b)==x['sha256']:same+=1
        else:assert x['path'] in allowed,x['path'];changed.append(x['path'])
    assert same+len(changed)==2895
    return {'unchanged':same,'own_controls_changed':changed,'other_changes':0}

for name,fn in [('RAW_LOCK_BYTES',raw),('ARCHIVES_TO_PHYSICAL_TREES_AND_RECORD',trees),('MERGED_TREE',merged),('METADATA_SOURCE_JOINS',metadata),('PREVIOUS_CHECKPOINT',preservation)]:check(name,fn)
out={'kind':'EXECUTED_READONLY_DATA_VERIFICATION_NOT_SDK_TESTS','observed_at':datetime.now(timezone.utc).isoformat(),'checks':checks,'passed':sum(c['status']=='PASS' for c in checks),'failed':sum(c['status']=='FAIL' for c in checks),'SDK_runtime':'NOT_RUN','compiler':'NOT_RUN','functional_receipts':0}
print(json.dumps(out,ensure_ascii=False,indent=2));sys.exit(1 if out['failed'] else 0)
