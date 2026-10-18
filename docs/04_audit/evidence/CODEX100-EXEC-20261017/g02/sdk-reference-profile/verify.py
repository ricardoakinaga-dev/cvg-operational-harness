"""Read-only static checks for the SDK reference HOW. Never imports a target."""
from pathlib import Path
import hashlib
import json
import re
import sys
import tomllib
from datetime import datetime, timezone

P = Path(__file__).resolve().parent
R = P.parents[5]
E = P.parents[1]


def read(name):
    return json.loads((P / name).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


checks = []


def check(name, fn):
    try:
        detail = fn()
        checks.append({"id": name, "status": "PASS", "detail": detail})
    except Exception as exc:
        checks.append({"id": name, "status": "FAIL", "detail": repr(exc)})


def sources():
    j = read("source-inputs.json")
    assert j["count"] == len(j["inputs"]) == 39
    for x in j["inputs"]:
        p = P / x["snapshot"]
        b = p.read_bytes()
        if x.get("snapshot_encoding") == "EMPTY_GIT_BLOB_JSON":
            record = json.loads(b)
            assert record["kind"] == "EMPTY_GIT_BLOB_REPRESENTATION"
            b = record["decoded_content_utf8"].encode()
            assert b == b"" and record["sha256"] == x["sha256"]
        assert len(b) == x["bytes"] and hashlib.sha256(b).hexdigest() == x["sha256"], x
        oid = hashlib.sha1(b"blob " + str(x["bytes"]).encode() + b"\0" + b).hexdigest()
        assert oid == x["git_blob"], x
    return "39 snapshots recomputed: bytes, SHA256 and Git blob OID."


def dependencies():
    j = read("dependency-proposal.json")
    lock = tomllib.loads((P / "inputs/sdk/python/uv.lock").read_text())
    packages = {x["name"]: x for x in lock["package"]}
    assert j["count"] == len(j["artifacts"]) == 7
    py = [x for x in j["artifacts"] if x["name"] != "typescript"]
    for x in py:
        pkg = packages[x["name"]]
        assert pkg["version"] == x["version"]
        found = [w for w in pkg["wheels"] if w["url"] == x["artifact_url"]]
        assert len(found) == 1
        assert found[0]["hash"] == "sha256:" + x["expected_sha256"]
        assert found[0]["size"] == x["expected_bytes"]
        assert sorted(x["dependencies"]) == sorted(d["name"] for d in pkg.get("dependencies", []))
    assert set(d for x in py for d in x["dependencies"]) <= set(x["name"] for x in py)
    ts = next(x for x in j["artifacts"] if x["name"] == "typescript")
    locktext = (P / "inputs/pnpm-lock.yaml").read_text()
    match = re.search(r"^  typescript@5\.9\.2:\n    resolution: \{integrity: ([^}]+)\}", locktext, re.M)
    assert match.group(1) == ts["expected_integrity"]
    assert j["python_artifact_total_bytes"] == sum(x["expected_bytes"] for x in py)
    return "Six exact wheel selections and their dependency closure + TS5.9.2 SHA512 lock binding; no download."


def cases():
    cs = read("cases.json")["cases"]
    cov = read("coverage.json")
    assert len(cs) == 19 and len({c["id"] for c in cs}) == 19
    assert len(cov["rows"]) == cov["source_contract_count"] == 44
    ids = {r["source_contract"] for r in cov["rows"]}
    for c in cs:
        assert set(c["contracts"]) <= ids
        assert c["receipt"] is None and c["runtime_status"] == "NOT_RUN"
        assert all(c[k] for k in ["action", "expected_observation", "known_bad_observation_to_reject", "cutpoint"])
    for r in cov["rows"]:
        assert not r["whole_requirement_covered"]
        assert r["selected_case_ids"] == [c["id"] for c in cs if r["source_contract"] in c["contracts"]]
    return "19 proposed cases join 44 retained contracts; none observed/qualified. This checks structure, not SDK semantics."


def old_inputs():
    baseline = json.loads((E / "checkpoint-before-sdk-reference-profile-manifest.json").read_text())
    allowed = {".agent/plans/codex100-exec-20261017.md", "docs/03_build/0386_backlog_paridade_codex.md",
               "docs/08_runtime/handoffs/codex100_exec_20261017.md"}
    allowed |= {str((E / n).relative_to(R)) for n in ["state.json", "continuation.json", "execution-log.jsonl"]}
    same, changed = 0, []
    for x in baseline["files"]:
        p = R / x["path"]
        if p.stat().st_size == x["bytes"] and digest(p) == x["sha256"]:
            same += 1
        else:
            assert x["path"] in allowed, x["path"]
            changed.append(x["path"])
    assert same + len(changed) == 2807
    return {"unchanged": same, "own_continuity_changed": changed, "other_changes": 0}


def links_and_json():
    parsed = 0
    for p in P.glob("*.json"):
        json.loads(p.read_text())
        parsed += 1
    links = 0
    for p in P.glob("*.md"):
        for raw in re.findall(r"\]\(([^)]+)\)", p.read_text()):
            if raw.startswith(("https:", "http:", "#")):
                continue
            dst = raw.split("#", 1)[0]
            assert (p.parent / dst).exists(), (p.name, dst)
            links += 1
    assert not any(p.stat().st_size == 0 for p in P.rglob("*") if p.is_file())
    return {"JSON_parsed": parsed, "local_links": links, "empty_files": 0}


def freeze():
    fs = sorted(P.glob("review-freeze-r*.json"))
    if not fs:
        return "No review freeze yet; review readiness is NOT asserted by this static procedure."
    f = fs[-1]
    j = json.loads(f.read_text())
    for x in j["files"]:
        p = P / x["path"]
        assert p.stat().st_size == x["bytes"] and digest(p) == x["sha256"], x["path"]
    return {"freeze": f.name, "inputs_intact": len(j["files"])}


for name, fn in [("SOURCE_SNAPSHOTS", sources), ("LOCK_BINDINGS", dependencies),
                 ("CASE_COVERAGE_STRUCTURE", cases), ("PREVIOUS_CHECKPOINT", old_inputs),
                 ("LINKS_JSON_HYGIENE", links_and_json), ("REVIEW_SUBJECT_INTEGRITY", freeze)]:
    check(name, fn)
out = {"kind": "EXECUTED_READONLY_STATIC_CHECKS_NOT_SDK_TESTS", "observed_at": datetime.now(timezone.utc).isoformat(),
       "checks": checks, "passed": sum(c["status"] == "PASS" for c in checks),
       "failed": sum(c["status"] == "FAIL" for c in checks), "SDK_runtime": "NOT_RUN", "functional_receipts": 0}
print(json.dumps(out, ensure_ascii=False, indent=2))
sys.exit(1 if out["failed"] else 0)
