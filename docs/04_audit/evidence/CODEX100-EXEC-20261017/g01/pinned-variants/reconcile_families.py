"""Bounded source dispositions for all repeated schema-difference families."""
from pathlib import Path
import collections
import hashlib
import json

OUT=Path(__file__).resolve().parent
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'

def anchor(path,marker,after=18,before=2,occurrence=None):
    p=UP/path;lines=p.read_text().splitlines()
    hits=[i for i,line in enumerate(lines) if marker in line]
    assert hits,(path,marker)
    if occurrence is None:assert len(hits)==1,(path,marker,hits)
    i=hits[0 if occurrence is None else occurrence]
    start=max(0,i-before);end=min(len(lines),i+after+1)
    return {'path':path,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
        'line':i+1,'anchor':marker,'occurrence':occurrence,
        'excerpt_start':start+1,'excerpt_lines':lines[start:end],
        'url':f'https://github.com/openai/codex/blob/{PIN}/{path}#L{i+1}'}

TURN='codex-rs/app-server-protocol/src/protocol/v2/turn.rs'
PROCESSOR='codex-rs/app-server/src/request_processors/turn_processor.rs'
families={
 'METADATA_PATCH':{
  'supporting_requirements':['CDX100-RPC-ClientRequest-turn.start','CDX100-RPC-ClientRequest-turn.steer'],
  'source_types':['TurnStartParams','TurnSteerParams','ResponsesApiClientMetadataUpdate'],
  'sources':[anchor(TURN,'pub responsesapi_client_metadata_patch:',4,12,0),
    anchor(TURN,'pub responsesapi_client_metadata_patch:',4,12,1),
    anchor('codex-rs/protocol/src/turn_input.rs','pub struct ResponsesApiClientMetadataUpdate',8,2),
    anchor('codex-rs/protocol/src/turn_input.rs','pub fn with_responses_metadata_patch(',8,2),
    anchor(PROCESSOR,'.with_responses_metadata_patch(params.responsesapi_client_metadata_patch)',3,4,0),
    anchor(PROCESSOR,'.with_responses_metadata_patch(params.responsesapi_client_metadata_patch)',3,4,1),
    anchor('codex-rs/core/src/turn_metadata.rs','pub(crate) fn update_responsesapi_client_metadata(',31,0),
    anchor('codex-rs/core/src/responses_metadata.rs','pub(crate) fn filter_extra_metadata(',10,0)],
  'source_disposition':['Both turn start and steer accept an optional string-map patch, experimental and nullable/omittable at the schema surface.',
    'Core filters reserved keys, applies optional replacement first and then extends with patch.',
    'An empty replacement clears ordinary entries; a patch preserves unrelated ordinary entries.',
    'A pre-existing targeted misalignment_override continuation is restored after replacement/patch.',
    'Separate config metadata validation limits are not assumed to apply to this incoming-turn path.'],
  'future_cases':['omitted/null/empty patch','replacement only/patch only/both with key collision',
    'empty replacement with patch','reserved session/thread/turn/window identity keys',
    'reviewed continuation override protection','wrong non-string values',
    'new turn vs active steer, expectedTurnId mismatch and restart metadata lifetime',
    'oversized maps/key/value handling requires route-specific oracle; do not infer config validation']},
 'VOICE_SESSION':{
  'supporting_requirements':['CDX100-RPC-ClientRequest-thread.realtime.start','CDX100-19-05'],
  'source_types':['ThreadRealtimeStartParams','ConversationStartParams'],
  'sources':[anchor('codex-rs/app-server-protocol/src/protocol/v2/realtime.rs','pub voice_session_id:',4,5),
    anchor(PROCESSOR,'voice_session_id: params.voice_session_id,',5,3),
    anchor('codex-rs/core/src/realtime_conversation.rs','let mut extra_headers = match transport',29,0),
    anchor('codex-rs/core/src/realtime_conversation.rs','if let Some(voice_session_id) = voice_session_id',7,6)],
  'source_disposition':['Optional voiceSessionId is distinct from realtimeSessionId and is forwarded to the core start parameters.',
    'Header builder attempts voice-session-id independently of x-session-id; invalid voice HeaderValue is omitted by the if-let chain.',
    'Header creation is used in websocket and WebRTC/existing-call branches; actual transport delivery remains unexecuted.'],
  'future_cases':['omitted/null/valid/empty voice ID','distinct realtime and voice IDs','CR/LF or other invalid header value omitted rather than assumed request failure',
    'websocket vs WebRTC/existing-call/version branches','resume/reconnect/header overwrite ordering with session headers']},
 'MCP_TOOL_META':{
  'supporting_requirements':['CDX100-RPC-ClientRequest-mcpServerStatus.list','CDX100-13-03'],
  'source_types':['McpServerStatus','ToolCatalogSnapshot'],
  'sources':[anchor('codex-rs/app-server-protocol/src/protocol/v2/mcp.rs','pub tool_list_meta:',7,4),
    anchor('codex-rs/codex-mcp/src/rmcp_client.rs','let first_page = params.as_ref().is_none_or',15,5),
    anchor('codex-rs/codex-mcp/src/client_tool_catalog.rs','CatalogSource::Local { tools, meta }',17,4),
    anchor('codex-rs/app-server/src/request_processors/mcp_processor.rs','tool_list_meta: tool_list_meta.remove(name)',6,5)],
  'source_disposition':['Opaque first-page MCP tool catalog _meta is retained separately from tools and exposed as toolListMeta by server.',
    'Local/cached and live catalog snapshots carry metadata; absence is represented by the optional JSON value.',
    'The public schema imposes no specific JSON object shape on toolListMeta. It does not grant tool authority.'],
  'future_cases':['first-page metadata with later-page differing metadata','no first-page metadata but later metadata',
    'empty/cached/live/failed catalog','object/list/string/number/bool/null metadata',
    'multi-server isolation and pagination/cursor limits','status/config-change invalidation and tools_error coexistence']},
 'IMAGE_RESULT_INPUTS':{
  'supporting_requirements':['CDX100-19-03'],
  'source_types':['ImageGenerationItem','GeneratedImageRef','ImageGenerationInputImage','ThreadItem'],
  'sources':[anchor('codex-rs/ext/items/src/image_generation.rs','pub struct ImageGenerationInputImage',42,4),
    anchor('codex-rs/ext/items/src/image_generation.rs','pub enum GeneratedImageRef',14,6),
    anchor('codex-rs/ext/image-generation/src/tool.rs','// The UI item retains its attachment-store reference',33,0),
    anchor('codex-rs/ext/image-generation/src/tool.rs','let sha256 = format!',21,12),
    anchor('codex-rs/app-server-protocol/src/protocol/v2/item.rs','ExtensionItem::ImageGeneration(item) =>',21,2),
    anchor('codex-rs/thread-store/src/local/rollout_migration/legacy_event.rs','EventMsg::ImageGenerationEnd(event) =>',19,0)],
  'source_disposition':['Public item flattens untagged GeneratedImageRef: File{fileId} is declared before Inline{result}.',
    'Pin schema uses anyOf; schema branch order does not establish Rust deserializer precedence. With both valid strings, Rust File-first preserves the attachment reference.',
    'inputImages defaults to empty Vec and is omitted when empty; entries contain path and sha256. Null Vec or malformed required fields are not the same as omission.',
    'Observed SHA256 derives from file bytes before normalization; public String type itself does not enforce hex/length.',
    'Public extension conversion and legacy migration preserve image representation and input observations. Older core item converts to Inline with empty observations.',
    'Upload/decode failure falls back to original inline result for UI item; model-facing projection keeps separate original data.',
    'Public image reference/input types do not themselves validate MIME/URL; later preparation/runtime stages must be distinguished.'],
  'future_cases':['inline only/file only/both valid strings including empty result','fileId null with valid result falls back to Inline',
    'neither branch valid','omitted/empty/null/malformed inputImages','path base guard and relative/absolute path cases',
    'pre-normalization bytes/hash identity','upload File/Inline/failure fallback','event/history/legacy migration/restart preserve representation',
    'unrestricted status string and empty-string references versus later resolver behavior','MIME/URL/size validation at the correct preparation boundary']}
}

