"""Final package checks after the runtime release: empty files, rule-name/40-hex co-occurrence, check-doc-links.mjs
of the main remote (git show into the session scratchpad) on this folder, then the evidence manifest (path, bytes,
sha256 of every file). usage: final_manifest.py <scratchpad-dir>"""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

sp = Path(sys.argv[1])
RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
files = [f for f in sorted(EV.rglob('*')) if f.is_file() and '__pycache__' not in f.parts]
empty = [str(f.relative_to(EV)) for f in files if f.stat().st_size == 0]
cooc = [str(f.relative_to(EV)) for f in files if f.suffix in ('.json', '.md', '.txt', '.py')
        and RULE.search(f.read_text(errors='replace')) and HEX40.search(f.read_text(errors='replace'))]
checker = sp / 'check-doc-links-cjs-spec.mjs'
checker.write_text(subprocess.check_output(['git', '-C', str(PROJECT), 'show', MAIN + ':scripts/check-doc-links.mjs'], text=True))
q = subprocess.run([NODE, str(checker), str(EV)], cwd=str(PROJECT), capture_output=True, text=True, env={'PATH': NODEBIN + ':/usr/bin:/bin'})
checker.unlink()
checks = {'task': TASK, 'observedAt': now(), 'emptyFiles': empty, 'ruleNameWith40HexFiles': cooc,
          'checkDocLinks': {'script': 'scripts/check-doc-links.mjs da main remota ' + MAIN[:8], 'exitCode': q.returncode, 'stdoutTail': q.stdout[-400:]},
          'runtimeExists': RUNTIME.exists(), 'status': 'PASS' if not empty and not cooc and q.returncode == 0 and not RUNTIME.exists() else 'FAIL'}
save('final-package-checks.json', checks)
files = [f for f in sorted(EV.rglob('*')) if f.is_file() and '__pycache__' not in f.parts and f.name != 'evidence-manifest-final.json']
man = {'task': TASK, 'observedAt': now(), 'files': [{'path': str(f.relative_to(EV)), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in files],
       'spec': {'materialized': 'materialized/0247_b6_cjs_export_soundness.md.txt', 'sha256': sha(EV / 'materialized/0247_b6_cjs_export_soundness.md.txt')}}
save('evidence-manifest-final.json', man)
print(json.dumps(checks, indent=1, ensure_ascii=False)); print(len(man['files']), 'files in manifest')
