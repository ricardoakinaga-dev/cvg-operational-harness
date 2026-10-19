import os, json, pathlib, subprocess, hashlib, time, signal, traceback

TMP=pathlib.Path('/tmp/cvg-hiso005-integration-20261018/recovery-review-r1')
OUT=pathlib.Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236/recovery-r2/review-r1')
SRC=pathlib.Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018')
NODE='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
ENV={'PATH':str(pathlib.Path(NODE).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(TMP)}
ENGINE=str(SRC/'scripts/boundary-semantic-engine.mjs')
CHECKER=str(SRC/'scripts/check-product-boundary.mjs')
RESULTS=[]
def h(b): return hashlib.sha256(b).hexdigest()
def dump(p,x): p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def write(root,p,b):
    f=root/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_bytes(b if isinstance(b,bytes) else b.encode()); return f
def proc(pid):
    try:
        root=pathlib.Path('/proc')/str(pid); s=(root/'stat').read_text();f=s[s.rfind(')')+2:].split()
        children=set()
        for t in (root/'task').iterdir():
            try: children.update(map(int,(t/'children').read_text().split()))
            except FileNotFoundError: pass
        return {'pid':pid,'born':f[19],'state':f[0],'ppid':int(f[1]),'cmdline':(root/'cmdline').read_bytes().replace(b'\0',b' ').decode(),'children':sorted(children)}
    except (FileNotFoundError,ProcessLookupError): return None
def call(case,module,method,args,flags=(),stop=False,observe=False):
    case.mkdir(parents=True,exist_ok=True)
    request={'module':module,'method':method,'args':args}; dump(case/'input.json',request)
    argv=[NODE,*flags,str(TMP/'caller.mjs')]; started=time.monotonic()
    p=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,cwd=TMP)
    owned={};samples=[];stopped=None;peak=0
    p.stdin.write(json.dumps(request).encode());p.stdin.close();p.stdin=None
    try:
        while p.poll() is None:
            pending=[(p.pid,0)]
            while pending:
                pid,depth=pending.pop();r=proc(pid)
                if not r: continue
                if depth:
                    key=(pid,r['born'])
                    if key not in owned: samples.append({'ms':round((time.monotonic()-started)*1000,3),'depth':depth,**r})
                    owned[key]=r;peak=max(peak,depth)
                if stop and stopped is None and depth==1 and ENGINE in r['cmdline'] and '--semantic-worker' in r['cmdline']:
                    now=proc(pid)
                    if now and now['born']==r['born']:
                        os.kill(pid,signal.SIGSTOP);stopped=r;samples.append({'signal':'SIGSTOP','ms':round((time.monotonic()-started)*1000,3),**r})
                pending.extend((c,depth+1) for c in r['children'])
            if time.monotonic()-started>12: raise RuntimeError('own observer deadline')
            time.sleep(.001 if observe or stop else .005)
        stdout,stderr=p.communicate(timeout=2)
        elapsed=(time.monotonic()-started)*1000
        remaining=[r for (pid,born),r in owned.items() if (proc(pid) or {}).get('born')==born]
        raw={'argv':argv,'env':ENV,'cwd':str(TMP),'exitCode':p.returncode,'elapsedMs':elapsed,'stdout':stdout.decode(),'stderr':stderr.decode(),'maxDepth':peak,'samples':samples,'stopped':stopped,'remaining':remaining}
        dump(case/'raw.json',raw)
        value=json.loads(stdout) if stdout else None;dump(case/'output.json',value)
        assert p.returncode==0,(p.returncode,stderr.decode())
        return value,raw
    finally:
        for (pid,born) in reversed(list(owned)):
            if (proc(pid) or {}).get('born')==born:
                try: os.kill(pid,signal.SIGKILL)
                except ProcessLookupError: pass
        if p.poll() is None:p.kill()
        p.wait(timeout=3)
def fixture(case,source='export const result=1;',ext='js',extra=None):
    root=case/'target';write(root,'package.json','{"type":"module"}')
    write(root,'entry.'+ext,source)
    for k,v in (extra or {}).items():write(root,k,v)
    return {'root':str(root),'starts':['entry.'+ext],'origins':[],'installed':[],'compiled':{'status':'UNAVAILABLE','files':[]}}
