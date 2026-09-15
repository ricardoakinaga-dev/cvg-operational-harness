#!/usr/bin/env bash
# Independent drift check: current working tree vs frozen round-4 snapshot list.
set -u
W=/tmp/opencode/p1-review2-20260913T053543Z
SNAP_DIR=/home/ricardo/cvg-agent-secretary-v2/docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/rehearsal-20260913T052107Z
REPO=/home/ricardo/cvg-agent-secretary-v2
LIST="$SNAP_DIR/snapshot-files.sha256"
OUT="$W/commands/drift"
mkdir -p "$OUT"
cd "$REPO" || exit 2
: > "$OUT/current-hashes.sha256"
: > "$OUT/missing.txt"
: > "$OUT/differing.txt"
: > "$OUT/match-count.txt"
while IFS= read -r line; do
  expected="${line%%  *}"
  f="${line#*  }"
  if [ -f "$f" ]; then
    actual=$(sha256sum "$f" | cut -d' ' -f1)
    printf '%s  %s\n' "$actual" "$f" >> "$OUT/current-hashes.sha256"
    if [ "$actual" != "$expected" ]; then
      printf '%s  %s (snapshot=%s)\n' "$actual" "$f" "$expected" >> "$OUT/differing.txt"
    fi
  else
    printf '%s\n' "$f" >> "$OUT/missing.txt"
  fi
done < "$LIST"
echo "total_listed=$(wc -l < "$LIST")" > "$OUT/summary.txt"
echo "present=$(wc -l < "$OUT/current-hashes.sha256")" >> "$OUT/summary.txt"
echo "missing=$(wc -l < "$OUT/missing.txt")" >> "$OUT/summary.txt"
echo "differing=$(wc -l < "$OUT/differing.txt")" >> "$OUT/summary.txt"
cat "$OUT/summary.txt"
echo "--- differing (all scopes) ---"
cat "$OUT/differing.txt"
echo "--- missing ---"
cat "$OUT/missing.txt"
