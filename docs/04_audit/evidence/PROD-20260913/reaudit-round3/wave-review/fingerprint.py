#!/usr/bin/env python3
"""Independent fingerprint of product/config/test source bytes.

Enumerates tracked+untracked non-ignored files via git, keeps source-like
paths, sha256-hashes each, computes an aggregate over the sorted
"sha256  path" lines. Output JSON: {aggregate_sha256, count, files}.
"""
import hashlib
import json
import subprocess
import sys

ROOT = "/home/ricardo/cvg-agent-secretary-v2"
EXCLUDE_SEGMENTS = {"node_modules", "dist", "coverage", "test-results", ".git",
                    "playwright-report", ".next", "build"}
EXCLUDE_TOP = {"certification"}

TOP_INCLUDE = {"apps", "packages", "tests", "scripts", "deploy"}
NAME_INCLUDE = {"package.json", "package-lock.json", "Dockerfile",
                "eslint.config.js", ".eslintrc.json", ".eslintrc.js",
                ".eslintrc.cjs"}
PREFIX_INCLUDE = ("tsconfig",)
EXT_INCLUDE = (".mts", ".cts")


def included(path: str) -> bool:
    parts = path.split("/")
    if parts[0] in EXCLUDE_TOP:
        return False
    if any(p in EXCLUDE_SEGMENTS for p in parts):
        return False
    if parts[0] in TOP_INCLUDE:
        return True
    name = parts[-1]
    if name in NAME_INCLUDE:
        return True
    if name.startswith(PREFIX_INCLUDE) and name.endswith((".json", ".js", ".mjs",
                                                         ".cjs", ".ts")):
        return True
    if name.endswith(EXT_INCLUDE):
        return True
    return False


def main() -> int:
    out_path = sys.argv[1]
    listing = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    paths = sorted({p for p in listing if p and included(p)})
    files = {}
    for p in paths:
        h = hashlib.sha256()
        with open(f"{ROOT}/{p}", "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        files[p] = h.hexdigest()
    lines = [f"{files[p]}  {p}" for p in sorted(files)]
    aggregate = hashlib.sha256("\n".join(lines).encode()).hexdigest()
    payload = {
        "root": ROOT,
        "aggregate_sha256": aggregate,
        "count": len(files),
        "listing_command": "git ls-files -co --exclude-standard",
        "include_rule": ("top-level dirs apps/packages/tests/scripts/deploy; "
                         "package.json/package-lock.json/Dockerfile/"
                         "eslint.config.js; tsconfig*; *.mts; excluding "
                         "node_modules/dist/coverage/test-results and "
                         "certification/*"),
        "files": files,
    }
    with open(out_path, "w") as fh:
        json.dump(payload, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"count={len(files)} aggregate={aggregate}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
