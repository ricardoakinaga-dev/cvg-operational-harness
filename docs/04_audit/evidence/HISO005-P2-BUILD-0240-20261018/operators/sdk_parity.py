"""Emit public SDK outputs in the candidate from the frozen source (same recipe as 0237 parity) and compare with the fresh consumer and 0237 emits."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

state, freeze, review, h = assert_frozen(allow_cert_dirty=True)
assert not (CANDIDATE / 'packages/sdk/dist').exists()
owned = RUNTIME / 'sdk-parity'
owned.mkdir()
config = owned / 'tsconfig.json'
config.write_text(json.dumps({'extends': str(CANDIDATE / 'tsconfig.base.json'), 'compilerOptions': {'paths': {}, 'typeRoots': [str(CANDIDATE / 'node_modules/@types')], 'rootDir': str(CANDIDATE / 'packages/sdk/src'), 'outDir': str(CANDIDATE / 'packages/sdk/dist'), 'composite': False, 'incremental': False, 'noEmitOnError': True}, 'include': [str(CANDIDATE / 'packages/sdk/src/**/*.ts')], 'exclude': [str(CANDIDATE / 'packages/sdk/src/**/*.test.ts'), str(CANDIDATE / 'packages/sdk/src/**/__tests__/**')]}, indent=2) + '\n')
log = []
p, rec = run([NODE, 'node_modules/typescript/bin/tsc', '-p', str(config)], CANDIDATE, minimal_env(owned), log, timeout=300)
save('sdk-physical-parity-command.json', {'commands': log, 'config': json.loads(config.read_text()), 'configSha256': sha(config)})
assert p.returncode == 0
consumer = {r['path']: r['sha256'] for r in load('consumer-precert-sdk-dist-hashes.json')['sdkDistFiles']}
old = Path('/mnt/ia/cvg-hiso005-build0237-20261018')
outputs = []
for path in sorted((CANDIDATE / 'packages/sdk/dist').rglob('*')):
    if not path.is_file():
        continue
    name = path.relative_to(CANDIDATE)
    o = old / name
    outputs.append({'path': str(name), 'sha256': sha(path), 'bytes': path.stat().st_size,
                    'equalsFreshConsumer': consumer.get(str(name)) == sha(path), 'equals0237Emit': o.is_file() and sha(o) == sha(path)})
changed = subprocess.check_output(['git', 'diff', '--name-only'], cwd=CANDIDATE, text=True).splitlines()
assert all(x.startswith('certification/') for x in changed), changed
assert_frozen(allow_cert_dirty=True)
result = {'task': TASK, 'status': 'SDK_PHYSICAL_PARITY_FROM_FROZEN_SOURCE', 'observedAt': now(), 'sourceCommit': h, 'outputCount': len(outputs),
          'allEqualFreshConsumer': all(x['equalsFreshConsumer'] for x in outputs), 'allEqual0237Emit': all(x['equals0237Emit'] for x in outputs),
          'outputs': outputs, 'freshConsumerSdkFiles': len(consumer), 'sourceEdited': False, 'sourceAliases': False, 'compiledSemanticAuthorityForSdk': False, 'proofOrResolutionCredit': 0}
save('sdk-physical-parity.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'outputs'}))
