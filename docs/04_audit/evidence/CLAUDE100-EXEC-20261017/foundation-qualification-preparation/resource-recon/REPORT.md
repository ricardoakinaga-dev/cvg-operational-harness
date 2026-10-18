# Static resource prerequisite map — C100-FND-QUALIFICATION-PREP-001

Completed one bounded static scout pass. **8 default-selected files = 7 profiles/71 historical pending tests + bound-fence startup failure.** Three `.integration.ts` files are future focused profiles, outside the default selection. **61 pending tests admit resource preparation without source edits; 2 need a legitimate legacy-owner assignment; 8 plus fence startup cannot use a newly created container under the frozen literals.** This is a prerequisite map, not functional acceptance.

Authoritative source: `/tmp/cvg-claude100-exec-20261017/diagnostic-ownership-candidate`, HEAD `99c9e5bce5e5ffb9e19ab56a9b294085ff1bad68`. Root governance and PARE contracts remain canonical; no historical controller grants current authority. [Structured map](map.json), [input hashes before](inputs.before.json), [input hashes after](inputs.after.json), [verification](verification.json), [source snapshot index](source-input-manifest.json), [artifact hashes](manifest.sha256).

No source changes, tests, probes, Docker/PG/app/network operations, descendants, installs, builds or gates. Functional credit0, no M1, no release/integration claim. Earlier FAILED units and budgets remain unchanged; this new unit was not reset. Root ledgers are read-only by the explicit lane contract; continuity is handed to Lead in `map.json`.

## Current raw result

Unit snapshot: 4651 passed / 93 failed /71 pending. Official skip inventory: **FAIL**,71 skips and70 failures (one catalogued Phase4A skip does not remove its preparation requirement). Bound-fence throws “Assigned SPEC0224 fence resource/evidence required; never skip” at collection. Missing emits/TypeScript/Vite issues belong to the separate Lead lane and are not solved or credited here.

[Unit observations](../../foundation-diagnostics-build/qualification-r1/unit-observations.json) · [Triage](../../foundation-diagnostics-build/qualification-r1/triage.json) · [Official skip inventory](../../foundation-diagnostics-build/qualification-r1/artifacts/certification/skip-inventory.json).

## Finite profile outcomes

| Profile | Historical pending | Assignment without source change | Exact source |
| --- | ---: | --- | --- |
| phase4a-conversation | 1 | Yes, owned preparation | [postgres-conversation.integration.test.ts](snapshots/packages/conversation/src/__tests__/postgres-conversation.integration.test.ts.source.txt) |
| checkpoint-codec | 2 | Yes, owned preparation | [complete-checkpoint-postgres.test.ts](snapshots/packages/persistence/src/__tests__/complete-checkpoint-postgres.test.ts.source.txt) |
| store-restart | 2 | Legacy owner only; current C100 root/task rejected | [complete-tool-process-restart.test.ts](snapshots/packages/persistence/src/__tests__/complete-tool-process-restart.test.ts.source.txt) |
| public-restart | 8 | New container impossible: old immutable ID fixed | [complete-tool-public-restart.test.ts](snapshots/packages/persistence/src/__tests__/complete-tool-public-restart.test.ts.source.txt) |
| fenced-outbox | 14 | Yes, owned preparation | [pare217-fenced-outbox-postgres.integration.test.ts](snapshots/packages/persistence/src/__tests__/pare217-fenced-outbox-postgres.integration.test.ts.source.txt) |
| published-store | 39 | Yes, owned preparation | [pare217-published-store-postgres.integration.test.ts](snapshots/packages/persistence/src/__tests__/pare217-published-store-postgres.integration.test.ts.source.txt) |
| published-worker | 5 | Yes, owned preparation | [pare217-published-postgres.integration.test.ts](snapshots/apps/worker/src/__tests__/pare217-published-postgres.integration.test.ts.source.txt) |
| bound-fence | startup failure | New container impossible: old immutable ID fixed | [complete-checkpoint-bound-fence.test.ts](snapshots/packages/persistence/src/__tests__/complete-checkpoint-bound-fence.test.ts.source.txt) |
| capacity | future focused | New container impossible: old immutable ID fixed | [complete-admission-capacity-postgres.integration.ts](snapshots/packages/persistence/src/__tests__/complete-admission-capacity-postgres.integration.ts.source.txt) |
| bound-admission | future focused | New container impossible: old immutable ID fixed | [complete-bound-admission-postgres.integration.ts](snapshots/packages/persistence/src/__tests__/complete-bound-admission-postgres.integration.ts.source.txt) |
| settlement | future focused | New container impossible: old immutable ID fixed | [complete-settlement-public-postgres.integration.ts](snapshots/packages/persistence/src/__tests__/complete-settlement-public-postgres.integration.ts.source.txt) |

Default inclusion is [vitest.config.mts](snapshots/vitest.config.mts.source.txt) L83–91. `.integration.test.ts` matches; `.integration.ts` does not. No glob/catalog edits proposed. All direct env reads and local symbols are indexed per file in `map.json`.

## phase4a-conversation

[packages/conversation/src/__tests__/postgres-conversation.integration.test.ts](snapshots/packages/conversation/src/__tests__/postgres-conversation.integration.test.ts.source.txt) — disposablePgEnabled / postgresIt:L28–49; postgresIt body / finally:L80–94; reader grants / finally:L405–454.

**Environment.** `{"arm": ["TEST_DATABASE_URL", "PHASE4A_DISPOSABLE_PG=1"], "required": "PHASE4A_PG_REQUIRED=1 converts absence to a failing test; does not provision"}`

**Resource/evidence.** `{"descriptor": "none; TEST_DATABASE_URL direct connection string", "schema": "cvg_phase4a_${Date.now()}", "role": "cvg_phase4a_reader_${Date.now()}"}`

**Binding outcome.** No hardcoded container ID, DB/user/port/root. Synthetic disposable DB only; source does not validate loopback itself. Explicit Lead loopback assignment required operationally.

