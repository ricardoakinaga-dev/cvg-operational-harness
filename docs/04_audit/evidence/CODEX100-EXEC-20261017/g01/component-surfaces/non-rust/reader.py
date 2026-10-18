#!/usr/bin/env python3
"""Read pinned non-Rust source. Never import/execute target; --check is read-only."""
import argparse
import ast
import bisect
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tomllib

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[6]
PIN = "8d9f6466ff0294785d56f55b1fe363d132fe4133"
DEFAULT_SOURCE = Path("/tmp/cvg-rea-codex-20261017/upstream")
CONTRACT = HERE.parent / "non-rust-contract.json"
CONTRACT_SHA256 = "19bb7ed51a8fb0950a309d95b1b4d45ef084231713017d462d9ebc5b989c94ed"
CATALOG = REPO / "docs/03_build/tracking/codex100_catalog_v1.json"
BASELINE = HERE.parents[1] / "sdk-public-inventory.json"
EXPECTED = sorted([
    "package.json", "codex-cli/package.json",
    "codex-rs/responses-api-proxy/npm/package.json", "sdk/typescript/package.json",
    "sdk/python/pyproject.toml", "sdk/python-runtime/pyproject.toml",
    "scripts/pyproject.toml", "scripts/codex_package/smoke_tests/pyproject.toml",
])
PYROOT = "sdk/python/src/openai_codex/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def ensure(ok, message):
    if not ok:
        raise ValueError(message)


def expr(node):
    return ast.unparse(node) if node is not None else None


def file_hash(path):
    return sha(path.read_bytes())


class Sources:
    def __init__(self, root):
        self.root = root.resolve()
        head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        ensure(head == PIN, "source HEAD does not match pin")
        raw = subprocess.check_output(["git", "-C", str(root), "ls-tree", "-rz", PIN])
        self.tree = {}
        for row in raw.split(b"\0"):
            if row:
                meta, path = row.split(b"\t", 1)
                mode, kind, oid = meta.decode().split()
                if kind == "blob":
                    self.tree[path.decode("utf-8")] = {"mode": mode, "git_blob": oid}
        self.data = {}
        self.text = {}
        self.offsets = {}
        self.index = {}

    def read(self, path):
        if path not in self.data:
            ensure(path in self.tree, "untracked source: " + path)
            data = (self.root / path).read_bytes()
            blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
            ensure(blob == self.tree[path]["git_blob"], "source blob drift: " + path)
            self.text[path] = data.decode("utf-8")
            offsets = [0]
            for line in data.splitlines(keepends=True):
                offsets.append(offsets[-1] + len(line))
            self.offsets[path] = offsets
            self.data[path] = data
            self.index[path] = {"path": path, **self.tree[path], "bytes": len(data), "sha256": sha(data)}
        return self.text[path]

    def span(self, path, start=0, end=None):
        self.read(path)
        data = self.data[path]
        end = len(data) if end is None else end
        ensure(0 <= start < end <= len(data), "invalid UTF8 span: " + path)
        data[start:end].decode("utf-8")
        return {"path": path, "git_blob": self.tree[path]["git_blob"],
                "byte_start": start, "byte_end": end, "sha256": sha(data[start:end]),
                "line_start": bisect.bisect_right(self.offsets[path], start),
                "line_end": bisect.bisect_right(self.offsets[path], end - 1)}

    def node_span(self, path, node):
        self.read(path)
        offsets = self.offsets[path]
        start = offsets[node.lineno - 1] + node.col_offset
        end = offsets[node.end_lineno - 1] + node.end_col_offset
        return self.span(path, start, end)

    def text_span(self, path, start, end):
        text = self.read(path)
        return self.span(path, len(text[:start].encode()), len(text[:end].encode()))


def module_name(path):
    if path.startswith(PYROOT):
        return "openai_codex." + path[len(PYROOT):-3].replace("/", ".").removesuffix(".__init__") if not path.endswith("openai_codex/__init__.py") else "openai_codex"
    if path == "sdk/python-runtime/src/codex_cli_bin/__init__.py":
        return "codex_cli_bin"
    return path[:-3].replace("/", ".").replace("-", "_")


def import_module(path, node):
    if not node.level:
        return node.module or ""
    current = module_name(path)
    parent = current if path.endswith("/__init__.py") else current.rsplit(".", 1)[0]
    parts = parent.split(".")
    base = parts[:len(parts) - node.level + 1]
    return ".".join(base + ([node.module] if node.module else []))


def args_record(node):
    a = node.args
    out = []
    positional = a.posonlyargs + a.args
    defaults = [None] * (len(positional) - len(a.defaults)) + list(a.defaults)
    for index, (arg, default) in enumerate(zip(positional, defaults)):
        out.append({"name": arg.arg, "kind": "positional_only" if index < len(a.posonlyargs) else "positional_or_keyword",
                    "annotation": expr(arg.annotation), "required": default is None, "default": expr(default)})
    if a.vararg:
        out.append({"name": a.vararg.arg, "kind": "var_positional", "annotation": expr(a.vararg.annotation)})
    for arg, default in zip(a.kwonlyargs, a.kw_defaults):
        out.append({"name": arg.arg, "kind": "keyword_only", "annotation": expr(arg.annotation),
                    "required": default is None, "default": expr(default)})
    if a.kwarg:
        out.append({"name": a.kwarg.arg, "kind": "var_keyword", "annotation": expr(a.kwarg.annotation)})
    return out


def fields(s, path, node):
    out = []
    for n in node.body:
        if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name):
            out.append({"name": n.target.id, "annotation": expr(n.annotation), "default": expr(n.value),
                        "required_syntactically": n.value is None, "source": s.node_span(path, n)})
        elif isinstance(n, ast.Assign):
            for t in n.targets:
                if isinstance(t, ast.Name):
                    out.append({"name": t.id, "annotation": None, "default": expr(n.value),
                                "required_syntactically": False, "source": s.node_span(path, n)})
    return out


def obligation(owner, requirements, gap=None):
    return {"owner": owner, "existing_requirements": requirements, "mapping_status": "PROPOSED_LANGUAGE_VARIANT",
            "proposed_gap": gap, "mandatory": True, "language_behavior_required": True,
            "qualification": "NOT_RUN", "functional_receipts": 0}


