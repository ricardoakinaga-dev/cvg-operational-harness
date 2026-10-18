#!/usr/bin/env python3
"""Offline, stdlib-only normalization of accepted JSON evidence; never imports it.

Default/--check are read-only, including bytecode. --write and --seal write only
inside this lane. No original readers, target files, subprocesses or network.
"""

import argparse
import collections
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

LANE = Path(__file__).resolve().parent
REPO = LANE.parents[6]
PROGRAM = LANE.parents[2]
G01 = PROGRAM / "g01"
PARENT = LANE.parent
CONTRACT_SHA = "4722152a3f4c8be37fb8edc0e3409cd298b58bd5f5eb7f5937b0ea66986ecab2"
PROJECTIONS_SHA = "30a2cfe26a224fcbfba5a36e1ef2d24f18d695217c8453f062f4663cff1f0641"
CHECKPOINT_SHA = "596e825451d439ecdf8b47d893384a40c83c84e522a147cf90f2980b7634511e"
SCHEMA = "cvg.codex100.source-projections.v1"
TASK = "DX100-G01:VARIANT-SOURCE-PROJECTIONS"
KINDS = {
    "contract": "SOURCE_CONTRACT",
    "public_variant": "PUBLIC_SURFACE_CANDIDATE_NOT_FUNCTION",
    "field": "DECLARED_FIELD_NOT_FUNCTION",
    "schema": "SYNTAX_OBLIGATION_NOT_BEHAVIOR",
    "response": "RESPONSE_OBLIGATION_NOT_RUN",
    "config": "CONFIGURATION_DECLARATION_NOT_EFFECTIVE_VALUE",
    "dynamic": "DYNAMIC_SOURCE_BOUND_RUNTIME_OPEN",
    "language": "LANGUAGE_SPECIFIC_DECLARATION_NOT_PARITY",
    "metadata": "SOURCE_METADATA_NOT_PUBLIC_FUNCTION",
    "support_census": "CONTEXT_NOT_FUNCTIONAL_VARIANT",
    "future_oracle": "FUTURE_OBLIGATION_NOT_EXECUTED_TEST",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return sha(canonical(value))


def load_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs, parse_constant=lambda value: require(False, "nonfinite JSON: " + value))