- Admin can CREATE SCHEMA/ROLE, apply existing migrations and grant reader access. Use separate owned disposable database; no borrowed ambient TEST_DATABASE_URL.
- Source creates schema/migrations itself. No resource JSON or child config needed.

**Guards.** postgresIt chooses it / missingPgIt / it.skip; no edits to that switch. Read role NOSUPERUSER NOBYPASSRLS; tenant context switches must expose exactly one own session per tenant.

**Cleanup boundary.** finally ends reader/pool, drops only own generated schema CASCADE and own reader role, ends admin; no container cleanup. Reader end errors explicitly caught in existing code.

**Evidence outputs.** `{"output": "normal Vitest result; no dedicated resource/evidence file", "reader_tables": ["cvg_conversation_sessions", "cvg_conversation_messages", "cvg_conversation_turns", "cvg_conversation_execution_claims", "cvg_conversation_deliveries"]}`

## checkpoint-codec

[packages/persistence/src/__tests__/complete-checkpoint-postgres.test.ts](snapshots/packages/persistence/src/__tests__/complete-checkpoint-postgres.test.ts.source.txt) — resourcePath:L1–35; beforeAll / afterAll:L151–210; corrupt wrapper restoration:L275–321.

**Environment.** `{"arm": ["SPEC0224_PG_RESOURCE"], "required": "SPEC0224_PG_REQUIRED=1"}`

**Resource/evidence.** `{"required": {"test_database_url": "URL with hostname in 127.0.0.1, localhost, [::1]", "schemaName": "^[a-z][a-z0-9_]*$", "synthetic": true, "exclusiveClaim": "truthy"}, "helper_claim_required": false}`

**Binding outcome.** No container ID/name/image/root/DB/user literal in this test. Shared SPEC0224_PG_RESOURCE must also satisfy store-restart if both run together.

- Provision empty exclusive schema using existing frozen runPostgresMigrations; this test creates no schema/services.
- Serving connection needs SELECT/INSERT/UPDATE/DELETE on operational_executions and operational_execution_checkpoints, including deliberately corrupt/oversized wrapper SQL; preserve tenant RLS. Record identity and grants; avoid assuming a service role mandated by this codec test.

**Guards.** describe.skipIf(!resourcePath); REQUIRED missing path throws before collection. Per-client JSONB OID3802 parser refuses oversized raw data before JSON.parse; SQL bounds/CAS/foreign tenant assertions unchanged.

**Cleanup boundary.** afterAll deletes only its tenant/execution checkpoints then parent and ends pool; schema/role/container remain Lead responsibility. Corrupt wrapper is restored in test finally.

**Evidence outputs.** `{"output": "normal Vitest result; no dedicated output env", "historical_provisioner": "old TMP postgres/provision.test.ts:6-18; old claim string and old worktree imports are historical, not a current controller"}`

## store-restart

[packages/persistence/src/__tests__/complete-tool-process-restart.test.ts](snapshots/packages/persistence/src/__tests__/complete-tool-process-restart.test.ts.source.txt) — connect:L32–85; cleanup / child:L199–250; parent suite:L334–344; finally:L410–420.

**Environment.** `{"arm": ["SPEC0224_PG_RESOURCE", "SPEC0224_PG_CHILD_CONFIG"], "required": "SPEC0224_PG_REQUIRED=1", "children_only": ["SPEC0224_PG_CHILD_ROLE", "SPEC0224_PG_CHILD_INPUT", "SPEC0224_PG_CHILD_DIR"], "parent_role": "SPEC0224_PG_CHILD_ROLE must be unset for parent suite"}`

**Resource/evidence.** `{"required": "complete-resource + complete-process-claim.json; see shared_contract", "kind": "store-restart", "provisioned_tables": ["operational_executions", "operational_execution_checkpoints"]}`

**Binding outcome.** No literal old container ID here or in assignedResource, so a new actual 64hex ID can technically satisfy it. But TASK, claimId, BASE and /cvg-pare100-224-pg are historical literals: a C100-only claim/root cannot satisfy frozen source. Requires explicit legitimate owner continuation/delegation in that legacy namespace; do not impersonate old task.

- Preprovision fresh migrated schema and set parent config env equal to sealed config in claim; source does not migrate schema.
- Shared descriptor can cover codec + store if it satisfies the stronger store helper contract; isolate public-restart descriptor/root because kind differs.
- Record fresh container identity/port and physical claim/config/evidence with owner transfer if pursuing legacy route. No such transfer inferred from old docs.

**Guards.** assignedResource, privateBytes, ownedPath, completeArgv and binary SHA checked before child spawn. Six finite roles; store-restart readiness20s/max25s. SIGKILL/CAS/NUL assertions preserved.

**Cleanup boundary.** cleanupCompleteChildren joins all owned processes first; unconfirmed join forbids DB/pool cleanup. Then deletes own tenant/execution rows and ends pool. HOME removed only after stdio close and PID absence; evidence/claimed schema retained.

**Evidence outputs.** `{"directory": "claim.evidence/restart-UUID or race-UUID; private input.json; role stdout/stderr logs and command.json; snapshots/proof JSON", "private_config": "completeChildConfig(store-restart, actual fixture worktree, root), exact bytes/hash; parent SPEC0224_PG_CHILD_CONFIG must match", "roles": ["writer", "reader", "initial-a", "initial-b", "reservation-a", "reservation-b"]}`

## public-restart

[packages/persistence/src/__tests__/complete-tool-public-restart.test.ts](snapshots/packages/persistence/src/__tests__/complete-tool-public-restart.test.ts.source.txt) — resourcePath / role:L43–49; connect:L104–144; snapshot / seed:L147–194; parent variants / finally:L528–550; finally / race:L672–749.

**Environment.** `{"arm": ["SPEC0224_PUBLIC_PG_RESOURCE", "SPEC0224_PUBLIC_CHILD_CONFIG"], "required": "SPEC0224_PUBLIC_PG_REQUIRED=1", "children_only": ["SPEC0224_PUBLIC_CHILD_ROLE", "SPEC0224_PUBLIC_CHILD_INPUT", "SPEC0224_PUBLIC_CHILD_DIR"], "parent_role": "SPEC0224_PUBLIC_CHILD_ROLE must be unset"}`

