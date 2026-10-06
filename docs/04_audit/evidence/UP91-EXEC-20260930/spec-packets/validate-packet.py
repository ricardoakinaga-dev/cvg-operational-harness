"""Read-only T1 packet validation; no product/runtime execution or approval."""

import hashlib
import json
import re
from pathlib import Path

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[4]
DOCS = [
    "docs/02_spec/0166_governed_context_response_budget.md",
    "docs/02_spec/0167_policy_prompt_approval_knowledge_audit.md",
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def sections(document):
    content = (ROOT / document).read_text(encoding="utf-8")
    matches = list(re.finditer(r"^## (.+)$", content, re.MULTILINE))
    result = {"PREAMBLE": content[: matches[0].start()]}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        result[match.group(1)] = content[match.start() : end]
    return result


def module_candidate(module, document):
    parts = sections(document)
    selected = [{"heading": "PREAMBLE", "text": parts["PREAMBLE"]}]
    for heading, text in parts.items():
        if heading == "PREAMBLE":
            continue
        if heading.startswith("Módulo UP91-") and not heading.startswith(
            f"Módulo {module} "
        ):
            continue
        selected.append({"heading": heading, "text": text})
    return {"module": module, "document": document, "parts": selected}


def candidate_bytes(candidate):
    return json.dumps(
        candidate, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def validate():
    errors = []
    source_manifest = json.loads((PACKET / "source-manifest.json").read_text())
    module_manifest = json.loads((PACKET / "module-manifest.json").read_text())
    source_drift = []
    for record in source_manifest["files"]:
        path = ROOT / record["path"]
        if not path.is_file():
            errors.append(f"missing source: {record['path']}")
            continue
        actual = sha(path.read_bytes())
        if actual != record["sha256"]:
            source_drift.append(
                {"path": record["path"], "expected": record["sha256"], "actual": actual}
            )
            if record["kind"] == "code":
                errors.append(f"analyzed code drift: {record['path']}")
    for document in module_manifest["documents"]:
        actual = sha((ROOT / document["path"]).read_bytes())
        if actual != document["sha256"]:
            errors.append(f"document hash mismatch: {document['path']}")
    if len(module_manifest["modules"]) != 8:
        errors.append("expected eight modules")
    for module in module_manifest["modules"]:
        candidate = module_candidate(module["id"], module["document"])
        if sha(candidate_bytes(candidate)) != module["sha256"]:
            errors.append(f"module hash mismatch: {module['id']}")
        if module["status"] != "REREVIEW_PENDING" or module["buildAuthorized"]:
            errors.append(f"unexpected authority: {module['id']}")
    freeze = json.loads((PACKET / "module012-freeze.json").read_text())
    frozen_candidate = json.loads((PACKET / freeze["candidateFile"]).read_text())
    if sha(candidate_bytes(frozen_candidate)) != freeze["sha256"]:
        errors.append("012 frozen candidate hash mismatch")
    if sha((PACKET / freeze["candidateFile"]).read_bytes()) != freeze["candidateFileSha256"]:
        errors.append("012 frozen container hash mismatch")
    current_012 = module_candidate("UP91-012", DOCS[1])
    if sha(candidate_bytes(current_012)) != freeze["sha256"]:
        errors.append("012 normative/common parts changed after freeze; reissue required")
    source_file = PACKET / freeze["sealedSourcesFile"]
    if sha(source_file.read_bytes()) != freeze["sealedSourcesFileSha256"]:
        errors.append("012 sealed source container hash mismatch")
    sealed = json.loads(source_file.read_text())
    expected_sources = {record["path"]: record["sha256"] for record in freeze["sources"]}
    if len(sealed["sources"]) != len(expected_sources):
        errors.append("012 sealed source count mismatch")
    for record in sealed["sources"]:
        if sha(record["content"].encode("utf-8")) != expected_sources.get(record["path"]):
            errors.append(f"012 sealed source bytes mismatch: {record['path']}")
        if sha((ROOT / record["path"]).read_bytes()) != expected_sources.get(record["path"]):
            errors.append(f"012 current source drift: {record['path']}")
    for name in ("spec-review-initial.json", "policy-review-initial.json"):
        if (PACKET / "initial-evidence" / name).read_bytes() != (PACKET.parent / name).read_bytes():
            errors.append(f"initial review changed: {name}")
    selected_path = PACKET / freeze["selectedPayloadFile"]
    if sha(selected_path.read_bytes()) != freeze["selectedPayloadFileSha256"]:
        errors.append("012 selected_payload container hash mismatch")
    selected = json.loads(selected_path.read_text())
    if sha(candidate_bytes(selected["selectedCandidate"])) != freeze["sha256"]:
        errors.append("012 selected_payload normative hash mismatch")
    if selected["sources"]["sha256"] != freeze["sealedSourcesFileSha256"]:
        errors.append("012 selected_payload source binding mismatch")
    if selected["sources"]["count"] != len(sealed["sources"]):
        errors.append("012 selected_payload source count mismatch")
    if [x["module"] for x in selected["finalIntegrationDependencies"]] != ["UP91-014"]:
        errors.append("012 final integration dependency missing")
    if freeze["closeableWithoutFinalIntegration"] or selected["buildAuthorized"]:
        errors.append("012 unexpected closure/BUILD authority")
    graph = {}
    for edge in selected["dependencyEdges"]:
        graph.setdefault(edge["from"], []).append(edge["to"])
    visited, active = set(), set()
    def visit(node):
        if node in active:
            errors.append("012 dependency cycle")
            return
        if node in visited:
            return
        active.add(node)
        for target in graph.get(node, []):
            visit(target)
        active.remove(node)
        visited.add(node)
    for node in graph:
        visit(node)
    references = 0
    markdown_files = [ROOT / path for path in DOCS] + sorted(PACKET.glob("*.md"))
    for file in markdown_files:
        content = file.read_text(encoding="utf-8")
        table_columns = None
        for line_number, text in enumerate(content.splitlines(), 1):
            if text.startswith("|"):
                columns = len(re.split(r"(?<!\\)\|", text)) - 2
                if table_columns is None:
                    table_columns = columns
                elif columns != table_columns:
                    errors.append(f"malformed table in {file.name}:{line_number}: {columns} columns vs {table_columns}")
                for code_span in re.findall(r"`([^`]+)`", text):
                    if re.search(r"(?<!\\)\|", code_span):
                        errors.append(f"unescaped enum pipe in {file.name}:{line_number}")
            else:
                table_columns = None
            if text.rstrip(" \t") != text:
                errors.append(f"trailing whitespace in {file.name}:{line_number}")
            if re.match(r"^(<{7}|={7}|>{7})", text):
                errors.append(f"conflict marker in {file.name}:{line_number}")
        for destination in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)", content):
            if "://" in destination or destination.startswith("#"):
                continue
            location = destination.split("#", 1)[0]
            match = re.search(r":([1-9][0-9]*)$", location)
            line = int(match.group(1)) if match else None
            if match:
                location = location[: match.start()]
            target = (file.parent / location).resolve()
            if not target.is_file():
                errors.append(f"missing linked file in {file.name}: {destination}")
            elif line and line > len(target.read_text(encoding="utf-8").splitlines()):
                errors.append(f"line out of range in {file.name}: {destination}")
            references += 1
        pending_marker = "REVIEW_PENDING" in content
        if file.name == "human-review-batch-v1.md":
            # This new readable cover is frozen with the human request. Validate
            # its explicit pending wording against the sealed normative packet
            # and request metadata instead of editing bytes already under review.
            packet_file = PACKET / "human-review-batch-v1.json"
            request = json.loads((PACKET / "human-review-batch-v1-request.json").read_text())
            batch = json.loads(packet_file.read_text())
            wanted = ["UP91-009", "UP91-010", "UP91-011", "UP91-013", "UP91-014", "UP91-015", "UP91-016"]
            pending_marker = (
                "decisão estiver pendente" in content
                and request["response"] == "PENDING"
                and request["buildAuthorized"] is False
                and request["scope"] == wanted
                and sha(packet_file.read_bytes()) == request["packetSha256"]
                and request["packetSha256"] in content
                and batch["kind"] == "EXPLICIT_MODULAR_T3_REVIEW_CANDIDATE"
                and [record["id"] for record in batch["selectedModules"]] == wanted
            )
            for record in batch["selectedModules"]:
                current = module_candidate(record["id"], record["normativeCandidate"]["document"])
                if (
                    candidate_bytes(current) != candidate_bytes(record["normativeCandidate"])
                    or sha(candidate_bytes(current)) != record["modularSha256"]
                    or sha((ROOT / current["document"]).read_bytes()) != record["documentSha256"]
                ):
                    errors.append(f"human review batch normative mismatch: {record['id']}")
        if not pending_marker or "BUILD_NOT_AUTHORIZED" not in content:
            errors.append(f"authority markers missing: {file.name}")
    for file in PACKET.glob("*.json"):
        json.loads(file.read_text(encoding="utf-8"))
    result = {
        "status": "PASS" if not errors else "FAIL",
        "scope": "T1 static document/hash/path validation only",
        "sources": len(source_manifest["files"]),
        "modules": len(module_manifest["modules"]),
        "linkedReferences": references,
        "untrackedMarkdownWhitespace": "PASS" if not errors else "FAIL",
        "sourceDrift": source_drift,
        "errors": errors,
        "behavioralTests": "NOT_RUN",
        "independentReview": "REREVIEW_PENDING",
        "humanReview": "PENDING",
        "frozen012Sha256": freeze["sha256"],
        "sealed012Sources": len(sealed["sources"]),
        "selectedPayloadSha256": freeze["selectedPayloadFileSha256"],
        "dependencyGraph": "ACYCLIC" if not errors else "FAIL",
        "finalIntegration": "PENDING_014",
        "tableShapes": "PASS" if not errors else "FAIL",
        "buildAuthorized": False,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(validate())
