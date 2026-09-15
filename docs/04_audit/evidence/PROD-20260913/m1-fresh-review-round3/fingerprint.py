import hashlib, json, os, sys, io

REPO = "/home/ricardo/cvg-agent-secretary-v2"
MANIFEST = os.path.join(REPO, "docs/04_audit/evidence/PROD-20260913/reaudit-round2/manifest.json")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opencode/critic3/fingerprint-before.json"

with open(MANIFEST) as f:
    m = json.load(f)
files = m["sourceRevalidation"]["files"]

results = {}
mismatch = []
missing = []
for entry in files:
    p = entry["path"]
    full = os.path.join(REPO, p)
    if not os.path.exists(full):
        missing.append(p)
        continue
    h = hashlib.sha256()
    with open(full, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    actual = h.hexdigest()
    results[p] = actual
    if actual != entry["sha256"]:
        mismatch.append({"path": p, "expected": entry["sha256"], "actual": actual})

agg = hashlib.sha256()
for p in sorted(results):
    agg.update(p.encode())
    agg.update(results[p].encode())
out = {
    "count_listed": len(files),
    "count_hashed": len(results),
    "aggregate_sha256": agg.hexdigest(),
    "missing": missing,
    "mismatch_count": len(mismatch),
    "mismatch": mismatch,
    "hashes": results,
}
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print("listed:", out["count_listed"], "hashed:", out["count_hashed"], "missing:", len(missing), "mismatch:", len(mismatch))
print("aggregate:", agg.hexdigest())
for mm in mismatch:
    print("MISMATCH:", mm["path"])
