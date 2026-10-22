#!/usr/bin/env bash
# DB and data-dir sizes (bytes) at one instant.
S="$1"; label="$2"
q() { $S/hc.sh exec -T postgres psql -U postgres -d cvg -tAc "$1" 2>/dev/null; }
db=$(q "select pg_database_size('cvg')")
data=$(q "select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cvg_data' and c.relkind in ('r','m','p')")
wal=$(q "select coalesce(sum(size),0) from pg_ls_waldir()")
dirb=$($S/hc.sh exec -T postgres du -sb /var/lib/postgresql/data 2>/dev/null | cut -f1)
outbox=$(q "select count(*) from cvg_data.outbox_events")
audit=$(q "select count(*) from cvg_data.audit_events")
approvals=$(q "select count(*) from cvg_data.runtime_approvals")
echo "{\"label\":\"$label\",\"at\":\"$(date -u +%FT%TZ)\",\"pgDatabaseSizeBytes\":$db,\"cvgDataRelationsBytes\":$data,\"walBytes\":$wal,\"pgDataDirBytes\":$dirb,\"rows\":{\"outbox_events\":$outbox,\"audit_events\":$audit,\"runtime_approvals\":$approvals}}"
