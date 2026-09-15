from pathlib import Path
import tempfile,shutil,subprocess,json,hashlib
root=Path.cwd(); out=root/'docs/04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3'
m=json.loads((root/'docs/04_audit/evidence/AAA/AAA-13/rework-r3/manifest.json').read_text())
checks={p:hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in m['current']['scripts'].items()}
with tempfile.TemporaryDirectory(prefix='aaa13-review-') as t:
 d=Path(t)
 for p in m['current']['scripts']:
  (d/p).parent.mkdir(parents=True,exist_ok=True); shutil.copy2(root/p,d/p)
 (d/'node_modules').symlink_to(root/'node_modules',target_is_directory=True); (d/'certification').mkdir()
 def run(name,args):
  r=subprocess.run(args,cwd=d,text=True,capture_output=True); (out/name).write_text(r.stdout+r.stderr); return r.returncode
 checks['selfTestExit']=run('self-test.log',['node','scripts/phase10-verify.mjs','--self-test'])
 shutil.copy2(d/'certification/negative-validation.json',out/'negative-validation.json')
 checks['historicalExit']=run('historical.log',['node','scripts/phase10-verify.mjs','--historical','--base',str(root/'certification/logs/historical/2026-09-11-phase10')])
 p=d/'scripts/phase10-verify.mjs'; s=p.read_text(); extra='''
  runCliCase('R1', 'coverage percentage absent', 'coverage_raw_invalid:coverage:statements', (state) => {
    rewriteEvidence(state, 'coverage/coverage-summary.json', JSON.stringify({total:{statements:{},branches:{pct:96},functions:{pct:97},lines:{pct:98}}}));
  });
  runCliCase('R2', 'all chaos assertions skipped', 'chaos_raw_invalid', (state) => {
    rewriteEvidence(state, 'certification/chaos-report.json', JSON.stringify({testResults:[{assertionResults:Array.from({length:14},(_,i)=>({title:`CHAOS-${String(i+1).padStart(2,'0')} fixture`,status:'skipped'}))}]}));
    state.result.metrics.chaos={executed:14,passed:0,failed:0,notExecuted:0};
  });
'''
 s=s.replace('  const verdict = checks.every',extra+'\n  const verdict = checks.every');p.write_text(s)
 checks['adversarialSelfTestExit']=run('adversarial.log',['node','scripts/phase10-verify.mjs','--self-test'])
 shutil.copy2(d/'certification/negative-validation.json',out/'adversarial-results.json')
 (out/'injected-cases.txt').write_text(extra)
(out/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(checks,indent=2))
print((out/'adversarial.log').read_text()[-2200:])