def binding_for(path, name):
    if "generated" in path or path.endswith(("/models.py", "/types.py")):
        return obligation("DX100-A01", ["CDX100-08-02", "CDX100-09-03"], "Python generated models/defaults/aliases need independent schema and runtime validation")
    if "runtime" in path or path.endswith(("release_version.py", "/_version.py")) or path.startswith(("scripts/", "codex-cli/", "codex-rs/")):
        return obligation("DX100-Z02", ["CDX100-22-07"], "Python/npm runtime package identity, platform and artifact validation remain mandatory")
    if path.endswith(("/client.py", "/async_client.py")):
        return obligation("DX100-A01", ["CDX100-08-01", "CDX100-08-02", "CDX100-08-03", "CDX100-08-04", "CDX100-08-05"], "Python stdio transport/async offloading/cancellation/RPC lifecycle")
    if "login" in name.lower() or "account" in name.lower() or "logout" in name.lower():
        return obligation("DX100-N01", ["CDX100-20-01", "CDX100-20-03", "CDX100-20-04"], "Python sync/async auth handle and cancellation behavior")
    return obligation("DX100-D01", ["CDX100-09-01", "CDX100-09-02", "CDX100-09-03", "CDX100-09-04", "CDX100-09-05"], "Python public API, sync/async, cleanup, error and retry variants are not covered by TypeScript evidence")


def python_inventory(s, paths):
    modules, definitions, nodes, imports = [], {}, {}, {}
    for path in paths:
        tree = ast.parse(s.read(path), filename=path)  # parse only; never compile/import
        mod = module_name(path)
        imps = {}
        for n in tree.body:
            if isinstance(n, ast.ImportFrom):
                target = import_module(path, n)
                for a in n.names:
                    imps[a.asname or a.name] = {"target": target + "." + a.name, "source": s.node_span(path, n)}
            elif isinstance(n, ast.Import):
                for a in n.names:
                    imps[a.asname or a.name.split(".")[0]] = {"target": a.name, "source": s.node_span(path, n)}
        imports[mod] = imps
        all_names = None
        for n in tree.body:
            if isinstance(n, (ast.Assign, ast.AnnAssign)):
                targets = n.targets if isinstance(n, ast.Assign) else [n.target]
                if any(isinstance(t, ast.Name) and t.id == "__all__" for t in targets):
                    all_names = ast.literal_eval(n.value)
        public_names = set(all_names or [])
        local_names = []

        def visit(n, parent=None):
            is_method = parent is not None
            ident = (parent + "." if parent else mod + ".") + n.name
            public = not n.name.startswith("_") or n.name in {"__init__", "__enter__", "__exit__", "__aenter__", "__aexit__", "__iter__", "__next__", "__aiter__", "__anext__"}
            d = {"id": ident, "module": mod, "name": n.name, "public_syntax": public,
                 "source": s.node_span(path, n), "binding": binding_for(path, ident),
                 "decorators": [expr(x) for x in n.decorator_list]}
            if isinstance(n, ast.ClassDef):
                d.update(kind="class", bases=[expr(x) for x in n.bases], fields=fields(s, path, n),
                         dataclass_constructor="SYNTHESIZED_NOT_EXECUTED" if any("dataclass" in expr(x) for x in n.decorator_list) else None)
                definitions[ident] = d
                for member in n.body:
                    if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        visit(member, ident)
            else:
                d.update(kind="method" if is_method else "function", async_=isinstance(n, ast.AsyncFunctionDef),
                         signature=expr(n.args), parameters=args_record(n), returns=expr(n.returns),
                         yields=any(isinstance(x, (ast.Yield, ast.YieldFrom)) for x in ast.walk(n)),
                         raises=[expr(x.exc) for x in ast.walk(n) if isinstance(x, ast.Raise)],
                         calls=[], rpc_direct=[], rpc_reachable=[], graph_status="STATIC_PARTIAL_NO_DYNAMIC_DISPATCH_PROOF")
                d["instance_assignments"] = []
                for assign in ast.walk(n):
                    if isinstance(assign, (ast.Assign, ast.AnnAssign)):
                        targets = assign.targets if isinstance(assign, ast.Assign) else [assign.target]
                        for target in targets:
                            if isinstance(target, ast.Attribute) and expr(target).startswith("self."):
                                d["instance_assignments"].append({"attribute": expr(target), "value": expr(assign.value),
                                                                  "annotation": expr(assign.annotation) if isinstance(assign, ast.AnnAssign) else None,
                                                                  "source": s.node_span(path, assign)})
                definitions[ident] = d
                nodes[ident] = (path, n, parent)
            if not parent:
                local_names.append(n.name)

        for n in tree.body:
            if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                visit(n)
            elif isinstance(n, (ast.Assign, ast.AnnAssign)):
                targets = n.targets if isinstance(n, ast.Assign) else [n.target]
                for t in targets:
                    if isinstance(t, ast.Name) and t.id != "__all__":
                        ident = mod + "." + t.id
                        local_names.append(t.id)
                        definitions[ident] = {"id": ident, "module": mod, "name": t.id, "kind": "value_or_alias",
                                              "public_syntax": not t.id.startswith("_"), "annotation": expr(n.annotation) if isinstance(n, ast.AnnAssign) else None,
                                              "value": expr(n.value), "source": s.node_span(path, n), "binding": binding_for(path, t.id)}
        names = all_names if all_names is not None else sorted({x for x in local_names + list(imps) if not x.startswith("_")})
        modules.append({"module": mod, "path": path, "explicit_all": all_names,
                        "export_policy": "__all__" if all_names is not None else "Python implicit non-underscore namespace, including imported bindings",
                        "exports": [{"name": n, "target": imps[n]["target"] if n in imps else mod + "." + n,
                                     "source": imps[n]["source"] if n in imps else definitions[mod + "." + n]["source"]} for n in names],
                        "lazy_hooks": [{"name": n.name, "source": s.node_span(path, n)} for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in {"__getattr__", "__getattribute__"}],
                        "class_methods": [x for x, d in definitions.items() if d.get("module") == mod and "classmethod" in d.get("decorators", [])],
                        "source": s.span(path)})

    def resolve(target, seen=None):
        seen = set() if seen is None else seen
        if target in seen:
            return {"target": target, "status": "OPEN_CYCLE"}
        if target in definitions:
            return {"target": target, "status": "SOURCE_BOUND", "source": definitions[target]["source"]}
        seen.add(target)
        mod, _, name = target.rpartition(".")
        if name in imports.get(mod, {}):
            return resolve(imports[mod][name]["target"], seen)
        return {"target": target, "status": "EXTERNAL_OR_DYNAMIC_OPEN"}

    for m in modules:
        for e in m["exports"]:
            e["resolved"] = resolve(e["target"])
            e["binding"] = binding_for(m["path"], e["name"])
        m["namespace_scope"] = ("ROOT_PUBLIC_ALL" if m["module"] == "openai_codex" else
                                "GENERATED_IMPORTABLE_NAMESPACE" if ".generated" in m["module"] else
                                "PRIVATE_SUPPORT_NAMESPACE" if m["module"].rsplit(".", 1)[-1].startswith("_") else
                                "IMPORTABLE_MODULE_NAMESPACE")

    edges = {}
    for ident, (path, node, parent) in nodes.items():
        d = definitions[ident]
        mod = d["module"]
        edges[ident] = set()
        for call in (x for x in ast.walk(node) if isinstance(x, ast.Call)):
            callee = expr(call.func)
            targets = []
            if callee.startswith("self.") and parent:
                suffix = callee[5:]
                if suffix.startswith("_sync."):
                    targets.append("openai_codex.client.CodexClient." + suffix[6:])
                elif suffix.startswith(("_client.", "_codex._client.")):
                    cls = parent.rsplit(".", 1)[-1]
                    async_client = cls.startswith("Async")
                    targets.append("openai_codex." + ("async_client.AsyncCodexClient." if async_client else "client.CodexClient.") + suffix.rsplit(".", 1)[-1])
                elif "." not in suffix:
                    targets.append(parent + "." + suffix)
            elif isinstance(call.func, ast.Name):
                targets.append(resolve(mod + "." + call.func.id)["target"])
            # Thread-offload wrapper passes sync bound methods as values, not calls.
            for arg in call.args:
                v = expr(arg)
                if v.startswith("self._sync."):
                    targets.append("openai_codex.client.CodexClient." + v[len("self._sync."):])
            known = sorted({x for x in targets if x in definitions})
            edges[ident].update(known)
            d["calls"].append({"callee": callee, "resolved_candidates": known, "source": s.node_span(path, call)})
            if callee in {"self.request", "self.notify", "self._request_raw"} and call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str):
                rpc = call.args[0].value
                d["rpc_direct"].append({"method": rpc, "params_expression": expr(call.args[1]) if len(call.args) > 1 else None,
                                         "keywords": {k.arg or "**": expr(k.value) for k in call.keywords}, "source": s.node_span(path, call)})
    direct = {k: {r["method"] for r in definitions[k]["rpc_direct"]} for k in nodes}
    reachable = {k: set(v) for k, v in direct.items()}
    changed = True
    while changed:
        changed = False
        for k in nodes:
            value = reachable[k] | set().union(*(reachable.get(e, set()) for e in edges[k]))
            if value != reachable[k]:
                reachable[k] = value
                changed = True
    for k in nodes:
        definitions[k]["rpc_reachable"] = sorted(reachable[k])
    root = next(m for m in modules if m["module"] == "openai_codex")
    public_api = []
    for export in root["exports"]:
        target = export["resolved"]["target"]
        definition = definitions.get(target, {})
        members = [d["id"] for d in definitions.values() if d["id"].startswith(target + ".") and
                   (d.get("public_syntax") or "classmethod" in d.get("decorators", []))]
        public_api.append({"name": export["name"], "definition": target, "kind": definition.get("kind"),
                           "members": sorted(members), "fields": [f["name"] for f in definition.get("fields", []) if not f["name"].startswith("_")],
                           "constructor": "SOURCE_DECLARED" if target + ".__init__" in definitions else definition.get("dataclass_constructor") or "INHERITED_OR_LANGUAGE_DEFAULT_OPEN",
                           "binding": export["binding"]})
    return {"modules": modules, "definitions": sorted(definitions.values(), key=lambda x: x["id"]), "root_public_api": public_api}