**Resource/evidence.** `{"required": "complete-resource + complete-process-claim.json", "kind": "public-restart", "schemaName": "pare224_runtime", "roleName": "pare224_runtime_service", "containerId": "0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c"}`

**Binding outcome.** Both historical helper claim/root/name and exact old ID in connect. A fresh container cannot truthfully have that ID. Existing old container reuse is only a conditional owner dependency, not current permission or readiness.

- Preprovision pare224_runtime using frozen migrations; public child needs execution/checkpoint/steps/journal writes under tenant context.
- If owner explicitly reassigns old exact resource: current endpoint + new immutable descriptor + kind-specific claim/config/private paths; preserve historical bytes. Existing rows/schema cannot be adopted/deleted without explicit ownership.
- For new C100 resources use a separate strict-equivalent binding proposal, never an old ID in a descriptor for a new container.

**Guards.** describe.skipIf path; required path hard fails. connect fixes schema and oldID, and helper fixes historical root/task. Seven full-output variants + two-process initial model CAS race; no changes to output, receipt, usage, SIGKILL, CAS, readiness45s/max75s.

**Cleanup boundary.** Public parents join children in finally; connect/snapshot/seed/runChild end pools via withCompleteCleanup. Rows, schema, role, resource and evidence retained for Lead; no parent DELETE cleanup.

**Evidence outputs.** `{"directory": "claim.evidence/restart-variant-UUID or race-UUID; input/runtime/trace/row snapshots/role outcomes/logs/command/proof files; private credentials remain private", "roles": ["writer", "reader", "race-a", "race-b"], "config": "exact completeChildConfig public-restart; parent config env must equal claim.config", "functional_result": "NOT_RUN; satisfying prerequisites does not establish native full-result CAS success"}`

## fenced-outbox

[packages/persistence/src/__tests__/pare217-fenced-outbox-postgres.integration.test.ts](snapshots/packages/persistence/src/__tests__/pare217-fenced-outbox-postgres.integration.test.ts.source.txt) — resourcePath / generated names / newPool:L21–60; beforeAll:L190–256; afterAll:L258–278.

**Environment.** `{"arm": ["PARE217_A_PG_RESOURCE"], "required": "PARE217_A_PG_REQUIRED=1"}`

**Resource/evidence.** `{"required": {"test_database_url": "URL hostname127.0.0.1, pathname /pare217_synthetic, username pare217; port from truthful current descriptor"}, "schema": "pare217_lane_a_${timestamp}_${hex}", "role": "pare217_a_${timestamp}_${hex}"}`

**Binding outcome.** No literal container ID/name/root/port; resourcePath points to JSON. Exclusive disposable PG assignment remains required outside these simple source checks.

- Admin pare217 can CREATE SCHEMA/ROLE and run unchanged default migrations; role is nonowner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS.
- Own schema only: grant USAGE schema, SELECT/INSERT/UPDATE all tables, USAGE/SELECT sequences. Own outbox_attempts sequence starts 9007199254740993; preserve bigint precision proof.
- Default migration set through0029; source admin connection retains migration search_path. No lease/time overrides.

**Guards.** Generated prefix guard; actual identity/FORCE RLS checks; actual DB time10s expiry, locks, rollback/tenant cleanup assertions remain.

**Cleanup boundary.** End serving pool then drop only generated schema/role, verify both absent, end admin in finally; container/database remain with Lead.

**Evidence outputs.** `{"output": "console PARE217_LANE_A setup/proofs/cleanup + Vitest; no separate evidence env required"}`

## published-store

[packages/persistence/src/__tests__/pare217-published-store-postgres.integration.test.ts](snapshots/packages/persistence/src/__tests__/pare217-published-store-postgres.integration.test.ts.source.txt) — beforeAll / afterAll:L39–115; launch process:L265–315.

**Environment.** `{"arm": ["PARE217_PG_RESOURCE"], "required": "PARE217_PG_REQUIRED=1", "evidence": "PARE217_PROCESS_EVIDENCE optional; set to new owned private directory to avoid ambient /tmp fallback"}`

**Resource/evidence.** `{"required": {"test_database_url": "URL hostname127.0.0.1, pathname /pare217_synthetic, username pare217; port from truthful current descriptor"}, "schema": "pare217_lead_${Date.now()}_${hex}", "role": "pare217_lead_role_${Date.now()}_${hex}"}`

**Binding outcome.** No hardcoded container ID/name/root/port. Child fixture enforces loopback/DB and generated schema prefix; hardcoded Node22 path and local tsx must exist.

- Admin creates own fresh schema, frozen migrations and nonowner/NOBYPASSRLS/NOINHERIT serving role.
- Grant USAGE schema; SELECT/INSERT/UPDATE/DELETE all tables; revoke DELETE bindings and UPDATE/DELETE evidence; grant USAGE/SELECT all sequences. Do not widen serving role/disable native guards.
- Use Node /home/ricardo/.nvm/versions/node/v22.23.2/bin/node --import tsx finite platform-process fixture; no install in this scout.

**Guards.** skipIf resource absent; REQUIRED fails; child uses literal DB and generated schema prefix. Native guard triggers/DB deadlines/one-use0002 approval and isolation proofs remain unchanged.

**Cleanup boundary.** Children controlled by unchanged trackPare217Process, stop/record in test finally; suite ends pool then drops own schema/role then ends admin. Child ClaimExecutionRegistry.stopAndDrain and pool cleanup are preserved. No container cleanup in suite.

**Evidence outputs.** `{"directory": "PARE217_PROCESS_EVIDENCE/label (fallback private per-process /tmp root and one /tmp fallback site at2636); 0600 synthetic-process-config.json, command/log/message/snapshot proofs", "policy_grant": "Existing platform_capability_approvals bound one-use0002 is a synthetic test business fixture, not an operational approval for resource ownership; do not mint human authority from it."}`

