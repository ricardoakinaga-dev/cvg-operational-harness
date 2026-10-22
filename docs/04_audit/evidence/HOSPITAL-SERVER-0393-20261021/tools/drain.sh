#!/usr/bin/env bash
# Wait until no outbox row is pending/processing/failed(retry); print seconds waited.
S="$1"; start=$(date +%s%N)
while true; do
  open=$($S/hc.sh exec -T postgres psql -U postgres -d cvg -tAc "select count(*) from cvg_data.outbox_events where status in ('pending','processing','failed')" 2>/dev/null)
  [ "$open" = "0" ] && break
  sleep 1
done
end=$(date +%s%N); LC_ALL=C awk -v a=$start -v b=$end 'BEGIN{printf "{\"drainSeconds\":%.1f}\n",(b-a)/1e9}'
