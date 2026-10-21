"""Gitleaks 8.28.0 (release binary of the port runtime, execution only), decision by exit code, with the .gitleaks.toml
of the candidate (config read from the commit; no .gitleaksignore is used for the evidence copy):
(1) the evidence folder (dir mode) on a private copy in the session scratchpad; (2) the same copy with every .gz
decompressed; (3) the commit diff 1d40fe51..<commit> in the candidate (git mode, --log-opts). The copy is removed after.
usage: gitleaks_scan.py <commit>"""
import gzip, json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

commit = git('rev-parse', sys.argv[1])
BIN = Path('/mnt/dados/cvg-work/cvg-hiso005-port-main-runtime-20261019/bin/release/gitleaks')
ver = subprocess.run([str(BIN), 'version'], capture_output=True, text=True).stdout.strip()
assert ver.lstrip('v') == '8.28.0', ver
SCRATCH = Path('/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad') / 'gitleaks-build0247'
if SCRATCH.exists(): shutil.rmtree(SCRATCH)
SCRATCH.mkdir(parents=True)
cfg = SCRATCH / 'gitleaks.toml'
cfg.write_text(subprocess.check_output(['git', 'show', commit + ':.gitleaks.toml'], cwd=CANDIDATE, text=True))
skip = ('gitleaks-scan.json', 'evidence-manifest-final.json', 'empty-artifact-delta.json')
plain = SCRATCH / 'evidence-plain'
shutil.copytree(EV, plain, ignore=shutil.ignore_patterns(*skip, '__pycache__'))
expanded = SCRATCH / 'evidence-expanded'
shutil.copytree(plain, expanded)
gz = sorted(expanded.rglob('*.gz'))
nbytes = 0
for f in gz:
    raw = gzip.decompress(f.read_bytes()); f.with_suffix('').write_bytes(raw); f.unlink(); nbytes += len(raw)
runs = []
def scan(what, argv, cwd=None):
    p = subprocess.run([str(BIN), *argv, '--config', str(cfg), '--no-banner', '--redact', '--exit-code', '1'], capture_output=True, text=True, cwd=cwd)
    runs.append({'what': what, 'argv': ['gitleaks', *argv, '--config', '<candidate .gitleaks.toml>', '--no-banner', '--redact', '--exit-code', '1'],
                 'exitCode': p.returncode, 'stderrTail': p.stderr[-300:]})
scan('pasta de evidência (modo dir, cópia privada)', ['dir', str(plain)])
scan('cópia com os %d .gz descompactados (%d bytes)' % (len(gz), nbytes), ['dir', str(expanded)])
scan('diff do commit %s..%s na candidata (modo git)' % (BASE[:12], commit[:12]), ['git', str(CANDIDATE), '--log-opts=' + BASE + '..' + commit])
files = sum(1 for f in plain.rglob('*') if f.is_file())
shutil.rmtree(SCRATCH)
rec = {'task': TASK, 'observedAt': now(), 'tool': 'gitleaks ' + ver + ' (binário release do runtime do port, só execução)', 'binarySha256Prefix': sha(BIN)[:16],
       'config': '.gitleaks.toml do commit ' + commit[:12] + ' (cópia no scratchpad da sessão)', 'filesInCopy': files, 'gzDecompressed': len(gz), 'expandedBytes': nbytes,
       'runs': runs, 'decision': 'pelo código de saída', 'status': 'PASS' if all(r['exitCode'] == 0 for r in runs) else 'FAIL',
       'scannedBeforeFiles': list(skip), 'note': 'esses três arquivos são escritos depois da varredura (só hashes e contagens); a verificação de regra+40 hex do manifesto cobre todos'}
save('gitleaks-scan.json', rec)
print(json.dumps({'status': rec['status'], 'runs': [(r['what'], r['exitCode']) for r in runs]}, ensure_ascii=False))
