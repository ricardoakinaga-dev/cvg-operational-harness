from pathlib import Path
import datetime,json,subprocess
b=Path(__file__).resolve().parent
root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
docs=['docs/99_runtime_state.md','docs/20_master_execution_log.md','docs/30_backlog_master.md','docs/03_build/0370_harness_product_isolation_backlog.md','docs/03_build/0391_hiso005_semantic_proof_execution.md','docs/02_spec/0190_spec_validation.md','docs/08_runtime/0803_runbook_gates_locais.md','docs/08_runtime/handoffs/hiso005_proof_20261017.md']
owned=[str((b/name).relative_to(root))for name in ['REPORT.md','ACCEPTANCE.md','NEXT.md']]
for name in docs+owned:assert(root/name).is_file()
receipt=b/'documentation-final-checks.json';receipt.write_text(json.dumps({'status':'RUNNING','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
checks=[]
for check,argv in [('format',[node,'node_modules/prettier/bin/prettier.cjs','--ignore-path','/dev/null','--check',*docs,*owned]),('links',[node,'scripts/check-doc-links.mjs',*docs,str(b.relative_to(root))]),('hygiene',[node,'scripts/check-evidence-hygiene.mjs',str(b.relative_to(root))])]:
 p=subprocess.run(argv,cwd=root,capture_output=True,text=True,timeout=120);checks.append({'check':check,'argv':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
coord=root/'docs/08_runtime/agent_coordination.md';text=coord.read_text();end=text.index('### HISO005-0236-BUILTIN-REPAIR-20261018');section=text[:end];argv=[node,'node_modules/prettier/bin/prettier.cjs','--stdin-filepath','docs/08_runtime/agent_coordination.md'];p=subprocess.run(argv,cwd=root,input=section,capture_output=True,text=True,timeout=120)
checks.append({'check':'format-owned-coordination-section-only','argv':argv,'exitCode':p.returncode if p.returncode else(0 if p.stdout.rstrip()==section.rstrip()else 1),'stderr':p.stderr,'scope':'Only initial HISO005-P2-BUILD-0237 section; peer sections not rewritten'})
result={'status':'PASS'if all(x['exitCode']==0 for x in checks)else'FAIL','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Own editable documents, coordination section and current bundle. Sealed code reviews remain immutable. No global repository green claim.','checks':checks};receipt.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':[(x['check'],x['exitCode'])for x in checks]}));assert result['status']=='PASS','See documentation-final-checks.json'
