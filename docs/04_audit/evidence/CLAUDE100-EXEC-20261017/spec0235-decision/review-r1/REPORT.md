# SPEC0235 — independent documentary review R1

**REVISE — 3 mandatory P1, 2 mandatory P2.** The exact frozen SPEC is not yet ready for human T3 approval. This is a contract review, not a runtime rejection or a claim that a particular implementation is vulnerable.

Task `C100-Q01-REF-PORT-001`; initial fresh critic, no descendants, no corrective round consumed. Reviewed at `2026-10-18T00:33:58.748249+00:00`.

Frozen packet SHA-256: `2f91338649bf2014d557592b5ac5caea24389395094109bed72fbb03ae140786`. SPEC SHA-256: `53fe829fe506ea7d06088616a0dafb2a564752892d3b21df5fe9dc7658380a24`. Packet plus all eight inputs matched before and after this review. Exact inventory and local artifact hashes are in `manifest.json`.

The requested goal is only real native POST → a fixed synthetic 503 in two confined containers. No model/semantic response, account, M1, functional receipt or parity credit is required or granted. SPEC0229 approval does not authorize this probe.

## Scope, authority and procedure

User ownership permits only REPORT.md, verdict.json, manifest.json here and the critic’s private /tmp subtree. The claim was recorded in this manifest before substantive evidence writes, using the delegated lane in coordination:96. Shared coordination and ledgers99/20/30 stayed read only; their mandatory persistence is handed to the Lead through this report. Existing foreign changes were preserved. No descendants, native binary, build, tests, gates, container operation, network, installation, commit or process control was used. Live Q04 resources were not inspected or touched.

Read applicable AGENTS/constitution/coordination, current ledger context, all eight frozen inputs and narrowly relevant existing publication source. Method: local cat/rg/nl/sed, Python JSON/byte/hash inspection and static failure-path reasoning. Two exploratory rg path misses returned exit2 and were corrected; they were not test failures. Large initial ledger/coordination output was truncated; relevant current claims/rules were subsequently selected. Detailed command/procedure records and source hashes are in the private artifacts listed by manifest.json. No broad audit followed initial instruction discovery.

## Evidence and feasibility limits

The frozen recon establishes selected-file digests, literal configuration occurrences, bounded byte excerpts and the reported lack of native REA analysis providers. For example, focused-configuration-bytes.json:6-8 counts eight ANTHROPIC_BASE_URL occurrences; its excerpts expose configuration references, not executed branches. bounded-artifact-strings.json labels its evidence STATIC/T1 and explicitly says transport behavior is unproven. The README:8-28 preserves that distinction. The three keyless strings concern remote attestation, not a proven local account-free API.

The fixed synthetic key/base URL is therefore a hypothesis to probe, not an already supported transport. ELF/Node/image compatibility remains unexecuted, as SPEC:55-58 correctly states. No linked online documentation was fetched because network use is outside this review’s authorization.

The proposed network-none observer plus network-sharing client, separate PID/mount namespaces, real inspect/preflight and private host evidence are credible containment controls. The host marker alone is only a narrow corroboration; the whole required inspect/namespace/mount/route profile is needed. Fake native stdout must not become HTTP evidence. The shared public sentinel does not authenticate process identity; provenance depends on trusted frozen host/wrapper/collector code and phase evidence. No new distributed authentication is needed.

## Mandatory corrections

### R1-01 — P1 — The input and executable identity chain is not defined completely

Criteria: NP01, NP04, NP08, NP10. References: `docs/02_spec/0235_claude_native_port_probe.md` lines 33, 78, 101, 109, 115, 172, 180, 183, 215.

**Observed contract:** The report names driverSha256/profileSha256 without defining their byte domains or bundle recipe. Binary handles/pre-post checks cover the selected toolchain, but no equivalent rule covers the trusted observer, client wrapper and imported helpers. The closed report has no manifest digest or mandatory artifact mapping for the exact consumed manifest, stdin and resolved profile. A generic artifacts list could carry these, but the SPEC does not require that inventory.

**Discriminating case:** Change an observer/helper while retaining the CLI script, toolchain and semantic manifest values. Both implementations can choose the same driverSha256/profileSha256 under the current undefined recipe; the reviewer cannot determine which trusted collector was executed. This is an underspecified contract, not a demonstrated exploit.

