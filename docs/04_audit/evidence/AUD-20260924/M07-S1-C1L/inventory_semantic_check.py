#!/usr/bin/env python3
"""Check that a C1L inventory report is complete and bound to its candidate."""

from __future__ import annotations

import json
from pathlib import Path
import sys


EXPECTED_ADDITIONS = sorted([
    "config/workspace-dependency-policy.json",
    "packages/conversation/src/__tests__/postgres-store.unit.test.ts",
    "scripts/workspace-dependency-audit.mjs",
    "tests/workspace-dependency-audit.test.js",
])


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: inventory_semantic_check.py CANDIDATE REPORT", file=sys.stderr)
        return 64
    candidate = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    report = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    additions = sorted(item["path"] for item in candidate["approved_additions"])
    report_additions = sorted(item["path"] for item in report["candidate"]["approvedAdditionalPaths"])
    codes = [item["code"] for item in report["report"]["findings"]]
    actual = {
        "candidate_fingerprint": candidate["candidate_fingerprint_sha256"],
        "report_fingerprint": report["candidate"]["fingerprint"],
        "candidate_input_count": len(candidate["candidate_input_manifest"]),
        "candidate_hash_count": candidate["workspace_summary"]["hashed_input_count"],
        "approved_additions": additions,
        "report_additions": report_additions,
        "inventory_exit": report["result"]["exitCode"],
        "inventory_status": report["result"]["status"],
        "inventory_complete": report["result"]["inventoryComplete"],
        "gaps": report["report"]["coverage"]["gaps"],
        "unresolved": report["result"]["unresolved"],
        "violations": report["result"]["violations"],
        "category_mismatch": codes.count("DEPENDENCY_CATEGORY_MISMATCH"),
        "missing_direct": codes.count("MISSING_DIRECT_DEPENDENCY"),
        "toolchain": candidate["toolchain"],
    }
    ok = (
        actual["candidate_fingerprint"] == actual["report_fingerprint"]
        and actual["candidate_input_count"] == 977
        and actual["candidate_hash_count"] == 977
        and additions == EXPECTED_ADDITIONS
        and report_additions == EXPECTED_ADDITIONS
        and actual["inventory_exit"] == 1
        and actual["inventory_status"] == "VIOLATION"
        and actual["inventory_complete"] is True
        and actual["gaps"] == []
        and actual["unresolved"] == 0
        and actual["violations"] == 11
        and actual["category_mismatch"] == 9
        and actual["missing_direct"] == 2
        and actual["toolchain"] == {"node": "v22.23.2", "typescript": "6.0.3", "npm": "10.9.8"}
    )
    print(json.dumps({"actual": actual, "pass": ok}, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
