# Independent final R2 review

**APPROVE_BOUNDED_REFERENCE_HOW.** No remaining mandatory or optional findings. All ten original criteria SDKHOW01–10 meet the finite T1 HOW scope. SDK, compiler, acquisition, transport helpers and admission remain **NOT_RUN**; functional receipts remain zero.

## R1-F01 disposition

The P2 finding affecting SDKHOW05/07 is **resolved at HOW level**, with high confidence. The [selected topology](../transport-topology.json) now fixes both process graphs and executable overrides: the SDK launches a synthetic adapter; that adapter owns the peer stdio pipes. Driver, adapter and peer reopen their own fixed named FIFOs after exec. The design therefore accommodates the unchanged Python `Popen` and Node `spawn` boundaries without extra inherited descriptors or SDK patches (topology lines 5–20, 31–79).

The same contract fixes six individually mounted IPC nodes, startup readers/keepers, bounded atomic frames, raw-read versus forward-commit accounting, separate control traffic and current inode/identity checks. SDKPY07 waits for request forwarding and peer hold, actual caller cancellation, reply release and the late subscription-close witness before peer finish/drain. Shutdown distinguishes stream/FIFO EOF, process exit and cgroup/service cleanup (lines 67–94).

SIGTERM commit deferral is bounded; unknown/missing capture or SIGKILL cannot become a successful observation. Individual read-only FIFO mount/I/O, actual PIPE_BUF, relays, barriers and failure controls must be qualified before SDK imports. Unsupported behavior stops rather than loosening mounts. This is a coherent selected design, **not evidence that its implementation runs**.

## Scope and prerequisites

The inherited nineteen cases still preserve Python version-guard/default-handler/ordinary-cancel/goal-retry distinctions and TS EOF/parse/error-event/turn-failure/nonzero-exit/abort distinctions. No source/case/coverage/quality-bar/dependency obligation was weakened. Actual interpreter identity remains separate from source, synthetic adapter/peer identity and fabricated version input. The custom TS5.9.2 transpile/loader profile remains distinct from tsup, declarations, typecheck and published npm qualification.

The largest remaining gap is concrete implementation and admission, an explicit execution prerequisite rather than a remaining HOW defect. Before SDK execution, the next registered unit must authenticate/seal the seven selected artifacts; implement and freeze private drivers/adapters/peers/relays/supervisor/config; admit exact FIFO/mount/runtime/library/resource identities; qualify raw captures, barriers, signals and cleanup using finite positive/negative controls; qualify TS5.9.2 before transpile and seal checked emits; validate actual Python models and then run cases serially once. Every item is **NOT_RUN**, detailed in [review.json](review.json).

No SDK/dependency/compiler/target/transport-helper runtime, acquisition, network, PG/container, application test or old probe ran in this review. Routine local reference preparation needs no new human T3 decision. This acceptance does not approve native SPEC0239, actual SDK tests, official distributions, real Codex/backend parity, a public schema/receipt extension or release.

## Integrity and final budget

Exactly **12 static checks passed**: six permitted verifier checks and six bounded discriminators. All 69 frozen R2 inputs, 39 physical upstream source/config/lock files and five host identities were exact before/after. All 57 R1 inputs reconstruct exactly from three preimages plus 54 in-place files; the R1 output hashes and manifest SHA remain intact. The earlier 2,807-file checkpoint has 2,804 exact entries and only three permitted Lead continuity updates, with no other changes. See [checks.json](checks.json).

This is review **2/2**, after grouped Lead repair **1/1**. No third review or second repair is authorized automatically. Lead owns continuity and the next separately registered preparation task; reviewer writes only `review-r2/**`.

The [manifest](manifest.json) binds this report, [review.json](review.json) and checks to R2 freeze SHA `dbab47713498273c38b31c3874b57b0a1d0d095f0bdfda802cdfdc2b75710eb3` and unchanged canonical [task.json](../task.json) SHA `6b58f3a1a8753da848826d1d4cf198144820d58c58d885b80a7b46a630e5f00d`.

