#!/usr/bin/env python3
"""AAA-04 documentary validation: structural completeness, traceability and a
hash-binding negative demonstration.

Read-only except for a temporary copy under /tmp/opencode used to demonstrate
that a byte change invalidates a recorded artifact hash.
"""
import hashlib
import json
import pathlib
import shutil
import tempfile

ROOT = pathlib.Path("/home/ricardo/cvg-agent-secretary-v2")
EVID = ROOT / "docs/04_audit/evidence/AAA/AAA-04"
REQUIRED_FIELDS = [
    "id", "area", "dimension", "invariant", "criticality", "mandatory",
    "boundary", "testMethod", "sample", "environment", "limitations",
    "evidence", "rejectedCase", "closure", "revalidation",
]
failures = []


def check(condition, label):
    print(f"{'PASS' if condition else 'FAIL'} {label}")
    if not condition:
        failures.append(label)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


bar = json.loads((EVID / "quality-bar.json").read_text())
manifest = json.loads((EVID / "manifest.json").read_text())
protocol = json.loads((EVID / "comparator-protocol.json").read_text())

check(bar["barVersion"] == "v2", "bar version v2")
check(bar["targetPerArea"] == 97, "target >=97 per area")
check(bar["areas"] == 20, "20 areas")
check(len(bar["criteria"]) == 80, "80 criteria")
check(bar.get("coverageTargets", {}).get("statements") == 90, "coverage floor statements 90")
check(bar.get("coverageTargets", {}).get("branches") == 85, "coverage floor branches 85")
check(bar.get("coverageTargets", {}).get("criticalBranches") == 95, "critical branches 95")
check(bar.get("coverageTargets", {}).get("mutationDetection") == 1.0, "mutation detection 100%")
check(bar.get("performanceProposals", {}).get("p95PersistenceMs") == 2000, "p95 persistence proposal 2000ms")
check(bar.get("performanceProposals", {}).get("ackP95Ms") == 10000, "ack proposal 10000ms")
check(
    bar.get("performanceProposals", {}).get("status") == "PROPOSED_NOT_APPROVED_D03",
    "performance proposals labeled not approved",
)
ids = [c["id"] for c in bar["criteria"]]
check(len(ids) == len(set(ids)), "unique criterion ids")
areas = sorted({c["area"] for c in bar["criteria"]})
check(areas == [f"A{i:02d}" for i in range(1, 21)], "areas A01..A20 present")

for criterion in bar["criteria"]:
    missing = [f for f in REQUIRED_FIELDS if f not in criterion]
    check(not missing, f"{criterion['id']} has all required fields")
    check(criterion["criticality"] in ("BLOCKING", "HIGH", "MEDIUM"), f"{criterion['id']} criticality valid")
    check(isinstance(criterion["mandatory"], bool), f"{criterion['id']} mandatory boolean")
    if criterion["criticality"] in ("BLOCKING", "HIGH"):
        check(criterion["mandatory"] is True, f"{criterion['id']} blocking/high is mandatory")
    for field in ("invariant", "boundary", "testMethod", "sample", "environment",
                  "limitations", "evidence", "rejectedCase", "closure", "revalidation"):
        check(bool(str(criterion[field]).strip()), f"{criterion['id']} {field} non-empty")

for area in areas:
    blocking_or_high = [c for c in bar["criteria"] if c["area"] == area and c["criticality"] in ("BLOCKING", "HIGH")]
    check(len(blocking_or_high) >= 1, f"{area} has at least one BLOCKING/HIGH criterion")

# Traceability: findings explicitly covered by the bar text.
contract = (ROOT / "docs/02_spec/aaa_quality_contract.md").read_text()
for finding in ("F11", "F12", "F14"):
    check(finding in contract or finding in json.dumps(bar), f"finding {finding} traceable")

# Artifact hashes recorded in the manifest match current bytes.
for artifact in manifest["artifacts"]:
    if artifact["sha256"] is None:
        continue
    path = ROOT / artifact["path"]
    check(path.exists(), f"artifact exists: {artifact['path']}")
    if path.exists():
        check(sha256(path) == artifact["sha256"], f"artifact hash matches: {artifact['path']}")

# Comparator protocol frozen before any holdout.
check(protocol["frozenBeforeHoldout"] is True, "protocol frozen before holdout")
check(protocol["partitions"]["holdout"]["content"].startswith("NOT CREATED"), "holdout not created yet")
metric_ids = {m["id"] for m in protocol["metrics"]}
for metric in ("task_success_rate", "forbidden_action_rate", "latency_p95_ms", "cost_usd_per_task"):
    check(metric in metric_ids, f"metric frozen: {metric}")

# Negative demonstration: a byte change after recording invalidates the hash.
with tempfile.TemporaryDirectory() as tmp:
    copy = pathlib.Path(tmp) / "quality-bar.json"
    shutil.copy2(EVID / "quality-bar.json", copy)
    original = sha256(copy)
    payload = json.loads(copy.read_text())
    payload["criteria"][0]["invariant"] += " MUTATED"
    copy.write_text(json.dumps(payload))
    mutated = sha256(copy)
    check(original != mutated, "N1-style mutation changes artifact hash (qualification would be denied)")

print()
print(f"failures: {len(failures)}")
if failures:
    raise SystemExit(1)
print("AAA-04 documentary validation PASS (structural + hash binding)")
