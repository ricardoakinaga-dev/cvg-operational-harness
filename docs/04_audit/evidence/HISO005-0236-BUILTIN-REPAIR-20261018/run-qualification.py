"""Qualify this frozen source once; stop before promotion for Lead inspection."""
from pathlib import Path
import datetime,json,subprocess,sys,hashlib

ev=Path(__file__).resolve().parent
candidate=Path('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018')
freeze=json.loads((ev/'source-freeze.json').read_text())
statepath=ev/'state.json'
steps=[]
def step(name,args):
    state=json.loads(statepath.read_text())
    state.update(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),phase=name,qualificationSteps=steps,nextAction='Follow same qualification job; source frozen, no restart or promotion before complete current evidence.')
    statepath.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'stage':name,'event':'STARTED'}),flush=True)
    p=subprocess.run([sys.executable,str(ev/args[0]),*args[1:]])
    steps.append({'stage':name,'argv':[sys.executable,str(ev/args[0]),*args[1:]],'exitCode':p.returncode})
    (ev/'qualification-orchestration.json').write_text(json.dumps({'status':'RUNNING' if p.returncode==0 else 'FAILED','sourceCommit':freeze['commit'],'steps':steps},indent=2)+'\n')
    assert p.returncode==0,(name,p.returncode)
step('CERTIFICATION_CURRENT',['run-certify-r1.py'])
receipt=json.loads((ev/'certify-r1-receipt.json').read_text())
result=json.loads((candidate/'certification/phase10-result.json').read_text())
manifest=json.loads((candidate/'certification/manifest.json').read_text())
assert receipt['head']==freeze['commit'] and receipt['exitCode']==0
assert len(result['gates'])==16 and all(x['status']=='PASS' and x['exitCode']==0 for x in result['gates'])
assert manifest['candidateId']==result['candidate']['candidateId'] and manifest['runId']==result['runId']
s=json.loads(statepath.read_text());s.update(certificationCandidateId=manifest['candidateId'],certificationRunId=manifest['runId'],certificationFinished=True,actualGateMetrics=result['metrics']);statepath.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
step('OFFICIAL_CURRENT_VERIFIER',['verify-current-certification.py'])
step('ARCHIVE_MANIFEST_BOUND_ARTIFACTS',['archive-current-qualification.py'])
step('POSTCERT_GATE_INPUTS_AND_CONSUMER',['revalidate-projections.py','postcert'])
step('DEFAULT_P1_SAME_PHYSICAL_COMPATIBILITY',['check-postcert-compatibility.py'])
step('REAL_NORMAL_STRICT_FRONTIER',['run-postcert-boundary.py'])
step('CANONICAL_PHYSICAL_ORIGINS_RECONCILIATION',['reconcile-postcert-frontier.py'])
s=json.loads(statepath.read_text());s.update(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),phase='QUALIFIED_PENDING_LEAD_INSPECTION_AND_TWO_PATH_PROMOTION',qualificationSteps=steps,activeJobs=[],nextAction='Lead inspect actual review/cert metrics/currentverifier38/projections/frontier and preimages, then explicitguardedtwofilepromotion/ownPGcleanup/documentation. NowholeB6release.');statepath.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
(ev/'qualification-orchestration.json').write_text(json.dumps({'status':'QUALIFICATION_FINISHED_NO_PROMOTION','sourceCommit':freeze['commit'],'steps':steps},indent=2)+'\n')
print(json.dumps({'status':'QUALIFICATION_FINISHED_NO_PROMOTION','sourceCommit':freeze['commit']}),flush=True)
