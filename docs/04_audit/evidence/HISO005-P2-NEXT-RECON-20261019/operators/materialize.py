"""Materializes the r3 drafts as the files the lead copies byte for byte to docs/02_spec (links relative to
docs/02_spec, provisional numbers 0242/0243). Writes them under materialized/ in this evidence folder only and
checks that every relative link resolves from docs/02_spec. usage: materialize.py"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

NAMES = {'0242': '0242_b6_body_caps_deadlines.md', '0243': '0243_b6_reference_source_scope.md'}
SPECDIR = PROJECT / 'docs/02_spec'
REL_EV = '../04_audit/evidence/' + TASK + '/'
HEADER_OLD = ("Rascunho r3 (correções da R2 aplicadas sem terceira rodada de crítica) da preparação T1 `HISO005-P2-NEXT-RECON-20261019`. "
              "O lead atribui o número final ao materializar em `docs/02_spec`; nesse passo, os links são reescritos para caminhos relativos a `docs/02_spec`")
out = {'task': TASK, 'observedAt': now(), 'targetDir': 'docs/02_spec', 'files': []}
for n, name in NAMES.items():
    src = EV / ('spec' + n + '-r3.source.md')
    s = src.read_text()
    assert s.count(HEADER_OLD) == 1, n
    s = s.replace(HEADER_OLD, "Preparação T1 `HISO005-P2-NEXT-RECON-20261019`, texto r3 (correções da R2 aplicadas sem terceira rodada de crítica), materializado com links relativos a `docs/02_spec`")
    s = s.replace(', e a referência ao rascunho 0243 recebe o número final.', '.')
    s = s.replace('Composição com o [rascunho 0243](spec0243-r3.source.md)', 'Composição com a [SPEC0243](' + NAMES['0243'] + ')')
    s = s.replace('[rascunho 0243](spec0243-r3.source.md)', '[SPEC0243](' + NAMES['0243'] + ')')
    s = s.replace('rascunho da [0242 §5](spec0242-r3.source.md)', '[SPEC0242 §5](' + NAMES['0242'] + ')')
    s = s.replace('](../../../02_spec/', '](')
    s = s.replace('](../../../', '](../')
    def fix(m):
        target = m.group(2)
        if target.startswith(('http', '../', '0')) or '/' in target:
            return m.group(0)
        return m.group(1) + REL_EV + target + ')'
    s = re.sub(r'(\]\()([^)#\s]+)\)', fix, s)
    assert 'rascunho' not in s.lower(), n
    dst = EV / 'materialized' / name
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(s)
    links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', s)
    broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists() and l not in NAMES.values()]
    out['files'].append({'spec': 'SPEC' + n, 'path': 'materialized/' + name, 'target': 'docs/02_spec/' + name, 'source': src.name,
                         'sourceSha256': sha(src), 'sha256': sha(dst), 'bytes': dst.stat().st_size, 'links': len(links), 'brokenFromSpecDir': broken,
                         'targetFreeAtObservation': not (SPECDIR / name).exists() and not list(SPECDIR.glob(n + '_*'))})
out['status'] = 'PASS' if all(not f['brokenFromSpecDir'] and f['targetFreeAtObservation'] for f in out['files']) else 'FAIL'
save('materialized-specs.json', out)
print(json.dumps(out, indent=1, ensure_ascii=False))
