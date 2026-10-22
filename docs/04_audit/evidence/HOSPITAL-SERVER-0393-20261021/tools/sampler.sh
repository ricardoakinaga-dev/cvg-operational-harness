#!/usr/bin/env bash
# docker stats for the sizing containers, one line per container per sample.
out="$1"
while true; do
  ts=$(date -u +%FT%TZ)
  docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}' \
    $(docker ps --filter name=^cvg-d9ef-sizing- --format '{{.Names}}') 2>/dev/null | sed "s/^/$ts\t/" >> "$out"
  sleep 1
done
