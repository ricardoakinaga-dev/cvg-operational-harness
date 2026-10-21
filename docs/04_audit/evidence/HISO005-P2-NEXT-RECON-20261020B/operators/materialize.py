"""Materialize the final drafts as the files the lead copies byte for byte to docs/02_spec (already formatted with the
main's prettier; .md.txt here because the links are relative to docs/02_spec). usage: materialize.py <0245-draft> <0246-draft>"""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

NAMES = {'0245': '0245_b6_tsx_parse.md', '0246': '0246_b6_scope_proof.md'}
SPECDIR = PROJECT / 'docs/02_spec'
out = {'task': TASK, 'observedAt': now(), 'targetDir': 'docs/02_spec', 'files': []}
for num, src_name in zip(('0245', '0246'), sys.argv[1:3]):
    src = EV / src_name
    s = src.read_text()
    assert not re.search(r'/home/|/mnt/', s)
    dst = EV / 'materialized' / (NAMES[num] + '.txt')
    dst.parent.mkdir(exist_ok=True)
    dst.write_bytes(src.read_bytes())
    p = subprocess.run([NODE, str(CANDIDATE / 'node_modules/prettier/bin/prettier.cjs'), '--config', str(PROJECT / '.prettierrc.json'), '--parser', 'markdown', '--check', str(dst)],
                       cwd=str(RUNTIME), capture_output=True, text=True)
    links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', s)
    broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists()]
    out['files'].append({'spec': 'SPEC' + num, 'path': 'materialized/' + NAMES[num] + '.txt', 'target': 'docs/02_spec/' + NAMES[num], 'source': src_name,
                         'sourceSha256': sha(src), 'sha256': sha(dst), 'bytes': dst.stat().st_size, 'byteEqualToSource': dst.read_bytes() == src.read_bytes(),
                         'prettierClean': p.returncode == 0, 'links': len(links), 'brokenFromSpecDir': broken,
                         'targetFreeAtObservation': not list(SPECDIR.glob(num + '_*'))})
out['status'] = 'PASS' if all(f['prettierClean'] and not f['brokenFromSpecDir'] and f['targetFreeAtObservation'] for f in out['files']) else 'FAIL'
save('materialized-specs.json', out)
print(json.dumps(out, indent=1, ensure_ascii=False))
