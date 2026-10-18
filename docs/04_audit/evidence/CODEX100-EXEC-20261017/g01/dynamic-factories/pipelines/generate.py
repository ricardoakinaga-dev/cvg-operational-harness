"""Source evidence for tool factories, not Rust execution or CVG BUILD."""
from pathlib import Path
import ast
import copy
import hashlib
import json
import re
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
HELPER = OUT.parents[1] / 'entrypoints/tools/build_tool_graph.py'
CONTRACT = OUT.parent / 'contract.json'
PLAN = 'codex-rs/core/src/tools/spec_plan.rs'
REGISTRY = 'codex-rs/core/src/tools/registry.rs'
MCP_CACHE = 'codex-rs/core/src/mcp_tool_exposure.rs'
DYNAMIC = 'codex-rs/core/src/tools/handlers/dynamic.rs'
MCP = 'codex-rs/core/src/tools/handlers/mcp.rs'
EXTENSION = 'codex-rs/core/src/tools/handlers/extension_tools.rs'
HOSTED = 'codex-rs/core/src/tools/hosted_spec.rs'
PROTOCOL = 'codex-rs/protocol/src/dynamic_tools.rs'
RESPONSES = 'codex-rs/tools/src/responses_api.rs'
SCHEMA = 'codex-rs/tools/src/json_schema.rs'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def read(path):
    return json.loads(path.read_text())


nodes = [n for n in ast.parse(HELPER.read_text()).body
         if isinstance(n, ast.FunctionDef) and n.name in ['mask_rust', 'balanced']]
require(len(nodes) == 2, 'Reviewed lexer definitions missing')
env = {'re': re}
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<reviewed-local-lexer>', 'exec'), env)
mask_rust, balanced = env['mask_rust'], env['balanced']

# Full source modules preserve nested types, attributes, constants and helper bodies.
# Their presence does not classify every declaration as public or runtime-reachable.
MODULES = [PLAN, REGISTRY, MCP_CACHE, DYNAMIC, MCP, EXTENSION, HOSTED, PROTOCOL, RESPONSES, SCHEMA,
           'codex-rs/tools/src/json_schema/compaction.rs', 'codex-rs/tools/src/json_schema/traversal.rs',
           'codex-rs/tools/src/json_schema/types.rs', 'codex-rs/tools/src/dynamic_tool.rs',
           'codex-rs/tools/src/mcp_tool.rs', 'codex-rs/tools/src/tool_definition.rs',
           'codex-rs/tools/src/output_schema.rs', 'codex-rs/tools/src/tool_spec.rs',
           'codex-rs/tools/src/tool_executor.rs', 'codex-rs/tools/src/lib.rs',
           'codex-rs/codex-mcp/src/binding.rs', 'codex-rs/codex-mcp/src/tools.rs',
           'codex-rs/codex-mcp/src/connection_manager/tool_catalog.rs',
           'codex-rs/core/src/state/turn.rs']

