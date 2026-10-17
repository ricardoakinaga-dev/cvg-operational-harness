exec((__import__('pathlib').Path(__file__).parent/'audit.py').read_text().split("if __name__=='__main__':")[0])
import re
inspected={}
def inspect(p,method):
 p=Path(p); inspected[str(p)]={'sha256':sha(p),'method':method};return p
# Semantic sources, never a previous acceptance report as proof of correctness.
for rel in ['AGENTS.md','docs/07_agents/AGENTS.md','docs/08_runtime/agent_coordination.md','docs/02_spec/0207_cleanup_orphaned_emits.md','docs/02_spec/0208_pare100_execution_baseline.md']:
 inspect(R/rel,'instructions / original acceptance requirements')
inspect(W/'docs/04_audit/evidence/PARE100-EXEC-20261014/scope/0378_backlog_paridade_integral.md','frozen original P100-001 / P100-002 criteria')
for rel in ['scripts/ci-bar.mjs','scripts/ci-bar-contract.mjs','scripts/phase10-certify.mjs','scripts/lib/certification-rules.mjs','scripts/lib/coverage-gate.mjs','scripts/run-core-coverage.mjs','scripts/coverage-thresholds.mjs','vitest.config.mts','tests/coverage-thresholds.test.js','package.json','.github/workflows/verify.yml']:
 inspect(D/rel,'static public gate/config inspection; actual modules exercised by isolated probes where applicable')
 inspect(R/rel,'byte comparison to D')
for rel in ['cleanup-manifest.json','tracked-implementation-baseline.json','post-cleanup-integrity.json','removed-emits-backup.tar.gz','typecheck.log','lint.log','unit.log','postgres.log','e2e.log','product-boundary.log']:
 inspect(H/rel,'historical raw evidence; backup hashes recomputed; 983 invariant limited to cleanup time')
for f in j(E/'integration/root-r4/plan.json')['files']:
 for tree in [R,D]: inspect(tree/f['path'],'integration identity only; no blanket semantic approval of other code')
for f in (E/'certification/r4/logs').glob('*'):inspect(f,'log hash binding to exact R4 gate; structured parser verification')
for f in (E/'certification/r4/artifacts').rglob('*'):
 if f.is_file():inspect(f,'raw candidate/manifest/result reports; verifyGateEvidence plus counts/coverage recomputation')
for rel in ['playwright-results.xml','scripts/critical-coverage-manifest.json']:
 inspect(D/rel,'raw fallback referenced by R4 manifest; hash matches R4 evidence')
# Supplemental inputs get their own initial hash inventory, explicitly later than main snapshot.
extra=[]
extra += list((P/'root-t1-archive-repair').glob('*'))
extra += list((W/'docs/04_audit/evidence/PARE100-EXEC-20261014/lead/phase4a-pg-supplement').glob('*'))
extra += [P/'qualification-cert-r4-driver.py',P/'qualification-cert-r4-run.json',P/'qualification-cert-r3-unit-native-failure/failure.json',P/'qualification-cert-r3-unit-native-failure/unit.log']
extra += list((E/'integration/root-r4').glob('*'))
extra += [P/'root-application-integration-r4/compiled-sdk-stage/probe.mjs']
for f in extra:
 if f.is_file(): inspect(f,'raw driver/command/log/plan; conclusions of previous acceptance not used')
for b in j(O/'integration-check.json')['backups']:
 for f in b['matching_backups']: inspect(f,'backup bytes independently match pre-integration hash')
save('inputs-inspected.json',inspected)
# Focused checks of current integration records and actual smoke artifacts.
metadata=[]
for label in ['typecheck','lint','boundary','build-sdk','build-platform','sdk-smoke','sdk-smoke-runtime','sdk-smoke-compiled']:
 m=j(E/f'integration/root-r4/{label}.json'); streams=[]
 for name, v in m.get('streams',{}).items():
  p=E/'integration/root-r4'/name; streams.append({'path':str(p),'hash_match':sha(p)==v['sha256'],'size_match':p.stat().st_size==v['bytes']})
 metadata.append({'label':label,'exit':m.get('exit'),'streams':streams,'classification':'IMPORT_ONLY' if label=='sdk-smoke' else 'ACTUAL_COMMAND'})
smokes={}
for label in ['sdk-smoke-runtime','sdk-smoke-compiled']:
 x=j(E/f'integration/root-r4/{label}.stdout.log'); v=x.get('journey',x)
 smokes[label]={'turn':v['turn'],'events':[x['type'] for x in v['events']],'sequences':[x['sequence'] for x in v['events']],'publicResolution':x.get('publicResolution')}
small=[]
for case in ['good','contracts','harness','orchestrator','agent-runtime','aggregate-bad']:
 log=(O/f'real-default-{case}.stdout.log').read_text(); s=j(log.split('current report: ')[1].splitlines()[0]); small.append({'case':case,'aggregate':s['total'],'errors':(O/f'real-default-{case}.stderr.log').read_text()})
sup=W/'docs/04_audit/evidence/PARE100-EXEC-20261014/lead/phase4a-pg-supplement'; q=j(sup/'report.json'); cmd=j(sup/'command.json')
supp={'command_exit':cmd['exit'],'test_sha_matches_r4':cmd['testSHA256']==sha(D/'packages/conversation/src/__tests__/postgres-conversation.integration.test.ts'),'testsPassed':q['numPassedTests'],'testsFailed':q['numFailedTests'],'testsPending':q['numPendingTests'],'stream_hashes_match':all(sha(sup/n)==v['sha256'] for n,v in cmd['streams'].items()),'not_rewritten_into_R4':True,'candidate_was_r1_not_r4':True}
# Baseline drift accounted for by separately approved integration, never demand old bytes today.
old=j(H/'tracked-implementation-baseline.json'); diffs=[p for p,h in old.items() if sha(R/p)!=h]; planpaths={x['path'] for x in j(E/'integration/root-r4/plan.json')['files']}
save('additional-checks.json',{'root_metadata':metadata,'smokes':smokes,'synthetic_actual_coverage':small,'skip_supplement':supp,'baseline983_current_differences':diffs,'baseline983_differences_outside_integration':[p for p in diffs if p not in planpaths],'historical_983_invariant_not_reapplied_to_present':True})
before=j(O/'inputs-before.json'); after={p:sha(p) for p in before};changes=[{'path':p,'before':h,'after':after[p]} for p,h in before.items() if h!=after[p]]
save('inputs-after.json',after);save('mutation-sentinel.json',{'scoped_paths':len(before),'drift':changes,'pass':not changes,'scope':'selected relevant ROOT/D/W inputs, including 348 absence checks per tree; not an entire shared-worktree freeze'})
print('sentinel',len(before),'changes',changes); print('983 differences now',len(diffs),'outside113',[p for p in diffs if p not in planpaths]);print('supplement',supp);print('inspected inputs',len(inspected));print('root metadata',[(m['label'],m['exit']) for m in metadata])
