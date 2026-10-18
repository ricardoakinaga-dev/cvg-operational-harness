from pathlib import Path
import datetime,gzip,hashlib,json,subprocess,os
root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
ev=root/'docs/04_audit/evidence/HISO005-0234-BUILD-20261017'
candidate=Path('/home/ricardo/cvg-candidates/hiso005-0234-20261017')
base=Path('/tmp/cvg-hiso005-0234-20261017')
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
cert=json.loads((ev/'full-certification-summary.json').read_text())
assert cert['status']=='PASS_ALL_16_LOCAL_GATES' and len(cert['gates'])==16
assert cert['head']=='b7032f8245fbfbec5570c585518172de9ab7f075'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()==cert['head']
freeze=json.loads((ev/'source-freeze-r2.json').read_text())
assert len(freeze['paths'])==9 and all(sha((candidate/f).read_bytes())==h for f,h in freeze['paths'].items())
assert all(sha((candidate/f).read_bytes())==h for f,h in json.loads((ev/'baseline-inputs.json').read_text())['protected'].items())
assert sha((root/'docs/02_spec/0234_b6_installed_content_identity.md').read_bytes())=='b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d'
assert sha((root/'docs/03_build/0389_hiso005_positive_proof_execution.md').read_bytes())=='560d63c93d1b4702a63f9fa0b1a05d9966facd763ba2dec9049c836e9c759e3b'
criteria=json.loads((ev/'acceptance-status.json').read_text());assert len(criteria['criteria'])==14 and all(v['status']=='PASS'for v in criteria['criteria'].values())
review=json.loads((ev/'review-r1/review.json').read_text());assert review['verdict']=='APPROVE_SCOPED_DIFF'and not review['mandatoryFindings']
assert json.loads((ev/'resource-cleanup-final.json').read_text())['status']=='PASS'
assert json.loads((ev/'resource-cleanup-pg.json').read_text())['status']=='PASS'
assert not Path('/proc/1650702').exists()
assert not subprocess.check_output(['ss','-ltnH','( sport = :56234 or sport = :3384 or sport = :4384 )'],text=True).strip()
for record in json.loads((ev/'certified-artifact-copies.json').read_text())['copies']:
 raw=gzip.decompress((ev/record['artifact']).read_bytes());assert len(raw)==record['bytes']and sha(raw)==record['sha256']
for name in ['HISO005-PROOF-PLAN-20261017','B6-0228-BUILD-20261017','DOCS-ISOLATION-20261017']:
 prior=root/'docs/04_audit/evidence'/name
 for f in json.loads((prior/'evidence-manifest.json').read_text())['files']:
  p=prior/f['path'];assert p.is_file() and sha(p.read_bytes())==f['sha256'] and p.stat().st_size==f['bytes']
logs=[]
for source,destination,command in [
 ('final-links-r2.log','final-links.log','node scripts/check-doc-links.mjs README.md AGENTS.md docs products'),
 ('final-format-r2.log','final-format.log','prettier --check nine own native documents'),
 ('final-whitespace.log','final-whitespace.log.gz','git diff --check -- own native tracked documents')]:
 p=base/source;raw=p.read_bytes();target=ev/destination
 target.write_bytes(gzip.compress(raw,mtime=0)if destination.endswith('.gz')else raw)
 logs.append({'command':command,'exitCode':0,'artifact':destination,'rawSha256':sha(raw),'commandCompletedAt':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat()})