def manifests_inventory(s, paths):
    purposes = {
        "package.json": "private repository maintenance tools; scripts remain real entrypoints",
        "codex-cli/package.json": "published npm CLI wrapper, native package selector",
        "codex-rs/responses-api-proxy/npm/package.json": "published npm responses proxy wrapper",
        "sdk/typescript/package.json": "published TypeScript SDK, dist output built from src/index.ts",
        "sdk/python/pyproject.toml": "published sync and async Python SDK using typed app-server stdio JSON-RPC",
        "sdk/python-runtime/pyproject.toml": "platform wheel-only native CLI runtime package; custom hatch hook rejects sdist",
        "scripts/pyproject.toml": "developer script environment; no project.scripts table does not imply no CLI tools",
        "scripts/codex_package/smoke_tests/pyproject.toml": "non-package smoke-test environment (tool.uv.package=false); developer validation only",
    }
    result = []
    for path in paths:
        data = json.loads(s.read(path)) if path.endswith(".json") else tomllib.loads(s.read(path))
        result.append({"path": path, "purpose": purposes[path], "manifest": data, "source": s.span(path),
                       "binding": obligation("DX100-Z02", ["CDX100-22-07"], "Release/package/host variants remain NOT_RUN")})
    return result


def ts_inventory(s, baseline):
    path = "sdk/typescript/src/index.ts"
    text = s.read(path)
    out = []
    for block in re.finditer(r'export\s+(type\s+)?\{([^}]+)\}\s+from\s+"(\.[^"]+)"\s*;', text):
        module_path = "sdk/typescript/src/" + block[3].removeprefix("./") + ".ts"
        decl = s.read(module_path)
        for name_match in re.finditer(r'\b(\w+)(?:\s+as\s+(\w+))?\s*(?:,|$)', block[2]):
            original, alias = name_match[1], name_match[2] or name_match[1]
            pattern = r'export\s+(?:declare\s+)?(?:class|type|interface|enum|function|const)\s+' + re.escape(original) + r'\b'
            match = re.search(pattern, decl)
            ensure(match is not None, "TypeScript missing declaration " + original)
            next_match = re.search(r'\nexport\s+', decl[match.end():])
            end = match.end() + next_match.start() if next_match else len(decl)
            b = next((e for e in baseline["exports"] if e["exported_name"] == alias), None)
            ensure(b is not None, "TypeScript export absent from baseline " + alias)
            ensure(b["original_name"] == original and b["type_only"] == bool(block[1]) and b["declaration_source"]["path"] == module_path, "TypeScript binding baseline drift")
            ensure(b["declaration_source"]["sha256"] == sha(decl.encode()), "TypeScript declaration source baseline drift")
            start = block.start(2) + name_match.start(1)
            out.append({"name": alias, "original": original, "type_only": bool(block[1]),
                        "export_source": s.text_span(path, start, start + len(original)),
                        "declaration_source": s.text_span(module_path, match.start(), end),
                        "baseline_record": copy.deepcopy(b),
                        "binding": obligation(b["owner"], [b["requirement"]]),
                        "full_language_behavior_required": True, "parser_limit": "regex binding; baseline TypeScript AST shape preserved without re-executing compiler"})
    ensure(len(out) == 34 and {x["name"] for x in out} == {x["exported_name"] for x in baseline["exports"]}, "TS public34 coverage")
    return out


