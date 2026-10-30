from pathlib import Path
import subprocess,json,hashlib
r=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029');c=r/'candidate';files={k:c/('packages/harness/src/kernel/'+k+'.ts') for k in ['hook-authority','pipeline','kernel-runtime']};original={k:p.read_text() for k,p in files.items()}
def change(k,a,b):
 p=files[k];s=p.read_text();assert s.count(a)==1,(k,a,s.count(a));p.write_text(s.replace(a,b))
def gate_mutant():
 p=files['pipeline'];s=p.read_text();a=s.index("        if (value?.kind === 'not_started') {");b=s.index("        if (value?.kind === 'succeeded'",a);p.write_text(s[:a]+"        if (value?.kind === 'not_started') return {kind:'not_started',gate:reconcileGate(undefined,value.gate)} as ToolOutcome\n"+s[b:])
def no_immediate_notice():
 p=files['hook-authority'];s=p.read_text();a=s.index('    immediateFailure = failure(');b=s.index('\n  } finally',a);p.write_text(s[:a]+'    immediateFailure = undefined'+s[b:])
def discard_block_cause():
 p=files['kernel-runtime'];s=p.read_text();a=s.rindex('          current = reconcileTurn(');b=s.index('\n        }',a);p.write_text(s[:a]+"""          current = {
            ...current,
            response: `Execution could not be completed because ${entry.plugin} failed: ${errorMessage(error)}.`,
            stopReason: 'INSUFFICIENT_EVIDENCE'
          }"""+s[b:])
boundary='tests/aud0625-f18-observer-boundary.test.ts';red='tests/aud0625-internal-hooks-authority-red.test.ts';rows=[]
mutants=[
 ('raw-state',boundary,'hides authority',lambda:change('hook-authority','if (isCoreHook(entry)) return state','if (true) return state')),
 ('control-kind-is-writer',red,'unbranded control cannot rewrite',lambda:change('hook-authority','adapters.has(entry.fn)','true')),
 ('raw-outcome',boundary,'gives post hooks detached results',lambda:change('hook-authority','return isCoreHook(entry) ? value : observation(value)','return value')),
 ('original-on-projection-error',boundary,'uses an opaque projection',lambda:change('hook-authority','    } catch {\n      return OPAQUE\n    }','    } catch {\n      return value\n    }')),
 ('relax-outcome',red,'cannot turn confirm_failed',lambda:change('hook-authority',"if (before.kind !== 'succeeded') return before","if (before.kind !== 'succeeded') return proposed as ToolOutcome")),
 ('relax-gate',boundary,'preserves a later gate denial',lambda:change('hook-authority',"if (before?.kind === 'stop') return before","if (before?.kind === 'stop') return proposed as KernelGate")),
 ('relax-turn',red,'a later turn hook',lambda:change('hook-authority',"if (before.stopReason !== 'COMPLETED' && !core) return before","if (before.stopReason !== 'COMPLETED' && !core) return proposed as RuntimeResult")),
 ('forge-counters',boundary,'allows redaction of a legitimate success',lambda:change('hook-authority','return { ...before, stopReason: value.stopReason, response: value.response }','return value')),
 ('duplicate-next',red,'duplicate next',lambda:change('hook-authority','if (!active || calls++ > 0)','if (!active)')),
 ('late-unused-next',boundary,'retained unused continuation',lambda:change('hook-authority','if (!active || calls++ > 0)','if (calls++ > 0)')),
 ('missing-next',red,'missing next',lambda:change('hook-authority','if (!running && positive(value))','if (false)')),
 ('completed-gate',boundary,'COMPLETED forged as an early gate',lambda:change('hook-authority',"    value.stopReason !== 'COMPLETED' &&\n",'')),
 ('invalid-notstarted-gate',boundary,'not-started outcome carrying a proceed',gate_mutant),
 ('wrapper-rewrites-physical-fact','packages/harness/src/__tests__/pare100-public-controls.test.ts','physical outcome survives',lambda:change('pipeline','(physical ?? outcome).kind','outcome.kind'))
]
mutants += [
 ('ignore-dispatch-fault',boundary,'invalidates delegated work',lambda:change('pipeline','if (continuationFault)','if (false)')),
 ('drop-immediate-fault-notice',boundary,'invalidates delegated work',no_immediate_notice),
 ('discard-original-block',red,'retains the original policy refusal',discard_block_cause),
 ('executor-getter-observed',boundary,'does not read an executor getter',lambda:change('hook-authority',"tool: without(call.tool, ['execute']),","tool: observation(Object.fromEntries(Object.entries(call.tool).filter(([key]) => key !== 'execute'))),"))
]
try:
 for name,test,pattern,mutate in mutants:
  for key,p in files.items():p.write_text(original[key])
  mutate();label='s2-mutant-'+name;report=r/(label+'-vitest.json')
  result=subprocess.run(['python3',str(r/'run.py'),label,'90','node','node_modules/vitest/vitest.mjs','run',test,'--testNamePattern='+pattern,'--no-file-parallelism','--maxWorkers=2','--reporter=verbose','--reporter=json','--outputFile='+str(report)],capture_output=True)
  d=json.loads(report.read_text());failed=[a for f in d['testResults'] for a in f['assertionResults'] if a['status']=='failed'];message='\n'.join(str(a['failureMessages']) for a in failed)
  row={'name':name,'exit':result.returncode,'failed':d['numFailedTests'],'passed':d['numPassedTests'],'filtered':d['numPendingTests'],'assertion_failure':'AssertionError' in message,'timeout':'timed out' in message.lower(),'tests':[a['fullName'] for a in failed]};rows.append(row);(r/'s2-mutations.json').write_text(json.dumps({'mutations':rows},indent=2)+'\n')
  assert result.returncode==1 and failed and row['assertion_failure'] and not row['timeout'],row
finally:
 for key,p in files.items():p.write_text(original[key]);assert p.read_text()==original[key]
 (r/'s2-mutation-source-restored.json').write_text(json.dumps({key:hashlib.sha256(p.read_bytes()).hexdigest() for key,p in files.items()},indent=2)+'\n')
print('18 semantic mutants killed by assertions; production source restored byte-identically')
