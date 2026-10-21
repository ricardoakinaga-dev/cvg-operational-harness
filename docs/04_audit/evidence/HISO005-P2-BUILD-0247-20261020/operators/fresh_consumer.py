"""(copied from HISO005-P2-BUILD-0245; BASE of the observer substitution = 1d40fe51) Fresh physical consumer without product, compiled from one commit of the candidate under the documented public
API (model: BUILD0241 fresh_consumer.py; observer basis = BUILD0237 smoke.mjs, read only).
usage: fresh_consumer.py <phase> <commit>"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

phase, commit = sys.argv[1], sys.argv[2]
commit = git('rev-parse', commit)
wait_load()
variant = RUNTIME / ('consumer-' + phase)
tmp = RUNTIME / ('consumer-' + phase + '-tmp')
archive = RUNTIME / ('consumer-' + phase + '-source.tar')
assert not variant.exists() and not archive.exists()
tmp.mkdir()
variant.mkdir()
env = minimal_env(tmp)
log = []
cmdfile = 'consumer-' + phase + '-commands.json'

def step(argv, cwd, timeout=1800):
    p, rec = run(argv, cwd, env, log, timeout=timeout, keep=6000)
    save(cmdfile, log)
    assert p.returncode == 0, 'see ' + cmdfile
    return p

step(['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', 'archive', '--format=tar', '--output=' + str(archive), commit, '--', '.', ':(exclude)docs/04_audit/evidence'], CANDIDATE)
step(['/usr/bin/tar', '-xf', str(archive), '-C', str(variant), '--no-same-owner', '--no-same-permissions',
      '--exclude=products', '--exclude=products/*', '--exclude=node_modules', '--exclude=*/node_modules',
      '--exclude=dist', '--exclude=*/dist', '--exclude=*.tsbuildinfo', '--exclude=.env*', '--exclude=*/.env*'], CANDIDATE)
assert not (variant / 'products').exists()
shutil.copytree(CANDIDATE / 'node_modules', variant / 'node_modules', symlinks=True)
removed = []
for p in (variant / 'node_modules/@cvg').glob('*'):
    if not p.is_symlink():
        continue
    target = (p.parent / os.readlink(p)).resolve()
    assert target.is_relative_to(variant), str(p)
    if target.is_relative_to(variant / 'products'):
        removed.append({'path': str(p.relative_to(variant)), 'target': os.readlink(p)})
        p.unlink()
assert sha(variant / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA

def rows(doc):
    result = []
    for package, body in re.findall(r'<!-- supported-exports:([^ >]+) -->(.*?)<!-- /supported-exports -->', doc.read_text(), re.S):
        assert re.fullmatch(r'@cvg/[a-z0-9-]+', package)
        for line in body.splitlines():
            fields = line.split('|')
            if len(fields) < 5 or fields[2].strip() not in ['tipo', 'valor']:
                continue
            for name in re.findall(r'`([^`]+)`', fields[1]):
                assert re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*', name)
                result.append({'package': package, 'name': name, 'kind': fields[2].strip(), 'stability': fields[4].strip().strip('`')})
    return result

exports = rows(variant / 'docs/architecture/PUBLIC_API.md')
assert exports
consumer = variant / 'audit-consumer'
consumer.mkdir()
(consumer / 'supported-exports.json').write_text(json.dumps(exports, ensure_ascii=False, indent=2) + '\n')
imports = ['import ' + ('type ' if r['kind'] == 'tipo' else '') + '{ ' + r['name'] + ' as E' + str(i) + ' } from ' + json.dumps(r['package']) + ';'
           for i, r in enumerate(exports)]
(consumer / 'public-imports.mts').write_text('\n'.join(imports) + '\nexport const importCount = ' + str(len(exports)) + ';\n')
shutil.copyfile(variant / 'examples/consumers/reception-agent/index.ts', consumer / 'reception-agent.mts')
(consumer / 'tsconfig.json').write_text(json.dumps({'extends': '../tsconfig.base.json', 'compilerOptions': {'paths': {}, 'rootDir': '.', 'outDir': 'dist', 'composite': False, 'declaration': False, 'sourceMap': False, 'incremental': False, 'noEmitOnError': True}, 'include': ['*.mts']}, indent=2) + '\n')
observer = Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018/without-product-r2/audit-consumer/smoke.mjs')
assert sha(observer) == '55ae900424d5d35a450589295bf70a20f3c661c61f2898e8195d55eecacd6365'
src = observer.read_text()
for old, new in [("'HISO005-P2-BUILD-0237'", "'" + TASK + "'"), ("'84d8d4b4ed053493533d7e9ad55e574a9e6f9047'", "'" + commit + "'"), ("'d8e3f8f2d346d4f8d3ddd162384ebbb79a322137'", "'" + BASE + "'")]:
    assert src.count(old) == 1, old
    src = src.replace(old, new)
(consumer / 'smoke.mjs').write_text(src)
step([NODE, 'scripts/build-runtime.mjs'], variant)
sdk = tmp / 'sdk.json'
sdk.write_text(json.dumps({'extends': str(variant / 'tsconfig.base.json'), 'compilerOptions': {'paths': {}, 'typeRoots': [str(variant / 'node_modules/@types')], 'rootDir': str(variant / 'packages/sdk/src'), 'outDir': str(variant / 'packages/sdk/dist'), 'composite': False, 'incremental': False, 'noEmitOnError': True}, 'include': [str(variant / 'packages/sdk/src/**/*.ts')], 'exclude': [str(variant / 'packages/sdk/src/**/*.test.ts'), str(variant / 'packages/sdk/src/**/__tests__/**')]}, indent=2) + '\n')
step([NODE, 'node_modules/typescript/bin/tsc', '-p', str(sdk)], variant)
step([NODE, 'node_modules/typescript/bin/tsc', '-p', 'audit-consumer/tsconfig.json'], variant)
report = EV / ('consumer-' + phase + '.json')
assert not report.exists()
step([NODE, 'audit-consumer/smoke.mjs', str(report)], variant)
out = json.loads(report.read_text())
assert out['status'] == 'PASS' and out['candidateCommit'] == commit and out['networkAttempts'] == 0
assert out['documentedImportsCompiled'] == len(exports)
assert out['runtimeExportsChecked'] == sum(x['kind'] == 'valor' for x in exports)
summary = {'task': TASK, 'status': 'FRESH_COMPILED_CONSUMER_PASS', 'phase': phase, 'observedAt': now(), 'commit': commit,
           'variant': str(variant), 'archiveSha256': sha(archive), 'archiveScope': 'commit sem docs/04_audit/evidence (mesma exclusão da SPEC0243)',
           'productPresent': False, 'removedProductLinks': removed, 'exportRows': len(exports), 'runtimeExports': out['runtimeExportsChecked'],
           'observerBasisSha256': sha(observer), 'observerCurrentSha256': sha(consumer / 'smoke.mjs'),
           'exampleSha256': sha(consumer / 'reception-agent.mts'), 'networkAttempts': 0, 'commands': cmdfile, 'report': report.name,
           'semanticApproval': False, 'productionApproved': False}
save('consumer-' + phase + '-summary.json', summary)
shutil.rmtree(variant); shutil.rmtree(tmp); archive.unlink()
print(json.dumps({k: summary[k] for k in ('status', 'commit', 'exportRows', 'runtimeExports')}))