comparison=json.loads((OUT.parent/'entrypoints/exports/comparison.json').read_text())
rows=[];counts=collections.Counter();files=collections.defaultdict(set)
for schema in comparison['schemas']:
    for i,diff in enumerate(schema.get('differences',[])):
        pointer=diff['pointer']
        family='IMAGE_RESULT_INPUTS' if any(v in pointer for v in ['ThreadItem','ImageGenerationInputImage']) else 'METADATA_PATCH' if 'responsesapiClientMetadata' in pointer else 'VOICE_SESSION' if 'voiceSessionId' in pointer else 'MCP_TOOL_META' if 'toolListMeta' in pointer else None
        assert family,('Unclassified source difference',schema['path'],pointer)
        rows.append({'schema':schema['path'],'comparison_record_index':i,'pointer':pointer,'kind':diff['kind'],'family':family,
            'source_sha256':schema['source_sha256'],'companion_sha256':schema['companion_sha256'],
            'disposition':'SOURCE_FAMILY_BOUND; companion behavior unknown','qualification':'NOT_RUN'})
        counts[family]+=1;files[family].add(schema['path'])
assert len(rows)==215 and len({r['schema'] for r in rows})==29
for name,family in families.items():
    family.update(difference_records=counts[name],schema_files=sorted(files[name]),qualification='NOT_RUN',
       claim='BOUNDED_SOURCE_RECONCILIATION; no executed behavior, executable identity, or full G01 closure')
result={'pin':PIN,'families':families,'differences':rows,'difference_record_count':215,'changed_schema_files':29,
    'counts_by_family':dict(counts),'functional_receipts':0,'full_g01_closure':False,
    'normalization_note':'Repeated embeddings are linked to their source family; descriptive/array-index changes are not counted as independent functional capabilities.'}
(OUT/'families.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'families':4,'changed_schemas':29,'difference_records':215,'counts':dict(counts),'functional_receipts':0}))
