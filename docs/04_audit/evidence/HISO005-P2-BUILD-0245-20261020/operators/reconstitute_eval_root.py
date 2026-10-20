"""Reconstitution recipe of the evaluated root 228e7918 (the physical copy used up to BUILD0244 was removed): detached
worktree of the commit (kept in refs/backup/cont-d9ef/cvg-hiso005-build0241-20261018), physical copy of the
dependency trees of a candidate with the same lock (cp -a, no install), the first-party builds that produced the dist
files, then the sha256 of every one of the 1.410 file inputs of the sealed v5 report must match.
usage: reconstitute_eval_root.py <step>...   steps: worktree deps runtime harness sdk verify"""
import gzip, json, os, shutil, subprocess, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

steps = sys.argv[1:]
recf = EV / 'eval-root-reconstitution.json'
rec = json.loads(recf.read_text()) if recf.exists() else {'task': TASK, 'evalRoot': str(EVAL_ROOT), 'commit': EVAL_COMMIT,
       'backupRef': 'refs/backup/cont-d9ef/cvg-hiso005-build0241-20261018', 'steps': [], 'commands': []}
log = rec['commands']
tmp = RUNTIME / 'reconstitution-tmp'; tmp.mkdir(parents=True, exist_ok=True)
env = dict(minimal_env(tmp), HOME=str(tmp))
for step in steps:
    if step == 'worktree':
        assert not EVAL_ROOT.exists()
        assert git('rev-parse', 'refs/backup/cont-d9ef/cvg-hiso005-build0241-20261018', cwd=PROJECT) == EVAL_COMMIT
        p, r = run(['git', '-C', str(PROJECT), 'worktree', 'add', '--detach', str(EVAL_ROOT), EVAL_COMMIT], PROJECT, {'PATH': '/usr/bin:/bin'}, log, timeout=600)
        assert p.returncode == 0, r
    elif step == 'deps':
        assert sha(DEPS_SOURCE / 'package-lock.json') == sha(EVAL_ROOT / 'package-lock.json')
        for rel in ['node_modules', 'apps/web/node_modules']:
            assert not (EVAL_ROOT / rel).exists()
            p, r = run(['/usr/bin/cp', '-a', str(DEPS_SOURCE / rel), str(EVAL_ROOT / rel)], EVAL_ROOT, {'PATH': '/usr/bin:/bin'}, log, timeout=1800)
            assert p.returncode == 0, r
        for l in sorted((EVAL_ROOT / 'node_modules/@cvg').iterdir()):
            if l.is_symlink():
                assert l.resolve().is_relative_to(EVAL_ROOT), str(l)
    elif step == 'runtime':
        wait_load()
        # default context dir: $TMPDIR/cvg-runtime (the script only accepts paths under its temp prefix)
        p, r = run([NODE, 'scripts/build-runtime.mjs'], EVAL_ROOT, env, log, timeout=3600, keep=3000)
        assert p.returncode == 0, r['stderr'][-1500:]
        shutil.rmtree(tmp / 'cvg-runtime', ignore_errors=True)
    elif step == 'harness':
        wait_load()
        p, r = run([NODE, 'node_modules/typescript/bin/tsc', '-b', 'packages/shared/tsconfig.json', 'packages/contracts/tsconfig.json', 'packages/orchestrator/tsconfig.json',
                    'packages/approval-engine/tsconfig.json', 'packages/harness/tsconfig.json', '--force'], EVAL_ROOT, env, log, timeout=3600, keep=3000)
        assert p.returncode == 0, r['stdout'][-1500:]
    elif step == 'sdk':
        wait_load()
        # The package tsconfig also includes its tests (rootDir error); the sdk dist is the src only, compiled as the
        # fresh-consumer recipe does (BUILD0241/0243/0244): rootDir src, outDir dist, tests excluded.
        cfg = tmp / 'sdk.json'
        cfg.write_text(json.dumps({'extends': str(EVAL_ROOT / 'tsconfig.base.json'), 'compilerOptions': {'paths': {}, 'typeRoots': [str(EVAL_ROOT / 'node_modules/@types')],
            'rootDir': str(EVAL_ROOT / 'packages/sdk/src'), 'outDir': str(EVAL_ROOT / 'packages/sdk/dist'), 'composite': False, 'incremental': False, 'noEmitOnError': True},
            'include': [str(EVAL_ROOT / 'packages/sdk/src/**/*.ts')], 'exclude': [str(EVAL_ROOT / 'packages/sdk/src/**/*.test.ts'), str(EVAL_ROOT / 'packages/sdk/src/**/__tests__/**')]}, indent=2) + '\n')
        p, r = run([NODE, 'node_modules/typescript/bin/tsc', '-p', str(cfg)], EVAL_ROOT, env, log, timeout=3600, keep=3000)
        assert p.returncode == 0, r['stdout'][-1500:]
        rec['sdkConfig'] = json.loads(cfg.read_text())
    elif step == 'verify':
        sealed = json.loads(gzip.decompress(SEALED_V5.read_bytes()))['semanticBoundary']['inputs']
        bad = []
        for x in sealed:
            f = EVAL_ROOT / x['file']
            got = sha(f) if f.is_file() else None
            if got != x['sha256']:
                bad.append({'file': x['file'], 'expected': x['sha256'], 'actual': got})
        cat = lambda f: 'node_modules' if f.startswith('node_modules') else ('dist' if '/dist/' in f else 'src')
        rec['verify'] = {'observedAt': now(), 'sealedReport': str(SEALED_V5.relative_to(PROJECT)), 'sealedReportSha256': sha(SEALED_V5),
                         'inputs': len(sealed), 'matching': len(sealed) - len(bad), 'mismatching': len(bad),
                         'mismatchByCategory': dict(Counter(cat(b['file']) for b in bad)), 'missing': sum(1 for b in bad if b['actual'] is None),
                         'sample': bad[:30], 'trackedStatus': git('status', '--porcelain', '--untracked-files=no', cwd=EVAL_ROOT).splitlines()[:20]}
        rec['status'] = 'PASS' if not bad else 'FAIL'
        rec.setdefault('verifyHistory', []).append({'at': rec['verify']['observedAt'], 'afterSteps': [x['step'] for x in rec['steps']],
                                                    'matching': rec['verify']['matching'], 'mismatching': rec['verify']['mismatching']})
    rec['steps'].append({'step': step, 'at': now()})
rec['observedAt'] = now()
save('eval-root-reconstitution.json', rec)
print(json.dumps({k: rec.get(k) for k in ('status', 'verify')}, indent=1, ensure_ascii=False)[:3000])