def utility_inventory(s):
    out = []
    for path in sorted(s.tree):
        if not (path.startswith(("scripts/", "codex-cli/scripts/")) or path in {"sdk/python/scripts/update_sdk_artifacts.py", "sdk/python/_runtime_setup.py", "sdk/python/release_version.py"}):
            continue
        if not path.endswith((".py", ".sh", ".ps1", ".cmd")):
            continue
        text = s.read(path)
        test = "test" in Path(path).stem or "/smoke_tests/" in path or Path(path).name in {"conftest.py", "fixtures.py"}
        packaging = any(word in path for word in ("codex_package/", "build_", "stage_", "install/", "update_sdk_artifacts", "runtime_setup", "release_version"))
        kind = "DEVELOPMENT_TEST_HELPER" if test else "PACKAGING_RELEASE_TOOL" if packaging else "DEVELOPMENT_TOOL"
        options, commands, entry = [], [], []
        if path.endswith(".py"):
            tree = ast.parse(text)
            for node in ast.walk(tree):
                if isinstance(node, ast.If) and "__name__" in expr(node.test) and "__main__" in expr(node.test):
                    entry.append(s.node_span(path, node))
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if node.func.attr in {"add_argument", "add_parser"}:
                        rec = {"arguments": [expr(a) for a in node.args], "keywords": {k.arg or "**": expr(k.value) for k in node.keywords}, "source": s.node_span(path, node)}
                        (options if node.func.attr == "add_argument" else commands).append(rec)
        elif text.startswith("#!") or path.endswith((".ps1", ".cmd", ".sh")):
            entry.append(s.span(path))
        out.append({"path": path, "classification": kind, "entry_guards": entry,
                    "argparse_options": options, "argparse_commands": commands, "source": s.span(path),
                    "user_facing_runtime_api": False, "absence_of_project_scripts_not_absence_of_tools": True,
                    "binding": obligation("DX100-Z02", ["CDX100-22-07"] if packaging else [],
                                          "Developer-only helper; no product parity receipt. Release behavior still requires qualification." if not test else "Development/test source only; not executed")})
    return out


def platform_inventory(s):
    """Retain source conditions rather than executing host platform selectors."""
    path = "sdk/python/_runtime_setup.py"
    tree = ast.parse(s.read(path))
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "platform_asset_name")
    assets = []
    def visit(node, conditions):
        if isinstance(node, ast.If):
            for child in node.body:
                visit(child, conditions + [expr(node.test)])
            for child in node.orelse:
                visit(child, conditions + ["NOT(" + expr(node.test) + ")"])
        elif isinstance(node, ast.Return) and isinstance(node.value, ast.Constant):
            assets.append({"asset": node.value.value, "conditions": conditions, "source": s.node_span(path, node)})
    for n in function.body:
        visit(n, [])
    selectors = []
    for path in ["codex-cli/bin/codex.js", "codex-rs/responses-api-proxy/npm/bin/codex-responses-api-proxy.js", "sdk/typescript/src/exec.ts"]:
        text = s.read(path)
        triples = []
        for match in re.finditer(r'"((?:x86_64|aarch64)-(?:unknown-linux-musl|apple-darwin|pc-windows-msvc))"', text):
            triples.append({"target": match[1], "source": s.text_span(path, match.start(1), match.end(1))})
        cases = []
        for match in re.finditer(r'case\s+"([^"]+)"\s*:', text):
            cases.append({"case": match[1], "source": s.text_span(path, match.start(), match.end())})
        selectors.append({"path": path, "target_occurrences": triples, "distinct_targets": sorted({t["target"] for t in triples}),
                          "switch_cases": cases, "qualification": "NOT_RUN", "source": s.span(path)})
    return {"python_bootstrap_assets": assets, "js_ts_selectors": selectors,
            "runtime_identity": {"sdk_source_project_version": "0.0.0-dev", "runtime_dependency_pin": "0.153.4", "minimum_selected_field_version": "0.151.0",
                                 "git_source_pin": PIN, "binary_payload_authenticated": False, "protocol_runtime_equivalence": "OPEN"}}