## published-worker

[apps/worker/src/__tests__/pare217-published-postgres.integration.test.ts](snapshots/apps/worker/src/__tests__/pare217-published-postgres.integration.test.ts.source.txt) — resourcePath / outputPath:L33–42; fixture resource/output guard:L308–354; fixture provisioning/grants:L374–446; env:L538–549; fixture finally:L608–679; K03 output guard:L1469–1482.

**Environment.** `{"arm": ["PARE217_WORKER_PG_RESOURCE (fallback PARE217_PG_RESOURCE)", "PARE217_WORKER_PG_OUTPUT"], "required": "PARE217_WORKER_PG_REQUIRED=1 requires BOTH resource and output", "output_for_all_default_cases": "absolute owned path ending /spec217-build/lane-b-worker-process"}`

**Resource/evidence.** `{"required": {"test_database_url": "URL hostname127.0.0.1, pathname /pare217_synthetic, username pare217; port from truthful current descriptor", "name": "cvg-pare100-217-pg"}, "schema": "pare217_worker_b_s1_${time36}_${hex}", "roles": ["pare217_b_worker_s1_${time36}_${hex}", "pare217_b_api_s1_${time36}_${hex}"]}`

**Binding outcome.** No literal container ID/port/root prefix; name literal required. A new actual container with that exact name requires name availability or explicit owner coordination, not fabricated descriptor attribution. lane-b-worker-pg suffix is accepted in common fixture but fails both K03 cases.

- Create new exclusive synthetic PG DB/user as source requires; manifest with test_database_url and name; current exact resource identity recorded by Lead externally.
- Assign output ending spec217-build/lane-b-worker-process for all five default tests, including K03; leave existing output untouched.
- Admin can create schema/two roles and apply migrations. Worker gets exact exported PUBLISHED_POSTGRES_TABLE_ACCESS + schema_migrations SELECT and two sequence USAGE grants; API gets SELECT/INSERT/UPDATE all tables, DELETE webhook_replay_events, USAGE all sequences.
- K11 expands grants only to union with WORKER_CRITICAL_TABLES by existing source logic; preserve default-off/strict unsupported/production refusals.
- Child process config is generated 0600 by fixture; worker runtime env created in fixture, not ambient credential inheritance.

**Guards.** Worker/API roles NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT; actual worker preflight verifies nonownership/memberships/RLS/migration checksum/guard triggers. provenance hashes source list in fixture; future genuine source changes do not inherit old receipt. No SDK assertion/clock/expiry/phase/ACK guards modified.

**Cleanup boundary.** Fixture closes API, stops/records children, drains workers/pools, drops only generated schema/two roles, verifies schemas/roles/sessions0, records sourceAfter and cleanup. Cleanup failures fail proof; no container removal. Source ordering captured, not claimed stronger than code.

**Evidence outputs.** `{"directory": "output/schema-label.json plus child subtree; proof includes resourceFileSHA256, resourceClaim, sourceBefore/After, queries/nativeQueries, identity, results and cleanup; raw private config contains synthetic credentials", "child_config_schema": ["env: Record<string,string>", "config: AgentConfig", "eventId: string", "stopAt?: BEFORE_COMPLETION | AFTER_COMPLETION_COMMIT | AFTER_S1_COMMIT"], "internal_env": ["NODE_ENV=test", "DATABASE_URL=<generated worker role>", "POSTGRES_SCHEMA=<fresh schema>", "POSTGRES_RLS_ENFORCEMENT=true", "CVG_WORKER_CONTROLLED_MODE=true", "CVG_WORKER_TENANT_ID=<synthetic217>", "CVG_WORKER_AGENT_ID=<synthetic>", "CVG_WORKER_ID=pare217_b_${label}", "CVG_WORKER_RUNTIME=published-agent", "CVG_WORKER_QUEUE_ADAPTER=postgres-controlled", "CVG_WORKER_PUBLISHED_DURABILITY=postgres-v1"]}`

## bound-fence

[packages/persistence/src/__tests__/complete-checkpoint-bound-fence.test.ts](snapshots/packages/persistence/src/__tests__/complete-checkpoint-bound-fence.test.ts.source.txt) — resourcePath / evidence / emit:L33–49; beforeAll resource guard:L118–175; identity / RLS / trigger proofs:L177–239; afterAll:L241–245; trigger equality oracle:L584–619.

**Environment.** `{"arm": ["SPEC0224_FENCE_RESOURCE", "SPEC0224_FENCE_EVIDENCE"], "required": "unconditional module-level throw if either is missing; NEVER SKIP"}`

**Resource/evidence.** `{"required": {"test_database_url": "hostname127.0.0.1, database pare224_synthetic, username pare224", "containerId": "0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c", "synthetic": true, "exclusiveClaim": "truthy", "schemaName": "^pare224_fence[a-z0-9_]*$", "roleName": "^pare224_fence[a-z0-9_]*$", "hostPort": {"HostIp": "127.0.0.1", "HostPort": "must equal URL.port"}}, "helper_claim_required": false}`

**Binding outcome.** A newly created container cannot match the immutable oldID. Truthful no-source-change route exists only if existing exact old container is still present and explicitly assigned by owner with current endpoint and fresh schema/role; no present availability inferred.

- Evidence directory must already exist and be writable: emit uses writeFile without mkdir. Never reuse earlier proof filenames.
- On legitimately assigned old container, choose fresh own schema/role names matching fence prefix; CREATE without IF NOT EXISTS rejects reuse. Admin migrates and creates serving principal.
- Grant schema USAGE, table SELECT/INSERT/UPDATE/DELETE then revoke binding DELETE and evidence UPDATE/DELETE; grant sequence USAGE/SELECT; record current_user/session_user/nonownership/memberships0/FORCE RLS and original trigger definitions.