**Why mandatory:** NP08 requires alteration of any input to invalidate its binding. Pinning only the three binaries cannot establish that property for the observation software and input.

**Smallest required correction:** Define raw/canonical digest domains and the deterministic bundle/profile recipe, including the controller, both wrappers/collector, imported helpers, synthetic settings/MCP, literal stdin, fixed argv/env template and resolved run-specific values. Require a retained consumed-input inventory and bind it to Reportv1, either through defined artifacts or explicit fields. State which snapshots/handles are used, when drift is checked and which status it causes. This needs no distributed signature or new trust service.

**Closure:** Documentary examples must let a reviewer recompute the same digests from retained bytes. Future negatives must change a helper, observer, manifest bytes, fixture/config and resolved invocation independently and defeat the relevant integrity check before launch or invalidate the run afterward. No digest used to grant PORT_OBSERVED may be null.

### R1-02 — P1 — The trusted observation protocol does not yet specify the native POST to fixed 503 proof

Criteria: NP03, NP04, NP05, NP06, NP08. References: `docs/02_spec/0235_claude_native_port_probe.md` lines 82, 90, 93, 124, 128, 133, 139, 147, 151, 153, 185, 212.

**Observed contract:** The collector/client separation is sound in direction, but the only specified host command is START_NATIVE. READY/preflight, version/port phase boundaries, child execution results and observer events have no closed framing or ordering contract. Version and prompt invocations are both allowed after START_NATIVE. Clock origin/offset derivation across containers is unspecified. The fixed 503 response has no frozen body/header bytes or required response completion record; observations describe requests only.

**Discriminating case:** An eligible callback followed by a response write/connection failure is not by itself evidence of the required POST503 exchange. Similarly, a request during the version phase is after START_NATIVE but is not evidence of the prompt probe. These paths need a rejectable event contract, not assumptions about current Claude behavior.

**Why mandatory:** NP03 rejects fake stdout, NP04 requires real launch/lineage and NP05 requires a real POST503. The current text does not define enough evidence to check those claims independently.

**Smallest required correction:** Freeze a small bounded host/wrapper/observer event protocol with source ownership, phases, framing, required fields, duplicate/out-of-order/EOF rejection and one time reference or explicit host ordering. Specify how native bytes remain data and how actual child exit/signal is obtained. Only the prompt-probe phase may contribute eligible observations. Freeze the synthetic 503 bytes/headers and require protected collector evidence of response outcome tied to the request; distinguish local response completion from proof that the client consumed it. State the local trust assumption: host, wrappers and collector are trusted reviewed software; the public synthetic sentinel is a routing/fixture guard, not authentication of a particular process.

**Closure:** Future negatives must cover client stdout containing fake events, malformed/duplicate control frames, POST before the prompt phase, missing native-start/result evidence and response failure after request receipt. None may manufacture the claimed exchange. A retained positive trace must identify the pinned prompt invocation and its actual observer-generated 503 outcome. No model response or functional adapter is requested.

### R1-03 — P1 — Uncertain Docker creation and failed cleanup lack a bounded recovery contract

Criteria: NP02, NP06, NP07, NP08. References: `docs/02_spec/0235_claude_native_port_probe.md` lines 62, 96, 98, 100, 135, 159, 162, 166, 170, 214.

**Observed contract:** The SPEC permits management only of created IDs checked against labels, gives deterministic names and requires cleanup within 5s. It does not say how ownership is recovered if Docker creates a container but its ID reply is lost, or how a controller crash/daemon outage is represented and handed off. NP07 states no container/process remains, which cannot be guaranteed within the deadline when the daemon cannot answer. Native output/artifact limits also do not explicitly allocate bounds for control/observer/Docker streams or daemon logging.

**Discriminating case:** docker create succeeds at the daemon, then the CLI times out before returning the ID. Retrying create may duplicate an uncertain effect; ID-only cleanup cannot address the container without a defined exact-identity reconciliation. A daemon outage can also outlast the cleanup budget.

