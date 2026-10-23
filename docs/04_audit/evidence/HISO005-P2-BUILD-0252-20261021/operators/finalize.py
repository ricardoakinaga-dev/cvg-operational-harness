"""build.json of the BUILD: commits from the base, sha256 of the code paths (base and BUILD), of every evidence file,
the commands run (operators with the JSON records that hold each argv and result) and what was not run.
usage: finalize.py <last-code-commit>"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

code = git('rev-parse', sys.argv[1])
commits = git('rev-list', '--reverse', BASE + '..' + code).splitlines()
code_paths = git('diff', '--name-only', BASE, code, '--', 'scripts', 'tests').splitlines()
show = lambda rev, p: subprocess.run(['git', 'show', rev + ':' + p], cwd=CANDIDATE, capture_output=True)
ev_paths = sorted(str(p.relative_to(CANDIDATE)) for p in EV.rglob('*') if p.is_file() and p.name != 'build.json')
OPS_RUN = [
    ('tools_copy.py v7 24cdb463', 'tools-v7.json'), ('catalog.py (74, v7 e b1, antes da mudança)', 'fixture-catalog.json'),
    ('run_vitest.py first-red-0252 --keep-report ' + TEST + ' (v7, worktree sem mudança)', 'first-red-0252-command.json'),
    ('catalog.py --suffix vn --engine vN=<engine b5a76d2d> (r1, substituído)', 'fixture-catalog-vn-r1.json'),
    ('tools_copy.py v8 b5a76d2d (r1)', 'tools-v8.json'), ('verify_eval_root.py before', 'eval-root-check-before.json'),
    ('npm_cache_copy.py', 'npm-cache-source-copy.json'), ('references.py scoped v8', 'references-scoped.json'),
    ('measure_chain.py r1 v7 v8 scoped (r1, substituída pela r2)', 'epoch-r1.json'),
    ('b6_final.py v7 v8 v8 b5a76d2d (r1, substituído)', 'b6-final-comparison-r1.json'),
    ('mutants.py (r1, interrompido pela revisão r1)', 'mutants-r1-interrupted.json'),
    ('catalog.py --suffix r1b --engine vN=<engine 9a571d36> (88)', 'fixture-catalog-r1b.json'), ('gen_test.py', 'test-generation.json'),
    ('prologue_node22.py (60 linhas, Node 22 real, v7 e vN)', 'prologue-table.json'),
    ('run_vitest.py green-0252-r1b --keep-report ' + TEST, 'green-0252-r1b-command.json'),
    ('red_on_base.py a1ef8120… (v7 trocado só na rodada)', 'first-red-0252-r1b-command.json'), ('first_red.py', 'first-red.json'),
    ('tools_copy.py v8b 9a571d36', 'tools-v8b.json'),
    ('measure_chain.py r2 v7 v8b scoped (verify_eval_root, guarded_measure v7, base_check v7, guarded_measure v8b, verify_eval_root)', 'epoch-r2.json'),
    ('base_check.py v7 (dentro da época r2)', 'base-vs-sealed.json'), ('b6_final.py v7 v8b v8b 9a571d36', 'b6-final-comparison.json'),
    ('mutants.py (29, engine a1ef8120)', 'mutants.json'), ('gates.py r1b <9 caminhos tocados>', 'gates-r1b.json'),
    ('run_vitest.py b6-focal <18 suítes B6>', 'b6-focal-command.json'), ('run_vitest.py b6-native --native <3 integrações>', 'b6-native-command.json'),
    ('fresh_consumer.py precert 9a571d36', 'consumer-precert-summary.json'), ('run_vitest.py unit-core --core (test:core, CVG_TEST_SCOPE=core)', 'unit-core-command.json')]
rec = {'task': TASK, 'observedAt': now(), 'spec': {'path': SPEC, 'sha256': sha(CANDIDATE / SPEC), 'approved': SPEC_SHA, 'unchanged': sha(CANDIDATE / SPEC) == SPEC_SHA},
       'worktree': str(CANDIDATE), 'base': BASE,
       'commits': [{'sha': c, 'subject': git('log', '-1', '--format=%s', c), 'paths': git('diff-tree', '--no-commit-id', '--name-only', '-r', c).count('\n') + 1} for c in commits],
       'evidenceCommit': 'o commit seguinte a ' + code[:12] + ' (esta pasta, com build.json e REPORT.md)',
       'codeFiles': {p: {'base': shab(show(BASE, p).stdout) if show(BASE, p).returncode == 0 else None, 'build': shab(show(code, p).stdout)} for p in code_paths},
       'kernel': {'before': OLD_VERSION, 'after': NEW_VERSION, 'engineBefore': V7_ENGINE_SHA, 'engineAfter': shab(show(code, ENGINE).stdout)},
       'evidenceFiles': {p: sha(CANDIDATE / p) for p in ev_paths},
       'commands': [{'operator': 'operators/' + c.split(' ')[0], 'argv': 'python3 -I -B operators/' + c, 'record': r,
                     'recordExists': (EV / r).exists()} for c, r in OPS_RUN],
       'environment': 'env -i HOME=$HOME PATH=' + NODEBIN + ':/usr/bin:/bin; filhos com PATH, LANG=C, LC_ALL=C, TZ=UTC e TMPDIR/HOME privados',
       'runtime': str(RUNTIME), 'notRun': ['certify (fica com o lead)', 'test:e2e', 'test:postgres', 'sbom', 'licenses:check', 'push', 'PR', 'deploy'],
       'lockfileChanged': bool(git('diff', '--name-only', BASE, code, '--', 'package-lock.json'))}
save('build.json', rec)
print(json.dumps({'commits': [c[:12] for c in commits], 'codeFiles': len(rec['codeFiles']), 'evidence': len(ev_paths),
                  'missingRecords': [c['record'] for c in rec['commands'] if not c['recordExists']], 'specUnchanged': rec['spec']['unchanged']}))
