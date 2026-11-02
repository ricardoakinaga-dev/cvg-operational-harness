from pathlib import Path
import datetime, hashlib, json, os, shutil, tarfile

CANDIDATE = Path(__file__).resolve().parent.parent
ROOT = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
EVIDENCE = ROOT / 'docs/04_audit/evidence/CODEX-INCORPORATION-20261101/cleanup-quality'
setup = json.loads((CANDIDATE / '.cquality/setup.json').read_text())
context = Path(setup['context'])
assert (context / 'runtime-context.json').is_file()
package, _ = json.JSONDecoder().raw_decode((EVIDENCE / 'checks/pack.log').read_text().lstrip())
filename = package[0]['filename']
assert '/' not in filename
archive = CANDIDATE / '.cquality/tarballs' / filename
consumer = CANDIDATE / '.cquality/consumer'
assert not consumer.exists()
shutil.copytree(context, consumer, symlinks=True)
target = consumer / 'packages/harness'
assert target.is_dir() and not target.is_symlink()
shutil.rmtree(target)
target.mkdir()
rows = []
with tarfile.open(archive, 'r:gz') as tar:
    for member in tar.getmembers():
        parts = Path(member.name).parts
        assert parts and parts[0] == 'package' and '..' not in parts
        relative = Path(*parts[1:])
        dest = target / relative
        if member.isdir():
            dest.mkdir(parents=True, exist_ok=True)
            continue
        assert member.isfile()
        data = tar.extractfile(member).read()
        assert data == (context / 'packages/harness' / relative).read_bytes()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        dest.chmod(member.mode & 0o777)
        assert dest.read_bytes() == data
        rows.append({'path': str(relative), 'sha256': hashlib.sha256(data).hexdigest(), 'tar_and_consumer_mode': member.mode & 0o777})
assert len(rows) == package[0]['entryCount'] == 169
source = CANDIDATE / 'node_modules'
def ignored(base, names):
    return [name for name in names if name in ['.vite', '.cache', '.vitest']] if Path(base) == source else []
shutil.copytree(source, consumer / 'node_modules', symlinks=True, ignore=ignored)
links = 0
for base, dirs, files in os.walk(consumer / 'node_modules', followlinks=False):
    for name in dirs + files:
        item = Path(base) / name
        if item.is_symlink():
            assert item.resolve().is_relative_to(consumer)
            links += 1
probe = (ROOT / 'docs/04_audit/evidence/CODEX-INCORPORATION-20261101/composition/public-consumer-oracle.mjs.txt').read_bytes()
assert hashlib.sha256(probe).hexdigest() == 'da684836894904992d85973e59a48a444d701815f79e9a2011203c9e666cda6d'
(consumer / 'probe.mjs').write_bytes(probe)
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'archive': str(archive), 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'entries': len(rows), 'consumer': str(consumer), 'harness_from_actual_tarball': True, 'all_tar_bytes_match_context_and_consumer': True, 'tar_modes_preserved_in_consumer': True, 'physical_deps': True, 'internal_links': links, 'outside_links': 0, 'same_previous_probe_sha256': hashlib.sha256(probe).hexdigest(), 'native_backend_loaded': False}
(EVIDENCE / 'package-inventory.json').write_text(json.dumps(rows, indent=2) + '\n')
(EVIDENCE / 'consumer-setup.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
