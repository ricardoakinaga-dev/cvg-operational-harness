from pathlib import Path
import json,subprocess,hashlib,traceback,os
P=Path('/tmp/cvg-hiso005-integration-20261018/recovery-review-r2')
OLD=Path('/tmp/cvg-hiso005-integration-20261018/recovery-review-r1')
ns={};code=(OLD/'probes.py').read_text();exec(compile(code[:code.index("scenario(1,'one worker")],str(OLD/'probes.py'),'exec'),ns)
ns['TMP']=P;ns['OUT']=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236/recovery-r2/review-r2');ns['ENV']={**ns['ENV'],'TMPDIR':str(P)}
NODE=ns['NODE'];ENV=ns['ENV'];CHECKER=ns['CHECKER'];ENGINE=ns['ENGINE'];dump=ns['dump'];h=ns['h'];call=ns['call'];fixture=ns['fixture'];host_fixture=ns['host_fixture'];lineage=ns['check_lineage'];RESULTS=[]
def scenario(n,title,fn):
 c=P/f'p{n:02d}';c.mkdir(exist_ok=True)
 try:r={'id':f'p{n:02d}','title':title,'status':'PASS','detail':fn(c)}
 except Exception as e:r={'id':f'p{n:02d}','title':title,'status':'FAIL','error':str(e),'traceback':traceback.format_exc()}
 RESULTS.append(r);dump(c/'assessment.json',r);dump(P/'summary.json',RESULTS);print(json.dumps(r,ensure_ascii=False),flush=True)
def relevant(report,label='node_modules/vendor/package.json'):
 return [x for key in ['origins','frontierOrigins'] for x in report['semanticBoundary'][key] if x.get('file')==label or x.get('requestedFile')==label or x.get('semanticPointer',{}).get('reportedFile')==label]
def unavailable(rows):
 assert rows
 assert all(x['file'] is None and x['fileSha256'] is None and x['start'] is None and x['end'] is None for x in rows),rows
def instrument(c,q):
 dump(c/'request.json',q);r=subprocess.run([NODE,str(P/'observer.mjs')],input=json.dumps(q).encode(),capture_output=True,env=ENV,cwd=P,timeout=35)
 dump(c/'raw.json',{'argv':r.args,'env':ENV,'exitCode':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()});assert r.returncode==0,r.stderr.decode();a=json.loads(r.stdout);dump(c/'output.json',a);assert not a['remaining'];return a
def setup(c,mode='observe',product=False):
 opts=host_fixture(c,"import 'vendor';export const result=1;",'export const value=1;');root=c/'evaluated';victim=root/'node_modules/vendor/package.json'
 pkg=json.loads(victim.read_text());pkg['_probe']='AAAA';
 if product:pkg['description']='products/shift'
 # Deliberate identity mismatch for fault-injection fixtures: never claim these as trusted packages.
 victim.write_text(json.dumps(pkg));sentinel=c/'synthetic-sentinel.json';sentinel.write_text(json.dumps({**pkg,'_probe':'EXTERNAL_SYNTHETIC'}))
 return {'checker':CHECKER,'root':str(root),'options':opts,'victim':str(victim),'sentinel':str(sentinel),'backup':str(c/'own-manifest-backup.json'),'replacement':json.dumps({**pkg,'_probe':'REPLACED'}),'mode':mode}
def p01(c):
 old=OLD/'p12/alias-complement';q=json.loads((old/'request.json').read_text());ref=q['options']['installedReference'];graph=c/'graph.json'
 argv=[NODE,CHECKER,q['root'],'--semantic','--installed-reference='+ref['manifestPath'],'--installed-reference-sha256='+ref['expectedSha256'],'--graph='+str(graph)]
 r=subprocess.run(argv,env=ENV,cwd=P,capture_output=True,timeout=20);dump(c/'raw.json',{'argv':argv,'env':ENV,'exitCode':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()});a=json.loads(r.stdout);dump(c/'output.json',a)
 assert r.returncode==1 and a['status']=='INCOMPLETE';unavailable(relevant(a));g=json.loads(graph.read_text());assert all(not x['verified'] for x in g['installed']);sentinelHash=h(Path(q['sentinel']).read_bytes());assert not any(x.get('fileSha256')==sentinelHash for k in ['origins','frontierOrigins'] for x in a['semanticBoundary'][k]);return {'status':a['status'],'aliasOrigins':relevant(a),'verified':0}
