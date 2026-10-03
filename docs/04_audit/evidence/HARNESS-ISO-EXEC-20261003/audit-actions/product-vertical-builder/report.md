# PRODUCT-FIRST-VERTICAL — frozen builder handoff

Status: **IMPLEMENTED_NOT_INTEGRATED**. Candidate source is frozen; next action belongs to Lead's independent validation of the text/persistence slice. This report records implementation and executed checks, not a builder approval, independent review, global acceptance, deployment or release. No self-review was started.

Authority: approved SPEC0179 §13/D local synthetic BUILD, human-t3-approval.json, existing same-name lane claim, and relevant SPEC0180 NO_MODEL requirements. SPEC hashes are recorded in source-freeze.json and match the supplied authority. C1 rejection/review budget and D009 shared gateway block remain unchanged. Shared ledgers were not updated: reconciliation deltas are provided in handoff-status.json within this owned evidence path.

## Observable result

The candidate admits authenticated, registered-author text over actual loopback WAHA/Evolution webhook HTTP, persists the original inbox before acknowledgement, organizes with an explicitly injected pure V2 fixture, queues and dispatches a source-faithful preview, and activates tasks only after that author sends the exact current note token and every preview part has a provider-accepted receipt. Confirmation, task activation, eligible literal patient bindings, processed inbox state and response intent are one fsynced journal transaction. A later response HTTP receipt is a separate durable outcome. Task numbers use maximum historical number + 1; duplicate admission and distinct repeated confirmation do not allocate again.

The default executable uses ModelOrganizer with clinical NO_MODEL denial before any provider invocation. Actual bundled CLI HTTP smoke confirms a raw clinical document with zero derived tasks and zero model requests. The positive task-producing flows use only static fixtures in tests. Neither result closes D2, D009, P07/P09 model-HTTP proof or clinical-provider qualification.

Strict V2 schemas, explicit typed events/actors and revision/dependency guards extend the existing journal; there is no parallel ledger or unknown-event escape. Legacy strict schemas remain. Legacy confirmation flags never actuate; terminal legacy states and HOLD remain preserved. Source evidence uses literal quote offsets computed locally in UTF16, explicit source blocks and literal patient IDs, finite pt-BR equivalence scoped to patient/field/unit, and confirmed-current memory only. Homonyms and reversed output arrays cannot select the first patient or merge identities.

Inbox processing is global concurrency one, with persisted stage/attempt/deadline/backoff and five total attempts. Errors free the worker without falsely marking success; restarted processing stages recover. Correction persists replacement_started and suspends existing open tasks before organizing, invalidates old pending effects, preserves done tasks, and leaves failed replacement pending. A successful replacement is a new draft requiring another exact confirmation.

Outbox dispatch persists dispatching before fetch and rechecks current recipient, pause/storage/stop, draft version and task eligibility with no await between intent and fetch. Typed outcomes distinguish accepted, definitelyNotAccepted and uncertain. Only safe definite rejection retries, at most five total attempts with persisted backoff. Post-start 5xx, disconnect, timeout, malformed acceptance, interrupted dispatch and ambiguous receipts become uncertain with no automatic resend. HTTP acceptance is not delivery confirmation. Receipt-persistence failure blocks further effects; replay recovers complete durable transactions.

Text shutdown aborts bounded organizer/send work, closes its own store/HTTP resources and releases its own lock. Readiness returns 503 on unavailable storage/HOLD/stopping; pause is represented separately. Duplicate payload conflicts return 409; queue exhaustion returns 503; invalid admission returns 400. Fresh-volume recovery tests retain history and originals; original residual locks are not automatically stolen.

## Executed verification

All current-code gates used Node 22.23.2 and the lane's owned TMPDIR. Tests use portable os.tmpdir unique volumes and ephemeral loopback ports. No actual clinical/model provider, real data, existing volume, Docker, reserved ports, PG, root suite, external CI, commit or push was used.

| Current capture | Result |
| --- | --- |
| release-product-tests.log / product-tests.json | 122 PASS, 0 FAIL, 0 skipped/todo; six files |
| journal-recovery.test.ts + journal-migration.test.ts | All 40 physical foundation tests, unchanged source hashes; nine original child SIGKILL controls |
| shift-assistant.test.ts + shift-assistant-e2e.test.ts | All 37 original scenario instances/names preserved, with explicit V2 contract/fixture wrappers |
| first-vertical.test.ts | 41 new HTTP, disk/restart, crash/failure, confirmation, identity and uncertainty tests |
| source-oracles.test.ts | Four new tests execute 41 numeral cases / 139 comparisons and all 21 quote proposals |
| release-typecheck.log | Full candidate npm run typecheck, exit 0 |
| release-lint.log | Full candidate npm run lint, exit 0 |
| release-public-build.log | Product build through public package exports; no source aliases/shared writes, exit 0 |
| release-bundle-smoke.log | Actual bundle CLI: modelRequests=0, sends=2, source preserved, raw document confirmed, derivedTasks=0, own lock released, exit 0 |
| freeze-format.log + release-format.log | Formatting checks cover all changed files, exit 0 |