def host_fixture(case,core='export const result=1;',vendor=None,missing=False):
    for root in [case/'evaluated',case/'reference']:
        package={'name':'synthetic','version':'1.0.0','private':True,'type':'module','workspaces':['packages/*','products/*']}
        lock={'lockfileVersion':3,'packages':{'':{'name':'synthetic','version':'1.0.0'}}}
        if vendor is not None: lock['packages']['node_modules/vendor']={'version':'1.0.0','resolved':'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz','integrity':'sha512-'+__import__('base64').b64encode(bytes([1])*64).decode()}
        write(root,'package.json',json.dumps(package));write(root,'package-lock.json',json.dumps(lock))
        write(root,'tsconfig.base.json',json.dumps({'compilerOptions':{'module':'NodeNext','moduleResolution':'NodeNext','allowJs':True,'target':'ES2022'}}))
        corepkg={'name':'@synthetic/core','version':'1.0.0','type':'module','main':'src/index.js'}
        if vendor is not None:corepkg['dependencies']={'vendor':'1.0.0'}
        write(root,'packages/core/package.json',json.dumps(corepkg));write(root,'packages/core/src/index.js',core)
        write(root,'products/shift/package.json',json.dumps({'name':'@private/product','version':'1.0.0','type':'module','main':'src/index.js'}));write(root,'products/shift/src/index.js','export const productOnly=1;')
        if vendor is not None:
            write(root,'node_modules/vendor/package.json',json.dumps({'name':'vendor','version':'1.0.0','type':'module','main':'missing.js' if missing else 'index.js'}))
            write(root,'node_modules/vendor/index.js',vendor)
    result=subprocess.run([NODE,str(TMP/'receipt.mjs'),str(case)],env=ENV,cwd=TMP,capture_output=True,timeout=15)
    dump(case/'receipt-raw.json',{'argv':result.args,'exitCode':result.returncode,'stdout':result.stdout.decode(),'stderr':result.stderr.decode()})
    assert result.returncode==0,result.stderr
    return {'graph':True,'semantic':True,'installedReference':json.loads(result.stdout)}