**Guards.** No skip/REQUIRED switch. Historical ID is checked in beforeAll after nonempty env. Preserve native boundCAS refusal cases, table snapshots, old-token/V2 rejection, before/after trigger equality. No resource inspect is called by this suite; current identity must be grounded externally by Lead.

**Cleanup boundary.** afterAll ends pool/admin only; intentionally retains own schema/roles/data/evidence for Lead inspection. Stop/retire container only under external exact ownership, never from this scout.

**Evidence outputs.** `{"historical_observation": "suite startup failure in unit-observations; do not assign a fabricated pending-test count", "directory": "SPEC0224_FENCE_EVIDENCE; serving-identity.json, native-rls.json, native-triggers-before/after.json and case row/proof files", "not_equivalent": "Removing ID guard, assigning oldID to a fresh manifest, skipping suite, or substituting mocked PG is forbidden."}`

## capacity

[packages/persistence/src/__tests__/complete-admission-capacity-postgres.integration.ts](snapshots/packages/persistence/src/__tests__/complete-admission-capacity-postgres.integration.ts.source.txt) — module resource guard:L47–84; provision:L100–202; afterAll:L474–480.

**Environment.** `{"required_all": ["SPEC0224_ADMISSION_PG_ASSIGNED_ROOT", "SPEC0224_ADMISSION_PG_RESOURCE", "SPEC0224_ADMISSION_PG_EVIDENCE", "SPEC0224_ADMISSION_PG_RUN_ID"], "missing_behavior": "unconditional startup throw; no skip/default"}`

**Resource/evidence.** `{"required": "shared complete-resource/claim; synthetic true; current hostPort; name /cvg-pare100-224-pg; URL postgresql://pare224@127.0.0.1:<port>/pare224_synthetic; no query/hash", "containerId": "0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c", "assignedRoot_regex": "/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/public-admission-postgres/(builder-r1|review-r[1-9][0-9]*)", "names": "schema and role ^pare224_admission_[a-z0-9_]+$, <=63chars; role=schema_service; helper additionally schema suffix <=50; runId ^r[0-9]+$", "service": "bound/settlement service path must be NEW; generated 0600 after provisioning; only bound child validates exact six-key service shape"}`

**Binding outcome.** Literal oldID AND live Docker inspect ID; cannot manufacture a new container with it. Literal roots/task/name preserved. capacity/settlement also pin image digest; bound compares inspect.Image to claim image, not an independent digest literal.

- Future separate focused native0224 run only; not one of current71pending. Do not add .integration.ts to default globs to make a claim.
- If pursuing exact old resource, resolve existing owner + current endpoint + fresh root/schema/role/evidence, seal complete claim before run; parent uses fresh DDL with preexistence false, never adopts earlier schemas.
- Existing migrations only; no0030 migration exists or is demanded by these frozen fixtures. SELECT/INSERT/UPDATE only on operational_executions, operational_execution_checkpoints, operational_execution_steps, operational_effect_journal; schema USAGE; serving statement_timeout5000/lock_timeout1500

**Guards.** All physical ownership/path/config/byte/output/deadline/join guards in shared helper remain. inspectCompleteResource uses pinned local Docker executable/hash/socket, finite inspect argv with5s/max1MiB; actual object ID/name/image/running/one127.0.0.1 endpoint checked. All receipt/CAS/journal failure assertions, native row witnesses and generated grants unchanged; capacity/settlement expected image sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c

**Cleanup boundary.** End pools/admin after owned work joins/quiesces; preserve schemas/roles/data/private service/evidence for Lead. Container stop/remove is outside suite. No cleanup of another owner or historical source/evidence.

**Evidence outputs.** `{"directory": "explicit private evidence below exact assignedRoot; non-overwrite wx files; actual identity/grants/migrations and native row/receipt/case summary witnesses", "image_pin": "sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c", "future_native_result": "NOT_RUN"}`

## bound-admission

[packages/persistence/src/__tests__/complete-bound-admission-postgres.integration.ts](snapshots/packages/persistence/src/__tests__/complete-bound-admission-postgres.integration.ts.source.txt) — module resource guard / tables:L62–115; service / provision:L178–346; finite child dispatch:L824–900; afterAll:L904–909.

**Environment.** `{"required_all": ["SPEC0224_BOUND_ASSIGNED_ROOT", "SPEC0224_BOUND_RESOURCE", "SPEC0224_BOUND_SERVICE_RESOURCE", "SPEC0224_BOUND_EVIDENCE", "SPEC0224_BOUND_CHILD_CONFIG", "SPEC0224_BOUND_CHILD_INPUT (child only)"], "missing_behavior": "unconditional startup throw; no skip/default"}`

**Resource/evidence.** `{"required": "shared complete-resource/claim; synthetic true; current hostPort; name /cvg-pare100-224-pg; URL postgresql://pare224@127.0.0.1:<port>/pare224_synthetic; no query/hash", "containerId": "0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c", "assignedRoot_regex": "/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/bound-admission/(builder-r1|review-r[1-9][0-9]*)", "names": "^pare224_bound_admission_[a-z0-9_]{1,35}$ plus shared helper <=50 suffix; role=schema_service; child service user prefix bound_admission_*_service", "service": "bound/settlement service path must be NEW; generated 0600 after provisioning; only bound child validates exact six-key service shape"}`

**Binding outcome.** Literal oldID AND live Docker inspect ID; cannot manufacture a new container with it. Literal roots/task/name preserved. capacity/settlement also pin image digest; bound compares inspect.Image to claim image, not an independent digest literal.

- Future separate focused native0224 run only; not one of current71pending. Do not add .integration.ts to default globs to make a claim.
- If pursuing exact old resource, resolve existing owner + current endpoint + fresh root/schema/role/evidence, seal complete claim before run; parent uses fresh DDL with preexistence false, never adopts earlier schemas.
- Existing migrations only; no0030 migration exists or is demanded by these frozen fixtures. SELECT/INSERT/UPDATE on exact tables constant92-111; REVOKE UPDATE controlled_published_evidence; schema USAGE; sequence USAGE/SELECT; service options search_path=<schema> statement_timeout10000 lock_timeout3000