Commands and Node version are captured in each corresponding .json; raw combined stdout/stderr logs end in EXIT_SENTINEL. Public-build input/source-copy manifests are attached. The build compiles copies of shared/model-gateway public inputs under product/dist and writes only product output, because the original standard build would write shared dist outside this lane. Shared implementation and dependencies/lockfiles were not changed.

The raw initial full product baseline is retained: baseline-product.log/json records 77 tests, 67 PASS / 10 FAIL, including the 40 foundation tests and original 37 scenarios. Intermediate failed checks remain available with their raw outputs; they were resolved in the candidate and were not removed or rewritten. Foundation40 alone was never counted as a full old baseline. inventory-sentinel.json records exact old declaration names, unchanged parameterized command inventory, unchanged foundation test hashes, zero skips, and assertion counts increasing from 69 to 72 and 34 to 37. Expected old contract semantics were explicitly adapted to author-confirmed V2 tasks; tests were not deleted or skipped.

Additional crash tests kill the child around V2 confirmation before write, after complete LF, and after fsync, then verify whole activation or none in a new owned recovery copy. SIGKILL proves process-crash behavior, not power-loss or device fsync guarantees. Normal reopen tests close their stores first. Recovery-copy lock handling is explicitly audited after proving the child dead, while the original volume/lock remains intact; it is not runtime automatic lock theft.

acceptance-evidence-map.json maps Lead's existing PV01–PV14 projections to executed test names and captures. All verdicts are reserved to Lead; that map introduces no requirements or acceptance decisions.

## Freeze and portable integration inputs

source-freeze.json SHA256: 7ee349ee0a9df176eeea649ba0cb23a7ee1ea5f32f5ad53a89c060b80f04f41f.

- vertical-from-foundation.patch: 24 changed paths against this lane's frozen foundation, reconstructed by before.tar.gz / before.json.
- product-from-T2.patch: 27 changed paths against the current root T2 product baseline; includes the foundation journal/migration/test additions necessary for the vertical. rootT2BaselineHashes in source-freeze.json identify that exact baseline. Both patches contain only products/shift-assistant paths.
- product-source.zip: complete portable product source/fixtures, excluding dist and node_modules. SHA256 7a6de4a662a5ec859a6acbe4a9d7dac287eee126536365eac4b725a2a3448961.
- product-bundle.zip: executable bundle and public input manifests. Bundle SHA256 e2f42b1467eb839ee8135506b831da7a699c7004b5f06ecd07b51a18f5c2c60c.

All source hashes, both baseline hash sets, artifact hashes, patch checks and execution-log references are in source-freeze.json. Each patch was checked and applied to an owned baseline copy, then all resulting changed-file hashes matched the frozen source (patch-verification.json and raw patch logs). An earlier nested-checkout attempt filtered paths; post-apply hash validation detected that no-op. Final checks used standalone owned git repositories and succeeded. No root/candidate original source was mutated by patch checks and no commits were made. Apply only after verifying the corresponding baseline, from the baseline repository root; the two patches are alternative bases, not sequential patches.

Candidate protected-file sentinel covers 490 shared/config/script/manifest files and found no drift. The final sentinel rechecks product source, protected files, artifacts, authoritative SPEC and own root-incident restoration. Source ownership is returned for Lead's frozen-artifact validation; the Builder will make no further source writes without a new explicit handoff.

## Incident and Lead repair

scope-incident.json records the first command's omitted cwd: own new domain-v2 file and exact domain suffix/rename initially reached root. The own file was moved into the candidate and only the own domain change was removed immediately. Root domain hash matches the pre-lane source and the unintended root file is absent. **No Lead repair is required.** Nothing in core, gateway, config/lock, C1, SPEC, shared ledgers or .gauntlet was changed or compensated. Protected hash verification is not a C1 checker review.

## Remaining approved-SPEC work and limits

The following requirements are OPEN/NOT_RUN/BLOCKED rather than silently declared accepted. They remain global backlog and independent integration obligations; none is closed by the 122 tests.

