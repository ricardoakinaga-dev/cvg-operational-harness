import json, os, subprocess, sys, time, hashlib
M = '/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/r0248/mutws'
OUT = sys.argv[1]
H = 'packages/harness/src/__tests__/aud0621-0248-decision-budget.test.ts'
O = 'packages/orchestrator/src/__tests__/aud0621-0248-decision-gate.test.ts'
G = 'packages/model-gateway/src/__tests__/aud0621-0248-gateway-cancel-cost.test.ts'
B = 'packages/model-gateway/src/__tests__/aud0621-0248-bounded-response.test.ts'
C = 'packages/channel-gateway/src/__tests__/aud0621-0248-channel-bounds.test.ts'
RT = 'packages/harness/src/iterative-runtime.ts'
HO = 'packages/orchestrator/src/hybrid-orchestrator.ts'
MUT = [
 ('M01-no-beginCall', HO, 'if (gate && !gate.beginCall()) {', 'if (false) {', H),
 ('M02-no-beginRepair', HO, 'return gate ? gate.beginRepair() : true', 'return true', H),
 ('M03-no-context-race', RT, 'const context = await race(turn, () => this.contextEngine.build(buildInput))', 'const context = await this.contextEngine.build(buildInput)', H),
 ('M04-no-composed-signal', RT, 'signal: AbortSignal.any([decisionAbort.signal, turn.signal]),', 'signal: decisionAbort.signal,', H),
 ('M05-no-pre-dispatch-cancel', RT, "      if (this.#turns.get(run)?.signal.aborted) {\n        return this.stop('CANCELLED', CANCELLED_RESPONSE)\n      }\n      const dispatch", '      const dispatch', H),
 ('M06-no-record-stop', RT, 'stopped ??= exceeded', 'void exceeded', H),
 ('M07-no-failure-usage', RT, 'if (reported) this.accountBeyondGate(run, reported, gate.counted)', 'void reported', H),
 ('M08-no-usage-validation', RT, "    if (!usage) {\n      return { outcome: this.stop('MODEL_FAILURE', INVALID_USAGE_RESPONSE) }\n    }\n", '', H),
 ('M17-gateway-no-finite-check', 'packages/model-gateway/src/gateway.ts', '        Number.isFinite(ceiling) &&\n', '', G),
 ('M18-usage-reread', RT, '        : snapshotUsage(reportedUsage)', '        : snapshotUsage(reportedUsage) && (reportedUsage as ModelUsage)', H),
 ('M19-orch-wrap-raw-error', HO, '            : error\n', "            : new OrchestratorDecisionError('decision_unparseable', String(error), usage)\n", O),
 ('M09-gateway-no-pre-abort', 'packages/model-gateway/src/gateway.ts', '    throwIfCancelled(externalSignal)\n', '', G),
 ('M10-gateway-no-ceiling', 'packages/model-gateway/src/gateway.ts', '        Number.isFinite(ceiling) &&\n        Number.isFinite(estimatedCost) &&\n        estimatedCost <= ceiling\n', '        true\n', G),
 ('M11-gateway-no-backoff-race', 'packages/model-gateway/src/gateway.ts', 'await this.#backoff(delayMs, externalSignal)', 'await this.#sleep(delayMs)', G),
 ('M12-transport-no-chunk-cut', 'packages/model-gateway/src/providers/ssrf-node.ts', 'if (limit !== undefined && total > limit) {', 'if (false) {', B),
 ('M13-reader-no-cap', 'packages/model-gateway/src/providers/http-errors.ts', '      if (total > maxBytes) throw tooLarge(providerId, maxBytes)\n', '', B),
 ('M14-channel-no-signal', 'packages/channel-gateway/src/adapters/evolution.ts', '            signal,\n            maxResponseBytes: this.#maxResponseBytes,\n', '            maxResponseBytes: this.#maxResponseBytes,\n', C),
 ('M15-channel-no-drain-cap', 'packages/channel-gateway/src/adapters/bounded-body.ts', '      if (total > maxBytes) throw responseTooLarge()\n', '', C),
 ('M16-channel-no-race', 'packages/channel-gateway/src/adapters/bounded-body.ts', '  // An abandoned send that settles after the deadline is never unhandled.\n', '  if (operation) return operation\n', C),
]
env = dict(os.environ)
env['PATH'] = '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + env['PATH']
env['NO_UPDATE_NOTIFIER'] = '1'
results = []
only = set(sys.argv[2:])
for mid, rel, old, new, test in MUT:
    if only and mid not in only: continue
    path = os.path.join(M, rel)
    orig = open(path, encoding='utf-8').read()
    n = orig.count(old)
    if n != 1:
        results.append({'id': mid, 'file': rel, 'error': f'pattern count {n}'}); print(mid, 'PATTERN', n, flush=True); continue
    open(path, 'w', encoding='utf-8').write(orig.replace(old, new))
    js = f'/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/r0248/mut-{mid}.json'
    t0 = time.time()
    hung = False
    proc = subprocess.Popen(['node', 'node_modules/vitest/vitest.mjs', 'run', test, '--testTimeout=20000', '--reporter=json', f'--outputFile={js}'], cwd=M, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        proc.wait(timeout=300)
    except subprocess.TimeoutExpired:
        hung = True
        os.killpg(proc.pid, 9)
        proc.wait()
    finally:
        open(path, 'w', encoding='utf-8').write(orig)
    if hung:
        res = {'id': mid, 'file': rel, 'test': test, 'killed': True, 'killedBy': ['suite did not finish within 300 s (test cannot pass)'], 'notPassed': None}
        results.append(res); print(mid, 'killed-hang', flush=True); continue
    try:
        d = json.load(open(js))
        failed = [t['title'] for f in d['testResults'] for t in f['assertionResults'] if t['status'] != 'passed']
        res = {'id': mid, 'file': rel, 'test': test, 'total': d['numTotalTests'], 'failed': d['numFailedTests'], 'notPassed': len(failed), 'killedBy': failed[:6], 'killed': len(failed) > 0, 'seconds': round(time.time()-t0)}
    except Exception as e:
        res = {'id': mid, 'file': rel, 'test': test, 'error': str(e), 'killed': None}
    results.append(res); print(mid, 'killed' if res.get('killed') else 'SURVIVED', res.get('notPassed'), flush=True)
    json.dump({'partial': True, 'mutants': results}, open(OUT, 'w'), indent=1, ensure_ascii=False)
# verify restoration
for _, rel, *_ in MUT:
    a = hashlib.sha256(open(os.path.join(M, rel),'rb').read()).hexdigest()
    b = hashlib.sha256(open(os.path.join('/mnt/dados/cvg-work/cvg-aud0621-runtime0248-20261020', rel),'rb').read()).hexdigest()
    assert a == b, rel
json.dump({'workspace': 'scratch copy of the candidate (sources only, node_modules symlinked)', 'mutants': results}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('done')