**Why mandatory:** This is an NP07 failure-path feasibility gap, and a resource/evidence boundary for NP06/NP08. A time-bounded failure is possible; a time-bounded unconditional no-orphan guarantee is not.

**Smallest required correction:** Record role/name/run nonce and creation intent before each create. Specify an exact-name/identity recovery procedure with full labels and image/config verification, no adoption of unrelated containers, no global inventory and no repeated uncertain create. Define crash/cancellation ownership and a finite unresolved-cleanup handoff containing only owned identities. Unconfirmed cleanup must yield INFRA_FAILURE/incomplete evidence and cannot satisfy NP07 or publish PORT_OBSERVED. Scope the 20s/30s/5s clocks to all relevant operations and bound subprocess/control buffers and daemon logging without expanding resources.

**Closure:** Future injected cases must cover create-completed/reply-lost, second create failure, inspect timeout, daemon unavailable during cleanup, controller cancellation/crash and primary-plus-cleanup failure. Each must produce either verified removal or an explicit owned unresolved-resource record, preserve all causes and avoid false clean/PORT_OBSERVED. Document the bounded human/Lead recovery next action when removal cannot be confirmed.

### R1-04 — P2 — Reportv1 is closed by name but is missing the evidence invariants needed for rejection

Criteria: NP02, NP03, NP04, NP05, NP06, NP07, NP08. References: `docs/02_spec/0235_claude_native_port_probe.md` lines 83, 85, 147, 148, 172, 185, 188, 190, 192, 194.

**Observed contract:** containmentChecks has no required ID set/order/uniqueness or mapping to real inspect/preflight evidence. Artifacts has no required roles or uniqueness/cardinality relationship to observations. Classified content-type/content-encoding and temporal evidence required at lines147-151 have no defined retained record location. A real native SIGABRT/SIGSEGV cannot be faithfully represented by the closed SIGTERM/SIGKILL/null field if that signal was observed.

**Discriminating case:** A report containing one arbitrary PASS check and a syntactically valid observation has no explicit schema-level missing-check rule. An artifact digest could point to unrelated bytes unless the observation-to-body/event relationship is mandatory. This does not mean such a report obeys the prose; it means its deterministic rejection contract is incomplete.

**Why mandatory:** The independent reviewer cannot mechanically distinguish complete real controls from a selectively populated report. A closed schema must represent genuine failures as well as the intended path.

**Smallest required correction:** Define the mandatory control IDs, their source artifacts and state/order rules, plus bounded list/type/uniqueness/path invariants. Require each observation to resolve to the exact raw body and protected event record, including encoding classifications, phase/time relation and response outcome from R1-02. State which absent evidence makes PORT_OBSERVED impossible. Allow faithful recording/classification of other observed native signals; reserve null for genuinely unobserved information with a limitation. Keep this report REFERENCE_RECON_ONLY.

**Closure:** Future report validation must reject missing/duplicate required checks, PASS without required raw evidence, digest/size mismatch, duplicated/out-of-range ordinals and wrong phase/body links. A synthetic non-TERM/KILL native signal must have a valid honest failure representation. This is a documentary schema correction, not a request to add product capabilities.

### R1-05 — P2 — Failure precedence leaves privacy violations and concurrent failures ambiguous

Criteria: NP01, NP05, NP06, NP07, NP08. References: `docs/02_spec/0235_claude_native_port_probe.md` lines 55, 139, 141, 150, 153, 156, 175, 198, 199, 201, 202.

**Observed contract:** The status paragraph lists categories but does not fully define competing runtime failures. A non-synthetic auth/token/cookie is a recorded violation, yet its terminal classification and effect on a previously eligible POST are absent. A toolchain digest failure overlaps hash INVALID_INPUT and toolchain INFRA_FAILURE; blocked preflight plus cleanup failure also has no explicit precedence. A required check failing must not be overridden by an earlier eligible POST.

**Discriminating case:** Observe one eligible POST, then reject a request carrying forbidden auth, then encounter cleanup failure. The report must preserve all causes and deterministically select a non-success status; choosing between the available categories is currently left to the builder.

**Why mandatory:** The scope promises fail-closed privacy and integrity, and exit0 only for an intact observation. That is testable only with a frozen terminal decision rule.

