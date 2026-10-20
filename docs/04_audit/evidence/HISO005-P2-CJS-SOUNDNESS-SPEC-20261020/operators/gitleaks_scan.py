"""Gitleaks 8.28.0 (release binary of the port runtime, execution only) over a private copy of this evidence folder,
with the .gitleaks.toml of the main remote (git show into the session scratchpad); the .gz files are decompressed in the copy.
Decision by exit code. usage: gitleaks_scan.py"""
import gzip, json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

BIN = Path('/mnt/dados/cvg-work/cvg-hiso005-port-main-runtime-20261019/bin/release/gitleaks')
ver = subprocess.run([str(BIN), 'version'], capture_output=True, text=True).stdout.strip()
assert ver.lstrip('v') == '8.28.0', ver
SCRATCH = Path('/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad') / 'gitleaks-cjs-spec'  # session scratchpad (the runtime is already released)
cfg = SCRATCH / 'gitleaks.toml'
copy = SCRATCH / 'evidence-copy'
if copy.exists(): shutil.rmtree(copy)
cfg.parent.mkdir(parents=True, exist_ok=True)
cfg.write_text(subprocess.check_output(['git', '-C', str(PROJECT), 'show', MAIN + ':.gitleaks.toml'], text=True))
shutil.copytree(EV, copy, ignore=shutil.ignore_patterns('gitleaks-scan.json', 'evidence-manifest-final.json', '__pycache__'))
expanded = 0
for gz in sorted(copy.rglob('*.gz')):
    raw = gzip.decompress(gz.read_bytes()); gz.with_suffix('').write_bytes(raw); gz.unlink(); expanded += len(raw)
files = sum(1 for f in copy.rglob('*') if f.is_file())
p = subprocess.run([str(BIN), 'dir', str(copy), '--config', str(cfg), '--no-banner', '--redact', '--exit-code', '1'], capture_output=True, text=True)
rec = {'task': TASK, 'observedAt': now(), 'tool': 'gitleaks ' + ver + ' (binário release do runtime do port, só execução)', 'binarySha256Prefix': sha(BIN)[:16],
       'config': '.gitleaks.toml da main remota ' + MAIN[:8] + ' (cópia no scratchpad da sessão, sha256 ' + sha(cfg)[:16] + ')',
       'target': 'cópia privada desta pasta, com os .gz descompactados', 'files': files, 'expandedBytes': expanded,
       'flags': ['dir', '--no-banner', '--redact', '--exit-code 1'], 'exitCode': p.returncode, 'stderrTail': p.stderr[-400:], 'decision': 'pelo código de saída',
       'status': 'PASS' if p.returncode == 0 else 'FAIL'}
shutil.rmtree(SCRATCH)
save('gitleaks-scan.json', rec)
print(json.dumps(rec, indent=1, ensure_ascii=False))