def p02(c):
 old=json.loads((OLD/'p12/alias-complement/request.json').read_text());q={'checker':CHECKER,'root':old['root'],'options':old['options'],'victim':old['alias'],'sentinel':old['sentinel'],'mode':'observe'};a=instrument(c,q);unavailable(relevant(a['report']));assert not any(x['event'] in ['capture-open','capture-read','unexpected-capture-readFileSync'] for x in a['events']);return {'captureAcquisition':0,'events':a['events'],'status':a['report']['status']}
def p03(c):
 q=setup(c);a=instrument(c,q);rows=relevant(a['report']);expected=h(Path(q['victim']).read_bytes());assert any(x.get('fileSha256')==expected for x in rows)
 opens=[x for x in a['events'] if x['event']=='capture-open'];assert len(opens)==1
 for x in opens: assert x['flags'] & os.O_NOFOLLOW and x['flags'] & os.O_NONBLOCK
 reads=[x for x in a['events'] if x['event']=='capture-read'];size=Path(q['victim']).stat().st_size;assert all(x['bufferLength']==size+1 and x['requested']<=size+1 for x in reads);assert len(a['closed'])==len(a['opened'])==1;return {'sha256':expected,'flags':opens[0]['flags'],'boundedBuffer':size+1,'fdClosed':True}
def p04(c):
 opts=host_fixture(c,"import 'vendor';export const result=1;",b'export const value=1;//'+bytes([255]));a,r=call(c/'run',CHECKER,'auditProductBoundary',[str(c/'evaluated'),opts]);s=lineage(a,c/'evaluated');x=next(x for x in a['semanticBoundary']['frontierOrigins'] if x['semanticPointer']['reason']=='UNKNOWN_ENCODING');assert x['fileSha256']==h((c/'evaluated/node_modules/vendor/index.js').read_bytes());return s
def p05(c):
 q=setup(c);Path(q['victim']).unlink();a=instrument(c,q);unavailable(relevant(a['report']));assert not any(x['event']=='capture-open' for x in a['events']);return {'requestedLabel':'node_modules/vendor/package.json','unavailable':True,'opens':0}
def p06(c):
 q=setup(c);pkg=json.loads(Path(q['victim']).read_text());pkg['description']='x'*(16*1024*1024);Path(q['victim']).write_text(json.dumps(pkg));a=instrument(c,q);unavailable(relevant(a['report']));assert not any(x['event']=='capture-open' for x in a['events']);return {'actualBytes':Path(q['victim']).stat().st_size,'emitterOpens':0,'cap':16*1024*1024}
def p07(c):
 q=setup(c,'open-symlink');a=instrument(c,q);assert a['fired'];assert any(x.get('code')=='ELOOP' for x in a['events']);unavailable(relevant(a['report']));assert not any(x['event']=='capture-read' for x in a['events']);return {'noFollowRefusal':'ELOOP','reads':0,'remaining':a['remaining']}
def p08(c):
 q=setup(c,'open-inode');a=instrument(c,q);assert a['fired'];unavailable(relevant(a['report']));assert not any(x['event']=='capture-read' for x in a['events']);assert len(a['closed'])==1;return {'inodeSwapRefusedBeforeRead':True,'closed':a['closed']}
def p09(c):
 q=setup(c,'path-after-open');originalHash=h(Path(q['victim']).read_bytes());a=instrument(c,q);assert a['fired'];unavailable(relevant(a['report']));assert any(x['event']=='capture-read' for x in a['events']);assert len(a['closed'])==1;return {'oldOpenedFileRead':True,'pathReplacementRefused':True,'oldHashNotAssigned':not any(x.get('fileSha256')==originalHash for x in relevant(a['report']))}
def p10(c):
 q=setup(c,'growth');a=instrument(c,q);assert a['fired'];unavailable(relevant(a['report']));assert len(a['closed'])==1;reads=[x for x in a['events'] if x['event']=='capture-read'];return {'growthRefused':True,'reads':reads,'fdClosed':True}