def packaging_inventory(s):
    paths = ["codex-cli/scripts/build_npm_package.py", "scripts/codex_package/targets.py",
             "scripts/codex_package/layout.py", "sdk/python/scripts/update_sdk_artifacts.py"]
    out = []
    selected_functions = {"stage_sources", "compute_platform_package_version", "stage_codex_sdk_sources",
                          "stage_python_sdk_package", "stage_python_runtime_package", "_validate_codex_package_layout",
                          "build_package_dir", "prepare_package_dir", "validate_package_dir", "default_target"}
    for path in paths:
        tree = ast.parse(s.read(path))
        constants, functions = [], []
        for node in tree.body:
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for target in targets:
                    if isinstance(target, ast.Name) and target.id.isupper():
                        item = {"name": target.id, "expression": expr(node.value), "source": s.node_span(path, node)}
                        if isinstance(node.value, ast.Dict):
                            item["dictionary_keys"] = [expr(k) for k in node.value.keys]
                        constants.append(item)
            elif isinstance(node, ast.FunctionDef) and node.name in selected_functions:
                functions.append({"name": node.name, "signature": expr(node.args), "returns": expr(node.returns),
                                  "statements": [expr(n) for n in node.body], "source": s.node_span(path, node)})
        out.append({"path": path, "constants": constants, "functions": functions, "source": s.span(path),
                    "binding": obligation("DX100-Z02", ["CDX100-22-07"], "Staged/generated package metadata and payloads remain unexecuted and unauthenticated")})
    return out


def notes_inventory(s):
    specs = [
        ("PY-SYNC-LIFECYCLE", "sdk/python/src/openai_codex/api.py", "class Codex:", "Constructor starts and initializes; Exception failure closes client; context manager closes. Async construction defers initialize under lock; Exception cleanup is explicit, cancellation semantics remain a separate obligation.", "DX100-D01", ["CDX100-09-01", "CDX100-09-05"]),
        ("PY-ASYNC-OFFLOAD", "sdk/python/src/openai_codex/async_client.py", "class AsyncCodexClient:", "Async API offloads sync work to threads; shielded turn start and callbacks handle cancellation; no event-loop equivalence inferred.", "DX100-A01", ["CDX100-08-03", "CDX100-09-05"]),
        ("PY-ROUTING", "sdk/python/src/openai_codex/_message_router.py", "class MessageRouter:", "Turn/login/goal subscriptions, terminal/error transport fanout and cleanup are mandatory independent Python behaviors.", "DX100-A01", ["CDX100-08-05"]),
        ("PY-ERRORS", "sdk/python/src/openai_codex/errors.py", "def map_jsonrpc_error", "Typed standard JSON-RPC code mapping, server range -32099..-32000, overload data and retry-limit text; retryable includes ServerBusyError.", "DX100-D01", ["CDX100-09-05", "CDX100-08-02"]),
        ("PY-RETRY", "sdk/python/src/openai_codex/retry.py", "def retry_on_overload", "Retry budget/backoff defaults and terminal rethrow remain Python obligations; source signature/raises/calls retained.", "DX100-D01", ["CDX100-09-05"]),
        ("PY-CLI-SELECTION", "sdk/python/src/openai_codex/client.py", "def resolve_codex_bin", "Explicit config path existence first; otherwise bundled native runtime; launch_args_override bypasses package resolution; env/PATH and Windows case handling; starts app-server --listen stdio://.", "DX100-Z02", ["CDX100-22-07", "CDX100-08-01"]),
        ("PY-WHEEL", "sdk/python-runtime/hatch_build.py", "class RuntimeBuildHook", "sdist rejected; platform-tag config then CODEX_CLI_BIN_PLATFORM_TAG then packaging.tags.sys_tags. Native py3-none platform wheel, pure_python=false.", "DX100-Z02", ["CDX100-22-07"]),
        ("PY-BUNDLED", "sdk/python-runtime/src/codex_cli_bin/__init__.py", "def bundled_package_dir", "Checks metadata file presence and binary file presence, not payload authenticity or schema equivalence; Windows exe name; optional codex-path.", "DX100-Z02", ["CDX100-22-07"]),
        ("PY-BOOTSTRAP", "sdk/python/_runtime_setup.py", "def pinned_runtime_version", "Runtime dependency pin from source or installed metadata, normalized release version; six OS/arch assets; HTTPS download/fallback, stage and pip install are source-only, never executed here.", "DX100-Z02", ["CDX100-22-07", "CDX100-22-08"]),
        ("PY-VERSION", "sdk/python/src/openai_codex/_version.py", "def package_version", "SDK source project version takes precedence over installed metadata then 0+unknown. Dependency pin 0.153.4 does not establish binary/protocol identity with this Git pin.", "DX100-Z02", ["CDX100-22-07"]),
        ("PY-PROTOCOL-GUARD", "sdk/python/src/openai_codex/_runtime_requirements.py", "MINIMUM_RUNTIME_VERSION", "Selected fields require minimum 0.151.0; alpha hotfix normalized; runtime 0.0.0 inspects checkout experimental schema, custom command cannot verify. Guard is not blanket generated-model compatibility proof.", "DX100-A01", ["CDX100-08-01", "CDX100-08-02"]),
        ("PY-GENERATOR", "sdk/python/scripts/update_sdk_artifacts.py", "def generate_v2_all", "Generator uses normalized aggregate v2 schema, legacy aliases/nullable fixes/open enums; notification registry from ServerNotification. Generation or schema/model semantic equivalence is NOT_RUN.", "DX100-A01", ["CDX100-08-02", "CDX100-09-03"]),
        ("TS-EXEC", "sdk/typescript/src/exec.ts", "export class CodexExec", "TypeScript launches exec --experimental-json, not Python app-server RPC; preserves environment, config overrides, abort/error/child cleanup and platform selection obligations.", "DX100-D01", ["CDX100-09-02", "CDX100-09-05"]),
        ("NPM-CLI", "codex-cli/bin/codex.js", "const PLATFORM_PACKAGE_BY_TARGET", "Six platform packages; linux/android aliases; package vendor fallback; package-manager ownership detection/env, args, signals and exit mirroring are real wrapper behavior.", "DX100-Z02", ["CDX100-22-07"]),
        ("NPM-PROXY", "codex-rs/responses-api-proxy/npm/bin/codex-responses-api-proxy.js", "function determineTargetTriple", "Six target triples; linux/android aliases; vendored proxy selection, unsupported platform error, args, inherited stdio, signals and exit mirroring. No proxy native behavior qualified.", "DX100-Z02", ["CDX100-22-07"]),
        ("NPM-STAGING", "codex-cli/scripts/build_npm_package.py", "def stage_sources", "Checked-in manifests differ from staged release metadata: codex receives six npm alias optionalDependencies; platform artifacts publish under @openai/codex with version suffix, os/cpu/vendor; codex-sdk removes prepare and injects @openai/codex runtime dependency at release version. No staging/build executed.", "DX100-Z02", ["CDX100-22-07"]),
        ("PY-STAGING-LAYOUT", "sdk/python/scripts/update_sdk_artifacts.py", "def _validate_codex_package_layout", "Staging checks codex-package.json, bin/codex-resources/codex-path directories, codex binary and code-mode host file presence. Layout validation is not artifact authentication or protocol equivalence.", "DX100-Z02", ["CDX100-22-07"]),
    ]
    out = []
    for ident, path, anchor, observation, owner, reqs in specs:
        text = s.read(path)
        start = text.index(anchor)
        out.append({"id": ident, "observation": observation, "source": s.text_span(path, start, len(text)), "binding": obligation(owner, reqs, "Language-specific behavior validation remains OPEN")})
    return out


