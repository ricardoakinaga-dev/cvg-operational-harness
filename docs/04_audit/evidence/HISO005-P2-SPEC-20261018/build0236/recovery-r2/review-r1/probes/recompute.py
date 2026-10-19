import pathlib,json,hashlib,collections,subprocess,gzip
R=pathlib.Path('/home/ricardo/Área de trabalho/cvg-operational-harness');B=R/'docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236';O=B/'recovery-r2/review-r1';C=pathlib.Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018');T=pathlib.Path('/tmp/cvg-hiso005-integration-20261018');P=T/'recovery-review-r1'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result={};pins=[]
def pin(p):pins.append({'path':str(p),'sha256':h(p),'bytes':p.stat().st_size})
def save(name,x):(O/name).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
def git(*args):return subprocess.check_output(['git','--no-optional-locks','-C',str(C),*args])
prior=json.loads((R/'docs/04_audit/evidence/HISO005-0234-BUILD-20261017/review-r1/review.json').read_text());protected=prior['sourceIntegrity']['protectedFiles']
result['original156Protected']=[]
for name,sha in protected.items():
 if not name.startswith('tests/'):continue
 row={'path':name,'sha256':h(C/name),'matchesProtected0234':h(C/name)==sha}
 if not row['matchesProtected0234']:
  row['same26d']=h(C/name)==hashlib.sha256(git('show','26d866c39060669680aca01b34a916d45e1ba362:'+name)).hexdigest()
  row['preexistingChange']='Nine additive SDK public API pins before this source17 composition; test cases retained.'
  (O/'preexisting-public-surface.patch').write_bytes(git('diff','b7032f8245fbfbec5570c585518172de9ab7f075','26d866c39060669680aca01b34a916d45e1ba362','--',name))
 result['original156Protected'].append(row)
result['leadRawResults']={}
for name in ['recovery-r2/first-red.json','recovery-r2/focused-r1.json','recovery-r2/encoding-first-red.json','recovery-r2/full-focused-r1.json','legacy-composed-r1.json','test-migration/first-red-public-build.json']:
 p=B/name;pin(p);d=json.loads(p.read_text());rows=[a for t in d.get('testResults',[]) for a in t.get('assertionResults',[])]
 result['leadRawResults'][name]={'reported':{k:d[k] for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests'] if k in d},'recounted':dict(collections.Counter(x['status'] for x in rows)),'failures':[{'fullName':x['fullName'],'failureMessages':x.get('failureMessages')} for x in rows if x['status']=='failed']}
# Multiset of legacy fullNames is recomputed against raw first-red collection.
a=json.loads((B/'test-migration/first-red-public-build.json').read_text());b=json.loads((B/'legacy-composed-r1.json').read_text());names=lambda d:collections.Counter(x['fullName'] for s in d['testResults'] for x in s['assertionResults'])
result['legacyNames']={'baseline':sum(names(a).values()),'final':sum(names(b).values()),'exactMultiset':names(a)==names(b),'missing':list((names(a)-names(b)).elements()),'extra':list((names(b)-names(a)).elements())}
result['historicalDefaultComparison']=[]
for mode in ['default','identity']:
 for suffix in ['','-graph']:
  p=T/f'final-{mode}-before{suffix}.json';q=T/f'final-{mode}-after{suffix}.json'
  if p.exists() and q.exists():
   pin(p);pin(q);result['historicalDefaultComparison'].append({'mode':mode,'graph':bool(suffix),'bytesEqual':p.read_bytes()==q.read_bytes(),'sha256':h(q)})
result['historical019']={}
for p in T.glob('semantic-final-normal*.json'):
 try:d=json.loads(p.read_text())
 except:continue
 pin(p)
 if 'diagnostics' in d:result['historical019']['report']={'path':str(p),'status':d['status'],'diagnostics':len(d['diagnostics']),'resolved':len(d.get('resolvedDiagnostics',[])),'baseline':d['semanticBoundary']['occurrences']['baseline'],'new':d['semanticBoundary']['occurrences']['new'],'compiled':d['semanticBoundary']['compiledProvenance']['status']}
 if 'installed' in d:result['historical019']['graph']={'path':str(p),'installed':len(d['installed']),'identity':dict(collections.Counter(x.get('contentIdentity',{}).get('status') for x in d['installed'])),'verified':sum(x['verified'] for x in d['installed'])}
# Preserve and read original R2 lifecycle witness and missing frontier-identity witness.
for p in [B/'review-r1/REPORT.md',B/'review-r1/review.json',B/'review-r2/REPORT.md',B/'review-r2/review.json',B/'review-r2/probes/p14-grammar-child-deadline/lifecycle-result.json',B/'review-r2/probes/p02-installed-anon-loader/output.json',B/'review-r1/probes/p17-host-installed-computed-finite/output.json',B/'review-r1/probes/p15-host-installed-default/output.json',B/'recovery-r2/task-short-spec.json',B/'recovery-r2/focused-source-observation.json',O/'frozen-inputs.json',R/'docs/02_spec/0236_b6_semantic_boundary_proof.md']:pin(p)
old=json.loads((B/'review-r2/probes/p02-installed-anon-loader/output.json').read_text())
if 'report' in old:old=old['report']
if 'semanticBoundary' in old:result['oldR2FrontierWitness']={'new':old['semanticBoundary']['occurrences']['new'],'ownOriginIds':sum(bool(x.get('originId')) for x in old['diagnostics'] if x['reason']=='UNVERIFIED_SEMANTIC_FRONTIER')}
# Complete source inventory, unchanged catalog, no changes beyond the four recovery paths.
f=json.loads((O/'frozen-inputs.json').read_text());result['source17']=[]
for x in f['files']:result['source17'].append({'path':x['path'],'sha256':h(C/x['path']),'matchesFreeze':h(C/x['path'])==x['sha256']})
result['recoveryChangedPaths']=git('diff','--name-only',f['previousSemanticCheckpoint'],f['commit']).decode().splitlines()
save('artifact-recomputation.json',result);save('inspected-input-hashes.json',pins)
print(json.dumps({'leadTests':{k:v['recounted'] for k,v in result['leadRawResults'].items()},'legacyNames':result['legacyNames'],'historical019':result['historical019'],'historicalDefaultPairs':result['historicalDefaultComparison'],'original156':result['original156Protected']},ensure_ascii=False,indent=2))
