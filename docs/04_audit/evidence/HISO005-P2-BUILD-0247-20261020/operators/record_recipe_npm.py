"""Records, in npx-runs.json, the npm execution done inside the installed-reference recipe of one refs label
(npm ci --offline --ignore-scripts, env built by scripts/boundary-reference-process.mjs with
NPM_CONFIG_UPDATE_NOTIFIER=false, nothing inherited): the npm debug logs and stderr logs of the recipe are scanned
for 'http fetch'. usage: record_recipe_npm.py <refs-label>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label = sys.argv[1]
inst = RUNTIME / ('refs-' + label) / 'installed'
logs = sorted(inst.glob('cache/_logs/*.log')) + sorted(inst.glob('logs/*.log'))
hits = [{'file': str(f.relative_to(RUNTIME)), 'line': l[:200]} for f in logs for l in f.read_text(errors='replace').splitlines() if 'http fetch' in l or 'registry.npmjs.org' in l and 'GET' in l]
dbg = sorted(inst.glob('cache/_logs/*.log'))
argv_line = next((l for f in dbg for l in f.read_text(errors='replace').splitlines() if 'argv' in l), None)
record_npx({'at': now(), 'tool': 'npm (dentro da receita instalada, refs-' + label + ')', 'via': 'scripts/build-installed-reference.mjs → npm-cli.js ci --offline --ignore-scripts --audit=false --fund=false',
            'envKeys': 'referenceEnvironment(): PATH, LANG, LC_ALL, TZ, GIT_CONFIG_*, NPM_CONFIG_USERCONFIG, NPM_CONFIG_GLOBALCONFIG, NPM_CONFIG_UPDATE_NOTIFIER=false, TMPDIR (nada herdado)',
            'debugArgvLine': argv_line, 'logsScanned': len(logs), 'httpFetchLines': hits, 'network': 'nenhuma' if not hits else 'VER httpFetchLines'})
print(len(logs), 'logs;', len(hits), 'hits;', argv_line)
assert not hits