**Guards.** All physical ownership/path/config/byte/output/deadline/join guards in shared helper remain. inspectCompleteResource uses pinned local Docker executable/hash/socket, finite inspect argv with5s/max1MiB; actual object ID/name/image/running/one127.0.0.1 endpoint checked. All receipt/CAS/journal failure assertions, native row witnesses and generated grants unchanged; capacity/settlement expected image sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c

**Cleanup boundary.** End pools/admin after owned work joins/quiesces; preserve schemas/roles/data/private service/evidence for Lead. Container stop/remove is outside suite. No cleanup of another owner or historical source/evidence.

**Evidence outputs.** `{"directory": "explicit private evidence below exact assignedRoot; non-overwrite wx files; actual identity/grants/migrations and native row/receipt/case summary witnesses", "image_pin": "inspect.Image equals resource.imageId equals sealed claim.imageId; Config.Image postgres:16.4-alpine", "future_native_result": "NOT_RUN"}`

## settlement

[packages/persistence/src/__tests__/complete-settlement-public-postgres.integration.ts](snapshots/packages/persistence/src/__tests__/complete-settlement-public-postgres.integration.ts.source.txt) — module resource guard / tables:L64–113; provision:L262–409; afterAll:L1420–1440.

**Environment.** `{"required_all": ["SPEC0224_SETTLE_ASSIGNED_ROOT", "SPEC0224_SETTLE_RESOURCE", "SPEC0224_SETTLE_SERVICE_RESOURCE", "SPEC0224_SETTLE_EVIDENCE"], "missing_behavior": "unconditional startup throw; no skip/default"}`

**Resource/evidence.** `{"required": "shared complete-resource/claim; synthetic true; current hostPort; name /cvg-pare100-224-pg; URL postgresql://pare224@127.0.0.1:<port>/pare224_synthetic; no query/hash", "containerId": "0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c", "assignedRoot_regex": "/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/settlement-failures/(builder-r1|review-r[1-9][0-9]*)", "names": "^pare224_settle_(?:r1|i1_r[1-9][0-9]*)$; role=schema_service", "service": "bound/settlement service path must be NEW; generated 0600 after provisioning; only bound child validates exact six-key service shape"}`

**Binding outcome.** Literal oldID AND live Docker inspect ID; cannot manufacture a new container with it. Literal roots/task/name preserved. capacity/settlement also pin image digest; bound compares inspect.Image to claim image, not an independent digest literal.

- Future separate focused native0224 run only; not one of current71pending. Do not add .integration.ts to default globs to make a claim.
- If pursuing exact old resource, resolve existing owner + current endpoint + fresh root/schema/role/evidence, seal complete claim before run; parent uses fresh DDL with preexistence false, never adopts earlier schemas.
- Existing migrations only; no0030 migration exists or is demanded by these frozen fixtures. SELECT/INSERT/UPDATE on exact tables constant94 onward; REVOKE UPDATE controlled_published_evidence; schema USAGE; sequence USAGE/SELECT; service options search_path=<schema> statement_timeout10000 lock_timeout3000

**Guards.** All physical ownership/path/config/byte/output/deadline/join guards in shared helper remain. inspectCompleteResource uses pinned local Docker executable/hash/socket, finite inspect argv with5s/max1MiB; actual object ID/name/image/running/one127.0.0.1 endpoint checked. All receipt/CAS/journal failure assertions, native row witnesses and generated grants unchanged; capacity/settlement expected image sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c

**Cleanup boundary.** End pools/admin after owned work joins/quiesces; preserve schemas/roles/data/private service/evidence for Lead. Container stop/remove is outside suite. No cleanup of another owner or historical source/evidence.

**Evidence outputs.** `{"directory": "explicit private evidence below exact assignedRoot; non-overwrite wx files; actual identity/grants/migrations and native row/receipt/case summary witnesses", "image_pin": "sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c", "future_native_result": "NOT_RUN"}`

## Shared process contract and exact source symbols

[complete-process-support.ts](snapshots/packages/persistence/src/__tests__/fixtures/complete-process-support.ts.source.txt): `completeProfiles` L24–50; `physicalPath` L56–71; `ownedPath` L72–94; `privateBytes` L95–113; `privateEnvironment` L114–142; `completeChildConfig` L146–175; `Claim` L177–200; `assignedResource` L201–276; `assignedService` L278–326; `completeArgv` L328–344; `observeCompleteChild` L376–488; `startCompleteChild` L489–575; `inspectCompleteResource` L579–672; `stopCompleteChildren` L676–692; `cleanupCompleteChildren` L755–778; `completeReadiness` L780 onward. Full source snapshots preserve all assertions and SQL in each mapped test; no execution/import of target modules occurred.

Claim file is `<root>/complete-process-claim.json`. Exact task `PARE100-EXEC:BUILD-TEST-RESOURCE-HARDENING-0224`, claimId `${TASK}:${kind}:${root}`, root starts `/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/`. Private physical root/evidence0700 and files0600, current UID, no symlink in any component, O_NOFOLLOW, <=1MiB stable read. Claim `cwd` equals current fixture worktree. It must bind resource raw SHA256, profile, ID/name/image/port/DB/user/schema/role, evidence and exact static config hash; Docker executable/hash/socket additionally required on inspect paths. All fields and patterns are enumerated in `map.json → shared_contract`.

Resource: synthetic=true, exclusiveClaim=exact claimId, containerId64lowerhex=claim, containerName=/cvg-pare100-224-pg, imageId=claim sha256 digest, schemaName=claim /^pare224_[a-z0-9_]{1,50}$/, roleName=schema_service; postgresql: URL127.0.0.1, no query/hash, user pare224, database pare224_synthetic, current port exactly matches claim and hostPort127.0.0.1. Shared helper accepts a new truthful container ID; public/fence and future focused callers additionally reject every ID except oldID. The helper claim alone does not inspect the container on store/public paths.