def build(root):
    ensure(file_hash(CONTRACT) == CONTRACT_SHA256, "frozen contract drift")
    s = Sources(root)
    manifests = sorted(x for x in s.tree if Path(x).name in {"package.json", "pyproject.toml"})
    ensure(manifests == EXPECTED, "complete Git manifest census drift")
    baseline = json.loads(BASELINE.read_text())
    catalog = json.loads(CATALOG.read_text())
    py_paths = sorted(x for x in s.tree if x.endswith(".py") and (x.startswith(PYROOT) or x.startswith("sdk/python-runtime/")))
    for path in s.tree:
        if path.startswith("sdk/typescript/src/") and path.endswith(".ts") or path == "sdk/typescript/tsup.config.ts":
            s.read(path)
    py = python_inventory(s, py_paths)
    data = {"schema_version": 1, "task": "DX100-G01:NON-RUST-PUBLIC-SURFACES", "pin": PIN,
            "status": "IMPLEMENTED_PENDING_INDEPENDENT_REVIEW", "functional_receipts": 0,
            "full_g01_closure": False, "full_codex_parity_claim": False,
            "contract_sha256": file_hash(CONTRACT), "baseline_sha256": file_hash(BASELINE),
            "catalog_sha256": file_hash(CATALOG), "parent_goal": {"cards": 49, "families": 22, "functional": 487, "controls": 22},
            "manifest_census": manifests, "manifests": manifests_inventory(s, manifests),
            "python": py, "typescript": ts_inventory(s, baseline),
            "utilities": utility_inventory(s), "behavior_and_provenance": notes_inventory(s),
            "platforms": platform_inventory(s),
            "packaging": packaging_inventory(s),
            "open_contracts": [
                {"id": "GAP-PY-API", "proposed_owner": "DX100-D01", "mandatory": True, "status": "OPEN", "detail": "High-level Python sync/async signatures, context lifecycle, turn handles, login handles, ExternalMessage, retries and errors need language-specific future variants; TS34 is insufficient."},
                {"id": "GAP-PY-RPC", "proposed_owner": "DX100-A01", "mandatory": True, "status": "OPEN", "detail": "Direct and transitive RPC bindings are source partial; generic method names, approvals, goals, subscription races/cancellation, overload and transport failures need concrete oracles."},
                {"id": "GAP-GENERATED", "proposed_owner": "DX100-A01", "mandatory": True, "status": "OPEN", "detail": "All generated classes/fields/aliases/default expressions inventoried; Pydantic runtime behavior/inherited methods, generator normalization and schema equivalence unverified."},
                {"id": "GAP-PROVENANCE", "proposed_owner": "DX100-Z02", "mandatory": True, "status": "OPEN", "detail": "SDK 0.0.0-dev / dependency runtime 0.153.4 / minimum 0.151.0 / Git source pin are different identities; no binary/wheel inspected, downloaded or executed. No manifest-only provenance authentication."},
                {"id": "GAP-TS-LANGUAGE", "proposed_owner": "DX100-D01", "mandatory": True, "status": "OPEN", "detail": "Original 34 AST export records preserved and source-bound; regex binding is not TypeScript typechecking or runtime qualification. Abort/JSONL/exec cleanup variants remain mandatory."},
                {"id": "GAP-PLATFORM-PACKAGING", "proposed_owner": "DX100-Z02", "mandatory": True, "status": "OPEN", "detail": "OS/arch/wheel/package manager/vendor fallback/install/authenticated artifacts and proxy wrapper behavior need functional qualification; developer helpers do not count as product APIs."},
            ], "limits": ["Static source-only evidence; no functional receipts or release approval", "No target imports, execution, compilation, tests, resources, network or installation", "AST signatures/default expressions are syntactic; inherited/generated runtime behavior remains OPEN", "Callgraph uses named receiver heuristics; candidates are not a proof of dynamic dispatch", "Implicit namespace includes imported third-party names; external bindings marked OPEN", "No catalog or shared ledger writes; Lead integrates proposed variants without dropping parent obligations"]}
    for path in ["codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.v2.schemas.json", "codex-rs/app-server-protocol/schema/json/ServerNotification.json"]:
        s.read(path)  # JSON provenance identity only, no Rust inspection
    data["sources"] = sorted(s.index.values(), key=lambda x: x["path"])
    reqs = {r["id"]: r for r in catalog["requirements"]}
    for d in py["definitions"]:
        for rpc in d.get("rpc_direct", []):
            prefix = "ClientNotification" if rpc["method"] == "initialized" else "ClientRequest"
            rid = "CDX100-RPC-" + prefix + "-" + rpc["method"].replace("/", ".")
            rpc["catalog_binding"] = {"requirement": rid if rid in reqs else None, "owner": reqs[rid]["owner"] if rid in reqs else "DX100-A01", "status": "EXISTING_CAPABILITY_LANGUAGE_VARIANT" if rid in reqs else "PROPOSED_MISSING_OBLIGATION", "mandatory": True, "qualification": "NOT_RUN"}
    data["counts"] = {
        "manifests": len(manifests), "sources": len(data["sources"]), "python_modules": len(py["modules"]),
        "python_definitions": len(py["definitions"]), "python_classes": sum(d["kind"] == "class" for d in py["definitions"]),
        "python_methods": sum(d["kind"] == "method" for d in py["definitions"]),
        "python_async_functions_methods": sum(d.get("async_", False) for d in py["definitions"]),
        "python_fields": sum(len(d.get("fields", [])) for d in py["definitions"]),
        "python_root_all": len(next(m for m in py["modules"] if m["module"] == "openai_codex")["explicit_all"]),
        "python_types_all": len(next(m for m in py["modules"] if m["module"] == "openai_codex.types")["explicit_all"]),
        "generated_classes": sum(d["kind"] == "class" and d["module"] == "openai_codex.generated.v2_all" for d in py["definitions"]),
        "lazy_hooks": sum(len(m["lazy_hooks"]) for m in py["modules"]),
        "class_methods": sum(len(m["class_methods"]) for m in py["modules"]),
        "rpc_direct_bindings": sum(len(d.get("rpc_direct", [])) for d in py["definitions"]),
        "rpc_distinct": len({r["method"] for d in py["definitions"] for r in d.get("rpc_direct", [])}),
        "typescript_exports": len(data["typescript"]), "utilities": len(data["utilities"]),
        "utility_options": sum(len(x["argparse_options"]) for x in data["utilities"]),
        "utility_subcommands": sum(len(x["argparse_commands"]) for x in data["utilities"]),
        "open_contracts": len(data["open_contracts"]),
        "python_bootstrap_assets": len(data["platforms"]["python_bootstrap_assets"]),
        "instance_assignments": sum(len(d.get("instance_assignments", [])) for d in py["definitions"]),
        "properties": sum("property" in d.get("decorators", []) for d in py["definitions"]),
        "root_public_member_references": sum(len(d["members"]) for d in py["root_public_api"]),
    }
    validate(data, s, reqs)
    return data, s, reqs


