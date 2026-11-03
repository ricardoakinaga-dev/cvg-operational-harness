from pathlib import Path
import datetime, hashlib, json, os, shutil, sys, tarfile

CANDIDATE = Path(__file__).resolve().parent.parent
ROOT = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
EVIDENCE = ROOT / 'docs/04_audit/evidence/CODEX-INCORPORATION-20261101/composition'
stage = sys.argv[1]
assert stage in ('baseline', 'green')
setup = json.loads((CANDIDATE / '.composition/setup.json').read_text())
context = Path(setup[stage + '_context'])
assert (context / 'runtime-context.json').is_file()
raw = (EVIDENCE / 'checks' / (stage + '-pack.log')).read_text()
package, _ = json.JSONDecoder().raw_decode(raw.lstrip())
filename = package[0]['filename']
assert '/' not in filename
archive = CANDIDATE / '.composition/tarballs' / stage / filename
consumer = CANDIDATE / ('.composition/consumer-' + stage)
assert not consumer.exists()
shutil.copytree(context, consumer, symlinks=True)
target = consumer / 'packages/harness'
assert target.is_dir() and not target.is_symlink()
shutil.rmtree(target)
target.mkdir()
native = []
with tarfile.open(archive, 'r:gz') as tar:
    for member in tar.getmembers():
        parts = Path(member.name).parts
        assert parts and parts[0] == 'package' and '..' not in parts
        relative = Path(*parts[1:])
        dest = target / relative
        if member.isdir():
            dest.mkdir(parents=True, exist_ok=True)
            continue
        assert member.isfile(), member.name
        data = tar.extractfile(member).read()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        dest.chmod(member.mode & 0o777)
        if str(relative).startswith('native/'):
            assert data == (context / 'packages/harness' / relative).read_bytes()
            native.append({'path': str(relative), 'sha256': hashlib.sha256(data).hexdigest(), 'mode': oct(member.mode & 0o777)})
assert len(native) == 2
shutil.copytree(CANDIDATE / 'node_modules', consumer / 'node_modules', symlinks=True)
links = 0
for base, dirs, files in os.walk(consumer / 'node_modules', followlinks=False):
    for name in dirs + files:
        item = Path(base) / name
        if item.is_symlink():
            assert item.resolve().is_relative_to(consumer), str(item)
            links += 1
probe = (CANDIDATE / '.composition/probe-source.mjs').read_bytes()
(consumer / 'probe.mjs').write_bytes(probe)
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'stage': stage, 'archive': str(archive), 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'entries': package[0]['entryCount'], 'consumer': str(consumer), 'harness_from_actual_tarball': True, 'other_workspaces_from_real_context': True, 'physical_deps_only': True, 'internal_links': links, 'outside_links': 0, 'probe_sha256': hashlib.sha256(probe).hexdigest(), 'native_assets': native, 'host_js_sha256': hashlib.sha256((target / 'dist/kernel/host.js').read_bytes()).hexdigest(), 'native_binary_loaded': False}
(EVIDENCE / (stage + '-consumer-setup.json')).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