FUNCTIONS = {
    PLAN: ['build_tool_router', 'code_mode_only_strict_3p_tools', 'apply_mcp_tool_exposure_policy',
           'extension_tool_executors', 'append_extension_tool_executors', 'append_dynamic_tool_runtimes',
           'finalize_tool_router', 'build_model_visible_specs', 'spec_for_model_request',
           'hosted_model_tool_specs', 'apply_direct_model_only_namespace_overrides',
           'tool_exposure_with_namespace_override', 'enforce_strict_3p_tools',
           'standalone_web_search_enabled', 'image_generation_available',
           'is_directly_visible', 'code_mode_tools', 'is_excluded_from_code_mode'],
    REGISTRY: ['prepare_tool', 'register_external', 'register_external_with_exposure', 'register_trusted_with_exposure'],
    MCP_CACHE: [('append_mcp_tools', 0), ('append_mcp_tools', 1),
                'filter_non_codex_apps_mcp_tools_only', 'filter_codex_apps_mcp_tools'],
    DYNAMIC: ['new', 'new_in_namespace', 'from_parts', 'handle_call', 'request_dynamic_tool'],
    MCP: ['new', 'new_with_schema_max_bytes', 'new_agent_plugin', 'with_agent_plugin',
          'create_tool_spec', 'effective_namespace_description', 'handle_call'],
    EXTENSION: ['new', 'to_extension_call'],
    HOSTED: ['create_web_search_tool'],
    PROTOCOL: ['normalize_dynamic_tool_specs', 'group_dynamic_tools_by_namespace', 'deserialize_dynamic_tool_specs'],
    RESPONSES: ['dynamic_tool_to_responses_api_tool', 'mcp_tool_to_responses_api_tool',
                'agent_plugin_mcp_tool_to_responses_api_tool', 'tool_definition_to_responses_api_tool'],
    SCHEMA: ['parse_tool_input_schema', 'parse_tool_input_schema_with_max_bytes',
             'parse_tool_input_schema_without_compaction', 'prepare_tool_input_schema',
             'deserialize_tool_input_schema', 'sanitize_json_schema', 'prune_unreachable_definitions'],
    'codex-rs/tools/src/mcp_tool.rs': ['parse_mcp_tool', 'parse_agent_plugin_mcp_tool',
                                    'parse_mcp_tool_with_description_limit', 'mcp_call_tool_result_output_schema'],
    'codex-rs/tools/src/dynamic_tool.rs': ['parse_dynamic_tool'],
    'codex-rs/core/src/mcp_tool_call.rs': ['handle_mcp_tool_call'],
    'codex-rs/core/src/session/mcp_runtime.rs': ['prepare_mcp_call'],
    'codex-rs/codex-mcp/src/runtime.rs': ['prepare_call'],
    'codex-rs/codex-mcp/src/connection_manager/tool_catalog.rs': ['tool_is_model_visible', 'prepare_call_for_tool'],
    'codex-rs/core/src/session/mod.rs': ['notify_dynamic_tool_response'],
    'codex-rs/core/src/state/turn.rs': ['insert_pending_dynamic_tool', 'remove_pending_dynamic_tool', 'clear_pending_waiters'],
}


