from pathlib import Path
import json, shutil, hashlib
from importlib.machinery import SourceFileLoader
runner=SourceFileLoader('critic_runner','critic-run.py').load_module();run=runner.run;node=runner.node
scratch=runner.scratch; result=runner.result; corpus=scratch/'snapshots/core'; negative=scratch/'critic-negative-corpora';negative.mkdir()
def hashes():return {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(corpus.glob('*.expected.json'))}
before=hashes();outcomes=[]
def case(name,modify):
 d=negative/name;shutil.copytree(corpus,d);modify(d)
 code,raw=run('cli-'+name,[node,'scripts/snapshot-replay.mjs','--fixtures-dir',str(d)])
 ok=code==1 and (b'snapshot replay rejected:' in raw if name not in ['bad-outcome','bad-event','bad-effect','bad-counter'] else b'replay mismatch:' in raw)
 outcomes.append({'case':name,'exit':code,'expected':1,'pass':ok});assert ok,(name,code,raw[-2000:])
def edit(d,name,fn):
 p=d/name;j=json.loads(p.read_text());fn(j);p.write_text(json.dumps(j)+'\n')
case('missing-input',lambda d:(d/'cancel-before.input.json').unlink())
case('missing-expected',lambda d:(d/'cancel-before.expected.json').unlink())
case('malformed-json',lambda d:(d/'simple-response.input.json').write_text('{'))
case('id-path-hostile',lambda d:edit(d,'simple-response.input.json',lambda j:j.update(id='../escape')))
case('unexpected-filename',lambda d:(d/'unknown.input.json').write_text('{}'))
def symlink_input(d):
 p=d/'simple-response.input.json';p.unlink();p.symlink_to(corpus/'simple-response.input.json')
case('symlink-input',symlink_input)
case('prototype-key',lambda d:edit(d,'simple-response.expected.json',lambda j:j['transcript']['result'].update({'__proto__':{'polluted':True}})))
case('oversized-file',lambda d:(d/'simple-response.input.json').write_text(' '*256001))
case('input-selects-program',lambda d:edit(d,'simple-response.input.json',lambda j:j.update(command='not-an-executable')))
case('bad-outcome',lambda d:edit(d,'authorized-tool.expected.json',lambda j:j['transcript']['result'].update(stopReason='MODEL_FAILURE')))
case('bad-event',lambda d:edit(d,'authorized-tool.expected.json',lambda j:j['transcript']['events'][1].update(payload={'critic':'corrupted event'})))
case('bad-effect',lambda d:edit(d,'authorized-tool.expected.json',lambda j:j['transcript']['toolBodies'].append({'critic':'unexpected effect'})))
case('bad-counter',lambda d:edit(d,'authorized-tool.expected.json',lambda j:j['transcript']['result'].update(toolCalls=999)))
for name,args in [
 ('reject-update',['--update']),
 ('reject-case-traversal',['--record','--case','../escape']),
 ('reject-record-other-dir',['--record','--case','simple-response','--fixtures-dir',str(negative/'missing-input')]),
]:
 code,raw=run('cli-'+name,[node,'scripts/snapshot-replay.mjs',*args]);assert code==1 and b'snapshot replay rejected:' in raw;outcomes.append({'case':name,'exit':code,'expected':1,'pass':True})
code,raw=run('cli-record-candidate',[node,'scripts/snapshot-replay.mjs','--record','--case','simple-response']);assert code==0
candidate=corpus/'recordings/simple-response.candidate.json';candidate_before=hashlib.sha256(candidate.read_bytes()).hexdigest()
code,raw=run('cli-record-no-overwrite',[node,'scripts/snapshot-replay.mjs','--record','--case','simple-response']);assert code==1 and b'EEXIST' in raw
assert hashlib.sha256(candidate.read_bytes()).hexdigest()==candidate_before
assert hashes()==before
summary={'status':'PASS','negative_cli_cases':len(outcomes),'cases':outcomes,'record_first_exit':0,'record_second_exit':1,'candidate_unchanged':True,'expected_before':before,'expected_after':hashes()}
(result/'cli-negative-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'status':'PASS','negative_cli_cases':len(outcomes),'record_no_rewrite':True}))
