#!/usr/bin/env python3
"""Validate that the optional C1L repair patch is triggered and in-scope."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys


HERE = Path(__file__).resolve().parent
REPAIRABLE_INITIAL_EXITS = {
    "candidate-freeze-initial": 0,
    "candidate-verify-initial": 0,
    "inventory-initial": 1,
    "inventory-semantic-check-initial": 0,
    "focused-tests-initial": 0,
    "full-suite-initial": 0,
    "typecheck-initial": 0,
    "lint-initial": 0,
    "coverage-initial": 0,
    "candidate-postcheck-initial": 0,
}
PRODUCT_ALLOWLIST = {
    "config/workspace-dependency-policy.json",
    "scripts/workspace-dependency-audit.mjs",
    "tests/workspace-dependency-audit.test.js",
}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_repair_patch.py PATCH", file=sys.stderr)
        return 64
    patch_path = Path(sys.argv[1])
    if not patch_path.is_absolute():
        patch_path = HERE.parents[4] / patch_path
    patch_path = patch_path.resolve()
    if not patch_path.is_relative_to(HERE) or not patch_path.is_file():
        print("repair patch is missing or outside the C1L evidence directory", file=sys.stderr)
        return 1

    records = json.loads((HERE / "command-records.json").read_text(encoding="utf-8"))
    by_id = {record.get("id"): record for record in records.get("records", [])}
    missing = sorted(set(REPAIRABLE_INITIAL_EXITS) - set(by_id))
    if missing:
        print(json.dumps({"pass": False, "missing_initial_records": missing}, sort_keys=True))
        return 1
    failures = sorted(
        command_id for command_id, expected_exit in REPAIRABLE_INITIAL_EXITS.items()
        if by_id[command_id].get("actual_exit_code") != expected_exit
    )
    if not failures:
        print(json.dumps({"pass": False, "reason": "no initial product-check failure"}, sort_keys=True))
        return 1

    patch_bytes = patch_path.read_bytes()
    patch_text = patch_bytes.decode("utf-8")
    patch_sha256 = hashlib.sha256(patch_bytes).hexdigest()
    hash_record = by_id.get("repair-01-patch-hash")
    if not hash_record or hash_record.get("actual_exit_code") != 0:
        print(json.dumps({"pass": False, "reason": "repair patch hash was not captured first"}, sort_keys=True))
        return 1
    hash_log = HERE / hash_record["stdout"]["path"]
    hash_match = re.match(r"^([0-9a-f]{64})\s+", hash_log.read_text(encoding="utf-8"))
    if not hash_match or hash_match.group(1) != patch_sha256:
        print(json.dumps({"pass": False, "reason": "captured repair patch hash differs"}, sort_keys=True))
        return 1

    diff_headers = re.findall(r"^diff --git a/(.+) b/(.+)$", patch_text, flags=re.MULTILINE)
    old_paths = re.findall(r"^--- a/(.+)$", patch_text, flags=re.MULTILINE)
    new_paths = re.findall(r"^\+\+\+ b/(.+)$", patch_text, flags=re.MULTILINE)
    touched = sorted({new for _, new in diff_headers})
    invalid_headers = any(old != new for old, new in diff_headers)
    invalid_modes = any(
        marker in patch_text
        for marker in ("GIT binary patch", "new file mode ", "deleted file mode ", "old mode ", "new mode ", "rename from ", "rename to ", "copy from ", "copy to ")
    )
    valid = (
        bool(diff_headers)
        and len(old_paths) == len(diff_headers)
        and len(new_paths) == len(diff_headers)
        and old_paths == [old for old, _ in diff_headers]
        and new_paths == [new for _, new in diff_headers]
        and all(old == new for old, new in diff_headers)
        and set(touched) <= PRODUCT_ALLOWLIST
        and not invalid_headers
        and not invalid_modes
    )
    result = {
        "pass": valid,
        "patch_sha256": patch_sha256,
        "observed_initial_failures": failures,
        "touched_paths": touched,
        "out_of_scope_paths": sorted(set(touched) - PRODUCT_ALLOWLIST),
        "mode_or_binary_change": invalid_modes,
    }
    print(json.dumps(result, sort_keys=True))
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