def escaped(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def pointer_join(pointer, key):
    return pointer + "/" + escaped(key)


def dereference(value, pointer):
    require(isinstance(pointer, str) and (pointer == "" or pointer.startswith("/")), "invalid pointer")
    for token in pointer.split("/")[1:]:
        require(re.search(r"~(?![01])", token) is None, "invalid pointer escaping")
        key = token.replace("~1", "/").replace("~0", "~")
        if isinstance(value, list):
            require(re.fullmatch(r"0|[1-9][0-9]*", key) is not None, "invalid array index")
            value = value[int(key)]
        else:
            require(isinstance(value, dict), "pointer through scalar")
            value = value[key]
    return value


def identity(path, pointer):
    return "src:" + sha((path + "\0" + (pointer if pointer is not None else "<bytes>")).encode())


def checked_path(relative):
    require(isinstance(relative, str), "path must be string")
    p = Path(relative)
    require(not p.is_absolute() and ".." not in p.parts and str(p) == relative, "noncanonical path: " + relative)
    result = REPO / p
    require(not any(part.is_symlink() for part in [result, *result.parents] if part != REPO.parent), "symlink input: " + relative)
    require(result.is_relative_to(REPO), "path outside repository")
    return result


def authenticate(data, expected, label):
    require(sha(data) == expected, "digest mismatch: " + label)


def manifest_entries(document, directory):
    entries = {}
    require(isinstance(document.get("files"), list), "manifest files must be array")
    for row in document["files"]:
        path = row["path"]
        if not path.startswith("docs/"):
            path = str(directory.relative_to(REPO) / path)
        checked_path(path)
        require(path not in entries, "duplicate manifest path: " + path)
        require(re.fullmatch("[a-f0-9]{64}", row["sha256"]) is not None, "invalid digest")
        require(type(row["bytes"]) is int and row["bytes"] >= 0, "invalid size")
        entries[path] = {"path": path, "sha256": row["sha256"], "bytes": row["bytes"]}
    return entries


def read_inputs():
    parent_raw = (PARENT / "contract.json").read_bytes()
    lane_raw = (PARENT / "projections-contract.json").read_bytes()
    checkpoint_raw = (PROGRAM / "checkpoint-tui-manifest.json").read_bytes()
    authenticate(parent_raw, CONTRACT_SHA, "parent contract")
    authenticate(lane_raw, PROJECTIONS_SHA, "lane contract")
    authenticate(checkpoint_raw, CHECKPOINT_SHA, "474-file checkpoint")
    contract = load_json(parent_raw)
    require(load_json(lane_raw)["parent_contract_sha256"] == CONTRACT_SHA, "lane parent binding")
    checkpoint = load_json(checkpoint_raw)
    protected = manifest_entries(checkpoint, PROGRAM)
    require(len(protected) == 474, "checkpoint file count")
    require(len(contract["source_packages"]) == 9, "nine manifests required")
    store, payloads, manifests = {}, {}, []
    for package in contract["source_packages"]:
        manifest = PROGRAM / package["manifest"]
        raw = manifest.read_bytes()
        authenticate(raw, package["sha256"], package["manifest"])
        key = str(manifest.relative_to(REPO))
        require(protected[key]["sha256"] == package["sha256"], "checkpoint manifest binding")
        document = load_json(raw)
        entries = manifest_entries(document, manifest.parent)
        require(len(entries) == package["files"], "package count: " + package["package"])
        actual = {str(p.relative_to(REPO)) for p in manifest.parent.rglob("*") if p.is_file() and p != manifest}
        require(actual == set(entries), "strict source manifest set: " + package["package"])
        manifests.append({**package, "manifest": key})
        for path, entry in sorted(entries.items()):
            require(path not in store, "overlapping source packages")
            require(entry == protected[path], "checkpoint file binding: " + path)
            content = checked_path(path).read_bytes()
            authenticate(content, entry["sha256"], path)
            require(len(content) == entry["bytes"], "input size: " + path)
            store[path] = {**entry, "source_package": package["package"], "media_type": "application/json" if path.endswith(".json") else "application/octet-stream"}
            if path.endswith(".json"):
                payloads[path] = load_json(content)
    require(len(store) == 386, "accepted sourcepacket count")
    input_manifest = {"schema_version": SCHEMA, "parent_contract_sha256": CONTRACT_SHA, "projections_contract_sha256": PROJECTIONS_SHA, "checkpoint_sha256": CHECKPOINT_SHA, "checkpoint_files": 474, "source_manifests": manifests, "files": [store[p] for p in sorted(store)], "file_count": len(store)}
    return contract, store, payloads, input_manifest


# Explicit field paths only. This is a JSON inventory selector, not a Rust reader.
# Every input also has a complete root record. Unexpanded tables remain lossless.
SELECT = {
    "pinned-variants/matrix.json": {
        "source_contracts": "contract", "request_responses": "response", "documents": "schema",
        "configuration/top_level_keys": "config", "json_nodes": "schema_pool", "syntax_variant_profiles": "schema_pool",
    },
    "pinned-variants/families.json": {"families": "schema", "differences": "schema"},
    "entrypoints/cli/graph.json": {"root_enum": "metadata_object", "types": "metadata", "variants": "public_variant", "fields": "field", "edges": "metadata", "dynamic_entries": "dynamic", "package_bindings": "support_census"},
    "entrypoints/exports/comparison.json": {"schemas": "metadata", "legacy_typescript_snapshots": "metadata", "policy_sources": "support_census"},
    "entrypoints/tools/tool-graph.json": {"registration_sites": "metadata", "handler_bindings": "metadata", "registry_policy_functions": "metadata", "dispatch_boundary_functions": "metadata", "exposure_and_factory_functions": "dynamic", "known_open_edges": "dynamic"},
    "exec-server/flows.json": {"operations": "contract", "generic_sources": "support_census", "error_constructors": "response"},
    "exec-server/type-links.json": {"operations": "metadata", "generic_envelope_types": "metadata", "unresolved_transitive_type_references": "metadata"},
    "exec-server/types/inventory.json": {"types": "metadata", "codec_contracts": "schema", "wire_domain_pairs": "schema", "unresolved_references": "metadata", "support": "support_census", "imports": "support_census"},
    "cli-adapters/schema/inventory.json": {"adapters": "public_variant", "windows_setup": "dynamic_object", "windows_setup/fields": "field", "future_cases": "future_oracle"},
    "cli-adapters/arg0/inventory.json": {"branches": "public_variant", "crate_bindings": "support_census", "constant_bindings": "metadata", "direct_entrypoints": "metadata", "argument_setup": "metadata", "normal_fallback": "metadata_object", "patch_argument_mode": "metadata_object", "basename_patch_mode": "metadata_object", "predispatch": "metadata_object"},
    "cli-adapters/integration.json": {"surfaces": "public_variant", "previous_manual_edges": "metadata"},
    "dynamic-factories/contributors/inventory.json": {"tools": "public_variant", "expanded_families": "dynamic", "other_production_contributors": "dynamic", "registry": "dynamic_object", "board": "dynamic_object", "skills": "dynamic_object", "shared_contracts": "schema", "census": "support_object"},
    "dynamic-factories/pipelines/inventory.json": {"factory_families": "dynamic", "mcp_exposure_source_variants": "public_variant", "future_case_obligations": "future_oracle", "source_rules": "metadata", "decoder_activations": "dynamic", "router_stages": "dynamic", "budget_constants": "config"},
    "dynamic-factories/integration.json": {"tool_links": "public_variant", "pipeline_links": "dynamic", "web_command_fields": "field"},
    "component-surfaces/rust/inventory.json": {"packages": "support_census", "virtual_manifests": "support_census", "workspace_manifests": "support_census", "target_candidates": "support_census", "local_dependency_edges": "support_census", "external_dependency_declarations": "support_census", "delegated_catalog_source_refs": "support_census"},
    "component-surfaces/rust/classification.json": {"packages": "support_census"},
    "component-surfaces/non-rust/inventory.json": {"manifests": "support_census", "manifest_census": "support_census", "typescript": "language", "python/root_public_api": "language", "python/definitions": "support_census", "python/modules": "support_census", "open_contracts": "language", "behavior_and_provenance": "language", "utilities": "support_census", "packaging": "support_object", "platforms": "support_object"},
    "component-surfaces/integration.json": {"mandatory_open_variants": "language", "delegated_source_bindings": "support_census"},
    "exec-transitive/internal/inventory.json": {"types": "metadata", "original_reference_bindings": "schema", "field_alias_reference_edges": "schema", "codec_private_type_links": "schema", "support": "support_census", "imports": "support_census"},
    "exec-transitive/internal/flow-links.json": {"operations": "metadata", "historical_reference_dispositions": "metadata"},
    "exec-transitive/external/inventory.json": {"crates": "schema", "limits": "metadata", "local_feature_declarations": "support_census", "local_sites": "support_object", "manifest_scan": "support_object", "lexical_index": "support_object"},
    "exec-transitive/integration.json": {"external_contracts": "contract", "operations": "contract", "historical_reference_resolutions": "schema", "historical_reference_dispositions": "metadata", "external_runtime_and_dependency_limits": "metadata"},
    "cli-parser-semantics/rules/inventory.json": {"fields": "field", "command_and_variant_metadata": "metadata", "explicit_parser_bindings": "schema", "typed_parser_declarations": "metadata", "parser_recipes": "schema", "source_functions": "support_census", "windows_fields": "field", "manual_adapters": "public_variant", "windows_grammar": "schema_object", "config_and_postparse_contracts": "config", "feature_registry_source_context": "support_object"},
    "cli-parser-semantics/scalars/inventory.json": {"fields": "field", "scalar_types": "metadata", "parent_container_ids": "metadata", "manual_windows": "metadata_object"},
    "cli-parser-semantics/integration.json": {"fields": "field", "future_oracle_obligations": "future_oracle", "manual_adapter_surfaces": "public_variant", "command_and_variant_metadata": "metadata", "windows_grammar": "schema_object", "manual_adapters": "metadata", "scalar_definition_ids": "metadata", "parser_recipe_ids": "metadata"},
    "tui-interactions/commands/inventory.json": {"variants": "public_variant", "description_arms": "metadata", "task_availability_arms": "metadata", "visibility_arms": "metadata", "bare_dispatch_arms": "metadata", "inline_dispatch_arms": "metadata", "builtin_flag_fields": "field", "lookup_alias_and_override_syntax": "schema_object", "dynamic_command_declarations": "dynamic", "dynamic_families": "dynamic", "handler_definition_candidates": "support_census"},
    "tui-interactions/events/inventory.json": {"enum/variants": "public_variant", "sources": "support_census", "references": "support_object", "imports": "support_object", "functions": "support_object", "attributes": "support_object", "consumers": "support_object", "type_mentions": "support_object"},
    "tui-interactions/views/inventory.json": {"entry_surface_bindings": "public_variant", "source_families": "metadata", "requirements": "contract", "keymap_actions": "metadata", "runtime_actions": "metadata", "action_joins": "metadata", "config_fields": "config", "declared_default_bindings": "config", "default_field_expressions": "config", "files": "support_census", "symbols": "support_object", "crosslane_references": "support_object", "unknowns": "dynamic", "mandatory_readonly_sdk_gaps": "language", "mandatory_readonly_external_runtime_limits": "metadata"},
    "tui-interactions/scope/inventory.json": {"files": "support_census", "root_target_candidates": "support_census", "module_edges": "support_object", "include_candidates": "support_object", "import_candidates": "support_object", "auxiliary_git_paths": "support_object"},
    "tui-interactions/integration.json": {"commands": "public_variant", "events": "public_variant", "view_requirements": "contract", "view_families": "metadata", "dynamic_command_families": "dynamic", "source_context": "support_census", "mandatory_sdk_gaps": "language", "mandatory_external_runtime_limits": "metadata", "mandatory_next_gates": "metadata"},
}


def selected_rows(payloads):
    for relative, fields in sorted(SELECT.items()):
        path = str((G01 / relative).relative_to(REPO))
        require(path in payloads, "selector input outside whitelist: " + path)
        for field, selection in fields.items():
            pointer = "/" + field
            value = dereference(payloads[path], pointer)
            aggregate = selection.endswith("_object") or selection == "schema_pool"
            kind = {"support_object": "support_census", "metadata_object": "metadata", "dynamic_object": "dynamic", "schema_object": "schema", "schema_pool": "schema"}.get(selection, selection)
            if aggregate:
                yield path, pointer, kind
            else:
                require(isinstance(value, (list, dict)), "selector must be collection: " + relative + pointer)
                for key in range(len(value)) if isinstance(value, list) else sorted(value):
                    row_pointer = pointer_join(pointer, key)
                    yield path, row_pointer, kind
                    if relative == "tui-interactions/integration.json":
                        row = dereference(payloads[path], row_pointer)
                        if field in ("commands", "events"):
                            require(isinstance(row["future_variant_family"], dict), "TUI future family object")
                            yield path, pointer_join(row_pointer, "future_variant_family"), "future_oracle"
                        if field == "view_families":
                            require(isinstance(row["future_variant_family_id"], str), "view future family identity")
                            yield path, pointer_join(row_pointer, "future_variant_family_id"), "future_oracle"
                    # Bounded direct field/enum support, never recursive private graph expansion.
                    if field == "types" and relative in ("exec-server/types/inventory.json", "exec-transitive/internal/inventory.json"):
                        row = dereference(payloads[path], row_pointer)
                        for child_key in ("fields", "variants"):
                            for i, child in enumerate(row.get(child_key, [])):
                                cp = pointer_join(pointer_join(row_pointer, child_key), i)
                                yield path, cp, "field" if child_key == "fields" else "metadata"
                                if child_key == "variants":
                                    for j in range(len(child.get("fields", []))):
                                        yield path, pointer_join(pointer_join(cp, "fields"), j), "field"


def bindings(value, pointer):
    normative, candidates, owners = [], [], []
    if not isinstance(value, dict):
        return normative, candidates, owners

    def visit(row, at, role="ENTRY_OR_DECLARATION", candidate=False):
        if not isinstance(row, dict):
            return
        relationship = row.get("requirement_relationship", row.get("mapping_status", row.get("disposition")))
        if isinstance(relationship, str) and relationship.startswith(("PROPOSED_", "CANDIDATE_")):
            candidate = True
            if role != "EFFECT_CANDIDATE":
                role = "SOURCE_PROPOSED_SUPPORTING_CANDIDATE"
        owner = row.get("owner", row.get("surface_owner"))
        if isinstance(owner, str) and re.fullmatch(r"DX100-[A-Z][0-9]{2}", owner):
            owners.append({"owner": owner, "role": role, "provenance_pointer": at, "candidate": candidate})
        else:
            owner = None
        ids = []
        for key in ("requirement", "requirement_id", "id"):
            item = row.get(key)
            if isinstance(item, str) and item.startswith("CDX100-"):
                ids.append((item, pointer_join(at, key)))
        for key in ("existing_requirements", "existing_owner_requirements"):
            for index, item in enumerate(row.get(key, [])):
                if isinstance(item, str) and item.startswith("CDX100-"):
                    ids.append((item, pointer_join(pointer_join(at, key), index)))
        for item, source in ids:
            (candidates if candidate else normative).append({"requirement_id": item, "owner": owner, "role": role, "provenance_pointer": source, "source_relationship": relationship, "semantic_owner_status": "OPEN_NOT_QUALIFIED"})

    visit(value, pointer)
    for key in ("binding", "baseline_record", "entry_requirement", "future_variant_family"):
        visit(value.get(key), pointer_join(pointer, key), "SURFACE_ENTRY" if key in ("entry_requirement", "future_variant_family") else "ENTRY_OR_DECLARATION")
    for key in ("requirements", "effect_requirement_candidates"):
        for index, row in enumerate(value.get(key, [])):
            visit(row, pointer_join(pointer_join(pointer, key), index), "EFFECT_CANDIDATE" if key == "effect_requirement_candidates" else "ENTRY_OR_DECLARATION", key == "effect_requirement_candidates")
    for index, owner in enumerate(value.get("owner_bindings", [])):
        if isinstance(owner, str) and re.fullmatch(r"DX100-[A-Z][0-9]{2}", owner):
            owners.append({"owner": owner, "role": "DECLARED_COMPONENT_OWNER", "candidate": False, "provenance_pointer": pointer_join(pointer_join(pointer, "owner_bindings"), index)})
    return normative, candidates, owners


FACETS = ("attributes", "historical_attributes", "cfg", "aliases", "alias", "serde_attributes", "serde_directives", "availability_conditions", "conditional_attributes", "availability_memberships", "qualification", "status", "variant_status", "coverage", "shape", "binding", "raw_properties", "lossless_property_syntax", "runtime_reachability", "source_disposition", "module_roles", "classification", "kind", "definition", "public_syntax", "type_only", "effect_owner_disposition", "source_role", "owner", "proposed_owner", "language_behavior_required", "compiler_reachability", "features", "platforms", "rule", "source_paths", "constructor", "members", "root_node", "schema_node", "schema_pointer", "keyword_nodes", "handler_alias", "impl_type", "name_resolution", "resolved_base_name", "registration_method", "resolution", "guard_summary", "compile_time_classification", "runtime_qualification", "requirement_relationship", "effective_namespace", "test_only", "cfg_test_only")


def make_record(path, pointer, kind, store, payloads):
    meta = store[path]
    value = dereference(payloads[path], pointer) if pointer is not None else None
    normative, candidates, owners = bindings(value, pointer or "") if pointer not in (None, "") else ([], [], [])
    qualifiers = []
    if isinstance(value, dict) and pointer not in (None, ""):
        for key in FACETS:
            if key in value:
                qualifiers.append({"json_pointer": pointer_join(pointer, key), "sha256": digest(value[key])})
    source_identity = None
    if isinstance(value, str) and (kind == "future_oracle" or pointer == "/root_enum"):
        source_identity = value
    if isinstance(value, dict):
        for key in ("id", "variant_id", "tool_id", "surface_id", "action_id", "scope_join_id", "handler_alias", "name", "method"):
            if isinstance(value.get(key), str):
                source_identity = value[key]
                break
    language = None
    if "/typescript/" in (pointer or "") or (pointer or "").startswith("/typescript/"):
        language = "TypeScript"
    if (pointer or "").startswith("/python/"):
        language = "Python"
    event = path.endswith("tui-interactions/integration.json") and re.fullmatch(r"/events/[0-9]+", pointer or "") is not None
    nested_refs = []
    if isinstance(value, dict) and pointer not in (None, ""):
        for key in sorted(value):
            if key.endswith(("_id", "_ids", "_indexes", "_references", "_refs")) or key in ("schema_node", "root_node", "schema_sites", "keyword_nodes"):
                nested_refs.append({"json_pointer": pointer_join(pointer, key), "sha256": digest(value[key])})
    return {"id": identity(path, pointer), "source_package": meta["source_package"], "inputpath": path, "json_pointer": pointer, "fragment_kind": kind, "semantic_class": KINDS[kind], "source_object_sha256": digest(value) if pointer is not None else meta["sha256"], "input_file_sha256": meta["sha256"], "source_identity": source_identity, "root_id": identity(path, "" if path in payloads else None), "requirement_bindings": normative, "candidate_bindings": candidates, "owner_bindings": owners, "assignment": "EXPLICIT_SOURCE_BINDING" if normative else "OPEN_SOURCE_CANDIDATE_ONLY" if candidates else "OPEN_UNASSIGNED", "effect_owner": "OPEN" if event else None, "language": language, "qualifier_refs": qualifiers, "nested_reference_refs": nested_refs, "future_qualification": "NOT_RUN", "receipt": None}


def coverage(payloads):
    def doc(relative):
        return payloads[str((G01 / relative).relative_to(REPO))]
    matrix = doc("pinned-variants/matrix.json")
    cli = doc("entrypoints/cli/graph.json")
    parser = doc("cli-parser-semantics/integration.json")
    rust = doc("component-surfaces/rust/inventory.json")
    nonrust = doc("component-surfaces/non-rust/inventory.json")
    tui = doc("tui-interactions/integration.json")
    toolgraph = doc("entrypoints/tools/tool-graph.json")
    require(isinstance(toolgraph["handler_bindings"], dict), "36 handlers must retain DICT identities")
    require(isinstance(cli["root_enum"], str), "root_enum is a source identity string")
    result = {
        "pinned_contracts": len(matrix["source_contracts"]), "response_obligations": len(matrix["request_responses"]), "config_keys": len(matrix["configuration"]["top_level_keys"]), "schema_documents": len(matrix["documents"]), "json_node_pool": len(matrix["json_nodes"]), "syntax_profiles": len(matrix["syntax_variant_profiles"]),
        "excluded_source_contracts": sum(x["coverage"] != "PINNED_PUBLIC_EXPORT_CASE" for x in matrix["source_contracts"]),
        "cli_root_variants": sum(x["owner"] == cli["root_enum"] for x in cli["variants"]), "cli_variants": len(cli["variants"]), "cli_types_support": len(cli["types"]), "cli_historical_fields": len(cli["fields"]), "cli_current_fields": len(parser["fields"]), "cli_future_cases_not_run": len(parser["future_oracle_obligations"]),
        "tool_handler_support": len(toolgraph["handler_bindings"]), "tool_registration_metadata": len(toolgraph["registration_sites"]), "tool_testonly_registration_support": sum(x["compile_time_classification"] == "TEST_ONLY_CFG_TEST" for x in toolgraph["registration_sites"]),
        "exec_operations": len(doc("exec-server/flows.json")["operations"]), "exec_external_contracts": len(doc("exec-transitive/integration.json")["external_contracts"]), "external_limits_open": len(tui["mandatory_external_runtime_limits"]),
        "contributor_tools": len(doc("dynamic-factories/contributors/inventory.json")["tools"]), "pipeline_families": len(doc("dynamic-factories/pipelines/inventory.json")["factory_families"]),
        "cargo_packages_support": len(rust["packages"]), "cargo_virtual_support": len(rust["virtual_manifests"]), "cargo_target_candidates_support": len(rust["target_candidates"]), "local_dependency_edges_support": len(rust["local_dependency_edges"]), "noncargo_manifests_support": len(nonrust["manifests"]), "typescript_exports": len(nonrust["typescript"]), "python_exports": len(nonrust["python"]["root_public_api"]), "sdk_gaps_open": len(tui["mandatory_sdk_gaps"]),
        "tui_commands": len(tui["commands"]), "tui_events": len(tui["events"]), "tui_effect_owners_open": sum(x["effect_owner_disposition"].startswith("OPEN") for x in tui["events"]), "tui_view_families": len(tui["view_families"]), "tui_dynamic_families": len(tui["dynamic_command_families"]), "tui_file_census_support": len(doc("tui-interactions/scope/inventory.json")["files"]), "tui_source_context_support": len(tui["source_context"]),
        "tui_future_families_not_run": sum("future_variant_family" in row for row in tui["commands"] + tui["events"]) + sum("future_variant_family_id" in row for row in tui["view_families"]),
    }
    return result


EXPECTED = {"pinned_contracts": 274, "response_obligations": 186, "config_keys": 103, "schema_documents": 455, "json_node_pool": 16087, "syntax_profiles": 6600, "excluded_source_contracts": 5, "cli_root_variants": 30, "cli_variants": 82, "cli_types_support": 105, "cli_historical_fields": 305, "cli_current_fields": 309, "cli_future_cases_not_run": 1459, "exec_operations": 32, "exec_external_contracts": 3, "external_limits_open": 5, "contributor_tools": 32, "pipeline_families": 4, "cargo_packages_support": 163, "cargo_virtual_support": 1, "cargo_target_candidates_support": 527, "local_dependency_edges_support": 1070, "noncargo_manifests_support": 8, "typescript_exports": 34, "python_exports": 37, "sdk_gaps_open": 6, "tui_commands": 65, "tui_events": 291, "tui_effect_owners_open": 291, "tui_view_families": 14, "tui_dynamic_families": 2, "tui_file_census_support": 1131, "tui_source_context_support": 1135}
EXPECTED.update(tool_handler_support=36, tool_registration_metadata=39, tool_testonly_registration_support=1)
EXPECTED.update(tui_future_families_not_run=370)


def project(contract, store, payloads, input_manifest):
    rows = {}
    for path in sorted(store):
        pointer = "" if path in payloads else None
        rows[(path, pointer)] = make_record(path, pointer, "metadata", store, payloads)
    for path, pointer, kind in selected_rows(payloads):
        key = (path, pointer)
        require(key not in rows, "duplicate source identity: " + path + str(pointer))
        rows[key] = make_record(path, pointer, kind, store, payloads)
    records = sorted(rows.values(), key=lambda x: (x["inputpath"], x["json_pointer"] or ""))
    counts = coverage(payloads)
    require(counts == EXPECTED, "source coverage changed: " + str(counts))
    return {"schema_version": SCHEMA, "task": TASK, "parent_contract_sha256": CONTRACT_SHA, "projections_contract_sha256": PROJECTIONS_SHA, "pin": contract["pin"], "input_manifest_sha256": digest(input_manifest), "records": records, "record_count": len(records), "fragment_counts": dict(sorted(collections.Counter(x["fragment_kind"] for x in records).items())), "coverage": counts, "mandatory_open": {"sdk_gaps": 6, "external_runtime_limits": 5, "tui_effect_owners": 291, "unassigned_fragments": sum(x["assignment"] == "OPEN_UNASSIGNED" for x in records), "source_binary_binding": "OPEN_G02", "language_equivalence": "OPEN_TS_IS_NOT_PYTHON", "cfg_macros_targets_private_callgraphs": "RUNTIME_ORACLES_NOT_EVALUATED"}, "functional_receipts": 0, "full_g01_closure": False}


def validate_registry(actual, expected):
    require(type(actual) is dict and set(actual) == set(expected), "registry root schema")
    require(len(actual["records"]) == expected["record_count"], "fragment count mismatch")
    require(len({x["id"] for x in actual["records"]}) == len(actual["records"]), "duplicate registry IDs")
    for observed, wanted in zip(actual["records"], expected["records"]):
        require(set(observed) == set(wanted), "record schema: " + wanted["id"])
        require(observed == wanted, "semantic projection mismatch: " + wanted["inputpath"] + "#" + str(wanted["json_pointer"]))
    require({k: v for k, v in actual.items() if k != "records"} == {k: v for k, v in expected.items() if k != "records"}, "registry metadata mismatch")


def authenticated_fragment(record, store, payloads):
    path, pointer = record["inputpath"], record["json_pointer"]
    require(path in store, "fragment outside whitelist")
    require(store[path]["sha256"] == record["input_file_sha256"], "fragment input authentication")
    require(record["id"] == identity(path, pointer), "fragment identity mismatch")
    if pointer is None:
        require(path not in payloads, "null pointer for JSON")
        data = checked_path(path).read_bytes()
        authenticate(data, record["source_object_sha256"], "raw fragment")
        return data.decode("utf-8")
    value = dereference(payloads[path], pointer)
    require(digest(value) == record["source_object_sha256"], "fragment object authentication")
    return value


def schema_document(first):
    return {"schema_version": SCHEMA, "registry_root_keys": list(first), "record_keys": list(first["records"][0]), "fragment_kinds": KINDS, "selectors": SELECT, "canonical_digest": "UTF8 JSON; sort_keys=True; ensure_ascii=False; separators=(',', ':'); no NaN", "identity": "src:SHA256(UTF8(inputpath + NUL + JSONpointer)); <bytes> sentinel for nonJSON", "dereference": "input-manifest authenticated by 9 parent manifests + checkpoint474; JSON RFC6901 against full original input, no span copying", "binding_selectors": ["direct requirement/requirement_id/CDX100 id + DX100 owner", "binding.existing_requirements + binding.owner", "baseline_record.requirement + owner", "entry_requirement + future_variant_family as SURFACE_ENTRY", "requirements[] as explicit entry binding", "effect_requirement_candidates[] as candidates only", "owner_bindings[] as DECLARED_COMPONENT_OWNER; no inferred requirement", "requirement_relationship/mapping_status/disposition prefixes PROPOSED_ or CANDIDATE_ retain source links as candidate-only OPEN; all semantic_owner_status OPEN_NOT_QUALIFIED"], "qualification": "NOT_RUN; zero functional receipts; no independent approval"}


def replace_pointer(value, pointer, new_value):
    """Copy only the in-memory path to the mutation; no input writes."""
    tokens = pointer.split("/")[1:]
    def replace(node, remaining):
        if not remaining:
            return new_value
        token = remaining[0].replace("~1", "/").replace("~0", "~")
        result = node.copy()
        key = int(token) if isinstance(node, list) else token
        result[key] = replace(node[key], remaining[1:])
        return result
    return replace(value, tokens)


def negative_tests(contract, store, payloads, inputs, expected):
    observed = []
    index = {(x["inputpath"], x["json_pointer"]): x for x in expected["records"]}

    def rejected(label, call, boundary):
        try:
            call()
        except (ValueError, KeyError, IndexError, TypeError) as error:
            observed.append({"id": label, "status": "REJECTED_AS_EXPECTED", "boundary": boundary, "error": str(error)[:300]})
        else:
            raise ValueError("negative accepted: " + label)

    # Normalization must change in addition to object/file digests. The mutated
    # object is fed through the real make_record; the frozen artifact is checked.
    probes = [
        ("omitted-requirement", "pinned-variants/matrix.json", "/source_contracts/0", "requirement", None, True),
        ("changed-requirement", "pinned-variants/matrix.json", "/source_contracts/0", "requirement", "CDX100-MUTATED", False),
        ("rust-owner-is-not-DX100", "pinned-variants/matrix.json", "/source_contracts/0", "owner", "rust::PrivateOwner", False),
        ("changed-source-identity", "cli-parser-semantics/integration.json", "/fields/0", "id", "changed-field-id", False),
        ("qualification-promotion", "pinned-variants/matrix.json", "/source_contracts/0", "qualification", "PASS", False),
        ("omitted-qualification", "pinned-variants/matrix.json", "/source_contracts/0", "qualification", None, True),
        ("raw5-coverage-loss", "pinned-variants/matrix.json", "/source_contracts/0", "coverage", "DROP_SOURCE_CONTRACT", False),
        ("changed-schema-node", "pinned-variants/matrix.json", "/source_contracts/0", "schema_node", "0" * 64, False),
        ("changed-schema-root", "pinned-variants/matrix.json", "/documents/0", "root_node", "1" * 64, False),
        ("changed-alias-syntax", "cli-parser-semantics/integration.json", "/command_and_variant_metadata/0", "lossless_property_syntax", {"alias": ["mutated"]}, False),
        ("changed-cfg", "entrypoints/cli/graph.json", "/types/0", "cfg", ["cfg(mutated)"], False),
        ("changed-serde-attributes", "exec-server/types/inventory.json", "/types/0", "attributes", ["#[serde(untagged)]"], False),
        ("changed-language-binding", "component-surfaces/non-rust/inventory.json", "/typescript/0", "binding", {}, False),
        ("changed-python-api", "component-surfaces/non-rust/inventory.json", "/python/root_public_api/0", "definition", "typescript-is-not-python", False),
        ("changed-dynamic-rule", "tui-interactions/integration.json", "/dynamic_command_families/0", "rule", "finite-and-closed", False),
        ("changed-context-module-role", "tui-interactions/integration.json", "/source_context/0", "module_roles", ["runtime-qualified"], False),
        ("changed-context-reachability", "tui-interactions/integration.json", "/source_context/0", "runtime_reachability", "PASS", False),
        ("changed-effect-ownership", "tui-interactions/integration.json", "/events/0", "effect_owner_disposition", "CLOSED", False),
        ("omitted-nested-reference", "tui-interactions/integration.json", "/events/0", "source_reference_ids", [], False),
        ("future-case-result-promotion", "cli-parser-semantics/integration.json", "/future_oracle_obligations/0", "qualification", "PASS", False),
        ("handler-DICT-alias-mutation", "entrypoints/tools/tool-graph.json", "/handler_bindings/DynamicToolHandler", "handler_alias", "omitted-dynamic-alias", False),
        ("registration-test-cfg-mutation", "entrypoints/tools/tool-graph.json", "/registration_sites/0", "compile_time_classification", "TEST_ONLY_MUTATION", False),
    ]
    for label, relative, pointer, key, replacement, remove in probes:
        path = str((G01 / relative).relative_to(REPO))
        original = index[(path, pointer)]
        value = copy.deepcopy(dereference(payloads[path], pointer))
        require(key in value, "negative fixture missing original property: " + label)
        if remove:
            del value[key]
        else:
            require(value[key] != replacement, "negative fixture no-op: " + label)
            value[key] = replacement
        changed = payloads.copy()
        changed[path] = replace_pointer(payloads[path], pointer, value)
        rebuilt = make_record(path, pointer, original["fragment_kind"], store, changed)
        # Explicitly discard all envelope hashes before proving semantic impact.
        semantic = lambda row: {k: v for k, v in row.items() if k not in ("source_object_sha256", "input_file_sha256")}
        require(semantic(rebuilt) != semantic(original), "negative only detected a digest: " + label)
        rejected(label, lambda: require(semantic(original) == semantic(rebuilt), "normalized binding/identity/qualifier/reference mismatch"), "IN_MEMORY_INPUT_TO_SEMANTIC_PROJECTION_WITH_FILE_AND_OBJECT_HASHES_IGNORED")

    # Preserve exact nested references, syntax pools and source Git/span records.
    for label, relative, pointer in [
        ("syntax-pool-child", "pinned-variants/matrix.json", "/json_nodes"),
        ("schema-sites-child", "pinned-variants/matrix.json", "/documents/0"),
        ("nested-git-span", "tui-interactions/views/inventory.json", "/files/0"),
    ]:
        path = str((G01 / relative).relative_to(REPO))
        original = index[(path, pointer)]
        value = copy.deepcopy(dereference(payloads[path], pointer))
        if label == "syntax-pool-child":
            key = sorted(value)[0]
            value[key]["kind"] = "mutated-kind"
        elif label == "schema-sites-child":
            value["schema_sites"][0]["node"] = "f" * 64
        else:
            require("git_blob" in value, "Git provenance fixture")
            value["git_blob"] = "0" * 40
        changed = payloads.copy()
        changed[path] = replace_pointer(payloads[path], pointer, value)
        rejected(label, lambda: authenticated_fragment(original, store, changed), "IN_MEMORY_JSON_POINTER_OBJECT_AUTHENTICATION_NOT_FILE_HASH")

    artifact_probes = [
        ("artifact-kind-private-as-public", lambda r: r.update(fragment_kind="public_variant", semantic_class=KINDS["public_variant"])),
        ("artifact-pointer-drift", lambda r: r.update(json_pointer="/not-present")),
        ("artifact-ID-drift", lambda r: r.update(id="src:" + "0" * 64)),
        ("artifact-false-owner", lambda r: r.update(owner_bindings=[{"owner": "DX100-U01"}])),
        ("artifact-promote-effect-owner", lambda r: r.update(effect_owner="DX100-U01")),
        ("artifact-promote-receipt", lambda r: r.update(receipt="fabricated", future_qualification="PASS")),
    ]
    first_index = next(i for i, r in enumerate(expected["records"]) if r["fragment_kind"] == "metadata" and r["json_pointer"] not in (None, ""))
    for label, mutate in artifact_probes:
        bad = {**expected, "records": expected["records"].copy()}
        row = copy.deepcopy(bad["records"][first_index])
        mutate(row)
        bad["records"][first_index] = row
        rejected(label, lambda: validate_registry(bad, expected), "ARTIFACT_SEMANTIC_VALIDATION_WITHOUT_MANIFEST_HASH_SHORTCIRCUIT")
    bad = {**expected, "records": expected["records"][:-1]}
    rejected("artifact-omitted-row", lambda: validate_registry(bad, expected), "EXACT_FRAGMENT_SET")
    bad = {**expected, "records": expected["records"] + [expected["records"][0]]}
    rejected("artifact-duplicated-row", lambda: validate_registry(bad, expected), "EXACT_FRAGMENT_SET")
    bad = {**expected, "coverage": {**expected["coverage"], "python_exports": 34}}
    rejected("artifact-typescript-is-not-python", lambda: validate_registry(bad, expected), "ARTIFACT_COVERAGE")
    sample = {"path": "synthetic.json", "sha256": "0" * 64, "bytes": 0}
    rejected("manifest-duplicate", lambda: manifest_entries({"files": [sample, sample]}, LANE), "STRICT_MANIFEST_STRUCTURE")
    for label, value in [("manifest-traversal", "../escape.json"), ("manifest-absolute", "/etc/passwd")]:
        rejected(label, lambda: manifest_entries({"files": [{**sample, "path": value}]}, REPO), "STRICT_MANIFEST_PATH")
    rejected("manifest-size", lambda: manifest_entries({"files": [{**sample, "bytes": -1}]}, LANE), "STRICT_MANIFEST_SIZE")
    rejected("manifest-digest", lambda: authenticate(b"mutated", "0" * 64, "synthetic input"), "INPUT_ENVELOPE_AUTHENTICATION")
    rejected("JSON-duplicate-key", lambda: load_json('{"id":1,"id":2}'), "STRICT_JSON_PARSE")
    rejected("pointer-invalid-escape", lambda: dereference({"~2": 1}, "/~2"), "RFC6901")
    rejected("pointer-noncanonical-index", lambda: dereference([1], "/00"), "RFC6901")

    synthetic = {"parent_contract_sha256": CONTRACT_SHA, "projections_contract_sha256": PROJECTIONS_SHA, "file_count": 1, "files": [sample]}
    known = {"synthetic.json": {"sha256": "0" * 64, "bytes": 0}}
    validate_lane_manifest(synthetic, known)
    rejected("own-manifest-missing-file", lambda: validate_lane_manifest(synthetic, {}), "STRICT_OWN_FILE_SET")
    rejected("own-manifest-extra-file", lambda: validate_lane_manifest(synthetic, {**known, "extra.json": {"sha256": "0" * 64, "bytes": 0}}), "STRICT_OWN_FILE_SET")
    rejected("own-manifest-nested-manifest-must-not-be-excluded", lambda: validate_lane_manifest(synthetic, {**known, "nested/manifest.json": {"sha256": "0" * 64, "bytes": 0}}), "STRICT_OWN_FILE_SET")
    rejected("own-manifest-digest-changed", lambda: validate_lane_manifest(synthetic, {"synthetic.json": {"sha256": "1" * 64, "bytes": 0}}), "STRICT_OWN_DIGEST")
    path = str((G01 / "pinned-variants/matrix.json").relative_to(REPO))
    original_table = payloads[path]["source_contracts"]
    for label, changed_table in [("source-omitted-contract-row", original_table[:-1]), ("source-added-contract-row", original_table + [original_table[0]])]:
        changed = payloads.copy()
        changed[path] = replace_pointer(payloads[path], "/source_contracts", changed_table)
        rejected(label, lambda: require(coverage(changed) == EXPECTED, "source semantic cardinality mismatch"), "INPUT_COLLECTION_CARDINALITY_WITH_ORIGINAL_FILE_HASH")

    explicit = []
    for relative, pointer, kind in [
        ("pinned-variants/matrix.json", "/source_contracts/0", "contract"),
        ("pinned-variants/matrix.json", "/request_responses/0", "response"),
        ("pinned-variants/matrix.json", "/configuration/top_level_keys/0", "config"),
        ("pinned-variants/matrix.json", "/documents/0", "schema"),
        ("entrypoints/cli/graph.json", "/types/0", "metadata"),
        ("cli-parser-semantics/integration.json", "/fields/0", "field"),
        ("cli-parser-semantics/integration.json", "/future_oracle_obligations/0", "future_oracle"),
        ("component-surfaces/non-rust/inventory.json", "/typescript/0", "language"),
        ("component-surfaces/non-rust/inventory.json", "/python/root_public_api/0", "language"),
        ("tui-interactions/integration.json", "/events/0", "public_variant"),
        ("tui-interactions/integration.json", "/dynamic_command_families/0", "dynamic"),
        ("tui-interactions/scope/inventory.json", "/files/0", "support_census"),
    ]:
        path = str((G01 / relative).relative_to(REPO))
        row = index[(path, pointer)]
        require(row["fragment_kind"] == kind, "explicit class case")
        authenticated_fragment(row, store, payloads)
        explicit.append({"id": row["id"], "input": relative, "pointer": pointer, "kind": kind, "status": "PASS"})
    cli_path = str((G01 / "entrypoints/cli/graph.json").relative_to(REPO))
    require(not index[(cli_path, "/variants/0")]["owner_bindings"], "raw Rust owner was normalized as DX100")
    event_rows = [x for x in expected["records"] if x["inputpath"].endswith("tui-interactions/integration.json") and re.fullmatch(r"/events/[0-9]+", x["json_pointer"] or "")]
    require(len(event_rows) == 291 and all(x["effect_owner"] == "OPEN" for x in event_rows), "291 effect owners OPEN")
    require(all(x["future_qualification"] == "NOT_RUN" and x["receipt"] is None for x in expected["records"]), "future/receipt invariant")
    require(coverage(payloads) == EXPECTED, "explicit source counts")
    toolpath = str((G01 / "entrypoints/tools/tool-graph.json").relative_to(REPO))
    handlers = payloads[toolpath]["handler_bindings"]
    for key in handlers:
        row = index[(toolpath, pointer_join("/handler_bindings", key))]
        require(row["fragment_kind"] == "metadata", "handler must not become callable capability")
        require(authenticated_fragment(row, store, payloads) == handlers[key], "lossless dictionary handler")
        require(not row["requirement_bindings"] and row["candidate_bindings"], "proposed handler link must remain candidate")
    for key in ("DynamicToolHandler", "ToolSearchHandler", "CodeModeExecuteHandler", "CodeModeWaitHandler", "SpawnAgentHandlerV2", "SendMessageHandlerV2", "ListAgentsHandlerV2"):
        require(key in handlers, "required handler family: " + key)
    matrix_path = str((G01 / "pinned-variants/matrix.json").relative_to(REPO))
    raw5 = [index[(matrix_path, pointer_join("/source_contracts", i))] for i, value in enumerate(original_table) if value["coverage"] != "PINNED_PUBLIC_EXPORT_CASE"]
    require(len(raw5) == 5, "five excluded contracts retained")
    for row in raw5:
        authenticated_fragment(row, store, payloads)
    explicit.append({"id": "tool-handler-DICT-and-raw5-census", "status": "PASS", "handlers": len(handlers), "registrations": len(payloads[toolpath]["registration_sites"]), "raw5_contract_ids": [r["id"] for r in raw5]})
    return {"schema_version": SCHEMA, "status": "PASS", "negative_count": len(observed), "negatives": observed, "explicit_case_count": len(explicit), "explicit_cases": explicit, "counts": EXPECTED, "input_mutations": "in memory only; unchanged file hashes; semantic assertions exclude file+object digest fields", "artifact_mutations": "semantic validator called directly, bypassing outer manifest digest rejection", "independent_review": "NOT_PERFORMED_BY_WORKER", "functional_receipts": 0}


def check_links():
    results = []
    for file in sorted(LANE.glob("*.md")):
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", file.read_text()):
            require(not re.match(r"[a-zA-Z]+:", target), "nonlocal link in own README")
            target = unquote(target.split("#", 1)[0])
            require((file.parent / target).exists(), "broken own link: " + target)
            results.append({"file": file.name, "target": target})
    require(bool(results), "no own Markdown links checked")
    return results


def strict_lane_manifest():
    actual = {str(p.relative_to(LANE)): p for p in LANE.rglob("*") if p.is_file() and p != LANE / "manifest.json"}
    manifest = load_json((LANE / "manifest.json").read_bytes())
    validate_lane_manifest(manifest, {path: {"sha256": sha(p.read_bytes()), "bytes": p.stat().st_size} for path, p in actual.items()})
    return manifest


def validate_lane_manifest(manifest, actual):
    entries = manifest["files"]
    require(len(entries) == len({x["path"] for x in entries}), "duplicate own manifest entry")
    require(manifest["file_count"] == len(entries), "own manifest count")
    require(set(actual) == {x["path"] for x in entries}, "strict own manifest file set")
    for row in entries:
        require(actual[row["path"]] == {"sha256": row["sha256"], "bytes": row["bytes"]}, "own artifact digest: " + row["path"])
    require(manifest["parent_contract_sha256"] == CONTRACT_SHA and manifest["projections_contract_sha256"] == PROJECTIONS_SHA, "own manifest contracts")


def write_json(name, value):
    require("/" not in name and name.endswith(".json"), "lane-only write")
    (LANE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--seal", action="store_true")
    mode.add_argument("--links", action="store_true")
    mode.add_argument("--negative-tests", action="store_true")
    mode.add_argument("--get", metavar="SOURCE_PACKET_ID")
    args = parser.parse_args()
    if args.links:
        print(json.dumps({"status": "PASS", "links": check_links()}, sort_keys=True))
        return
    contract, store, payloads, inputs = read_inputs()
    first = project(contract, store, payloads, inputs)
    if args.write:
        write_json("input-manifest.json", inputs)
        write_json("registry.json", first)
        write_json("summary.json", {k: v for k, v in first.items() if k != "records"})
        write_json("schema.json", schema_document(first))
        print(json.dumps({"status": "IMPLEMENTED", "records": len(first["records"]), "coverage": first["coverage"]}, sort_keys=True))
        return
    actual = load_json((LANE / "registry.json").read_bytes())
    validate_registry(actual, first)
    require(load_json((LANE / "input-manifest.json").read_bytes()) == inputs, "input manifest mismatch")
    require(load_json((LANE / "schema.json").read_bytes()) == schema_document(first), "schema semantics mismatch")
    require(load_json((LANE / "summary.json").read_bytes()) == {k: v for k, v in first.items() if k != "records"}, "summary semantics mismatch")
    if args.get:
        manifest = strict_lane_manifest()
        require(manifest["registry_canonical_sha256"] == digest(first) and manifest["input_manifest_canonical_sha256"] == digest(inputs), "seal semantic binding")
        selected = [x for x in actual["records"] if x["id"] == args.get]
        require(len(selected) == 1, "unknown source packet ID")
        print(json.dumps(authenticated_fragment(selected[0], store, payloads), ensure_ascii=False, sort_keys=True))
        return
    if args.negative_tests:
        print(json.dumps(negative_tests(contract, store, payloads, inputs, first), sort_keys=True))
        return
    second = project(contract, store, payloads, inputs)
    require(canonical(first) == canonical(second), "nondeterministic normalization")
    links = check_links()
    if args.seal:
        files = [{"path": str(p.relative_to(LANE)), "sha256": sha(p.read_bytes()), "bytes": p.stat().st_size} for p in sorted(LANE.rglob("*")) if p.is_file() and p != LANE / "manifest.json"]
        write_json("manifest.json", {"schema_version": SCHEMA, "task": TASK, "status": "IMPLEMENTED", "parent_contract_sha256": CONTRACT_SHA, "projections_contract_sha256": PROJECTIONS_SHA, "input_manifest_canonical_sha256": digest(inputs), "registry_canonical_sha256": digest(first), "files": files, "file_count": len(files), "self_exclusion": "exact projections/manifest.json only; record its SHA externally", "functional_receipts": 0, "full_g01_closure": False})
    else:
        manifest = strict_lane_manifest()
        require(manifest["registry_canonical_sha256"] == digest(first) and manifest["input_manifest_canonical_sha256"] == digest(inputs), "seal semantic binding")
    print(json.dumps({"status": "PASS", "readonly": not args.seal, "input_files": len(store), "records": len(first["records"]), "deterministic_runs": 2, "registry_canonical_sha256": digest(first), "own_links": len(links), "functional_receipts": 0, "full_g01_closure": False}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, IndexError, TypeError, OSError) as error:
        print(json.dumps({"status": "FAIL", "error": str(error)}, sort_keys=True), file=sys.stderr)
        sys.exit(1)
