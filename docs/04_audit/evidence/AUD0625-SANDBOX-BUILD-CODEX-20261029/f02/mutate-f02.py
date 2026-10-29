from pathlib import Path
import subprocess,json,hashlib
r=Path('/mnt/dados/cvg-work/aud0625-sandbox-build-codex-20261029');c=r/'candidate'
paths={k:c/('packages/sandbox/src/'+k+'.ts') for k in ['process-profile','run','shell-tool']}
originals={k:p.read_text() for k,p in paths.items()}
def replace(k,a,b):
 s=paths[k].read_text();assert s.count(a)==1,(k,a,s.count(a));paths[k].write_text(s.replace(a,b))
rows=json.loads((r/'f02-mutations.json.first-attempt').read_text())['mutations'][:2]
mutants=[
 ('full-host-root','tests/aud0625-process-containment-red.test.ts','cannot read its owned sentinel',lambda:replace('process-profile',"      '--tmpfs',\n      '/'", "      '--tmpfs',\n      '/', '--ro-bind', '/', '/'")),
 ('inherit-parent-env','tests/aud0625-process-containment-red.test.ts','unapproved synthetic parent variable',lambda:(replace('run','env: launch.env','env: process.env'),replace('process-profile',"      cwd,\n      '--clearenv'",'      cwd'))),
 ('workspace-name-bind','tests/aud0625-process-profile.test.ts','pins the original workspace',lambda:replace('process-profile',"      '--bind-fd',\n      String(3 + rootIndex)","      '--bind',\n      record.workspaceRoot")),
 ('runtime-name-bind','tests/aud0625-process-profile.test.ts','pins reviewed runtime bytes',lambda:replace('process-profile',"args.push('--ro-bind-fd', String(3 + index), entry.destination)","args.push('--ro-bind', entry.source, entry.destination)")),
 ('bypass-workspace-identity','tests/aud0625-process-profile.test.ts','refuses a replacement directory',lambda:replace('process-profile',"workspaceIdentity(fstatSync(rootFd, { bigint: true })) !==\n      record.workspaceIdentity",'false')),
 ('bypass-runtime-identity','tests/aud0625-process-profile.test.ts','refuses changed runtime bytes',lambda:replace('process-profile',"current.stamp !== record.stamp ||\n      current.sha256 !== record.sha256 ||\n      current.bytes !== record.bytes",'false')),
 ('freeze-profile-version','tests/aud0625-process-profile.test.ts','binds the shell version and fingerprint',lambda:replace('shell-tool',"  const version = processProfile\n    ? processProfileVersion(processProfile, root)\n    : SHELL_BASE.version", "  const version = SHELL_BASE.version")),
 ('mutable-options-profile','tests/aud0625-process-profile.test.ts','captures the host profile once',lambda:replace('shell-tool','...(processProfile ? { processProfile } : {}),','...(options.processProfile ? { processProfile: options.processProfile } : {}),')),
 ('model-authority-fields','tests/aud0625-process-profile.test.ts','the model cannot choose',lambda:replace('shell-tool',"if (record?.[key] !== undefined)\n          return rejected(\n            'containment configuration belongs to trusted composition'", "if (false)\n          return rejected(\n            'containment configuration belongs to trusted composition'")),
 ('f05-x6-drop-catch-fence','tests/aud0625-shell-cancellation-red.test.ts','runner throw after cancellation',lambda:replace('shell-tool',"      } catch (error) {\n        if (signal?.aborted)","      } catch (error) {\n        if (false)"))
]
try:
 for name,test,pattern,mutate in mutants[2:]:
  for k,p in paths.items():p.write_text(originals[k])
  mutate();report=r/(name+'-vitest.json');label='f02-mutant-'+name
  result=subprocess.run(['python3',str(r/'run.py'),label,'90','node','node_modules/vitest/vitest.mjs','run',test,'--testNamePattern='+pattern,'--no-file-parallelism','--maxWorkers=2','--reporter=verbose','--reporter=json','--outputFile='+str(report)])
  d=json.loads(report.read_text());failed=[a for t in d['testResults'] for a in t['assertionResults'] if a['status']=='failed'];messages='\n'.join(str(a['failureMessages']) for a in failed)
  row={'name':name,'exit':result.returncode,'passed':d['numPassedTests'],'failed':d['numFailedTests'],'filtered':d['numPendingTests'],'assertions':[a['fullName'] for a in failed],'assertion_failure':('AssertionError' in messages),'setup_timeout':('timed out' in messages.lower() or 'beforeAll' in messages)}
  rows.append(row);(r/'f02-mutations.json').write_text(json.dumps({'mutations':rows},indent=2)+'\n')
  assert result.returncode==1 and failed and row['assertion_failure'] and not row['setup_timeout'],row
finally:
 for k,p in paths.items():p.write_text(originals[k]);assert p.read_text()==originals[k]
 (r/'f02-source-restored.json').write_text(json.dumps({k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in paths.items()},indent=2)+'\n')
print('All 10 mutants killed by assertions; all source restored')