def check_lineage(report,root):
    s=report['semanticBoundary'];rows=[x for x in report['diagnostics'] if x['reason']=='UNVERIFIED_SEMANTIC_FRONTIER'];orig=s['frontierOrigins'];o=s['occurrences'];base={x['id'] for x in s['origins']}
    ids=[x['originId'] for x in rows]; assert rows and len(set(ids))==len(rows)==len(orig)==o['new']; assert ids==o['newOriginIds']; assert not base.intersection(ids)
    assert o['baseline']==o['resolved']+o['unresolved']==len(base)
    assert not set(ids).intersection(x.get('originId') for x in s['proofs'])
    for row,a in zip(rows,orig):
        body={k:v for k,v in a.items() if k!='id'}
        assert a['id']==h(json.dumps(body,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode())
        assert a['kind']=='NonAstDiagnostic' and a['start'] is None and a['end'] is None and a['context']=='semantic-frontier'
        if a['file'] is None: assert a['fileSha256'] is None
        else: assert a['fileSha256']==h((root/a['file']).read_bytes())
        ptr=a['semanticPointer']; assert ptr['reason']==row['detail'] and ptr['detail']==row['semanticDetail']; assert ptr['causalOriginId']==row.get('causalOriginId')
        if ptr['path'].startswith('#/semanticBoundary/unknowns/'):
            u=s['unknowns'][int(ptr['path'].rsplit('/',1)[1])];assert u['reason']==ptr['reason'] and u.get('detail')==ptr['detail']
            assert u.get('originId')==ptr['causalOriginId']
    return {'new':len(rows),'baseline':len(base),'nullPhysical':sum(x['file'] is None for x in orig),'causal':sum(bool(x.get('causalOriginId')) for x in rows),'details':[x['semanticDetail'] for x in rows]}
def scenario(n,title,fn):
    case=TMP/f'p{n:02d}';case.mkdir(exist_ok=True)
    try:
        detail=fn(case); row={'id':f'p{n:02d}','title':title,'status':'PASS','detail':detail}
    except Exception as e:row={'id':f'p{n:02d}','title':title,'status':'FAIL','error':str(e),'traceback':traceback.format_exc()}
    RESULTS.append(row);dump(case/'assessment.json',row);dump(TMP/'summary.json',RESULTS);print(json.dumps(row,ensure_ascii=False),flush=True)

def p01(c):
    global POSITIVE_INPUT,POSITIVE_OUTPUT
    POSITIVE_INPUT=fixture(c);POSITIVE_OUTPUT,r=call(c/'run',ENGINE,'runSemanticBoundary',[POSITIVE_INPUT],observe=True)
    assert POSITIVE_OUTPUT['status']=='PROVEN' and POSITIVE_OUTPUT['validation']['valid']
    assert r['maxDepth']==1 and not r['remaining'];assert all('--check' not in x['cmdline'] for x in r['samples'])
    return {'status':POSITIVE_OUTPUT['status'],'maxDepth':r['maxDepth'],'remaining':r['remaining']}
def p02(c):
    i=fixture(c);i['limits']={'timeoutMs':1100};o,r=call(c/'run',ENGINE,'runSemanticBoundary',[i],stop=True,observe=True)
    assert r['stopped'] and r['maxDepth']==1 and not r['remaining'] and r['elapsedMs']<2400
    assert o['status']=='UNKNOWN' and not o['proofs'] and any(x['reason']=='UNKNOWN_ANALYSIS_LIMIT' for x in o['unknowns'])
    return {'elapsedMs':r['elapsedMs'],'stoppedPid':r['stopped']['pid'],'maxDepth':r['maxDepth'],'remaining':r['remaining']}
def p03(c):
    o,r=call(c/'normal',ENGINE,'validateSemanticBoundary',[POSITIVE_INPUT,POSITIVE_OUTPUT],observe=True);assert o['valid'] and r['maxDepth']==1 and not r['remaining']
    i={**POSITIVE_INPUT,'limits':{'timeoutMs':1100}}
    o,r=call(c/'stalled',ENGINE,'validateSemanticBoundary',[i,POSITIVE_OUTPUT],stop=True,observe=True)
    assert not o['valid'] and r['stopped'] and r['maxDepth']==1 and not r['remaining'] and r['elapsedMs']<2400
    return {'normalValid':True,'stalled':o,'elapsedMs':r['elapsedMs'],'remaining':r['remaining']}
def grammar(c,source,ext,reason='UNKNOWN_RUNTIME_SYNTAX'):
    i=fixture(c,source,ext);o,r=call(c/'run',ENGINE,'runSemanticBoundary',[i],observe=True)
    assert o['status']=='UNKNOWN' and not o['proofs'] and any(x['reason']==reason for x in o['unknowns']),o
    assert r['maxDepth']==1 and not r['remaining'];return {'status':o['status'],'unknowns':o['unknowns'],'maxDepth':r['maxDepth']}
def p08(c):
    i=fixture(c,'export const result:number=1;','ts');o,r=call(c/'strip',ENGINE,'runSemanticBoundary',[i],observe=True)
    assert o['status']=='PROVEN' and o['validation']['valid'];assert r['maxDepth']==1 and not r['remaining']
    sentinel=c/'TARGET_EXECUTED';text="import fs from 'node:fs';fs.writeFileSync("+json.dumps(str(sentinel))+",'executed');process.exit(93);"
    trap=fixture(c/'trap',text,'mjs');a,b=call(c/'no-exec',ENGINE,'runSemanticBoundary',[trap]);assert a['status']=='UNKNOWN' and not sentinel.exists()
    return {'validTs':'PROVEN','trapStatus':a['status'],'sentinelExists':sentinel.exists()}
def p09(c):
    rows=[]
    for idx,flags in enumerate([['--experimental-vm-modules'],['--no-warnings'],['--conditions=forbidden']]):
        o,r=call(c/str(idx),ENGINE,'runSemanticBoundary',[POSITIVE_INPUT],flags=flags,observe=True)
        assert o['status']=='UNKNOWN' and not o['proofs'] and any(x['reason']=='UNKNOWN_RUNTIME_PROFILE' for x in o['unknowns'])
        assert r['maxDepth']==0;rows.append({'flags':flags,'reason':o['unknowns'][0]['reason']})
    return rows
def p10(c):
    options=host_fixture(c,"import 'vendor';export const result=1;",'export default function(specifier){return import(specifier)}')
    root=c/'evaluated';a,r=call(c/'normal',CHECKER,'auditProductBoundary',[str(root),options]);b,r=call(c/'repeat',CHECKER,'auditProductBoundary',[str(root),options])
    cli=subprocess.run([NODE,CHECKER,str(root),'--semantic','--strict','--installed-reference='+options['installedReference']['manifestPath'],'--installed-reference-sha256='+options['installedReference']['expectedSha256']],env=ENV,cwd=TMP,capture_output=True,timeout=15)
    dump(c/'strict-cli-raw.json',{'argv':cli.args,'exitCode':cli.returncode,'stdout':cli.stdout.decode(),'stderr':cli.stderr.decode()});strict=json.loads(cli.stdout);dump(c/'strict.json',strict)
    assert a['status']=='INCOMPLETE' and not a['graph']['installed'][0]['verified'] and a['graph']['installed'][0]['contentIdentity']['status']=='MATCH'
    stats=check_lineage(a,root);assert 'specifier' in stats['details'];assert a['semanticBoundary']==b['semanticBoundary']==strict['semanticBoundary'];return stats
def p11(c):
    vendor=b'export const value=1; //'+bytes([255]);options=host_fixture(c,"import 'vendor';export const result=1;",vendor)
    a,r=call(c/'run',CHECKER,'auditProductBoundary',[str(c/'evaluated'),options]);stats=check_lineage(a,c/'evaluated')
    origin=next(x for x in a['semanticBoundary']['frontierOrigins'] if x['semanticPointer']['reason']=='UNKNOWN_ENCODING')
    assert origin['file']=='node_modules/vendor/index.js' and origin['fileSha256']==h(vendor);assert a['status']=='INCOMPLETE' and not a['graph']['installed'][0]['verified'];return {'origin':origin,**stats}
def p12(c):
    options=host_fixture(c,"import 'vendor';export const result=1;",'export const result=1;',missing=True)
    a,r=call(c/'run',CHECKER,'auditProductBoundary',[str(c/'evaluated'),options]);stats=check_lineage(a,c/'evaluated')
    assert stats['nullPhysical']>0 and a['status']=='INCOMPLETE';return stats
def p13(c):
    core='const data={x:1};Object.getOwnPropertyDescriptor(data,"x");Object.getOwnPropertyDescriptor(data,"x");export function external(input){return Object.getPrototypeOf(input)}'
    options=host_fixture(c,core);a,r=call(c/'run',CHECKER,'auditProductBoundary',[str(c/'evaluated'),options]);stats=check_lineage(a,c/'evaluated')
    base=a['semanticBoundary']['origins']; assert len(base)>=3 and len(set(x['id'] for x in base))==len(base);assert not a['resolvedDiagnostics'];assert a['status']=='INCOMPLETE';return stats
def spot(c,name,expected):
    old=pathlib.Path('/tmp/cvg-hiso005-integration-20261018/review0236-r1')/name;request=json.loads((old/'request.json').read_text());root=pathlib.Path(request['evaluated']);options={**request['options'],'graph':True}
    before={str(p):h(p.read_bytes()) for p in old.rglob('*') if p.is_file() and not p.is_symlink()}
    a,r=call(c/'run',CHECKER,'auditProductBoundary',[str(root),options]);assert a['status']==expected and not a['graph']['installed'][0]['verified'];assert all(x['status']!='PROVEN' for x in a['semanticBoundary']['installed']);assert not a['semanticBoundary']['proofs']
    assert before=={str(p):h(p.read_bytes()) for p in old.rglob('*') if p.is_file() and not p.is_symlink()};dump(c/'preserved-physical-fixture.json',before);stats=check_lineage(a,root)
    return {'status':a['status'],'verified':a['graph']['installed'][0]['verified'],'vendorSha256':h((root/'node_modules/vendor/index.js').read_bytes()),**stats}
def p16(c):
    options=host_fixture(c,"import {value} from 'vendor';export const result=value;",'export const value=1;')
    root=str(c/'evaluated');base={k:v for k,v in options.items() if k!='semantic'}
    d,r=call(c/'default',CHECKER,'auditProductBoundary',[root,{'graph':True}]);p,r=call(c/'identity',CHECKER,'auditProductBoundary',[root,base]);a,r=call(c/'semantic',CHECKER,'auditProductBoundary',[root,options])
    assert d['status']==p['status']=='INCOMPLETE' and not d['graph']['installed'][0]['verified'] and not p['graph']['installed'][0]['verified'];assert 'semanticBoundary' not in d and 'semanticBoundary' not in p
    assert a['status']=='PASS' and a['graph']['installed'][0]['verified'] and a['semanticBoundary']['status']=='PROVEN';assert a['exceptionsApplied']==False and not a['exceptions']
    return {'default':d['status'],'identityOnly':p['status'],'semantic':a['status'],'verified':True,'resolved':len(a['resolvedDiagnostics'])}

scenario(1,'one worker; no parser descendants',p01)
scenario(2,'SIGSTOP exact own worker; deadline kills and reaps',p02)
scenario(3,'external validation uses controlled worker; stalled recomputation refuses',p03)
scenario(4,'raw ESM typed JS never erased',lambda c:grammar(c,'export const value:number=1;','js'))
scenario(5,'ESM duplicate const grammar',lambda c:grammar(c,'const x=1;const x=2;export const result=x;','mjs'))
scenario(6,'CJS duplicate const grammar',lambda c:grammar(c,'const x=1;const x=2;module.exports=1;','cjs'))
scenario(7,'TS duplicate const after strip',lambda c:grammar(c,'const x:number=1;const x:number=2;export const result=x;','ts'))
scenario(8,'valid TS strip and target no execution sentinel',p08)
scenario(9,'public caller runtime flags refused',p09)
scenario(10,'each anonymous-loader frontier has canonical physical independent identity',p10)
scenario(11,'raw invalid UTF8 physical byte hash',p11)
scenario(12,'missing entry and absent provenance keep null identity',p12)
scenario(13,'duplicate baseline remains distinct from new blocking frontier',p13)
scenario(14,'R1 p17 computed product physical spot recheck',lambda c:spot(c,'p17-host-installed-computed-finite','FAIL'))
scenario(15,'R1 anonymous installed false PASS physical spot recheck',lambda c:spot(c,'p15-host-installed-default','INCOMPLETE'))
scenario(16,'default and identity refuse; closed MATCH needs semantic proof',p16)
assert len(RESULTS)==16
