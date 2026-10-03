# PISO004-JOURNAL — IMPLEMENTED_NOT_INTEGRATED

The actual journal/migration/recovery foundation is implemented through ShiftStore.
This is builder delivery, not acceptance of PISO-004, HISO-004/HISO-008, the vertical
product flow, or the 24-criterion program. Source and API are frozen. No descendants,
shared ledger edits, SPEC changes, old-test edits, provider calls, real data, Docker,
commit, push or release. C1 findings were not compensated in this lane.

The current authority is human-t3-approval.json plus the direct user instruction;
0179 SHA-256 remains 988192fe48737b4571ed659f051e22f3a9283d5c433e7c6c078e1dd0f7be86c3.
Historical pending SPEC prose was not changed. Lead owns acceptance, shared
ledgers/claims and further integration. No inference that independent safe work
must stop because of the C1 review; no unreviewed inbox/confirmation integration
is authorized by this builder result.

Five frozen source/test paths:

- products/shift-assistant/src/journal.ts
- products/shift-assistant/src/migrate-journal.ts
- products/shift-assistant/src/store.ts
- products/shift-assistant/src/__tests__/journal-recovery.test.ts
- products/shift-assistant/src/__tests__/journal-migration.test.ts

[Source freeze and protected sentinels](source-freeze.json),
[reviewable code patch](source-code.patch), and [frozen API](api-contract.md)
provide exact bytes, hashes, contracts and required revisions.

Implemented behavior: exclusive O_CREAT/O_EXCL mode-0600 lock with UUID/PID/Linux
boot identity and explicit close; canonical recursive JSON SHA-256 chain/sequence;
one LF per transaction; real short-write loop and fsync before publication;
bounded strict UTF-8 byte streaming (1 MiB V2, 128 MiB V1); read-only valid-prefix
diagnosis for delimited corruption; non-LF tail retained without parsing;
immutable original/copy/tail hashes, sealed original and successor manifest;
exclusive segment creation, synced temporary/rename/directory manifest publication
and retained revisions. Divergent or abandoned manifest candidates fail closed.
Complete ambiguous commits are validated and re-synced on reopen before retry;
same transitionId returns its original result. Memory mode validates the same
domain schema/guards and returns frozen copies.

Media uses generated opaque paths with a closed extension/MIME list, exclusive
temporary, file sync, publish, directory sync and immutable sidecar.
Unusable partials/orphans are inventoried and retained. Referenced corrupt media
blocks storage. Migration verifies a separate retained pre-upgrade backup
directory, reads V1 without changing events.jsonl, preserves historical state,
externalizes inline/named media in the projection, binds identity to explicitly
provided legacySession, records inventory/mappings, preserves pause and terminals,
and holds every legacy open task. Unconfirmed tasks project draft; confirmed
legacy tasks project legacy_review_required. Upgrade is repeatable across two
reopens and never writes V1. No task is activated by a V1 confirmation flag.

Final executable results under Node v22.23.2:

| Check | Result | Evidence |
| --- | --- | --- |
| Foundation tests through ShiftStore | 40/40 PASS, no skips | [raw log](tests-final.log), [exact command/source hashes](tests-final-command.json) |
| Scoped strict typecheck, including new tests | exit 0 | [raw log](typecheck-final.log), [command](typecheck-final-command.json) |
| Scoped ESLint | exit 0 | [raw log](lint-final.log), [command](lint-final-command.json) |
| Format with repository configuration | exit 0 | [raw log](format-r2.log), [command](format-r2-command.json) |
| Unchanged original consumer tests | 27 PASS / 10 FAIL / 37; exit 1 | [raw log](legacy-tests-final.log), [command](legacy-tests-final-command.json) |

The first typecheck errors, subsequent test assertion cast errors, prefer-const
lint failure, and isolated format failure are preserved. The format failure came
from omitted repository .prettierrc.json in scratch, not source formatting:
copying that readonly config made the final check pass without source edits.
No log was overwritten to turn a failure into success. Initial tests were 32/32,
then 36/36, then expanded to 40/40; portability changes were rerun. Final commands
record their actual exit status and exact source hashes.

Real child SIGKILL covers before journal write, partial journal write, after LF,
after journal sync, before media write, after media sync, after sidecar sync,
and before/after recovery manifest rename. The journal child commits a three-event
message/note/draft-task batch: on restart all three are present or all absent.
A complete batch does not activate a task. Tests record an owned synthetic operator
decision only after spawnSync proves that child exited; only that fixture's
residual operational lock is removed. No lock theft by PID/TTL is implemented.
[Child receipts and filesystem hashes](durability-receipts.json) retain provenance.
These are process-crash/local-filesystem observations, not power-loss/device
certification or release qualification.

Tests use os.tmpdir() and unique mkdtempSync prefixes. The lane run sets TMPDIR
to its private cache; no absolute host paths remain in either new test source.
Scratch/dependencies are private/read-only-linked; the frozen Lead candidate
was never mutated. Synthetic volumes are retained under the builder cache.
All emitted repository evidence files are listed with hashes in proof.json;
the source patch is available without needing a Git commit.

Individual old-test triage (all ten failures remain FAIL):

