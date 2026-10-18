"""Curated owner groups; source/cargo evidence is bound by generate.py."""
from pathlib import Path
import json
import re
import subprocess
import tomllib

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
GROUPS = {
    'K01': 'core core-api async-utils utils-cache utils-path-uri utils-path utils-absolute-path utils-readiness utils-redacted-string utils-string utils-sleep-inhibitor utils-template',
    'O01': 'agent-graph-store agent-identity agent-roles agent-message-board-client agent-extension agent-message-board-extension',
    'S01': 'thread-store state history message-history rollout',
    'C01': 'context-fragments collaboration-mode-templates prompts',
    'C02': 'memories-read memories-write memories-extension history-notes-extension',
    'M01': 'api backend-client backend-openapi-models client chatgpt model-provider model-provider-info models-manager http-client websocket-client utils-rustls-provider utils-stream-parser',
    'M02': 'lmstudio ollama utils-oss responses-api-proxy',
    'N01': 'aws-auth login keyring-store secrets user-verification workload-identity websocket-auth',
    'T01': 'apply-patch file-search file-system file-watcher utils-output-truncation multi-env-copy-file web-search-extension',
    'X01': 'shell-command process-hardening utils-process utils-pty',
    'X02': 'bwrap linux-sandbox mxc-sandbox network-proxy sandboxing windows-sandbox windows-sandbox-service utils-sandbox-summary',
    'X03': 'execpolicy guardian-context guardian-reviewer guardian-v2 utils-approval-presets',
    'A01': 'app-server app-server-protocol protocol app-server-protocol-noop-macros experimental-api-macros',
    'A03': 'app-server-client app-server-transport uds stdio-to-uds',
    'D02': 'exec',
    'H01': 'config config-schema home features utils-cli utils-home-dir utils-json-to-toml',
    'H02': 'cli arg0 build-info install-context',
    'E01': 'core-plugin-common core-plugins plugin skills skills-extension utils-plugins',
    'E02': 'extension-api extension-items tools',
    'F01': 'hooks',
    'P01': 'mcp rmcp-client mcp-extension',
    'P02': 'connectors connectors-extension',
    'O02': 'goal-extension queue-extension',
    'W01': 'git-utils worktree utils-git-discovery git-attribution',
    'U01': 'tui ansi-escape terminal-detection utils-fuzzy-match',
    'R01': 'app-server-daemon',
    'R02': 'exec-server exec-server-protocol tcp-tunnel',
    'R03': 'cloud-client cloud-config cloud-tasks cloud-tasks-client cloud-tasks-mock-client',
    'I01': 'attachment-store image-generation-extension utils-image',
    'I02': 'realtime-webrtc voice-host utils-audio',
    'V01': 'analytics diagnostics feedback mermaid otel otel-trace-websocket response-debug-context rollout-trace utils-elapsed',
    'Z01': 'external-agent-migration',
    'T02': 'code-mode code-mode-host code-mode-protocol code-mode-runtime v8-poc',
}
ROLES = {
    'K01': 'CAPABILITY_OR_SHARED_RUNTIME', 'A01': 'PROTOCOL_OR_SERVER_CONTRACT',
    'A03': 'PROTOCOL_TRANSPORT', 'D02': 'HEADLESS_CAPABILITY', 'E02': 'EXTENSION_INTERFACE',
    'H01': 'CONFIGURATION_OR_GENERATOR', 'H02': 'CLI_OR_INSTALL_SUPPORT',
    'M01': 'PROVIDER_OR_TRANSPORT', 'M02': 'LOCAL_PROVIDER_OR_PROXY',
    'N01': 'IDENTITY_OR_SECURITY_SUPPORT', 'X01': 'PROCESS_RUNTIME_SUPPORT',
    'X02': 'NATIVE_CONTAINMENT_SUPPORT', 'X03': 'POLICY_OR_REVIEW_SUPPORT',
    'V01': 'OBSERVABILITY_OR_DIAGNOSTIC_SUPPORT', 'T02': 'CODE_EXECUTION_CAPABILITY_OR_SUPPORT',
    'U01': 'TUI_CAPABILITY_OR_SUPPORT',
}
files = subprocess.check_output(['git', '-C', str(UP), 'ls-tree', '-r', '--name-only', 'HEAD'], text=True).splitlines()
packages = {}
for path in files:
    if path.endswith('Cargo.toml'):
        data = tomllib.loads((UP / path).read_text())
        if 'package' in data:
            name = data['package']['name']
            assert name not in packages, name
            packages[name] = path
titles = dict(re.findall(r'^### (DX100-[A-Z]\d\d) — (.+)$',
                        (ROOT / 'docs/03_build/0386_backlog_paridade_codex.md').read_text(), re.M))
rows = {}
for owner, names in GROUPS.items():
    for short in names.split():
        name = 'codex-' + short
        assert name in packages and name not in rows, name
        rows[name] = {'primary_owner': 'DX100-' + owner,
                      'role': ROLES.get(owner, 'CAPABILITY_IMPLEMENTATION'),
                      'purpose': titles['DX100-' + owner],
                      'basis': 'Curated purpose/owner group, inspected against bound manifest, entry source, catalog references and consumer edges; not runtime qualification.'}
for name in ['app_test_support', 'core_test_support', 'codex-exec-server-test-support',
             'codex-protocol-test-support', 'codex-windows-sandbox-test-support',
             'codex-test-binary-support', 'codex-utils-cargo-bin']:
    assert name in packages
    rows[name] = {'primary_owner': 'DX100-Q04', 'role': 'TEST_SUPPORT_SOURCE',
                  'purpose': 'Repository test/binary support; preserve normal/dev/build consumer scopes rather than assuming all builds exclude it.',
                  'basis': 'Explicit support identity, source and declared consumers; no functional requirement is removed.'}
for name, owner, role, purpose in [
    ('codex-app-server-test-client', 'H02', 'DIAGNOSTIC_CLIENT', 'App-server diagnostic/test-client executable; callable modes retained.'),
    ('codex-thread-manager-sample', 'D01', 'SAMPLE_HOST_EXECUTABLE', 'Thread-manager sample host; executable/interface evidence retained.'),
    ('argument_comment_lint', 'Z02', 'DEVELOPMENT_LINTER_PLUGIN_AND_CLI', 'Standalone Dylint/rustc-private plugin and CLI outside codex-rs; explicit build/development role retained.'),
]:
    assert name in packages
    rows[name] = {'primary_owner': 'DX100-' + owner, 'role': role, 'purpose': purpose,
                  'basis': 'Manifest/entry-source purpose and consumer declarations; not an exclusion based on name or publish=false.'}
assert set(rows) == set(packages), sorted(set(packages) - set(rows))
for name, row in rows.items():
    row['manifest'] = packages[name]
value = {'kind': 'CURATED_COMPONENT_PURPOSE_OWNER_BINDINGS_NOT_RUNTIME_DISPOSITION',
         'package_count': len(rows), 'packages': dict(sorted(rows.items()))}
(OUT / 'classification.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'classified': len(rows), 'roles': len({r['role'] for r in rows.values()})}))
