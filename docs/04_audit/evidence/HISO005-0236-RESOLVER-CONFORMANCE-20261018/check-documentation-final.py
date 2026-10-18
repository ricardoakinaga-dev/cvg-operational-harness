from pathlib import Path
import datetime, hashlib, json, subprocess
root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
ev=Path(__file__).resolve().parent
owned=Path('/tmp/cvg-hiso005-resolver-fix-20261018')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
native=['docs/99_runtime_state.md','docs/20_master_execution_log.md','docs/30_backlog_master.md','docs/03_build/0370_harness_product_isolation_backlog.md','docs/03_build/0391_hiso005_semantic_proof_execution.md','docs/08_runtime/0803_runbook_gates_locais.md','docs/08_runtime/handoffs/hiso005_proof_20261017.md']
commands=[('format',[node,'node_modules/prettier/bin/prettier.cjs','--check',*native,'docs/02_spec/0237_b6_runtime_resolution_profile.md']),('links',[node,'scripts/check-doc-links.mjs',*native,'docs/02_spec/0237_b6_runtime_resolution_profile.md',str(ev.relative_to(root)),'docs/04_audit/evidence/HISO005-P2-RESOLUTION-SPEC-20261018']),('repair-hygiene',[node,'scripts/check-evidence-hygiene.mjs',str(ev.relative_to(root))]),('spec-hygiene',[node,'scripts/check-evidence-hygiene.mjs','docs/04_audit/evidence/HISO005-P2-RESOLUTION-SPEC-20261018'])]
rows=[]
for name,argv in commands:
    process=subprocess.run(argv,cwd=root,capture_output=True,timeout=120)
    paths={}
    for stream,data in [('stdout',process.stdout),('stderr',process.stderr)]:
        path=owned/f'documentation-final-attempt2-{name}.{stream}.txt'
        path.write_bytes(data)
        paths[stream+'Path']=str(path)
        paths[stream+'Sha256']=hashlib.sha256(data).hexdigest()
    rows.append({'check':name,'argv':argv,'exitCode':process.returncode,**paths})
    print(name,process.returncode,flush=True)
    if process.returncode:
        print((process.stdout+process.stderr).decode()[-1500:])
result={'status':'PASS' if all(x['exitCode']==0 for x in rows) else 'FAIL','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attempt':2,'firstAttempt':'documentation-final-checks-attempt1.json','scope':'Own native docs, revised0237documentarydraft and resolverrepair evidence only; global48peerabsolute links separately retained','checks':rows}
(ev/'documentation-final-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
assert result['status']=='PASS'
