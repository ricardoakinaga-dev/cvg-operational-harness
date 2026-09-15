#!/usr/bin/env bash
# P2-B rebind: current tree vs frozen candidate 328d6a38 (round-5 snapshot list).
set -u
W=/tmp/opencode/p2b-rebind-20260913T071238Z
SNAP_DIR=/home/ricardo/cvg-agent-secretary-v2/docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/rehearsal-20260913T062303Z
REPO=/home/ricardo/cvg-agent-secretary-v2
LIST="$SNAP_DIR/snapshot-files.sha256"
OUT="$W/commands/drift"
mkdir -p "$OUT"
cd "$REPO" || exit 2
: > "$OUT/differing.txt"
: > "$OUT/missing.txt"
: > "$OUT/current-hashes.sha256"
while IFS= read -r line; do
  expected="${line%%  *}"
  f="${line#*  }"
  if [ -f "$f" ]; then
    actual=$(sha256sum "$f" | cut -d' ' -f1)
    printf '%s  %s\n' "$actual" "$f" >> "$OUT/current-hashes.sha256"
    if [ "$actual" != "$expected" ]; then
      printf '%s  %s (candidate328d6a38=%s)\n' "$actual" "$f" "$expected" >> "$OUT/differing.txt"
    fi
  else
    printf '%s\n' "$f" >> "$OUT/missing.txt"
  fi
done < "$LIST"
{
  echo "total_listed=$(wc -l < "$LIST")"
  echo "present=$(wc -l < "$OUT/current-hashes.sha256")"
  echo "missing=$(wc -l < "$OUT/missing.txt")"
  echo "differing=$(wc -l < "$OUT/differing.txt")"
} | tee "$OUT/summary.txt"
echo "--- differing paths ---"; cat "$OUT/differing.txt"
echo "--- missing paths ---"; cat "$OUT/missing.txt"

# Product-source hash maps (frozen vs current) for the four governed packages.
for pkg in packages/agent-runtime/src packages/approval-engine/src packages/channel-gateway/src packages/policy-engine/src; do
  name=$(echo "$pkg" | tr '/' '_')
  grep -E "  ${pkg}/" "$LIST" | sort > "$OUT/${name}.candidate.sha256"
  (cd "$REPO" && while IFS= read -r line; do f="${line#*  }"; printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done < "$OUT/${name}.candidate.sha256") > "$OUT/${name}.current.sha256"
  if diff -q "$OUT/${name}.candidate.sha256" "$OUT/${name}.current.sha256" >/dev/null; then
    echo "PRODUCT_DELTA $pkg: EQUAL ($(wc -l < "$OUT/${name}.current.sha256") files)"
  else
    echo "PRODUCT_DELTA $pkg: DIFFERS"
    diff "$OUT/${name}.candidate.sha256" "$OUT/${name}.current.sha256" | head -20
  fi
done

# Candidate scope files present now but not in the round-5 list (new files).
git ls-files --cached --others --exclude-standard -z | tr '\0' '\n' | while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    docs/04_audit/evidence/*|coverage/*|test-results/*|playwright-report/*|blob-report/*|.gauntlet/*|.opencode/*) continue;;
    certification/manifest.json|certification/phase10-result.json|certification/candidate-manifest.json|certification/candidate-qualification.json|certification/sbom.cyclonedx.json|certification/license-report.json|certification/agent-eval-report.json|certification/chaos-report.json|certification/load-report.json|certification/restore-report.json|certification/negative-validation.json|certification/baseline.json) continue;;
  esac
  if ! grep -q "  ${f}$" "$LIST"; then echo "NEW_OR_UNLISTED $f"; fi
done > "$OUT/new-unlisted.txt"
echo "--- new/unlisted candidate-scope files vs round-5 list ---"; cat "$OUT/new-unlisted.txt"
