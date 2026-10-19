#!/usr/bin/env bash
# usage: rungate.sh NAME -- command...
# Runs in the candidate with Node22 first in PATH; logs to runtime, summary JSON to evidence.
set -u
NAME="$1"; shift; [ "$1" = "--" ] && shift
CAND=/mnt/ia/cvg-c100-integration-20261018
RT=/mnt/ia/cvg-c100-integration-runtime-20261018
EV="/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CLAUDE100-EXEC-20261017/root-integration-20261018/gates"
mkdir -p "$RT/logs" "$EV"
export PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH
export TMPDIR="$RT/tmp"; mkdir -p "$TMPDIR"
cd "$CAND"
HEAD=$(git rev-parse HEAD); DIRTY=$(git status --porcelain | wc -l)
START=$(date -Is); S=$(date +%s)
"$@" >"$RT/logs/$NAME.stdout.log" 2>"$RT/logs/$NAME.stderr.log"
RC=$?
E=$(date +%s)
python3 - "$NAME" "$RC" "$START" "$((E-S))" "$HEAD" "$DIRTY" "$RT/logs/$NAME.stdout.log" "$RT/logs/$NAME.stderr.log" "$EV/$NAME.json" "$*" <<'PY'
import sys,json,hashlib
n,rc,start,dur,head,dirty,out,err,dest,cmd=sys.argv[1:]
def h(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
def tail(p,k=40):
    return open(p,errors='replace').read().splitlines()[-k:]
json.dump({"gate":n,"command":cmd,"cwd":"/mnt/ia/cvg-c100-integration-20261018","node":"/home/ricardo/.nvm/versions/node/v22.23.2/bin/node","head":head,"trackedDirtyEntriesBefore":int(dirty),"startedAt":start,"durationSeconds":int(dur),"exitCode":int(rc),"stdoutLog":out,"stdoutSha256":h(out),"stderrLog":err,"stderrSha256":h(err),"stdoutTail":tail(out),"stderrTail":tail(err,20)},open(dest,'w'),indent=2,ensure_ascii=False)
PY
echo "$NAME exit=$RC dur=$((E-S))s"
exit $RC