def build():
    cache = {}; sources = {}

    def load(path):
        if path not in cache:
            data = (UP / path).read_bytes(); text = data.decode()
            sources[path] = {'path': path, 'sha256': sha(data), 'bytes': len(data)}
            cache[path] = (text, mask_rust(text))
        return cache[path]

    def ref(path, start, end):
        text, _ = load(path); data = text[start:end].encode()
        return {'path': path, 'file_sha256': sources[path]['sha256'],
                'start_byte': len(text[:start].encode()), 'end_byte_exclusive': len(text[:end].encode()),
                'start_line': text[:start].count('\n') + 1,
                'end_line': text[:end].count('\n') + (not text[:end].endswith('\n')),
                'sha256': sha(data), 'text': data.decode()}

    def functions(path):
        text, mask = load(path); found = []
        for match in re.finditer(r'\b(?:async\s+)?fn\s+(\w+)\s*(?:<[^{};]*?>)?\s*\(', mask):
            args_end = balanced(mask, match.end() - 1, '(', ')')
            brace = mask.find('{', args_end); semi = mask.find(';', args_end)
            if brace < 0 or (semi >= 0 and semi < brace):
                continue
            end = balanced(mask, brace, '{', '}')
            found.append({'name': match[1], 'start': match.start(), 'end': end})
        return found

    bodies = {}
    for path, names in FUNCTIONS.items():
        found = functions(path)
        for spec in names:
            name, occurrence = spec if isinstance(spec, tuple) else (spec, None)
            hits = [r for r in found if r['name'] == name]
            require(len(hits) == 1 if occurrence is None else len(hits) > occurrence,
                    'Ambiguous/missing function: ' + path + '::' + name)
            chosen = hits[0 if occurrence is None else occurrence]
            key = path + '::' + name + ('' if occurrence is None else '#' + str(occurrence))
            bodies[key] = {'name': name, 'occurrence': occurrence,
                           'source': ref(path, chosen['start'], chosen['end']),
                           'scope': 'selected source body; ancestors/attributes retained in full source module when included'}
    modules = {path: {'scope': 'FULL_SOURCE_MODULE_WITH_TEST_MARKERS_NOT_RUNTIME_CLASSIFICATION',
                      'source': ref(path, 0, len(load(path)[0]))} for path in MODULES}

    def key(path, name):
        value = path + '::' + name
        require(value in bodies, 'Missing semantic anchor: ' + value)
        return value

    activations = []
    for path, owner in [('codex-rs/protocol/src/protocol.rs', 'SessionMeta'),
                        ('codex-rs/app-server-protocol/src/protocol/v2/thread.rs', 'ThreadStartParams')]:
        text, mask = load(path); start = text.index('pub struct ' + owner + ' {')
        brace = mask.index('{', start); end = balanced(mask, brace, '{', '}')
        declaration = ref(path, start, end)
        require('deserialize_dynamic_tool_specs' in declaration['text'] and
                'pub dynamic_tools: Option<Vec<DynamicToolSpec>>' in declaration['text'], 'Dynamic decoder not activated')
        activations.append({'owner': owner, 'field': 'dynamic_tools', 'source': declaration,
                            'status': 'SOURCE_SERDE_HELPER_BINDING_NOT_ACCEPTED_INPUT_EXECUTION'})

    rules = []

    def rule(identifier, path, name, patterns, observation):
        anchor = key(path, name); text = bodies[anchor]['source']['text']
        require(all(p in text for p in patterns), 'Source rule changed: ' + identifier)
        rules.append({'id': identifier, 'source_body': anchor, 'required_source_expressions': patterns,
                      'observation': observation, 'qualification': 'NOT_RUN'})

    rule('registry-external-policy-reserved-collision', REGISTRY, 'register_external_with_exposure',
         ['tool_policy.allows', '"exec_command" | "shell_command"', 'Entry::Occupied', 'false'],
         'External registration consults ToolPolicy, rejects reserved default names and keeps first on collision; no CVG authorization inferred.')
    rule('dynamic-deferred-marker', DYNAMIC, 'from_parts',
         ['output_tool.defer_loading = None', 'if tool.defer_loading', 'ToolExposure::Deferred', 'ToolExposure::Direct'],
         'Model schema marker is cleared while runtime exposure records defer_loading.')
    rule('dynamic-legacy-mixed-rejection', PROTOCOL, 'normalize_dynamic_tool_specs',
         ['has_legacy_format && has_canonical_format', 'exposeToContext', 'unwrap_or(false)'],
         'Canonical/legacy mixing errors; explicit defer_loading wins, otherwise inverse expose_to_context, otherwise false.')
    rule('dynamic-request-cancel-and-pending', DYNAMIC, 'request_dynamic_tool',
         ['is_cancelled()', 'insert_pending_dynamic_tool', 'or_cancel', 'DynamicToolCallStatus::Failed'],
         'Pending response registration is atomic with active turn; cancellation/error paths retain failed terminal source.')
    rule('dynamic-response-removal', 'codex-rs/core/src/session/mod.rs', 'notify_dynamic_tool_response',
         ['remove_pending_dynamic_tool', 'tx_response.send', 'No pending dynamic tool call'],
         'Response removes pending sender before sending; absent IDs warn. Cancellation alone does not prove immediate map removal; a late response can find a closed sender.')
    rule('mcp-app-policy-filter', MCP_CACHE, 'filter_codex_apps_mcp_tools',
         ['connector_id', 'tool_is_model_visible', 'destructive_hint', 'open_world_hint', '.enabled'],
         'Apps need model visibility, connector identity and app policy eligibility; regular MCP uses separate filter.')
    rule('mcp-live-call-snapshot', 'codex-rs/codex-mcp/src/connection_manager/tool_catalog.rs', 'prepare_call_for_tool',
         ['tool_filter.allows', 'connector_id == advertised_tool.connector_id', 'tool_is_model_visible', '.callable_namespace', '.callable_name'],
         'Rebind to live catalog/config/client while retaining advertised callable identity; immutable handlers are not authorization snapshots.')
    rule('mcp-namespace-schema', MCP, 'create_tool_spec',
         ['agent_plugin_mcp_tool_to_responses_api_tool', 'mcp_tool_to_responses_api_tool', 'callable_namespace'],
         'MCP model spec is namespaced with plugin/regular schema paths and bounded description.')
    rule('mcp-missing-properties-projection', 'codex-rs/tools/src/mcp_tool.rs', 'parse_mcp_tool_with_description_limit',
         ['obj.get("properties").is_none_or', 'output_schema: Some', 'defer_loading: false'],
         'Missing/null properties becomes object; source retains output schema separately from model serialization.')
    rule('schema-projection-permissive-boolean', SCHEMA, 'sanitize_json_schema',
         ['JsonValue::Bool(_)', 'json!({ "type": "string" })', 'map.remove("const")'],
         'Tool model projection rewrites boolean schemas and const; this is not an execution validator or grant.')
    rule('plugin-schema-fallback', RESPONSES, 'agent_plugin_mcp_tool_to_responses_api_tool',
         ['MAX_SERIALIZED_MCP_TOOL_BYTES', 'JsonSchema::object', 'Some(true.into())'],
         'Oversized serialized plugin spec can use permissive object parameters before later model budget filtering.')
    rule('hosted-standalone-precedence', PLAN, 'hosted_model_tool_specs',
         ['use_responses_lite', 'ToolName::namespaced("web", "run")', 'provider.capabilities().web_search'],
         'ResponsesLite omits hosted specs; eligible standalone web prevents duplicate hosted web spec.')
    rule('hosted-mode-variants', HOSTED, 'create_web_search_tool',
         ['WebSearchMode::Cached', 'WebSearchMode::Indexed', 'WebSearchMode::Live', 'WebSearchMode::Disabled', 'search_content_types'],
         'Cached, Indexed, Live and Disabled/None map to distinct source fields, with text/image modality.')
    rule('strict-thirdparty-hidden-preserved', PLAN, 'enforce_strict_3p_tools',
         ['ToolExposure::Hidden', 'ToolExposure::Deferred', 'is_third_party_tool'],
         'Strict code-only-thirdparty logic runs after namespace overrides; hidden ineligible/budget entries remain hidden.')
    rule('extension-web-image-eligibility', PLAN, 'append_extension_tool_executors',
         ['standalone_web_search_enabled', 'WebSearchMode::Disabled', 'image_generation_available', 'registry.register_external'],
         'Contributor presence does not bypass web/image eligibility or registry policy/collision checks.')
    rule('mcp-cache-metadata-and-budget', MCP_CACHE, 'append_mcp_tools#1',
         ['handlers.retain', 'cached.handler.tool_info() == tool', 'schema_max_bytes == tool_input_schema_max_bytes',
          'MAX_AGENT_PLUGIN_MCP_TOTAL_BYTES', 'ToolExposure::Hidden', 'register_external_with_exposure'],
         'Metadata cache invalidation and plugin model budget happen before external registry policy result; hidden budget failures may still have a registered runtime.')
    rule('schema-null-root-error', SCHEMA, 'deserialize_tool_input_schema',
         ['JsonSchemaPrimitiveType::Null', 'singleton_null_schema_error'],
         'A singleton-null projected root is explicitly rejected; boolean rewrite is a different source branch.')
    rule('schema-normalization-before-compaction', SCHEMA, 'parse_tool_input_schema_with_max_bytes',
         ['prepare_tool_input_schema', 'compact_large_tool_schema', 'deserialize_tool_input_schema'],
         'Sanitization and unreachable-definition pruning precede compaction and deserialization; underlying helpers remain source, not executed behavior.')

    case_examples = {
        'registry-external-policy-reserved-collision': ['policy denied', 'reserved default exec/shell name', 'duplicate existing name', 'same name in nondefault namespace'],
        'dynamic-deferred-marker': ['defer_loading false/true', 'Function versus Namespace', 'blank namespace description fallback'],
        'dynamic-legacy-mixed-rejection': ['canonical-only', 'legacy-only', 'canonical/legacy mixture', 'legacy fields nested in canonical namespace', 'explicit defer overrides exposeToContext', 'missing both defaults false'],
        'dynamic-request-cancel-and-pending': ['cancel before lock', 'cancel after lock before insertion', 'cancel while awaiting response', 'no active turn', 'duplicate call_id overwrites sender'],
        'dynamic-response-removal': ['matching pending ID', 'missing ID/no active turn', 'late response with closed sender after cancellation'],
        'mcp-app-policy-filter': ['apps disabled', 'connector missing', 'model hidden', 'app disabled', 'destructive/open-world annotation policy'],
        'mcp-live-call-snapshot': ['tool removed or filter revoked', 'connector identity differs', 'live metadata updated', 'advertised callable identity retained'],
        'mcp-namespace-schema': ['plugin/regular schema construction', 'namespace description fallback/truncation', 'invalid schema construction'],
        'mcp-missing-properties-projection': ['properties absent', 'properties null', 'properties present', 'output schema absent/present'],
        'schema-projection-permissive-boolean': ['boolean true/false', 'const becomes enum', 'unrecognized schema hints', 'local refs/compositions/nullable child defaults'],
        'plugin-schema-fallback': ['serialized spec below/at/above 8000bytes', 'UTF8 descriptions', 'permissive object replacement followed by model budget checks'],
        'hosted-standalone-precedence': ['ResponsesLite', 'standalone web registered/absent', 'provider web capability denied', 'standalone eligibility false'],
        'hosted-mode-variants': ['Cached', 'Indexed', 'Live', 'Disabled/None', 'Text versus TextAndImage', 'filters/location/context present/absent'],
        'strict-thirdparty-hidden-preserved': ['strict feature off', 'hidden thirdparty remains hidden', 'eligible thirdparty deferred', 'nonthirdparty unchanged'],
        'extension-web-image-eligibility': ['web disabled by mode', 'web feature/model gate', 'image generation unavailable', 'external name collision/policy denied'],
        'mcp-cache-metadata-and-budget': ['metadata/config budget changes invalidate handler', 'regular-before-app order', 'single/aggregate plugin budget boundaries', 'budget charge precedes registry denial/collision', 'hidden runtime registration versus eligible returned set'],
        'schema-null-root-error': ['singleton null root', 'nullable union root', 'malformed projected shape'],
        'schema-normalization-before-compaction': ['reachable/unreachable definitions', 'normal/default versus supplied byte limit', 'description/definition/depth compaction', 'trusted no-compaction path'],
    }
    require(set(case_examples) == {r['id'] for r in rules}, 'Future cases not joined to source rule')

    stages = [('mcp-cache', '.append_mcp_tools('), ('mcp-exposure', 'apply_mcp_tool_exposure_policy('),
              ('extensions', 'append_extension_tool_executors('), ('dynamic', 'append_dynamic_tool_runtimes('),
              ('hosted', 'hosted_model_tool_specs('), ('finalize', 'finalize_tool_router(')]
    route = bodies[key(PLAN, 'build_tool_router')]['source']['text']
    offsets = [route.index(marker) for _, marker in stages]
    require(offsets == sorted(offsets), 'Router stage ordering changed')
    stage_rows = [{'stage': stage, 'source_expression': marker, 'offset_in_router_body': offset}
                  for (stage, marker), offset in zip(stages, offsets)]
    budgets = []
    for path, name in [(MCP_CACHE, 'MAX_AGENT_PLUGIN_MCP_SPEC_BYTES'), (MCP_CACHE, 'MAX_AGENT_PLUGIN_MCP_TOTAL_BYTES'),
                       (RESPONSES, 'MAX_SERIALIZED_MCP_TOOL_BYTES'),
                       ('codex-rs/tools/src/json_schema/compaction.rs', 'DEFAULT_COMPACT_TOOL_SCHEMA_BYTES')]:
        text, _ = load(path); match = re.search(r'\bconst\s+' + name + r'\s*:\s*usize\s*=\s*([\d_]+);', text)
        require(match is not None, 'Budget constant missing: ' + name)
        budgets.append({'name': name, 'value': int(match[1].replace('_', '')), 'source': ref(path, match.start(), match.end())})
    exposures = re.findall(r'\((false|true), (false|true), (false|true)\) => ToolExposure::(\w+)',
                           bodies[key(PLAN, 'apply_mcp_tool_exposure_policy')]['source']['text'])
    require(len(exposures) == 6, 'Exposure source matrix changed')
    return {'kind': 'T1_FACTORY_SOURCE_GRAPH_NOT_RUNTIME_CONFORMANCE', 'pin': PIN,
            'contract_sha256': sha(CONTRACT.read_bytes()),
            'reader_helper': {'path': str(HELPER.relative_to(ROOT)), 'sha256': sha(HELPER.read_bytes())},
            'sources': sorted(sources.values(), key=lambda r: r['path']), 'source_modules': modules,
            'source_bodies': bodies, 'decoder_activations': activations,
            'router_stages': stage_rows, 'source_rules': rules, 'budget_constants': budgets,
            'mcp_exposure_source_variants': [{'direct': d == 'true', 'deferred': f == 'true', 'code': c == 'true', 'variant': v}
                                           for d, f, c, v in exposures],
            'factory_families': ['EXTENSION_EXECUTOR', 'MCP_EXTERNAL', 'DYNAMIC_CLIENT_RESPONSE', 'PROVIDER_HOSTED'],
            'future_case_obligations': [{'rule': r['id'], 'cases': case_examples[r['id']],
                                        'qualification': 'NOT_RUN', 'exhaustive_runtime_matrix': False} for r in rules],
            'limitations': ['Full source module text preserves test/cfg markers; no Rust compiler/type resolution, macro expansion or runtime reachability claim.',
                            'Schema normalization/compaction is retained as source, not executed, and is not CVG authorization or execution validation.',
                            'External rmcp/serde/transport semantics and downstream hook/provider/effect implementations remain bounded external/transitive obligations.',
                            'Contributor lane is independent; G01 component classification, scalar/cfg/platforms,20exec references,G02binding,G03reuse,G04gate remain open.'],
            'functional_receipts': 0, 'full_g01_closure': False}