Static child config is import-free `export default <JSON>
`, node environment, threads, maxWorkers1, fileParallelismfalse, one exact target, root/vite-cache, and exactly five current-cwd aliases (contracts/orchestrator/harness/shared/platform). Required parent CHILD_CONFIG must equal the seal even with no CHILD_ROLE. Do not set child role on the parent suite. Bound argv alone adds `--configLoader native`. Six-key service JSON is host/port/database/user/password/options, with exact statement_timeout10000 and lock_timeout3000; validated values are passed directly, not reread.

Pinned Node22.23.2 SHA256 `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`; finite local Vitest argv and isolated HOME/TMP/XDG env. Readiness/max store20/25s, public45/75s, bound15/45s. Output1MiB per stream/2MiB total; overflow invalidates all transcript evidence. Original lifecycle TERM1s/KILL2s/exit5s and default max180s preserved. Join failures forbid DB cleanup; HOME deletion requires closed stdio and PID absence.

[trackPare217Process](snapshots/apps/worker/src/__tests__/fixtures/pare217-process-lifecycle.ts.source.txt) L17–157; [worker child main](snapshots/apps/worker/src/__tests__/fixtures/pare217-published-worker-process.ts.source.txt) L24–39/154–159; [platform child main](snapshots/apps/worker/src/__tests__/fixtures/pare217-platform-process.ts.source.txt) L43–59; [observeFunctionCalls](snapshots/apps/worker/src/__tests__/fixtures/pare217-function-call-probe.ts.source.txt) L1–96 (in-process inspector, no listening port). Synthetic domain fixture helpers are snapshotted, without following their production runtime graph.

Existing schema runner [packages/persistence/src/postgres-migrations.ts](snapshots/packages/persistence/src/postgres-migrations.ts.source.txt) `defaultPostgresMigrations` L20–50 and `runPostgresMigrations` L121–184 applies0000..0027 then0029 with checksum/advisory lock. There is no0030 prerequisite in these frozen profiles. [apps/worker/src/postgres-role-preflight.ts](snapshots/apps/worker/src/postgres-role-preflight.ts.source.txt) `PUBLISHED_POSTGRES_CRITICAL_TABLES` L330–352, `PUBLISHED_POSTGRES_REQUIRED_MIGRATIONS` L354–364, `PUBLISHED_POSTGRES_TABLE_ACCESS` L366–379 and native guard preflight L381 onward remain the serving source of truth. No hand-built replacement tables or widened grants.

## Existing owner resources and controllers (historical only)

- 224 status/resource-final/preflight records show exited/stopped/preserved then; no current Docker/PG observation occurred in scout.
- identity-public preflight explicitly records empty dynamic HostPort while stopped; old32802 not current assignment. Do not reuse historical ports32784/32785/32787/32788.
- postgres-runtime-r3/resource.json URL.port32787 disagrees with hostPort.HostPort32785; fails current shared equality; preserve bytes and issue fresh manifest only after actual owner-controlled observation.
- Old postgres/provision.test.ts and postgres-runtime/provision.test.ts import old worktree and assert old exclusiveClaim strings, which do not satisfy new shared claimId; recipe reference only, not executable current controller.
- Old PG217 postgres-resource.json has container_id d318ffa7..., name cvg-pare100-217-pg and port32781, no current-state proof; checkpoint-r6 says original217PG untouched, not reassigned.
- No complete-process-claim.json discovered among the bounded manifest/controller set inspected. The frozen helper explicitly requires one; its existence/current validity is not established by this scout. No recursive historical search pursued.

Exact bounded inputs (hashes in map/input manifest; descriptors with synthetic credentials are referenced, not copied into report snapshots):

- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/postgres/resource-status.json](../../../PARE100-EXEC-20261014/spec0224-build/postgres/resource-status.json) — `267b0c0ad33133a460ff288e58e61b66dfc330925402a78625ca0af422521ed9`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/postgres/resource.json](../../../PARE100-EXEC-20261014/spec0224-build/postgres/resource.json) — `4c34b677ce722eb09bd5cda51139d778482783e11c3e2db95dd342a25113a4e6`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/postgres-runtime/claim.json](../../../PARE100-EXEC-20261014/spec0224-build/postgres-runtime/claim.json) — `e89e04a9acb25fb7b054ea7396ad8ae9ea69adfdf222bf2b08fb3626db58d4b2`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/postgres-runtime-r3/resource.json](../../../PARE100-EXEC-20261014/spec0224-build/postgres-runtime-r3/resource.json) — `42588578fc9c9bcc3049f58ded40b3b1f8f7a702d5243c7507ecf0d45f44b50a`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/fence-r1/claim.json](../../../PARE100-EXEC-20261014/spec0224-build/fence-r1/claim.json) — `051505d8a0d7b47576e90c96cf81494b0bbca881b0b672fbe1b2473d54a3de71`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/fence-r1/resource.json](../../../PARE100-EXEC-20261014/spec0224-build/fence-r1/resource.json) — `bb565ebcee7af05bfb95995f220d510542c5a9a05e6bd28984c46c341aed8d0b`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/settlement-failures/resource-final-lead.json](../../../PARE100-EXEC-20261014/spec0224-build/settlement-failures/resource-final-lead.json) — `203cfa1ae85b0835a51cd9c38804bb9fa370d9e4d38abda85e233c623be5e2fa`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0224-build/status.json](../../../PARE100-EXEC-20261014/spec0224-build/status.json) — `cd4bbda2cfffeb270ed628142fc3d2e6013004a9fb9f1caefed70833a096f1cf`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/test-resource-hardening-r1/contract/task-short-spec.json](../../../PARE100-EXEC-20261014/test-resource-hardening-r1/contract/task-short-spec.json) — `9ca664f71ed3d3befc9676b51dcbcba82eb21c397e5d65a1ad1921e8e2a33d16`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/test-resource-hardening-r1/resource-preflight-r1/task-short-spec.json](../../../PARE100-EXEC-20261014/test-resource-hardening-r1/resource-preflight-r1/task-short-spec.json) — `6f4bfd06e2632bdd7b8ca97917e88932305d55ab67fdb544105732dba60bd582`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/test-resource-hardening-r1/resource-preflight-r1/identity-public.json](../../../PARE100-EXEC-20261014/test-resource-hardening-r1/resource-preflight-r1/identity-public.json) — `c171735d55b09de76f6cae8d7d0648eeb8ac3419243898f34d1dadacf64e7160`.
- [docs/04_audit/evidence/PARE100-EXEC-20261014/spec0217/build/checkpoint-r6/status.json](../../../PARE100-EXEC-20261014/spec0217/build/checkpoint-r6/status.json) — `eb5beba8903cd661def3c9875b52fdad3b90011549d5df1dcd5a07904ee20aa6`.

