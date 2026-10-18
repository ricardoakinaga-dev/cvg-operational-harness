from pathlib import Path
import json,hashlib,tarfile,subprocess,os
R=Path('/home/ricardo/Área de trabalho/cvg-operational-harness'); P=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay'); D=P/'certification-r4-worktree'; W=P/'worktree'; O=P/'critic-baseline-closure-r1-result'; E=R/'docs/04_audit/evidence/PARE100-EXEC-20261014'; H=R/'docs/04_audit/evidence/PARE100-20261014'
def j(p): return json.loads(Path(p).read_text())
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest() if Path(p).is_file() else None
def save(n,d): (O/n).write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
def snapshot():
 paths=set()
 for base in [H,E/'certification/r4',E/'integration/root-r4',P/'root-t1-archive-repair']:
  paths.update(f for f in base.rglob('*') if f.is_file() and not any(x in f.name.lower() for x in ['summary','review','outcome','acceptance']))
 plan=j(E/'integration/root-r4/plan.json')
 base=j(H/'tracked-implementation-baseline.json')
 clean=j(H/'cleanup-manifest.json')
 for tree in [R,D,W]:
  for f in plan['files']: paths.add(tree/f['path'])
  for name in ['AGENTS.md','docs/07_agents/AGENTS.md','docs/02_spec/0207_cleanup_orphaned_emits.md','docs/02_spec/0208_pare100_execution_baseline.md','package.json','vitest.config.mts','vitest.config.ts','scripts/ci-bar.mjs','scripts/phase10-certify.mjs','scripts/certification-rules.mjs','scripts/run-core-coverage.mjs','scripts/coverage-thresholds.mjs','tests/coverage-thresholds.test.js','apps/web/src/vite-env.d.ts']: paths.add(tree/name)
  paths.update(f for f in (tree/'scripts').rglob('*') if f.is_file() and any(t in f.name for t in ['coverage','certification','phase10','ci-bar']))
  for f in clean['files']: paths.add(tree/f['path'])
 paths.update(R/f for f in base)
 paths.add(W/'docs/04_audit/evidence/PARE100-EXEC-20261014/scope/0378_backlog_paridade_integral.md')
 # exact integration raw record explicitly requested, not its prior acceptance conclusions
 paths.add(E/'integration/root-r4/acceptance-r2.json')
 return {str(f):sha(f) for f in sorted(paths)}
if __name__=='__main__':
 import sys
 if sys.argv[1]=='before':
  s=snapshot(); save('inputs-before.json',s); print('snapshotted',len(s),'paths')