def walk(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)


def validate(data, s, reqs):
    ensure(data["pin"] == PIN and data["manifest_census"] == EXPECTED, "pin or census mismatch")
    ensure(data["functional_receipts"] == 0 and not data["full_g01_closure"] and not data["full_codex_parity_claim"], "false qualification")
    ensure(data["parent_goal"] == {"cards": 49, "families": 22, "functional": 487, "controls": 22}, "parent goal reduction")
    ensure(data["counts"]["typescript_exports"] == 34 and len(data["typescript"]) == 34, "TS baseline export omission")
    assets = data["platforms"]["python_bootstrap_assets"]
    ensure(len(assets) == 6 and len({a["asset"] for a in assets}) == 6, "platform selector omission")
    for selector in data["platforms"]["js_ts_selectors"]:
        ensure(len(selector["distinct_targets"]) == 6, "JS/TS platform target omission")
    ensure(data["platforms"]["runtime_identity"]["binary_payload_authenticated"] is False and data["platforms"]["runtime_identity"]["protocol_runtime_equivalence"] == "OPEN", "false runtime authentication")
    for d in walk(data):
        if "byte_start" in d:
            actual = s.span(d["path"], d["byte_start"], d["byte_end"])
            ensure(d == actual, "UTF8 span/hash/line/blob drift")
        if "language_behavior_required" in d:
            ensure(d["mandatory"] and d["language_behavior_required"] and d["qualification"] == "NOT_RUN" and d["functional_receipts"] == 0, "false language qualification")
            for rid in d["existing_requirements"]:
                ensure(rid in reqs, "unknown capability requirement " + rid)
    mods = {m["module"]: m for m in data["python"]["modules"]}
    root = mods["openai_codex"]
    ensure(set(root["explicit_all"]) == {e["name"] for e in root["exports"]}, "missing Python public export")
    ensure(all(e["resolved"]["status"] == "SOURCE_BOUND" for e in root["exports"]), "unbound root public export")
    defs = {d["id"]: d for d in data["python"]["definitions"]}
    method = defs["openai_codex.api.Codex.thread_start"]
    approval = next(p for p in method["parameters"] if p["name"] == "approval_mode")
    ensure(approval["default"] == "ApprovalMode.auto_review" and not approval["required"], "signature/default guard")
    ensure("thread/start" in method["rpc_reachable"], "method to RPC binding lost")
    ensure(defs["openai_codex.api.AsyncCodex.thread_start"]["async_"], "async surface lost")
    ensure(defs["openai_codex.client.CodexConfig"]["fields"][0]["default"] == "None", "config default guard")
    manifests = {m["path"]: m["manifest"] for m in data["manifests"]}
    ensure(manifests["codex-cli/package.json"]["bin"] == {"codex": "bin/codex.js"}, "CLI entry changed")
    ensure(manifests["sdk/python/pyproject.toml"]["project"]["dependencies"][-1] == "openai-codex-cli-bin==0.153.4", "runtime pin drift")
    ensure(next(n for n in data["behavior_and_provenance"] if n["id"] == "PY-BUNDLED")["observation"].startswith("Checks metadata file presence"), "false runtime provenance")
    platforms = s.read("sdk/python/_runtime_setup.py")
    ensure(len(set(re.findall(r'codex-package-[\w-]+\.tar\.gz', platforms))) == 6, "runtime platform assets omitted")
    ensure(len(data["open_contracts"]) == 6 and all(g["status"] == "OPEN" and g["mandatory"] for g in data["open_contracts"]), "uncovered obligations dropped")


