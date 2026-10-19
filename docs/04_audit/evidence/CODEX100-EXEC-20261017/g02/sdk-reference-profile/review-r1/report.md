# Independent R1 technical review

**REVISE — one mandatory P2 finding (R1-F01).** Criteria SDKHOW05 and SDKHOW07 require a documentary repair. The other eight criteria meet this T1 scope. Acquisition, private implementation/admission, compiler and all SDK tests remain **NOT_RUN**; functional receipts remain zero.

## Mandatory finding

**R1-F01: specify a feasible relay/control-channel topology.** The [capture HOW](../containment-and-observer.json) (lines 47–50) requires independent raw relays and a separate inherited fixture pipe/socketpair. The [execution profile](../execution-profile.json) launches fixtures directly. Python’s actual SDK [Popen call](../inputs/sdk/python/src/openai_codex/client.py) (268–278) creates its own three stdio pipes without `pass_fds`; local CPython defaults are `close_fds=True, pass_fds=()` (stdlib source hash recorded in checks). TypeScript’s [spawn call](../inputs/sdk/typescript/src/exec.ts) (203–206) likewise requests no extra stdio descriptors.

An extra control descriptor opened by the driver therefore does not simply reach these children. The HOW does not choose how relays attach or how the independent control channel crosses this boundary. This leaves the cancellation barrier in SDKPY07 and capture-complete absence judgments dependent on an unspecified construction. Confidence: **high**. This finding identifies an incomplete design, not impossibility of every implementation.

In the single grouped T1 repair, select a concrete process/channel topology for both clients: distinguish launch adapter, peer, relays and supervisor; identify their endpoints and control path without SDK patches, control bytes in SDK stdout or ambient host-socket exposure. A separately identified adapter creating its own peer/control descriptors, or an explicitly confined per-attempt FIFO topology, can be viable. Keep implementation and positive/negative relay/barrier/EOF/truncation qualification as explicit prerequisites before SDK import. No implementation or execution is requested in this review.

## What the bounded checks support

All 39 source/config/lock snapshots match their Git path, mode and blob at pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`, and the actual checkout bytes. This includes the complete 22-file Python package and ten TS source files. Five host executable/OS file identities also match. Genuine interpreter hashes are correctly separate from SDK source, fixture claims and future loaded-library closure.

The selected Python initialization, non-None version guard, default-handler replies, late ordinary-turn cancellation and one-retry/same-ID goal behavior agree with source. Required generated fixture fields and exact error-parser matches are supportable statically; Pydantic validation remains unexecuted. SDKPY07 explicitly exposes its observational profiling instrumentation.

The TS source can support the restricted source-transpile profile: runtime imports are SDK relatives and Node builtins; the external MCP import is type-only. The emitted graph and loader must still be qualified. The cases preserve distinctions among empty EOF, parse failure, error events, truthy/null turn failures, nonzero process exit and delegated abort. They do not infer remote stop or cleanup from cancellation/finally. The HOW correctly excludes official tsup, declarations, typecheck and published npm qualification.

The seven-artifact proposal is lock-bound and finite, with acquisition/extraction/closure stops and no install/hooks/import authority. Resource, identity, capture and cleanup gates are explicit and unexecuted; R1-F01 concerns their transport construction.

## Execution prerequisites and evidence limits

Before SDK execution: authenticate and seal the seven artifacts; repair the topology and freeze/qualify private drivers, peers, relays, observer and loader; admit exact runtime/library/mount/env identities and current namespace/cgroup/output limits; qualify TS5.9.2 before transpiling and seal checked emits; then validate Python fixtures and execute the 19 cases serially with independent captures and exit/cleanup evidence. Each prerequisite is **NOT_RUN**, detailed in [review.json](review.json).

Exactly **12 discriminating checks: 11 PASS, 1 FAIL**. Six are the permitted read-only verifier, six are source/static discriminators. No SDK, target dependency, compiler, Codex/backend, network/acquisition, PG/container or application test ran. The 57 frozen inputs, actual 39 upstream files, five host identities and supporting stdlib hash were exact before/after. The verifier also found all 2,807 previous checkpoint files unchanged before/after. See [checks.json](checks.json).

Largest gap: **R1-F01**, resolvable in the HOW without runtime qualification. R1 uses one of two review rounds; one grouped Lead repair and the final R2 remain available. Official distributions, real Codex/backend and other platforms remain future program work. No native SPEC0239 approval or parity credit is inferred, and routine local reference preparation needs no new human T3 decision.

The Lead owns continuity outside this write set. Reviewer outputs are bound by [manifest.json](manifest.json); subject freeze SHA `dc4530aff72413bb54707d324370dc4dd29452ec66cf5ad195417909ed86b89d`; task contract is the canonical [task.json](../task.json), SHA `6b58f3a1a8753da848826d1d4cf198144820d58c58d885b80a7b46a630e5f00d`.