Old TMP PG217 descriptor: `/tmp/cvg-pare100-exec-20261014-6az3hlay/spec217-build/postgres-resource.json`; exact hash in inputs manifest. Old TMP provision recipes are captured by hash only, not invoked. Their historical task/paths/claim strings cannot silently become C100 authority.

## Grouped next action

1. **Prepare resources:** Lead can plan the five configurable default profiles/61pending with exact synthetic loopback resource manifests, current owned identities, full existing migrations/grants and worker-process output suffix. Preparation has no source delta and no new human gate merely because docs exist; actual resource execution needs the separate resource claim already required by the lane contract.

2. **Resolve existing owner dependency:** Store2 requires legacy task/root/name assignment; public8 plus fence/future3 additionally require original224 container. Existing manifests prove historical identity only. Current availability, port and ownership remain UNKNOWN; no Docker/PG probe was authorized or performed. Reuse must preserve old schemas/evidence and choose fresh owned scopes.

3. **If fresh C100 resources are required:** prepare a separate private binding task/spec, because current unit authorizes only persistence/package.json and lockfile source writes. The proposal below preserves the entire qualification bar. No test source changed in this lane.

## Minimal strict-equivalent binding — proposal only

1. One new Lead-owned private assignment root from an explicit exact allowlisted task contract, physical/UID/mode/no-symlink checks unchanged. Claim task/claimId must name current real task and finite profile, exact cwd/target/config/evidence paths, no generic base-root bypass.

2. At WHAT/HOW freeze bind actual immutable container64hex ID, exact unique container name, approved image digest/tag, loopback single current host port, database/user, synthetic/exclusive claim, schema/role patterns and existing grants. No wildcard ID or descriptor self-attestation alone.

3. Compare descriptor to hash-sealed Lead claim AND current independent fixed Docker inspect (ID/name/image/running/one127.0.0.1 mapping). Preserve docker executable hash/socket/timeout/output bounds. For public/fence, which currently compare only a literal ID, any new inspection acquisition needs explicitly scoped private ownership, not a new arbitrary command capability.

4. Replace ONLY old literal equality at mapped binding sites with equality to this independently grounded frozen assignment; retain required resource startup failure, schema/role predicates, URL/no-query/hash restrictions where currently enforced, static config exact byte hash, nonowner/NOBYPASSRLS/NOINHERIT/memberships0, FORCE RLS, native triggers and all existing grants/revokes.

5. Keep public pare224_runtime and fence/native namespace constraints unless a separately reviewed strict mapping is necessary. Parameterize historical root/name/task only as exact task-bound constants/allowlist; no arbitrary shell/argv/config/loader, ambient env or old data adoption.

6. Freeze negative acceptance before implementation: absent claim/resource, stale oldID/newcontainer mismatch, wrong name/image/port/DB/user/schema/role, symlink/UID/mode/hash/cwd/config drift, foreign root, nonlocal Docker socket, widened service JSON/options, live-child cleanup failure all fail closed; native SIGKILL/CAS/full output/journal/lease/approval cases remain byte-equivalent and required.

7. Separate current result/provenance/new resource lifecycle; never rewrite old units, manifests, FAILED verdicts or budgets; no release/M1/functional credit from binding preparation.

T2 only if confined to private synthetic test resource acquisition/assignment with equivalent or stronger validation and unchanged security/public/runtime contracts. Existing PARE hardening contract explicitly classified same private infrastructure as T2; does not authorize this new code.

**Concrete T3 boundary.** Relaxing trusted ownership/identity/policy/approval boundaries, accepting arbitrary roots/config/commands/socket/provider/host identities, dropping hash/RLS/nonowner/native guards, or treating descriptor claims as security authority changes security and is T3 (and is not proposed). Promoting private assignment schema into public runtime/API/resource contract, changing migration/database schema or grants/security posture, or publishing a claim of equivalent public qualification requires concrete T3 spec review before build under root D-12. Documentation existence alone is not a new human gate.

No safety waiver and no human gate requested by this scout. Equivalent private test binding can remain T2 only after a separate scoped task/HOW; security or public contract changes are T3 for the reasons above, not because of document presence. New native execution can still fail on its original functional assertions; no PASS or M1 is inferred.

## Seal and continuity

Every inspected input has before/after SHA256 and size. Frozen-source snapshots are byte copies named `snapshots/<source>.source.txt`, indexed with original path/hash/size. `manifest.sha256` seals every payload file; the separate `manifest.sha256.sha256` seals that manifest (both seal files are excluded from the payload list to avoid recursion). Verification is static JSON/link/hash/coverage accounting only. No qualification tests were run.

Lane status: COMPLETED_STATIC_MAP / READY_FOR_LEAD_RESOURCE_DECISION. Lead next action: choose exact owner continuation or a separate strict-equivalent binding proposal, while completing compiled-input preparation in the new candidate. Old FAILED units remain FAILED; no reset, production permission, source promotion, functional credit or active jobs.

Shared coordination file changed concurrently during this pass (whole-file before/after hashes are retained in verification). The current top C100 task still reserves this exact lane and write scope; revalidated in [current claim snapshot](coordination-current-top.source.txt). No frozen-source input drift. The packet does not conceal or overwrite concurrent governance edits.