1. **Clinical model/D2 and shared transport/D009/D011:** default clinical NO_MODEL remains; no actual local/remote organizer or clinical provider calls occurred. The product caller's early public policy_denied guard is not shared gateway.generate migration or shared enforcement acceptance. Prompt registry, durable shared model budget/circuit, approved organization policy, model HTTP contract, P07/P09 gateway oracle and provider transport qualification are pending. No clinical-to-INTERNAL relabeling, grant or C1 repair was introduced.
2. **Source coverage:** the finite equivalence/quote fixture corpus is executed, with selected product flows, but this is not all AP009 twenty full scenarios, clinical usefulness/human verification, or Whisper-produced source qualification. Admission supports explicit Paciente/Novo paciente anchors and literal identity in their first anchor sentence; unsupported prose is conservatively blocked. Field-context grammar is finite, dates cannot borrow an unspecified day from a clock, ambiguous homonyms/normalization remain blocked. No clinical truth, dose or identity inference is qualified.
3. **Audio/images/Whisper and full media persistence:** old scenario compatibility is retained through static wrappers and local synthetic HTTP, without qualifying actual transcription/vision/OCR. Inline Evolution base64 is refused before journaling. Complete synced inbound envelopes, bounded/hash-qualified download and media budgets/decode, saved-byte replay/retranscription, sidecar-orphan reconciliation, all ten real Whisper clips and human transcript verification are not implemented/qualified in this slice. Existing downloader/transcriber compatibility does not prove full text transport controls for media.
4. **Legacy migration/operator safety:** strict schemas, preserved originals, terminal states/numbers and HOLD remain. There is no audited HOLD release, human legacy task reactivation retaining original numbers, complete migration/restore operator CLI, old-writer stop/downgrade prevention proof or independent backup-medium qualification. Fresh recovery copies and process SIGKILL do not close infrastructure restore or device/power-loss assumptions.
5. **Outbox operational review:** no qualified provider idempotency, provider acceptance query or delivery guarantee. Uncertain records require handoff and are never retried automatically. Operator delivery_review_resolved tooling/full resolution audit and the remaining full maintenance/media/reminder actor/event families are not implemented. Every implemented event remains explicit and strictly validated.
6. **Reminders/delivery/SLA:** thin legacy-compatible reservation, own-task done/snooze and generation guards remain, including four slots and thirty-minute repeat behavior. Full PISO005/006 qualification, authenticated delivery-confirmed callbacks/correlation/early receipt storage, twenty-task ≤60-second delivery SLA and real provider delivery are absent. HTTPaccepted does not mean delivery/read within sixty seconds. Existing SHIFT_TICK_SECONDS default60 and accepted [10,3600] range are not the full 1–5-second/priority/adaptive scheduler. Tick still awaits dispatcher network. Clock-regression, external supervisor/heartbeat/progress, full dependency health and backlog latency proof are pending.
7. **Admission/operational controls:** bounded text queue and manager control reservation exist; complete max16 connections/max4 authenticated bodies, admission headers/request deadlines, rate controls and shared SSRF/network qualification are not complete. Readiness covers storage/HOLD/stopping/pause, not all provider dependencies/uncertain alarms/watchdogs. Bounded text organizer/send stop is proven; arbitrary media work, blocked physical fsync/kernel I/O and external supervisor recovery are not.
8. **Infrastructure/restore:** PISO007 scratch/nonroot/read-only/egress IPv4/IPv6/relay/DNS evidence and PISO008 complete backup/restore/receipts/operator reconciliation/alerts external monitoring are outside this slice and unqualified. New-volume tests are local synthetic process recovery, not global restore approval.
9. **Product operations/human pilot:** existing V1 guides/runbooks/demo scripts were preserved, not comprehensively adapted or requalified. New actual-bundle smoke covers this text slice only. PISO009/010 full demo/runbook/usefulness, AP008 actual Whisper, whole AP009 acceptance corpus, human review, administrative/DPA/pilot contacts/channel/team qualification and real providers remain open.
10. **Integration/release gates:** root suite, PG, harness E2E, certify, SBOM/licenses, remote CI, infrastructure restore and production/pilot were not run. HISO/PISO global criteria/ledgers remain WAITING or their existing states; C1 review budget is spent, shared D009 remains blocked. Lead must validate the frozen source and integrate under its own claim before any broader acceptance. No global PASS, release or shared gateway migration acceptance is asserted.

Token-only confirmation follows the user's explicit instruction: generic/bare ok cannot actuate, including cases where SPEC permits an eligible shorthand. Raw document confirmation is allowed with zero derived tasks. These choices and conservative source refusals are documented behavior; they do not rewrite SPEC or imply acceptance of unimplemented paths.