require(subprocess.check_output(['git', '-C', str(UP), 'rev-parse', 'HEAD'], text=True).strip() == PIN, 'Wrong pin')
require(not subprocess.check_output(['git', '-C', str(UP), 'status', '--porcelain'], text=True).strip(), 'Source modified')
fresh = build(); require(fresh == build(), 'Generation not deterministic')
for row in fresh['sources']:
    require(sha(subprocess.check_output(['git', '-C', str(UP), 'show', PIN + ':' + row['path']])) == row['sha256'],
            'Source bytes differ from pinned Git object: ' + row['path'])


def validate(value):
    require(value == fresh, 'Evidence differs from exact source-backed generation')
    require(len(value['factory_families']) == 4 and len(value['router_stages']) == 6, 'Pipeline family/stage omitted')
    require(value['functional_receipts'] == 0 and not value['full_g01_closure'], 'False qualification')


negatives = []
for name, mutate in [
    ('omitted_factory_family', lambda v: v['factory_families'].pop()),
    ('reordered_router', lambda v: v['router_stages'].reverse()),
    ('removed_registry_policy', lambda v: v['source_rules'].pop(0)),
    ('wrong_schema_budget', lambda v: v['budget_constants'][0].update(value=8000000)),
    ('lost_exposure_variant', lambda v: v['mcp_exposure_source_variants'].pop()),
    ('lost_dynamic_legacy', lambda v: v['source_bodies'].pop(PROTOCOL + '::normalize_dynamic_tool_specs')),
    ('lost_dynamic_cancellation', lambda v: v['source_bodies'].pop(DYNAMIC + '::request_dynamic_tool')),
    ('lost_live_mcp_binding', lambda v: v['source_rules'].pop(6)),
    ('lost_schema_normalization', lambda v: v['source_bodies'].pop(SCHEMA + '::sanitize_json_schema')),
    ('lost_hosted_precedence', lambda v: v['source_bodies'].pop(PLAN + '::hosted_model_tool_specs')),
    ('foreign_body_binding', lambda v: v['source_bodies'][PLAN + '::append_dynamic_tool_runtimes'].update(
        source=v['source_bodies'][PLAN + '::append_extension_tool_executors']['source'])),
    ('hidden_transitive_limits', lambda v: v.update(limitations=[])),
    ('false_qualification', lambda v: v.update(functional_receipts=1)),
]:
    bad = copy.deepcopy(fresh); mutate(bad)
    try:
        validate(bad)
    except AssertionError:
        negatives.append({'name': name, 'result': 'REJECTED'})
    else:
        raise AssertionError('Known-bad inventory accepted: ' + name)

