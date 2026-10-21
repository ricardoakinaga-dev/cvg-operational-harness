"""SPEC draft checks: links resolve from docs/02_spec, no absolute paths, prettier (main config, markdown parser)
clean, target numbers free; rule-name/40-hex co-occurrence and empty files in this package.
usage: check_documents.py <out-name> <spec-file>..."""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

out, specs = sys.argv[1], sys.argv[2:]
SPECDIR = PROJECT / 'docs/02_spec'
PRETTIER = CANDIDATE / 'node_modules/prettier/bin/prettier.cjs'
docs = []
for name in specs:
    t = (EV / name).read_text()
    links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', t)
    broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists()]
    p = subprocess.run([NODE, str(PRETTIER), '--config', str(PROJECT / '.prettierrc.json'), '--parser', 'markdown', '--check', str(EV / name)], cwd=str(RUNTIME) if RUNTIME.exists() else '/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad', capture_output=True, text=True)
    num = re.search(r'SPEC(\d{4})', t).group(1)
    docs.append({'file': name, 'sha256': sha(EV / name), 'bytes': (EV / name).stat().st_size, 'links': len(links), 'brokenFromSpecDir': broken,
                 'absolutePaths': bool(re.search(r'/home/|/mnt/', t)), 'prettierClean': p.returncode == 0, 'number': num,
                 'targetFree': not list(SPECDIR.glob(num + '_*'))})
    docs[-1]['status'] = 'PASS' if not broken and not docs[-1]['absolutePaths'] and docs[-1]['prettierClean'] and docs[-1]['targetFree'] else 'FAIL'
RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
cooc = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.suffix in ('.json', '.md', '.txt', '.py')
        and RULE.search(f.read_text(errors='replace')) and HEX40.search(f.read_text(errors='replace'))]
empty = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.stat().st_size == 0]
rec = {'task': TASK, 'observedAt': now(), 'documents': docs, 'ruleNameWith40HexFiles': cooc, 'emptyFiles': empty,
       'status': 'PASS' if all(d['status'] == 'PASS' for d in docs) and not cooc else 'FAIL'}
save(out, rec)
print(json.dumps(rec, indent=1, ensure_ascii=False))