**Smallest required correction:** Provide an ordered phase/failure table covering invalid CLI/input, missing/mismatched/incompatible toolchain, preflight failure, forbidden auth, request/output cap, native timeout/exit, control protocol failure, late drift, IO and cleanup failure. Freeze the terminal status, exit code, retained primary/additional causes and later NOT_RUN checks. Explicitly deny PORT_OBSERVED whenever a required safety/integrity check fails, even after an eligible request. Define marker/opaque-body outcomes consistently with the intentionally port-only goal; do not add a functional-parity requirement.

**Closure:** Documentary cases must have exactly one expected status/exit/check chain for eligible-POST plus forbidden auth, cap overflow, timeout, digest drift, cleanup failure and final publication failure, as well as preflight plus cleanup dual failure. Future tests must preserve that mapping and never silently downgrade a violation to PORT_NOT_OBSERVED or success.

## NP01–NP10 disposition

| Criterion | Documentary assessment | Findings |
| --- | --- | --- |
| NP01 | Needs correction | R1-01, R1-05 |
| NP02 | Needs correction | R1-03, R1-04 |
| NP03 | Needs correction | R1-02, R1-04 |
| NP04 | Needs correction | R1-01, R1-02, R1-04 |
| NP05 | Needs correction | R1-02, R1-04, R1-05 |
| NP06 | Needs correction | R1-02, R1-03, R1-04, R1-05 |
| NP07 | Needs correction | R1-03, R1-04, R1-05 |
| NP08 | Needs correction | R1-01, R1-02, R1-03, R1-04, R1-05 |
| NP09 | Documentarily adequate | None |
| NP10 | Documentarily adequate subject to corrected freeze | R1-01 |

Every NP execution status remains **NOT_RUN**. NP09 and the gate ordering in NP10 are adequate as documentary requirements; neither has executable acceptance from this critic. Positive containment and native transport remain future real observations, not mocked or inferred results.

## Optional suggestions — do not block this review

- **O1 / P3 — Reuse the qualified publication mechanism explicitly** (SPEC lines 33, 166, 170): Existing Q01 safe-io.mjs:336-398 and qualify.mjs:523-618 already show staging, close-before-publish and final exclusive report.json publication. Their static source is feasible support for the intended rule. An explicit normative reference and frozen helper identity would save reimplementation. Preserve its pending/final distinction and apply the probe-specific 8MiB cap; this is a reuse suggestion, not a requirement to import the qualifier or rewrite publication.

- **O2 / P3 — Explain marker/protocol limits near the successful port result** (SPEC lines 149, 150, 153, 195): The marker and recognized JSON are intentionally separate from eligible transport observation. A short example of PORT_OBSERVED with an opaque body would help operators avoid treating it as SDK/model qualification. Do not strengthen the probe into semantic or functional parity.

## Publication, limits and retained authority

SPEC:166-170 already prohibits treating partial output as a published report. Read-only inspection of existing Q01 safe-io.mjs:336-398 and qualify.mjs:523-618 found a feasible stage → close → exclusive final link pattern. publication.test.js contains synthetic final-write/close/link failure cases, but none was executed here. This is supporting feasibility evidence only; it does not confer NP acceptance. Probe cleanup and input/binary checks must all precede the publication boundary, and final IO/cleanup failure must not leave authoritative PORT_OBSERVED output. The failure table and required evidence above make that existing rule rejectable without requesting a publication redesign.

P1 means a missing trust/measurement/containment failure contract before a native launch; P2 means an essential schema/classification gap preventing deterministic rejection. These are mandatory pre-T3 SPEC corrections, not authority to implement changes. P3 suggestions are optional.

## Handoff / next action

Lead corrects only mandatory contract gaps, freezes a new SPEC/packet and returns the changed contract for bounded corrective review. Then obtain explicit human T3 approval of the accepted exact SPEC; only afterward BUILD/code review and separately claimed native execution/gates.

Keep this R1 and its failed documentary cases immutable. The unit permits at most two corrective rounds; do not open another critic or broaden the work to justify a preferred outcome. Q04 work remains independent. There is no external blocker to revising the contract; hence REVISE, not BLOCKED. Human review/code/runtime gates remain ungranted.