result = {'kind': 'T1_FACTORY_SOURCE_VERIFICATION_ONLY', 'result': 'PASS', 'source_git_objects': len(fresh['sources']),
          'source_modules': len(fresh['source_modules']), 'source_bodies': len(fresh['source_bodies']),
          'source_rules': len(fresh['source_rules']), 'factory_families': 4, 'router_stages': 6,
          'exposure_variants': 6, 'budget_constants': len(fresh['budget_constants']),
          'negative_controls': negatives, 'functional_receipts': 0, 'full_g01_closure': False}
if '--check' in sys.argv:
    require((OUT / 'inventory.json').read_bytes() == encode(fresh), 'Inventory regeneration differs')
    require(read(OUT / 'verification.json') == result, 'Verification changed')
    manifest = read(OUT / 'manifest.json')
    require({p.name for p in OUT.iterdir() if p.is_file() and p.name != 'manifest.json'} ==
            {r['path'] for r in manifest['files']}, 'Manifest file set differs')
    require(all(sha((OUT / r['path']).read_bytes()) == r['sha256'] for r in manifest['files']), 'Manifest bytes differ')
    require(manifest['contract_sha256'] == sha(CONTRACT.read_bytes()), 'Manifest contract differs')
else:
    (OUT / 'inventory.json').write_bytes(encode(fresh)); (OUT / 'verification.json').write_bytes(encode(result))
    manifest = {'kind': 'T1_SOURCE_PACKAGE_NOT_PARITY', 'pin': PIN, 'contract_sha256': sha(CONTRACT.read_bytes()),
                'files': [{'path': p.name, 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                          for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'manifest.json']}
    (OUT / 'manifest.json').write_bytes(encode(manifest))
print(json.dumps(result))
