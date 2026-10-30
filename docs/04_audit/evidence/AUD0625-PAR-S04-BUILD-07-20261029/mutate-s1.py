import subprocess,json,sys,re
F='packages/harness/src/session/fork.ts'
T=['tests/aud0625-par-s04-red.test.ts','tests/par-s04-session-fork-edges.test.ts']
src=open(F).read()
M=[
('M1 count non-completed turn',"if (t.state !== 'completed' || t.uncertainEffects.length > 0) break","if (t.uncertainEffects.length > 0) break"),
('M2 ignore uncertain effects',"if (t.state !== 'completed' || t.uncertainEffects.length > 0) break","if (t.state !== 'completed') break"),
('M3 cut past inheritable',"turn.lastSequence > analysis.inheritableThrough","turn.lastSequence > analysis.inheritableThrough + 1"),
('M4 keep source session id',"sessionId: options.targetSessionId\n    })","sessionId: e.sessionId\n    })"),
('M5 renumber',"...e,\n      sessionId","...e,\n      sequence: e.sequence + 1,\n      sessionId"),
('M6 assistant not required',"(!hasUser || hasAssistant)","true"),
('M7 uncertain outcome deadline dropped',"'deadline',\n  'cancelled'","'cancelled'"),
('M8 unpaired calls ignored',"for (const queue of open.values()) uncertain.push(...queue)",""),
('M9 depth not grown',"(options.sourceLineage?.depth ?? 0) + 1","(options.sourceLineage?.depth ?? 0)"),
('M10 target==source allowed',"if (sourceId === options.targetSessionId)","if (false)"),
('M11 digest unordered',"prefix\n        .map(","[...prefix].reverse()\n        .map("),
('M12 first open turn',"[...turns].reverse().find(","[...turns].find("),
('M13 gap allowed',"if (e.sequence !== previous + 1)","if (e.sequence <= previous)"),
('M14 interleave allowed',"if (closed.has(e.correlationId)) unanalyzable('turns are interleaved')",""),
('M15 double turn/end allowed',"if (ends.length > 1) unanalyzable('a turn has more than one turn/end')",""),
]
out=[]
for name,a,b in M:
    if a not in src:
        out.append((name,'PATTERN-MISSING'));continue
    open(F,'w').write(src.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*T],capture_output=True,text=True)
    out.append((name,'KILLED' if r.returncode else 'SURVIVED'))
    print(out[-1],flush=True)
subprocess.run(['git','checkout','--',F]) if False else open(F,'w').write(src)
json.dump(out,open(sys.argv[1],'w'),indent=1)
