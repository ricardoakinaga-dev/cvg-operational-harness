import subprocess,json,sys,os
F='packages/persistence/src/session-persistence.ts'
T=['packages/persistence/src/__tests__/par-s04-session-fork-postgres.test.ts','tests/par-s04-session-fork-processes-postgres.test.ts']
src=open(F).read()
M=[
('F1 fork without REPEATABLE READ snapshot',"BEGIN ISOLATION LEVEL REPEATABLE READ')\n      let key","BEGIN')\n      let key"),
('F2 fork takes the source lock',"        key = Number(inserted.rows[0]?.writer_lock_id)\n        const got","        key = Number(inserted.rows[0]?.writer_lock_id)\n        const srcLock = await lease.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1, (SELECT writer_lock_id FROM '+schema+'.session_streams WHERE tenant_id=$2 AND session_id=$3)) AS ok', [this.keyBase, tenant, sourceId])\n        if (srcLock.rows[0]?.ok !== true) throw new SessionAlreadyOwnedError('source owned', sourceId)\n        const got"),
('F3 fork without a single transaction',"        key = Number(inserted.rows[0]?.writer_lock_id)\n        const got","        key = Number(inserted.rows[0]?.writer_lock_id)\n        await lease.query('COMMIT')\n        await lease.query('BEGIN')\n        const got"),
('F4 depth not grown from the source lineage',"          ...(source.lineage ? { sourceLineage: source.lineage } : {})\n",""),
('F5 no size ceiling',"if (bytes > SESSION_BATCH_MAX_BYTES)\n          throw new SessionForkRefusedError('fork_too_large', sourceId)","void bytes"),
('F6 foreign parentSession accepted',"asked.parentSession !== undefined && asked.parentSession !== sourceId","false"),
('F7 caller lineage accepted',"if ('lineage' in asked)","if (false as boolean)"),
('F8 writer slot leaked on failure',"      if (lease) await lease.destroy()\n      this.#writers--\n      if (error instanceof SessionPersistenceError || isAbort(error))\n        throw error\n      if ((error as { code?: string }).code === '23505')","      if (lease) await lease.destroy()\n      if (error instanceof SessionPersistenceError || isAbort(error))\n        throw error\n      if ((error as { code?: string }).code === '23505')"),
('F9 cursor not advanced',"          next++\n          await lease.query(\n            `UPDATE","          next++\n          if (next < 0) await lease.query(\n            `UPDATE"),
('F10 abort ignored',"    const signal = forkOptions.signal\n    if (signal?.aborted) throw abortError()","    const signal = forkOptions.signal"),
('F11 target==source not refused early',"    if (targetId === sourceId)\n      throw new SessionForkRefusedError('fork_target_is_source', sourceId)\n",""),
('F12 through ignored',"...(through ? { through } : {}),",""),
('F13 child not seeded',"            isSeeded: true,\n            parentSession: sourceId,","            isSeeded: false,\n            parentSession: sourceId,"),
]
env=dict(os.environ)
out=[]
for name,a,b in M:
    if a not in src:
        out.append((name,'PATTERN-MISSING'));print(out[-1],flush=True);continue
    open(F,'w').write(src.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*T],capture_output=True,text=True,env=env)
    out.append((name,'KILLED' if r.returncode else 'SURVIVED'))
    print(out[-1],flush=True)
open(F,'w').write(src)
json.dump(out,open(sys.argv[1],'w'),indent=1)