def checks():
 clean=j(H/'cleanup-manifest.json'); baseline=j(H/'tracked-implementation-baseline.json'); plan=j(E/'integration/root-r4/plan.json'); apply=j(E/'integration/root-r4/apply-result.json')
 with tarfile.open(H/'removed-emits-backup.tar.gz') as t:
  members={x.name.removeprefix('./'):x for x in t.getmembers() if x.isfile()}
  bad=[]
  for f in clean['files']:
   m=members.get(f['path']); b=t.extractfile(m).read() if m else b''
   if not m or hashlib.sha256(b).hexdigest()!=f['sha256'] or len(b)!=f['size_bytes']: bad.append(f['path'])
 integrity={'manifest_count':len(clean['files']),'unique_paths':len({f['path'] for f in clean['files']}),'bytes':sum(f['size_bytes'] for f in clean['files']),'backup_members':len(members),'backup_mismatches':bad,'backup_sha256':sha(H/'removed-emits-backup.tar.gz'),'backup_hash_matches_manifest':sha(H/'removed-emits-backup.tar.gz')==clean['durable_backup_sha256'],'remaining':{str(tree):[f['path'] for f in clean['files'] if (tree/f['path']).exists()] for tree in [R,D,W]},'historical_baseline_count':len(baseline),'historical_post_cleanup_raw':j(H/'post-cleanup-integrity.json'),'authorial':{'baseline':baseline.get('apps/web/src/vite-env.d.ts'),'root':sha(R/'apps/web/src/vite-env.d.ts'),'D':sha(D/'apps/web/src/vite-env.d.ts')}}
 save('cleanup-check.json',integrity)
 mismatches=[]
 for f in plan['files']:
  for tree in [R,D]:
   if sha(tree/f['path'])!=f['source_sha256']: mismatches.append({'tree':str(tree),'path':f['path'],'expected':f['source_sha256'],'actual':sha(tree/f['path'])})
 backupbase=P/'root-application-integration-r4'
 back=[]
 for b in apply['backups']:
  matches=[x for x in backupbase.rglob(Path(b['path']).name) if x.is_file() and sha(x)==b['sha256']]
  back.append({'path':b['path'],'expected':b['sha256'],'matching_backups':[str(x) for x in matches]})
 save('integration-check.json',{'plan_count':len(plan['files']),'copied_count':len(apply['copied']),'mismatches':mismatches,'backups':back,'backups_verified':sum(bool(b['matching_backups']) for b in back)})
 art=E/'certification/r4/artifacts'; cert=art/'certification'; phase=j(cert/'phase10-result.json'); candidate=j(cert/'candidate-manifest.json')
 binds=[]
 for g in phase['gates']:
  raw=E/'certification/r4/logs'/Path(g['log']).name
  binds.append({'gate':g['id'],'status':g['status'],'exit':g['exitCode'],'log_hash_match':sha(raw)==g['logSha256'],'evidence':[{'path':x['path'],'match':sha(art/x['path'] if (art/x['path']).is_file() else D/x['path'])==x['sha256']} for x in g.get('evidence',[]) if not x['path'].startswith('certification/logs/')]})
 rawmetrics={}
 for name in ['unit','postgres']:
  x=j(cert/f'{name}-test-report.json'); assertions=[a for f in x['testResults'] for a in f.get('assertionResults',[])]
  from collections import Counter
  rawmetrics[name]={'top':{k:v for k,v in x.items() if k!='testResults' and not isinstance(v,(list,dict))},'assertion_counts':dict(Counter(a['status'] for a in assertions))}
 summary=j(art/'coverage/coverage-summary.json'); core={}; badcore=[]
 for pkg in ['contracts','harness','orchestrator','agent-runtime']:
  files={k:v for k,v in summary.items() if f'/packages/{pkg}/src/' in k}; core[pkg]=len(files)
  for k,v in files.items():
   if any(v[d]['covered']!=v[d]['total'] or v[d]['pct']!=100 for d in ['statements','branches','functions','lines']): badcore.append(k)
 candbad=[f['path'] for f in candidate['files'] if f['path'].startswith(('scripts/','packages/','apps/','tests/')) and sha(D/f['path'])!=f['sha256']]
 e2e=j(cert/'e2e-test-report.json')
 save('r4-raw-check.json',{'candidateId':candidate['candidateId'],'phase_candidate_match':phase['candidate']['candidateId']==candidate['candidateId'],'candidate_source_drift':candbad,'gates':binds,'metrics_recomputed':rawmetrics,'coverage_total':summary['total'],'covered_core_files':core,'core_below_100':badcore,'e2e_stats':e2e.get('stats'),'decision':phase['decision'],'certification':phase['certification']})
 print('cleanup',len(clean['files']),'backup',len(members),'mismatches',len(bad),'remaining',integrity['remaining'],'authorial',integrity['authorial'])
 print('integration',len(plan['files']),'mismatches',len(mismatches),'backups',sum(bool(b['matching_backups']) for b in back),'of',len(back))
 print('R4 gates',[(x['gate'],x['status'],x['log_hash_match']) for x in binds]); print('raw counts', {k:v['assertion_counts'] for k,v in rawmetrics.items()},'core',core,'bad',badcore,'candidate drift',candbad,'e2e',e2e.get('stats'))
if __name__=='__main__' and sys.argv[1]=='checks': checks()
