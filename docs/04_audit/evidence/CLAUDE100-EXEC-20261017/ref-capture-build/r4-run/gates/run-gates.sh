#!/usr/bin/env bash
# Current gates on the frozen candidate (Node 22), own synthetic PG and ports.
set -u
G=/mnt/ia/cvg-claude100-refcapture-r4-runtime-20261018/gates
C=/mnt/ia/cvg-claude100-refcapture-r4-20261018
NODEBIN=/home/ricardo/.nvm/versions/node/v22.23.2/bin
D="env -i PATH=/usr/bin:/bin HOME=$G/docker-config LANG=C.UTF-8 TZ=UTC /usr/bin/docker --host unix:///var/run/docker.sock --config $G/docker-config"
IMAGE=sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94
NAME=cvg-claude100-refcapture-r4-pg
echo "pre-inspect:"; $D container inspect $NAME >/dev/null 2>&1 && { echo "NAME BUSY"; exit 3; }
for p in 55894 3404 4404; do ss -ltn | grep -q ":$p " && { echo "PORT $p BUSY"; exit 3; }; done
PGID=$($D run --detach --rm --pull=never --name $NAME --label cvg.task=C100-Q01-REF-CAPTURE-001:R4-GATES --label cvg.owner=CLAUDE100-EXEC-20261017 --memory=1g --cpus=1 --pids-limit=128 --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=768m --publish 127.0.0.1:55894:5432 --env POSTGRES_PASSWORD=c100_ref_capture_synthetic --env POSTGRES_DB=c100_ref_capture $IMAGE)
echo "pg_id=$PGID" | tee $G/pg-id.txt
for i in $(seq 1 60); do $D exec $PGID pg_isready -U postgres -d c100_ref_capture >/dev/null 2>&1 && break; sleep 1; done
$D exec $PGID pg_isready -U postgres -d c100_ref_capture
cd $C
export_env="PATH=$NODEBIN:/usr/bin:/bin HOME=/home/ricardo LANG=C.UTF-8 TZ=UTC CI=true TMPDIR=$G/tmp NPM_CONFIG_CACHE=$G/npm-cache NPM_CONFIG_USERCONFIG=$G/npm-config/user.npmrc NPM_CONFIG_GLOBALCONFIG=$G/npm-config/global.npmrc TEST_DATABASE_URL=postgresql://postgres:c100_ref_capture_synthetic@127.0.0.1:55894/c100_ref_capture CVG_API_PORT=3404 CVG_WEB_PORT=4404"
date -u +%FT%TZ > $G/certify-started.txt
env -i $export_env npm run certify > $G/certify.log 2>&1
echo "certify_exit=$?" | tee $G/certify-exit.txt
date -u +%FT%TZ > $G/certify-ended.txt
env -i $export_env npm run certification:verify > $G/verify.log 2>&1
echo "verify_exit=$?" | tee $G/verify-exit.txt
$D stop --time 5 $PGID >/dev/null 2>&1
sleep 2
$D container inspect $PGID >/dev/null 2>&1 && echo "PG_STILL_PRESENT" || echo "pg_absent=confirmed" | tee $G/pg-absent.txt
