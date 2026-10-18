"""Generate source evidence for the five contracts absent from companion export.

This is a reviewed, bounded disposition table, not a Rust parser or runtime test.
It never changes the normative catalog and never labels a capability qualified.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

OUT = Path(__file__).resolve().parent
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
COMMON = 'codex-rs/app-server-protocol/src/protocol/common.rs'
V1 = 'codex-rs/app-server-protocol/src/protocol/v1.rs'
PROCESSOR = 'codex-rs/app-server/src/message_processor.rs'
THREAD = 'codex-rs/app-server/src/request_processors/thread_processor.rs'
ACCOUNT = 'codex-rs/app-server/src/request_processors/account_processor.rs'
GIT = 'codex-rs/app-server/src/request_processors/git_processor.rs'
EVENTS = 'codex-rs/app-server/src/bespoke_event_handling.rs'
LIFECYCLE = 'codex-rs/app-server/src/request_processors/thread_lifecycle.rs'
V2_THREAD = 'codex-rs/app-server-protocol/src/protocol/v2/thread.rs'
V2_ITEM = 'codex-rs/app-server-protocol/src/protocol/v2/item.rs'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def anchor(path, marker, following=18, preceding=2):
    lines = (UP/path).read_text().splitlines()
    hits = [i for i, line in enumerate(lines) if marker in line]
    assert len(hits) == 1, (path, marker, hits)
    i = hits[0]
    start, end = max(0, i-preceding), min(len(lines), i+following+1)
    return {'path': path, 'sha256': sha(UP/path), 'anchor': marker,
            'line': i+1, 'excerpt_start': start+1,
            'excerpt': '\n'.join(lines[start:end]),
            'url': f'https://github.com/openai/codex/blob/{PIN}/{path}#L{i+1}'}

def fields(names):
    return [{'wire_field': name, 'source_type': kind,
             'coverage': 'REVIEWED_TOP_LEVEL; transitive types remain scope obligations'}
            for name, kind in names]

assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip() == PIN
assert not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip()
rows = []

rows.append({
    'method': 'getConversationSummary', 'envelope': 'ClientRequest',
    'disposition': 'DEPRECATED_BUT_DISPATCHED_IN_PIN; retain mandatory capability',
    'sources': [anchor(COMMON, 'GetConversationSummary =>'),
                anchor(V1, 'pub enum GetConversationSummaryParams', 38),
                anchor(V1, 'pub struct ConversationGitInfo', 6),
                anchor(PROCESSOR, 'ClientRequest::GetConversationSummary', 3),
                anchor(THREAD, 'pub(crate) async fn conversation_summary(', 9),
                anchor(THREAD, 'async fn get_thread_summary_response_inner(', 45),
                anchor(THREAD, 'fn conversation_summary_thread_id_read_error(', 57)],
    'parameters': {'encoding': 'serde untagged union; declaration order rolloutPath then conversationId',
                   'alternatives': [{'rolloutPath': 'PathBuf'}, {'conversationId': 'ThreadId'}]},
    'response': fields([('summary', 'ConversationSummary')]),
    'nested_response': {'ConversationSummary': fields([
        ('conversationId','ThreadId'), ('path','PathBuf'), ('preview','String'),
        ('timestamp','Option<String>'), ('updatedAt','Option<String>'),
        ('modelProvider','String'), ('cwd','PathBuf'), ('cliVersion','String'),
        ('source','SessionSource'), ('gitInfo','Option<ConversationGitInfo>')]),
        'ConversationGitInfo': fields([('sha','Option<String>'), ('branch','Option<String>'),
                                      ('origin_url','Option<String>')])},
    'observed_source_semantics': [
        'Thread ID reads include archived threads and exclude history.',
        'Rollout path variant explicitly rejects non-local stores.',
        'Not found/invalid/unsupported/internal errors have distinct source mappings.'],
    'required_future_cases': ['each untagged alternative', 'both alternatives present and declaration order',
        'missing/invalid ID', 'local and non-local store', 'archived thread',
        'missing rollout', 'unsupported operation', 'cross-tenant/path denial',
        'SessionSource transitive variants', 'null/omitted optional fields'],
})
rows.append({
    'method': 'gitDiffToRemote', 'envelope': 'ClientRequest',
    'disposition': 'DEPRECATED_BUT_DISPATCHED_IN_PIN; retain mandatory capability',
    'sources': [anchor(COMMON, 'GitDiffToRemote =>'),
                anchor(V1, 'pub struct GitDiffToRemoteParams', 3),
                anchor(V1, 'pub struct GitDiffToRemoteResponse', 4),
                anchor(PROCESSOR, 'ClientRequest::GitDiffToRemote', 3),
                anchor(GIT, 'pub(crate) async fn git_diff_to_remote(', 24)],
    'parameters': fields([('cwd','PathBuf')]),
    'response': fields([('sha','GitSha'), ('diff','String')]),
    'observed_source_semantics': ['Delegates to git_diff_to_remote; None becomes invalid_request.',
        'This evidence does not resolve the delegated helper or execute Git/network.'],
    'required_future_cases': ['valid repository', 'no remote/base', 'empty diff', 'large diff',
        'non-repository cwd', 'untrusted cwd', 'delegated helper reachability and side effects'],
})
rows.append({
    'method': 'getAuthStatus', 'envelope': 'ClientRequest',
    'disposition': 'DEPRECATED_IN_FAVOR_OF_ACCOUNT_READ_BUT_DISPATCHED_IN_PIN',
    'sources': [anchor(COMMON, 'GetAuthStatus =>'),
                anchor(V1, 'pub struct GetAuthStatusParams', 4),
                anchor(V1, 'pub struct GetAuthStatusResponse', 5),
                anchor(PROCESSOR, 'ClientRequest::GetAuthStatus', 3),
                anchor(ACCOUNT, 'pub(crate) async fn get_auth_status(', 8),
                anchor(ACCOUNT, 'async fn get_auth_status_response(', 75),
                anchor(COMMON, 'pub enum AuthMode', 48)],
    'parameters': fields([('includeToken','Option<bool>'), ('refreshToken','Option<bool>')]),
    'response': fields([('authMethod','Option<AuthMode>'), ('authToken','Option<String>'),
                        ('requiresOpenaiAuth','Option<bool>')]),
    'observed_source_semantics': ['Missing includeToken/refreshToken become false.',
        'Refresh is requested before selecting response branch; may involve external auth.',
        'Provider not requiring OpenAI auth returns no method/token and false.',
        'Host-owned/metadata credentials, workload identity and failed permanent refresh protect tokens.'],
    'required_future_cases': ['all bool presence/null/value combinations', 'no auth required',
        'no identity', 'each AuthMode', 'refresh success/transient/permanent failure',
        'token inclusion vs host credential protection', 'CVG token-export governance decision'],
})
for method, variant, type_name, type_path, marker, following in [
    ('rawResponseItem/completed', 'RawResponseItemCompleted',
     'RawResponseItemCompletedNotification', V2_ITEM, 'EventMsg::RawResponseItem(mut', 15),
    ('rawResponse/completed', 'RawResponseCompleted',
     'RawResponseCompletedNotification', V2_THREAD, 'EventMsg::RawResponseCompleted(raw', 12),
]:
    schema_path = 'codex-rs/app-server-protocol/schema/json/v2/' + type_name + '.json'
    destination = OUT/'reference'/('pinned-'+type_name+'.json')
    shutil.copyfile(UP/schema_path, destination)
    rows.append({
        'method': method, 'envelope': 'ServerNotification',
        'disposition': 'INTERNAL_EXPERIMENTAL_OPT_IN_EMISSION_IN_PIN; mandatory until explicit scope decision',
        'sources': [anchor(COMMON, variant+' =>', 1),
                    anchor(type_path, 'pub struct '+type_name, 7),
                    anchor(V2_THREAD, 'pub experimental_raw_events: bool', 1, 5),
                    anchor(LIFECYCLE, ') && !raw_events_enabled', 4, 4),
                    anchor(EVENTS, marker, following)],
        'pinned_schema': {'path': schema_path, 'sha256': sha(UP/schema_path),
                          'snapshot': str(destination.relative_to(OUT)),
                          'authority': 'CHECKED_IN_PINNED_SOURCE_SCHEMA; not companion runtime attestation'},
        'observed_source_semantics': [
            'Both event kinds are skipped when thread experimental_raw_events is false.',
            'RawResponseItem removes executed-tool warehouse metadata before notification.',
            'OmitAppServerNotificationMedia can transform the item payload.',
            'RawResponseCompleted preserves optional token usage and usage metadata.'],
        'required_future_cases': ['opt-in default false', 'enabled subscription delivery',
            'internal experimental handshake gating', 'subscriber isolation',
            'item sanitization and media omission', 'usage null/metadata variants',
            'restart/subscription state and event ordering'],
    })
for row in rows:
    row['requirement'] = 'CDX100-RPC-'+row['envelope']+'-'+row['method'].replace('/','.')
    row['qualification'] = 'NOT_RUN'
    row['companion_schema_presence'] = False
    row['source_disposition_resolved'] = True
    row['variant_closure'] = 'OPEN; reviewed top-level contracts do not close transitive/runtime cases'
inventory = json.loads((OUT/'protocol-source-inventory.json').read_text())['entries']
assert {r['requirement'] for r in rows} == {r['requirement'] for r in inventory if not r['companion_schema_presence']}
result = {'commit': PIN, 'kind': 'BOUNDED_SOURCE_DISPOSITION; zero functional qualification',
          'contracts': rows, 'resolved_dispositions': 5,
          'remaining': 'Legacy nested types, delegated helpers, runtime identity and all functional cases remain open.'}
(OUT/'source-only-dispositions.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'source_dispositions': len(rows), 'functional_receipts': 0}))
