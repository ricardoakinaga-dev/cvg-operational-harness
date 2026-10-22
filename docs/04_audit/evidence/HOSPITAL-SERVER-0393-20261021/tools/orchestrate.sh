#!/usr/bin/env bash
set -u
S="$1"; NODE=/home/ricardo/.nvm/versions/node/v22.23.2/bin/node
mark() { echo "{\"phase\":\"$1\",\"at\":\"$(date -u +%FT%TZ)\"}" >> $S/out/phases.jsonl; }
: > $S/out/stats.tsv; : > $S/out/phases.jsonl; : > $S/out/load-rounds.jsonl
$S/sampler.sh $S/out/stats.tsv & SP=$!
mark idle-start; sleep 60; mark idle-end
for r in 1 2 3; do
  rs=$(date +%s)
  mark load-$r-start
  env -i HOME=$HOME PATH=/usr/bin:/bin NODE_EXTRA_CA_CERTS=$S/etc/tls/fullchain.pem $NODE $S/load.mjs $S/etc/harness.env 280 20 round-$r >> $S/out/load-rounds.jsonl
  mark load-$r-sent
  d=$($S/drain.sh $S); echo "{\"round\":$r,\"drain\":$d}" >> $S/out/load-rounds.jsonl
  mark load-$r-drained
  $S/sizes.sh $S after-round-$r >> $S/out/sizes.jsonl
  while [ $(( $(date +%s) - rs )) -lt 90 ]; do sleep 1; done
done
mark post-idle-start; sleep 60; mark post-idle-end
kill $SP; wait $SP 2>/dev/null
echo DONE
