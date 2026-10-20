"""Materializes the final SPEC0244 draft as the file the lead copies byte for byte to docs/02_spec (the draft is
already written with links relative to docs/02_spec). Writes only under materialized/ here and checks that every
relative link resolves from docs/02_spec and that the number 0244 is free. usage: materialize.py <draft.md>"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

src = EV / sys.argv[1]
NAME = '0244_b6_esm_module_shape.md'
SPECDIR = PROJECT / 'docs/02_spec'
s = src.read_text()
assert not re.search(r'/home/|/mnt/', s)
dst = EV / 'materialized' / NAME
dst.parent.mkdir(exist_ok=True)
dst.write_text(s)
links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', s)
broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists()]
out = {'task': TASK, 'observedAt': now(), 'targetDir': 'docs/02_spec',
       'files': [{'spec': 'SPEC0244', 'path': 'materialized/' + NAME, 'target': 'docs/02_spec/' + NAME, 'source': src.name, 'sourceSha256': sha(src),
                  'sha256': sha(dst), 'bytes': dst.stat().st_size, 'byteEqualToSource': dst.read_bytes() == src.read_bytes(), 'links': len(links),
                  'brokenFromSpecDir': broken, 'targetFreeAtObservation': not (SPECDIR / NAME).exists() and not list(SPECDIR.glob('0244_*'))}]}
out['status'] = 'PASS' if not broken and out['files'][0]['targetFreeAtObservation'] else 'FAIL'
save('materialized-specs.json', out)
print(json.dumps(out, indent=1, ensure_ascii=False))