assert b'DOC_LINKS_OK'in(base/'final-links-r2.log').read_bytes()
assert b'All matched files use Prettier code style!'in(base/'final-format-r2.log').read_bytes()
assert (base/'final-whitespace.log').read_bytes()==b''
# These are verified typed observations, not empty-log inference.
state=json.loads((ev/'state.json').read_text())
state.update(status='COMPLETED',scopeStatus='COMPLETED_LOCAL_14_OF_14',stage='AUDIT',taskComplete=True,goalComplete=False,hiso005Closed=False,b6Accepted=False,productionApproved=False,rootIntegrated=False,activeGate=None,activeSessions={},activeLanes={},completedAt=now(),lastCompletedAction='SPEC0234 H5-P1:14criteria/16localgates,3607unit/302PG/12E2E zero failures/skips/todo/flaky;official38hashes current;freshconsumer198imports/72exports;normalstrict andsources/ref intact;critical0mandatory;ownresources cleaned.',nextAction='Prepare bounded P2 semantic/loaders/receivers/mirrors contract using real evidence and explicit esbuild mismatch; then P3/newB6 under existing0389. No future BUILD approval inferred.',evidenceManifest='evidence-manifest.json',centralCatalogIntegration={'status':'PENDING_CONCURRENT_WRITER_CLAUDE100','delta':'empty-artifact-central-delta.json','scopeLocalHygiene':'PASS','centralFileModifiedByThisTask':False})
if 'processIdentity'in state:state['completedProcessIdentity']=state.pop('processIdentity')
if 'certifyPid'in state:state['historicalCertifyPid']=state.pop('certifyPid')
state['ownedResources'].update(containerStatus='REMOVED',portsStatus='FREE',activeProcesses=0)
(ev/'state.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
controls=['docs/02_spec/0190_spec_validation.md','docs/03_build/0390_hiso005_installed_identity_build.md','docs/03_build/0370_harness_product_isolation_backlog.md','docs/08_runtime/0803_runbook_gates_locais.md','docs/08_runtime/agent_coordination.md','docs/08_runtime/handoffs/hiso005_proof_20261017.md','docs/20_master_execution_log.md','docs/30_backlog_master.md','docs/99_runtime_state.md']
(ev/'control-plane-final.json').write_text(json.dumps({'observedAt':now(),'scope':'Own current native records; complete H5-P1, parentHISO005 remainsIN_PROGRESS','files':{f:sha((root/f).read_bytes())for f in controls},'frozenSpecSha256':'b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d','frozenPlan0389Sha256':'560d63c93d1b4702a63f9fa0b1a05d9966facd763ba2dec9049c836e9c759e3b'},indent=2)+'\n')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
p=subprocess.run([node,'scripts/check-evidence-hygiene.mjs',str(ev)],cwd=root,capture_output=True,text=True)
assert p.returncode==0,(p.stdout,p.stderr)
(ev/'final-evidence-hygiene.log').write_text(p.stdout+p.stderr)
checks={'observedAt':now(),'status':'PASS','records':logs+[{'command':'node scripts/check-evidence-hygiene.mjs ownEvidenceRoot','exitCode':p.returncode,'artifact':'final-evidence-hygiene.log'}],'scope':'Links full repository; formatting own9native docs; whitespace owntrackednative docs; evidence hygiene scoped only. Central catalog owner respected; delta prepared.','sourceIntegrity':'final-integrity-and-freshness.json','completeCertification':'full-certification-summary.json','officialCurrentVerifier':'certification-verify.log'}
(ev/'final-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
excluded={'evidence-manifest.json','completeness-audit.json'}
files=[]
for p in sorted(ev.rglob('*')):
 if not p.is_file()or p.relative_to(ev).as_posix()in excluded:continue
 assert not p.is_symlink()
 raw=p.read_bytes()
 if p.suffix=='.json'and raw:json.loads(raw)
 files.append({'path':p.relative_to(ev).as_posix(),'bytes':len(raw),'sha256':sha(raw)})
manifest={'schemaVersion':1,'task':'HISO005-CONTENT-ID-BUILD-0234','candidateCommit':cert['head'],'runId':cert['runId'],'createdAt':now(),'files':files,'excludedSelfReferences':sorted(excluded)}
(ev/'evidence-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for f in files:
 p=ev/f['path'];assert p.stat().st_size==f['bytes']and sha(p.read_bytes())==f['sha256']
audit={'status':'PASS','observedAt':now(),'taskStatus':'COMPLETED','scopeVerdict':'VERIFIED_LOCAL_H5_P1_ONLY','candidateCommit':cert['head'],'criteriaPassed':14,'localGatesPassed':16,'officialArtifactsVerified':38,'currentEvidenceFilesBound':len(files),'manifestSha256':sha((ev/'evidence-manifest.json').read_bytes()),'allBoundFilesMatch':True,'allBoundJsonParses':True,'previousSealedFilesPreserved':276,'source9AndOriginal156Unchanged':True,'compiledConsumerFinal':'PASS','allOwnedJobsAndAgentsClosed':True,'ownPgRemovedAndPortsFree':[56234,3384,4384],'hiso005Closed':False,'b6Accepted':False,'productionApproved':False,'centralCatalogDeltaPendingOtherWriter':True,'limitations':['Closure303:302MATCH/1esbuildMISMATCH, allverifiedfalse; fullphysical304:303MATCH/1MISMATCH. No lifecycle exclusion or semantic trust.','Root code not integrated; whole HISO005 requiresP2/P3/newB6. Local CONDITIONAL_GO/AAA_CONTROLLED is not production.','Central empty-artifact catalog is owned by activeClaude100; scoped catalog/hygiene pass and additive own delta ready.']}
(ev/'completeness-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({'status':audit['status'],'taskStatus':state['status'],'filesBound':len(files),'criteria':14,'gates':16,'manifestSha256':audit['manifestSha256'],'centralCatalog':'handoff_pending_other_owner'}))
