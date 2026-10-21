"""SPEC0247 draft checks: links resolve from docs/02_spec, no absolute paths, prettier output (npx --stdin-filepath in
the read-only PR9 worktree) byte-equal, target number free; in this evidence package: rule-name/40-hex co-occurrence
and empty files; scripts/check-doc-links.mjs (main remote, git show into the runtime) on this folder.
usage: check_documents.py <out-name> <spec-file-in-evidence>..."""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

out, specs = sys.argv[1], sys.argv[2:]
SPECDIR = PROJECT / 'docs/02_spec'
docs = []
for name in specs:
    data = (EV / name).read_bytes(); t = data.decode()
    links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', t)
    broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists()]
    p = npx_prettier(data, 'check ' + name)
    num = re.search(r'SPEC(\d{4})', t).group(1)
    d = {'file': name, 'sha256': sha(EV / name), 'bytes': len(data), 'links': len(links), 'brokenFromSpecDir': broken,
         'absolutePaths': bool(re.search(r'/home/|/mnt/', t)), 'prettierStdinIdempotent': p.returncode == 0 and p.stdout == data,
         'number': num, 'targetFree': not list(SPECDIR.glob(num + '_*')), 'targetFreeInMainRemote': not subprocess.run(
             ['git', '-C', str(PROJECT), 'ls-tree', '--name-only', MAIN, 'docs/02_spec/' + num + '_b6_cjs_export_soundness.md'], capture_output=True, text=True).stdout.strip()}
    d['status'] = 'PASS' if not broken and not d['absolutePaths'] and d['prettierStdinIdempotent'] and d['targetFree'] and d['targetFreeInMainRemote'] else 'FAIL'
    docs.append(d)
RULE = re.compile(r'sourcegraph|gitleaks:allow|generic-api-key|aws-access-token', re.I)
HEX40 = re.compile(r'\b[0-9a-f]{40}\b')
cooc = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.suffix in ('.json', '.md', '.txt', '.py')
        and RULE.search(f.read_text(errors='replace')) and HEX40.search(f.read_text(errors='replace'))]
empty = [str(f.relative_to(EV)) for f in sorted(EV.rglob('*')) if f.is_file() and f.stat().st_size == 0]
checker = RUNTIME / 'check-doc-links.mjs'
checker.write_text(subprocess.check_output(['git', '-C', str(PROJECT), 'show', MAIN + ':scripts/check-doc-links.mjs'], text=True))
q = subprocess.run([NODE, str(checker), str(EV)], cwd=str(PROJECT), capture_output=True, text=True, env={'PATH': NODEBIN + ':/usr/bin:/bin'})
rec = {'task': TASK, 'observedAt': now(), 'documents': docs, 'ruleNameWith40HexFiles': cooc, 'emptyFiles': empty,
       'checkDocLinks': {'script': 'scripts/check-doc-links.mjs da main remota ' + MAIN[:8] + ' (sha256 ' + sha(checker) + ')', 'root': str(EV.relative_to(PROJECT)),
                         'exitCode': q.returncode, 'stdoutTail': q.stdout[-600:], 'note': 'o checker só lê .md; os textos da SPEC aqui são .md.txt, conferidos acima a partir de docs/02_spec'},
       'status': 'PASS' if all(d['status'] == 'PASS' for d in docs) and not cooc and not empty and q.returncode == 0 else 'FAIL'}
save(out, rec)
print(json.dumps(rec, indent=1, ensure_ascii=False)[:3000])