def p11(c):
 q=setup(c,'same-size');a=instrument(c,q);assert a['fired'];unavailable(relevant(a['report']));assert len(a['closed'])==1;return {'sameSizeMutationRefused':True,'fdClosed':True}
def p12(c):
 q=setup(c,'cache-change',True);a=instrument(c,q);assert a['fired'];rows=relevant(a['report']);assert any(x.get('file') for x in rows) and any(x.get('requestedFile') for x in rows);assert len([e for e in a['events'] if e['event']=='capture-open'])==1;return {'cacheMutationRefused':True,'originRows':rows,'emitterOpens':1}
def p13(c):
 q=setup(c,'read-error');a=instrument(c,q);assert a['fired'];unavailable(relevant(a['report']));assert len(a['closed'])==1 and not a['remaining'];return {'EIORefused':True,'fdClosed':True,'remaining':[]}
def p14(c):
 i=fixture(c);positive,r=call(c/'normal',ENGINE,'runSemanticBoundary',[i],observe=True);assert positive['status']=='PROVEN' and r['maxDepth']==1 and not r['remaining']
 i['limits']={'timeoutMs':1100};a,r=call(c/'stopped',ENGINE,'runSemanticBoundary',[i],observe=True,stop=True);assert a['status']=='UNKNOWN' and not a['proofs'] and r['stopped'] and r['maxDepth']==1 and not r['remaining'] and r['elapsedMs']<2500
 valid,rv=call(c/'validate',ENGINE,'validateSemanticBoundary',[{k:v for k,v in i.items() if k!='limits'},positive],observe=True);assert valid['valid'] and rv['maxDepth']==1 and not rv['remaining'];return {'normal':'PROVEN','stopped':'UNKNOWN','elapsedMs':r['elapsedMs'],'depth':r['maxDepth'],'externalValidate':True,'remaining':[]}
def p15(c):
 old=json.loads((OLD/'p10/normal/input.json').read_text());root,opts=old['args'];a,r=call(c/'repeat1',CHECKER,'auditProductBoundary',[root,opts]);b,r=call(c/'repeat2',CHECKER,'auditProductBoundary',[root,opts]);prior=json.loads((OLD/'p10/normal/output.json').read_text());stats=lineage(a,Path(root));assert a['semanticBoundary']['frontierOrigins']==b['semanticBoundary']['frontierOrigins']==prior['semanticBoundary']['frontierOrigins'];assert a['semanticBoundary']['origins']==prior['semanticBoundary']['origins'];assert a['status']=='INCOMPLETE' and not a['graph']['installed'][0]['verified'];return {'oldOriginIdsRetained':True,'repeatDeterministic':True,**stats}
def p16(c):
 q=json.loads((Path('/tmp/cvg-hiso005-integration-20261018/review0236-r1')/'p17-host-installed-computed-finite/request.json').read_text());a,r=call(c/'run',CHECKER,'auditProductBoundary',[q['evaluated'],{**q['options'],'graph':True}]);assert a['status']=='FAIL' and not a['graph']['installed'][0]['verified'] and not a['semanticBoundary']['proofs'];return {'status':'FAIL','verified':False,'proofs':0}

scenario(1,'R1 alias physical witness via plain CLI',p01)
scenario(2,'refused alias has zero emitter acquisition calls',p02)
scenario(3,'regular physical origin uses bounded nofollow/nonblock FD and closes',p03)
scenario(4,'raw invalid UTF8 frontier retains physical hash',p04)
scenario(5,'missing manifest unavailable/null and no FD acquisition',p05)
scenario(6,'over16MiB origin rejected before open',p06)
scenario(7,'file-to-symlink race at open is refused without reading',p07)
scenario(8,'regular inode replacement at open refused before read',p08)
scenario(9,'path alias replacement after open detected after bounded read',p09)
scenario(10,'file growth during read rejected and FD closed',p10)
scenario(11,'same-size byte mutation during read rejected and FD closed',p11)
scenario(12,'cached stat revalidated on later diagnostic',p12)
scenario(13,'read failure refuses provenance and closes FD',p13)
scenario(14,'semantic lifecycle and external validation remain supervised',p14)
scenario(15,'old canonical frontier and baseline IDs stable/deterministic',p15)
scenario(16,'old R1 finite computed-product witness remains FAIL',p16)
assert len(RESULTS)==16
