# SPEC0224 PostgreSQL lane — BUILDER_EVIDENCE_ONLY

Task TOOL-RESULT-BUILD-001, TR05/TR06 partial store boundary. No acceptance.

`handoff.json` is the entrypoint; `sources-final.json` contains exact current
source hashes and the explicitly recorded shared contract drift. The seven
files in the codec builder's manifest match exactly. `resource.json` identifies
the exclusive synthetic database, image, container and anonymous volume.
`resource-status.json` records clean shutdown; both container and volume remain
preserved. Existing PG217 and other containers were never operated on.

Final run: 4 main tests in 2 files passed, zero failures/skips. Provisioning
separately passed 1 test and applied 29 existing migrations. Nested processes
produced 5 completed child tests plus one deliberately killed writer; these
are not added to the main test total. ESLint and formatting passed.

Writer PID 2039430 received SIGKILL after committed CAS. Reader PID 2039556
loaded from PostgreSQL using a new adapter/process. Full checkpoint equality,
memory-store equality, 4096 NULs plus NUL key, 24616 canonical output bytes,
usage and synthetic SETTLED receipt were compared. No model or tool body was
instantiated. Two distinct processes per phase produced one CAS winner and
one conflict for initial insertion and reservation. See child directories
for exact commands, PIDs, exits/signals, stdout and nonempty stderr.

The initial run's 2 failures were test readiness buffering, retained in
`pg-tests-r1.*` and child logs. Only the new test's readiness signal changed
from console.log to process.stdout.write. Finalization's first assertion also
detected Lead-owned contract drift and is retained; the revised check records
that drift and continues to require exact frozen builder hashes.

The final test command, when the tracked resource is running under its
exclusive claim, is:

```sh
SPEC0224_PG_RESOURCE=/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/postgres/resource.json \
SPEC0224_PG_REQUIRED=1 \
SPEC0224_PG_CHILD_CONFIG=/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/postgres/vitest.config.mts \
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run \
  --config /tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/postgres/vitest.config.mts \
  packages/persistence/src/__tests__/complete-checkpoint-postgres.test.ts \
  packages/persistence/src/__tests__/complete-tool-process-restart.test.ts
```

Run from `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. The provisioning
test deliberately requires an empty schema and must not be rerun against the
already provisioned schema. Original command metadata is retained without
rewriting. The first runner version did not record environment overrides:
provision used SPEC0224_PG_RESOURCE and SPEC0224_PG_REQUIRED as above; tests-r1
also used SPEC0224_PG_CHILD_CONFIG. Tests-r2 records them directly.

Unproved: public runtime restart/resume, bound lease/fence loss, native model
receipt/call issuance, native settlement transitions and full TR05/TR06.
Synthetic SETTLED fields prove persistence, not execution of settlement.
Global gates, acceptance and runtime/log/backlog updates remain Lead-owned.

File-backed command logs start at Docker preflight. Initial read-only
discovery and patch records remain in the conversation. Captured empty
streams are omitted explicitly in command JSON; no empty logs are fabricated.