| Original test | Observed failure | Triage and required next work |
| --- | --- | --- |
| shift-assistant.test: turns a text note into paste-ready text and a timed task | openTasks returns no activated task | Intentional approved draft/confirmation guard; old caller creates V1 task without V2 approval. Lead must implement strict confirmation before eligibility. |
| shift-assistant.test: transcribes audio and keeps the media file as a document | media directory has two entries rather than one | Intentional sidecar protocol; its later events.jsonl assertion would also need V2-aware integration. No old test changed. |
| shift-assistant.test: lists, snoozes and completes only the member own tasks | response has no open task #1 | Old caller uses scheduler eligibility to render commands; draft listing/command UX is unimplemented integration. Initial failure is expected until strict confirmation; later snooze/done assertions were not reached. |
| shift-assistant.test: reminds at the due time, repeats on an interval and stops after the limit | tick returns 0 | Intentional no reminder without V2 confirmation/reservation. Outbox/reminder generation and receipts remain unimplemented. |
| shift-assistant.test: processes messages stored before a crash and rebuilds tasks on restart | STORE_LOCKED on second live instance | Intentional exclusive process lock/close contract. Lead owns future intentional test/lifecycle changes; no lock weakening. |
| shift-assistant.test: corrects the last note, cancelling the tasks it created | original task remains historical status open instead of cancelled | TRUE INTEGRATION DEFECT: old assistant cancels only openTasks, now an effect-eligible view excluding drafts. Correction must inspect tasks bound to the superseded revision and cancel/suspend them atomically. Drafts remain ineligible, so no unsafe reminder occurs. This is not classified as a pure intentional semantic PASS. |
| shift-assistant-e2e: runs the WAHA flow: audio note, paste text, task, reminder and done | expected one open task, got zero | Intentional confirmation guard plus missing full V2 flow. No vertical success claimed. |
| shift-assistant-e2e: runs the Evolution flow with media fetched by message id | no eligible task description | Same draft guard and missing V2 flow; future inline-envelope admission also requires integration. |
| shift-assistant-e2e: guides a new admission with the template and returns tutor and reason | eligible task is undefined | Intentional no activation from V1 admission; strict patient-binding/confirmation remains absent. |
| shift-assistant-e2e: tells two patients with the same name apart by ID and bed | prior ID is no longer inferred from V1 memory | Intentional trusted-memory guard; knownPatients is deliberately inactive pending V2 confirmed binding. New trusted-memory behavior requires Lead integration. |

Remaining SPEC gaps, explicitly not accepted:

1. Domain remains the reserved V1 ShiftEvent union. The strict maintenance schemas
   migration_applied/recovery_recorded are local physical foundation types; the
   final domain event actors, registered-member/local-operator audit contract and
   full inbox/note/task/outbox schemas are not implemented here. Public commit
   accepts only strict current ShiftEvent; it rejects runtime maintenance-event
   injection. The frozen API details the SPEC event families and revision wiring
   needed for typed extension.
2. Strict confirmation/binding, new inbox/outbox state machine, same-message identity
   session tuple in current domain callers, audited release of operationalHold,
   readiness 503/ack/shutdown wiring, source/transcript durability and reminder
   intent are not integrated. V1 note_confirmed stores its historical flag but
   does not qualify activation or trusted patient memory. openTasks/knownPatients
   remain inactive until the Lead adds the actual V2 semantics.
3. Section 5.4 is a conservative projection/backup/mapping foundation, not a
   completed migration acceptance. There is no real old-writer stop proof,
   operator upgrade/rollback CLI, legacy command classifier, audited human
   task reactivation or full webhook→preview→confirm→reminder on an upgraded
   volume. Recorded legacy messages remain review_required or uncertain_legacy
   with no retry/resend, including commands; no command is replayed. Backup
   copies are in a separate retained recovery directory on the same filesystem,
   not a qualified independent backup medium.
4. The old binary does not understand the new lock. Operator stopping the old
   writer remains a required precondition; exclusive new-process locking is not
   proof that an old binary cannot open events.jsonl. A changed legacy hash on
   reopen fails closed. No downgrade of this new implementation writes V1.
5. Media sidecars/inventory are usable hooks, but automatic orphan association
   via media_attached/recovery events, inbound envelope admission, content-addressed
   reuse across retries, same-ID/hash conflict artifact and recovery CLI remain
   absent. The current closed list omits the old caller's image/webp extension;
   that input is rejected rather than silently saved. Large legacy media files
   are read as whole blobs during externalization; journal records themselves
   are byte-streamed within their stated budgets.
6. IDEMPOTENCY_CONFLICT and STATE_CONFLICT are typed exceptions, not the full
   inbox conflict-block/alert lifecycle. Physical append/fsync failure requires
   close/reopen; there is no in-place recovering state machine yet. Invalid
   schemas/size/inline admission errors occur before publication; callers must
   map them appropriately without claiming persisted success.
7. Real SIGKILL of a multi-event draft batch is proven; actual confirmation_committed
   crash/receipt semantics cannot be proven before that reserved schema/flow exists.
   Interrupted manifest publication fails closed and preserves copies; divergent
   complete retained candidates require operator recovery, not auto-adoption.
8. Full product/root/PG/E2E/certification gates and an independent acceptance
   review were not performed for this foundation. The only E2E execution here
   is the unchanged original consumer suite, which FAILs as reported.

Lead next action: retain this frozen foundation in its own candidate and, when
the governing gates authorize that work, review/verify it and implement the
reserved typed domain/caller flow. Do not accept HISO-004/HISO-008, whole PISO004
or the full product from the foundation PASS. Builder stops after final evidence;
shared ledger entries and any claim update belong to Lead.
