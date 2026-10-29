import json, subprocess, sys, os
os.chdir('/mnt/dados/cvg-work/aud0625-f13-07')
SA='products/shift-assistant/src/'
M=[
 ('M1 no receipt counts as eligible',SA+'preview-receipt.ts',"  if (!last) {\n    return { ok: false, cause: 'preview_not_delivered', echoable: false }\n  }","  if (!last) return { ok: true }"),
 ('M2 truncated ignored',SA+'preview-receipt.ts',"  if (last.truncated) {","  if (false) {"),
 ('M3 partial cause collapsed',SA+'preview-receipt.ts',"cause: accepted ? 'preview_partial' : 'preview_not_delivered',","cause: 'preview_partial',"),
 ('M4 unsent is echoable',SA+'preview-receipt.ts',"      cause: accepted ? 'preview_partial' : 'preview_not_delivered',\n      echoable: false","      cause: accepted ? 'preview_partial' : 'preview_not_delivered',\n      echoable: true"),
 ('M5 complete = some accepted',SA+'preview-receipt.ts',"event.parts.every((part) => part.outcome === 'accepted')","event.parts.some((part) => part.outcome === 'accepted')"),
 ('M6 complete ignores truncated',SA+'preview-receipt.ts',"    !event.truncated &&\n    event.parts.length > 0","    event.parts.length > 0"),
 ('M7 complete not sticky',SA+'store.ts',"complete:\n            previous?.complete === true || isCompletePresentation(event),","complete: isCompletePresentation(event),"),
 ('M8 no attempt budget',SA+'store.ts',"      if (state.attempts >= MAX_ATTEMPTS) return false\n",""),
 ('M9 no re-presentation delay',SA+'store.ts',"const delay = RETRY_DELAYS_MS[state.attempts - 1] ?? 0","const delay = 0"),
 ('M10 attempts not counted',SA+'store.ts',"attempts: (previous?.attempts ?? 0) + 1,","attempts: (previous?.attempts ?? 0) + 0,"),
 ('M11 token ignores revision',SA+'preview-receipt.ts',"-r${noteRevision(note)}-","-r1-"),
 ('M12 echo never recorded',SA+'assistant.ts',"      echoed = true\n",""),
 ('M13 eligibility not checked',SA+'assistant.ts',"if (!eligibility.ok && !(echoed && eligibility.echoable)) {","if (false) {"),
 ('M14 short code selects draft',SA+'assistant.ts',"(note) => this.#tokenOf(note) === code","(note) => noteCode(note) === code"),
 ('M15 later parts recorded accepted',SA+'assistant.ts',"recorded.push({ ...base, outcome: 'not_sent' })\n          continue\n        }\n        if (","recorded.push({ ...base, outcome: 'accepted' })\n          continue\n        }\n        if ("),
 ('M16 truncated not recorded',SA+'assistant.ts',"            parts: recorded,\n            truncated\n","            parts: recorded,\n            truncated: false\n"),
 ('M17 no re-presentation',SA+'assistant.ts',"      await this.#representDrafts()\n",""),
 ('M18 no concurrent-presentation guard',SA+'assistant.ts',"    if (this.#presenting.has(noteId)) return\n",""),
 ('M19 split never reports truncation',SA+'transport-limits.ts',"truncated: rest.length > 0","truncated: false"),
 ('M20 revision not advanced',SA+'assistant.ts',"return previous ? noteRevision(previous) + 1 : 1","return previous ? noteRevision(previous) : 1"),
 ('M21 uncertain echo denied',SA+'preview-receipt.ts',"return { ok: false, cause: 'preview_uncertain', echoable: true }","return { ok: false, cause: 'preview_uncertain', echoable: false }"),
 ('M22 truncation notice dropped',SA+'assistant.ts',"      if (truncated) {\n        await this.#reply(","      if (false) {\n        await this.#reply("),
 ('M23 suppressed send records a receipt',SA+'assistant.ts',"          if (recorded.length === 0) {\n            this.#logger.info('shift.reply.suppressed', {})\n            return\n          }","          if (false) {\n            return\n          }"),
]
TESTS=['products/shift-assistant/src/__tests__/preview-receipt-journal.test.ts','products/shift-assistant/src/__tests__/preview-receipt-reliability.test.ts','products/shift-assistant/src/__tests__/confirmation-reliability.test.ts','products/shift-assistant/src/__tests__/shift-assistant.test.ts']
res=[]
for name,f,old,new in M:
    src=open(f).read()
    if src.count(old)!=1:
        res.append({'mutant':name,'status':'NOT_APPLIED','count':src.count(old)}); print(name,'NOT_APPLIED',src.count(old)); continue
    open(f,'w').write(src.replace(old,new))
    try:
        r=subprocess.run(['npx','vitest','run',*TESTS,'--maxWorkers=2'],capture_output=True,text=True,timeout=600)
        killed=r.returncode!=0
    finally:
        subprocess.run(['git','checkout','--',f],check=True)
    res.append({'mutant':name,'status':'KILLED' if killed else 'SURVIVED'}); print(name,res[-1]['status'],flush=True)
json.dump(res,open(sys.argv[1],'w'),indent=1)