def controls(data, s, reqs):
    cases = []
    def reject(name, mutate):
        d = copy.deepcopy(data)
        mutate(d)
        try:
            validate(d, s, reqs)
            stage = "canonical_reextraction_comparison"
            ensure(d == data, "deterministic re-extraction mismatch")
        except (ValueError, KeyError, StopIteration):
            cases.append({"id": name, "expected": "REJECT", "observed": "REJECT", "mechanism": stage if 'stage' in locals() else "semantic_or_source_identity_invariant"})
        else:
            raise ValueError("negative control accepted: " + name)
    reject("missing-python-export", lambda d: d["python"]["modules"][next(i for i,m in enumerate(d["python"]["modules"]) if m["module"] == "openai_codex")]["exports"].pop())
    reject("missing-typescript-export", lambda d: d["typescript"].pop())
    reject("missing-manifest", lambda d: d["manifest_census"].pop())
    reject("false-functional-receipt", lambda d: d.update(functional_receipts=1))
    reject("false-full-g01", lambda d: d.update(full_g01_closure=True))
    reject("false-parity", lambda d: d.update(full_codex_parity_claim=True))
    reject("parent-denominator-reduction", lambda d: d["parent_goal"].update(functional=485))
    reject("signature-annotation", lambda d: next(x for x in d["python"]["definitions"] if x["id"] == "openai_codex.api.Codex.thread_start")["parameters"][1].update(annotation="str"))
    reject("signature-default", lambda d: next(p for x in d["python"]["definitions"] if x["id"] == "openai_codex.api.Codex.thread_start" for p in x["parameters"] if p["name"] == "approval_mode").update(default="None"))
    reject("entrypoint", lambda d: next(x for x in d["manifests"] if x["path"] == "codex-cli/package.json")["manifest"]["bin"].update(codex="missing.js"))
    reject("runtime-version-pin", lambda d: next(x for x in d["manifests"] if x["path"] == "sdk/python/pyproject.toml")["manifest"]["project"]["dependencies"].pop())
    reject("platform-source-identity", lambda d: next(x for x in d["behavior_and_provenance"] if x["id"] == "PY-BOOTSTRAP")["source"].update(sha256="0"*64))
    reject("platform-asset-missing", lambda d: d["platforms"]["python_bootstrap_assets"].pop())
    reject("platform-condition-wrong", lambda d: d["platforms"]["python_bootstrap_assets"][0].update(conditions=["system == 'linux'", "machine == 'ppc64'"]))
    reject("platform-target-missing", lambda d: d["platforms"]["js_ts_selectors"][0]["distinct_targets"].pop())
    reject("false-payload-authentication", lambda d: d["platforms"]["runtime_identity"].update(binary_payload_authenticated=True))
    reject("false-protocol-equivalence", lambda d: d["platforms"]["runtime_identity"].update(protocol_runtime_equivalence="PASS"))
    reject("false-runtime-provenance", lambda d: next(x for x in d["behavior_and_provenance"] if x["id"] == "PY-BUNDLED").update(observation="Manifest authenticates executable and protocol"))
    reject("rpc-binding", lambda d: next(x for x in d["python"]["definitions"] if x["id"] == "openai_codex.api.Codex.thread_start").update(rpc_reachable=[]))
    reject("async-erasure", lambda d: next(x for x in d["python"]["definitions"] if x["id"] == "openai_codex.api.AsyncCodex.thread_start").update(async_=False))
    reject("generated-field-default", lambda d: next(x for x in d["python"]["definitions"] if x["id"] == "openai_codex.generated.v2_all.AmazonBedrockAccount")["fields"][-1].update(default="True"))
    reject("source-blob", lambda d: d["typescript"][0]["declaration_source"].update(git_blob="0"*40))
    reject("utf8-span", lambda d: d["typescript"][0]["export_source"].update(byte_end=0))
    reject("span-end-line", lambda d: d["typescript"][0]["export_source"].update(line_end=999999))
    reject("language-obligation-dropped", lambda d: d["typescript"][0]["binding"].update(language_behavior_required=False))
    reject("uncovered-contract-dropped", lambda d: d["open_contracts"].pop())
    return cases


def make_manifest():
    return {"schema_version": 1, "task": "DX100-G01:NON-RUST-PUBLIC-SURFACES", "pin": PIN,
            "contract_sha256": file_hash(CONTRACT),
            "files": [{"path": p.name, "bytes": p.stat().st_size, "sha256": file_hash(p)} for p in sorted(HERE.iterdir()) if p.is_file() and p.name != "manifest.json"],
            "self_hash": "External SHA-256; manifest excludes itself"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--check", action="store_true", help="re-extract/compare without writing any file")
    parser.add_argument("--seal", action="store_true", help="seal own files only, after README formatting")
    args = parser.parse_args()
    ensure(not (args.check and args.seal), "--check and --seal are exclusive")
    data, s, reqs = build(args.source)
    negative = controls(data, s, reqs)
    verification = {"task": data["task"], "status": "PASS_STATIC_CHECKS_ONLY", "functional_receipts": 0,
                    "inventory_sha256": sha(encoded(data)), "counts": data["counts"],
                    "checks": ["Git HEAD pin", "full tracked manifest census", "all selected worktree bytes equal Git blobs", "UTF8 byte spans/hash/line identities", "all Python root exports source-bound", "public34 TypeScript baseline records preserved/source-bound", "signatures/defaults and async retained", "method-to-RPC source graph", "capability IDs exist; proposed language variants retained", "no functional qualification", "uncovered contracts remain OPEN"],
                    "negative_controls": negative, "independent_review": "PENDING_PARENT"}
    if args.check:
        ensure((HERE / "inventory.json").read_bytes() == encoded(data), "inventory differs from deterministic extraction")
        ensure((HERE / "verification.json").read_bytes() == encoded(verification), "verification drift")
        ensure(json.loads((HERE / "manifest.json").read_text()) == make_manifest(), "own file manifest drift")
    elif args.seal:
        ensure((HERE / "inventory.json").read_bytes() == encoded(data), "extract before seal")
        (HERE / "manifest.json").write_bytes(encoded(make_manifest()))
    else:
        (HERE / "inventory.json").write_bytes(encoded(data))
        (HERE / "verification.json").write_bytes(encoded(verification))
    print(json.dumps({"status": "PASS_READONLY_CHECK" if args.check else "SEALED" if args.seal else "GENERATED", "counts": data["counts"], "negative_controls_rejected": len(negative), "inventory_sha256": sha(encoded(data)), "contract_sha256": file_hash(CONTRACT)}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, StopIteration) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        sys.exit(1)
