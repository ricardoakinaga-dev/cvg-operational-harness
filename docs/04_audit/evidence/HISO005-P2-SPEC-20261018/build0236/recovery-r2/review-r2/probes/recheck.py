from pathlib import Path
import json,traceback
P=Path('/tmp/cvg-hiso005-integration-20261018/recovery-review-r2')
ns={};s=(P/'probes.py').read_text();exec(compile(s[:s.index("scenario(1,'R1 alias")],str(P/'probes.py'),'exec'),ns)
dump=ns['dump'];setup=ns['setup'];instrument=ns['instrument'];unavailable=ns['unavailable']
initial=json.loads((P/'summary.json').read_text());final=json.loads(json.dumps(initial));changes=[]
# Reassess the existing missing-manifest raw observation: the installed node is
# the directory when the manifest is absent, so requestedFile labels that node.
missing=json.loads((P/'p05/output.json').read_text());rows=[x for x in missing['report']['semanticBoundary']['origins'] if x.get('requestedFile')=='node_modules/vendor'];unavailable(rows);assert not missing['events'] and not missing['opened']
final[4].update(status='PASS',detail={'missingManifestOrigin':'node_modules/vendor','file':None,'fileSha256':None,'emitterAcquisition':0,'method':'Reassessment of original raw only; wrong initial manifest label oracle corrected.'});final[4].pop('error',None);final[4].pop('traceback',None);changes.append({'scenario':'p05','reason':'Missing manifest uses installed directory node label; original observer confirmed no acquisition.'})
for n,mode in [(7,'open-symlink'),(8,'open-inode'),(9,'path-after-open'),(10,'growth'),(11,'same-size'),(12,'cache-change'),(13,'read-error')]:
 c=P/f'p{n:02d}'/'recheck';c.mkdir(parents=True,exist_ok=True)
 try:
  q=setup(c,mode,n==12);a=instrument(c,q);assert a['fired'];baseline=[x for x in a['report']['semanticBoundary']['origins'] if x.get('requestedFile')=='node_modules/vendor/package.json'];assert baseline
  unavailable(baseline)
  assert len(a['opened'])==len(a['closed']) and not a['remaining']
  if n==7:
   assert any(x.get('code')=='ELOOP' for x in a['events']);idx=next(i for i,x in enumerate(a['events']) if x.get('code')=='ELOOP');assert not any(x['event']=='capture-read' for x in a['events'][:idx])
  if n in [8,9]:assert a['opened'][0]['reads']==0
  if n in [10,11]:assert a['opened'][0]['reads']>=1
  if n==10:
   reads=[x for x in a['events'] if x['event']=='capture-read'];assert reads[0]['returned']+reads[1]['returned']==reads[0]['bufferLength']
  if n==12:assert len(a['opened'])==1 and any(x.get('file')=='node_modules/vendor/package.json' for x in a['report']['semanticBoundary']['origins'])
  if n==13:assert any(x['event']=='injected-EIO' for x in a['events'])
  detail={'injection':mode,'initialBaselineOriginUnavailable':True,'openedGenerations':a['opened'],'closedGenerations':a['closed'],'remaining':a['remaining'],'raw':'p%02d/recheck/output.json'%n,'note':'Later frontier acquisition after a restored/replaced regular file is evaluated independently; it does not undo the original baseline refusal.'}
  final[n-1].update(status='PASS',detail=detail);final[n-1].pop('error',None);final[n-1].pop('traceback',None);dump(c/'assessment.json',{'status':'PASS',**detail})
  changes.append({'scenario':f'p{n:02d}','reason':'Correct observer uses active FD generations and excludes mutation injector I/O; oracle checks first baseline refusal separately from later valid frontier acquisition.','status':'PASS'})
  print(json.dumps({'scenario':f'p{n:02d}','status':'PASS','openGenerations':a['opened'],'closed':a['closed']},ensure_ascii=False),flush=True)
 except Exception as e:
  dump(c/'assessment.json',{'status':'FAIL','error':str(e),'traceback':traceback.format_exc()});print(json.dumps({'scenario':f'p{n:02d}','status':'FAIL','error':str(e)}),flush=True);final[n-1]['status']='FAIL';final[n-1]['correctedMeasurementFailure']=traceback.format_exc()
dump(P/'final-summary.json',final);dump(P/'measurement-correction.json',{'initialSummary':'first-attempt/summary.json','retainedInitialRaw':True,'sourceChanged':False,'newScenarioIds':0,'corrections':changes,'scope':'Verifier measurement repair only, not a new source/recovery round.'})
