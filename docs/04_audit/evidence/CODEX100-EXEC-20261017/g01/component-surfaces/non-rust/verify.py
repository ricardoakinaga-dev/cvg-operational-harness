#!/usr/bin/env python3
"""Independent stdlib byte/span verifier for this evidence lane; read-only."""
import argparse
import bisect
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
PIN = "8d9f6466ff0294785d56f55b1fe363d132fe4133"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def walk(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("/tmp/cvg-rea-codex-20261017/upstream"))
    args = parser.parse_args()
    inv = json.loads((HERE / "inventory.json").read_text())
    manifest = json.loads((HERE / "manifest.json").read_text())
    require(inv["pin"] == PIN and inv["functional_receipts"] == 0 and inv["full_g01_closure"] is False, "qualification/pin")
    require(sha((HERE.parent / "non-rust-contract.json").read_bytes()) == inv["contract_sha256"] == manifest["contract_sha256"], "contract identity")
    actual_files = sorted(p.name for p in HERE.iterdir() if p.is_file() and p.name != "manifest.json")
    require(actual_files == sorted(x["path"] for x in manifest["files"]), "manifest completeness")
    for f in manifest["files"]:
        require(Path(f["path"]).name == f["path"], "manifest path escape")
        raw = (HERE / f["path"]).read_bytes()
        require(len(raw) == f["bytes"] and sha(raw) == f["sha256"], "artifact identity: " + f["path"])
    git_head = subprocess.check_output(["git", "-C", str(args.source), "rev-parse", "HEAD"], text=True).strip()
    require(git_head == PIN, "HEAD drift")
    tree_raw = subprocess.check_output(["git", "-C", str(args.source), "ls-tree", "-rz", PIN])
    tree = {}
    for item in tree_raw.split(b"\0"):
        if item:
            info, path = item.split(b"\t", 1)
            mode, kind, blob = info.decode().split()
            if kind == "blob":
                tree[path.decode()] = (mode, blob)
    census = sorted(p for p in tree if Path(p).name in {"package.json", "pyproject.toml"})
    require(census == inv["manifest_census"] and len(census) == 8, "manifest census")
    cache, linefeeds = {}, {}
    for f in inv["sources"]:
        path = f["path"]
        raw = (args.source / path).read_bytes()
        raw.decode("utf-8")
        blob = hashlib.sha1(b"blob %d\0" % len(raw) + raw).hexdigest()
        require(tree[path] == (f["mode"], blob) and blob == f["git_blob"], "Git blob identity: " + path)
        require(len(raw) == f["bytes"] and sha(raw) == f["sha256"], "source hash: " + path)
        cache[path] = raw
        linefeeds[path] = [i for i, b in enumerate(raw) if b == 10]
    spans = 0
    for value in walk(inv):
        if "byte_start" not in value:
            continue
        raw = cache[value["path"]]
        start, end = value["byte_start"], value["byte_end"]
        require(0 <= start < end <= len(raw), "span bounds")
        raw[start:end].decode("utf-8")
        require(sha(raw[start:end]) == value["sha256"] and tree[value["path"]][1] == value["git_blob"], "span identity")
        lf = linefeeds[value["path"]]
        require(value["line_start"] == bisect.bisect_left(lf, start) + 1, "span start line")
        require(value["line_end"] == bisect.bisect_left(lf, end) + (0 if raw[end - 1:end] == b"\n" else 1), "span end line")
        spans += 1
    require(len(inv["typescript"]) == 34, "TS public count")
    repo = HERE.parents[6]
    baseline_path = HERE.parents[1] / "sdk-public-inventory.json"
    baseline = json.loads(baseline_path.read_text())
    require(sha(baseline_path.read_bytes()) == inv["baseline_sha256"], "baseline file identity")
    original = {r["exported_name"]: r for r in baseline["exports"]}
    for export in inv["typescript"]:
        require(export["baseline_record"] == original[export["name"]], "baseline record not preserved")
    require(sha((repo / "docs/03_build/tracking/codex100_catalog_v1.json").read_bytes()) == inv["catalog_sha256"], "readonly catalog drift")
    print(json.dumps({"status": "PASS_INDEPENDENT_BYTE_ALGORITHM_ONLY", "artifacts": len(manifest["files"]),
                      "sources": len(cache), "span_occurrences": spans, "typescript_baseline_records": 34,
                      "functional_receipts": 0, "independent_critic": "PENDING_PARENT", "inventory_sha256": sha((HERE / "inventory.json").read_bytes()),
                      "manifest_sha256": sha((HERE / "manifest.json").read_bytes())}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        sys.exit(1)
