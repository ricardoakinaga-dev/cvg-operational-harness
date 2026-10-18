# SPEC0235 — independent audit of first actual contained native observation

**ACCEPT_BOUNDED_NATIVE_OBSERVATION. No blocking finding in the captured observation.** The raw evidence supports a real selected-Claude2.1.302 port observation under the approved contained configuration: three eligible POSTs received fixed503 responses completed locally. This is **REFERENCE_RECON_ONLY**, with zero semantic/model/M1/parity/catalog credit. **NP10 and final gates remain PENDING with Lead.**

Audited 2026-10-18T04:02:46.984674+00:00, source/code checkpoint `288119672028afb6f0ea5dcca62dae73247b7033`. Capture executed by Lead from2026-10-18T03:49:28.850953Z to03:49:34.927623Z, launcher exit0, PID2172079. This reviewer did not execute/repeat the native probe, invoke Docker/HTTP/network/CLI mains, allocate resources or control Lead's jobs. Original failed BUILD/ledger rounds and budgets remain historical; no corrective code or new authority is granted.

## What was independently checked

[direct-byte-audit.json](direct-byte-audit.json) records **163/163 raw-byte/JSON relationship checks** with no failures. These are audit checks, not163runtime positive controls. A separate pure import of frozen `assertEvidenceBindings` accepted all48inert archived artifacts, [result](inert-validator.json). It did not invoke runProbe, wrappers, selected native, observer/client mains or any transport. The audit independently inspected the actual captured inspect/preflight, host commands/frame order, child hashes/results, HTTP metadata/body digests, source/input inventories and cleanup rather than accepting13PASS labels at face value.

All51archived files match both original files under `/tmp/cvg-claude100-exec-20261017/ref-port-native-r1` and Lead's exact raw file manifest. Report SHA is `f45c2c99f1eb9243147bab70b9f0c6b6b4512bbc5821ccda4fed93c23f28b473`;48artifact bytes total445577. Current35source/protected pins match the reviewed freeze before/after. Full immutable input/file bindings are in [inputs-manifest.json](inputs-manifest.json), SHA `3973814fb34be43c86e0c19ff1ea15710da9a7323250506c9385c73aee602511`. Captures and sources were not modified.

## Actual containment, process and phase facts

| Fact | Captured evidence |
| --- | --- |
| Observer identity | `bf9576a68a68f6bd47a3a69bd435b0b8f302a868bc50fdd256c166a9829ab83c`, hostPID2172256, networkMode none |
| Client identity | `377b458b8f1ad0cca691a63f703305dac1243867cd2cdbc9ff81cd4886e21ee3`, hostPID2172332, networkMode container:observerID |
| Actual preflight | Both UID/GID1000:1000 and PID1; PID namespaces4026533445(observer)/4026533561(client), distinct from captured host; shared net namespace4026533448 distinct from host |
| Interfaces/routes | Both array[lo], route only::1/128; synthetic host marker absent |
| Privileges/mounts | Both readonly rootfs, privilegedfalse, CapDropALL, no-new-privileges, privatePID/IPC/cgroup, no port bindings/devices; five approved readonly binds each |
| Configured resources | CPU1each, pids64each,nofile256; client768MiB/observer192MiB; private noexec/nosuid/nodev scratch+tmp96MiB/32MiB,total128MiB; logdriver none |

The five bind sources are exactly pinned Node/Claude plus this run's retained bundle, synthetic workspace and empty volume-directory binding; no real HOME/repository-wide/host-RW/socket mount. Raw inspect is compared to profile identity/labels/config and preflight. Resource figures are configured ceilings, not measured peak CPU/RAM. Docker's empty PID mode denotes its private default and is corroborated by distinct actual PID namespaces. This accepts the captured configuration under the trusted frozen host/wrappers; it is not a cryptographic OS or hostile-host attestation.

The capture has37global records:27control and10observer, consecutive ordinals and monotonic offsets. Physical trace ownership matches the reviewed partition. CONFIGURE derives the observed port34377 and exact profile/env hashes; client READY matches them. Inspect/preflight precede START_NATIVE. Actual native starts/ends are:

| Phase | PID / PPID in client | Captured monotonic duration | Actual native exit | Signal / timeout |
| --- | --- | --- | --- | --- |
| version |17 /1|17ms|0|none /false|
| port |18 /1|1954ms|1|none /false|

Version rawstdout is22bytes identifying2.1.302; stderr is empty. Version completion and the captured process listing with only the wrapper precede ARM_PORT; ARMED precedes START_PORT. Both starts bind exact `/toolchain/claude` argv, closed seven-key native environment, stdin hashes and readonly selected binary. Client uses only the public fake sentinel and computed loopback base URL, isolated scratch HOME/config, explicit settings/MCP, bare/print/no-session flags and no tools. The launcher HOME belongs to the host bootstrap and is not the child's HOME. No raw profile/message/auth values are reproduced here.

The client wrapper's final captured exit0 is distinct from native port exit1. Native portstdout is1363bytes of JSON with `is_error:true` and `api_error_status:503`; stderr is empty. It is conservatively classified as an error consistent with deliberate503, not a successful model result. No native result/error text was printed or promoted into semantics.

## HTTP origin, privacy, framing and bounds

Three protected observer REQUEST/RESPONSE pairs at global23/24,25/26,27/28 correspond to request ordinals1,2,3, all POST `/v1/messages`, each965bytes with the fixed synthetic marker and absent content encoding. All three bodies are byteidentical, SHA `6a6515c180bbe1af97cbcf35274b217cc598726c0ba357075f2ca4561630bcfc`, and remain inert. REQUEST/RESPONSE refs, body hashes, sizes and windows resolve to the actual observer document; no native stdout is used as an HTTP event.

Each503 response records FINISHED with fixed82byte body SHA `796e602e993c62185defa24a075b0d40fd497b5403e38d5ec88065f6d79198af` and fixed header canonical SHA `ceb4648d9acd33f48bff7ca6e5183c8d222e1d5d5ecbb027f86bccd2d104533d`. This proves completion at the local protected sender, not by itself that a model/remote service or the native client consumed those bytes.

Ordinal0 is an anonymized `UNSUPPORTED_ROUTE` rejection. No URL/query/auth/body0 was retained, and it earns no port proof. Thus four requests reached the collector, of which three were eligible; the reported ordinal gaps are legitimate. No FORBIDDEN_AUTH/CAP/EARLY_PHASE or failure cause is present. Auth/header values are intentionally absent; eligible sentinel admission is supported by the immutable reviewed collector path and protected events, not a newly retained raw-header packet capture. No actual fifthrequest/cap+1/privacy-injection control occurred in this run.

Observed retained volumes:2895eligible bodybytes, native stdout1385bytes across both phases, both native stderrs0, controlNDJSON4262bytes. Native/body raw frame inventories independently match every data chunk/digest and terminal; all native channels and three bodies terminate, with no pending raw chunks, partial bodies or capture-failed flags. Native raw result bytes are absent from the control wire. Framing headers are represented by the validated capture inventory; no packet capture was added.

The Docker evidence contains15completed CLI call records plus two counted local API attach calls (17logical calls, below24); captured completed-call output48839bytes, maximum call elapsed360ms, below their caps. Attach timing is not independently logged as another completed CLI record; the reviewed shared deadline/byte controls still govern it. No repeated create/adoption is shown; both resources bind durable intent/name/full labels/image/config before their creates.

Launcher elapsed is6076.67ms; last protected offset5692ms; native shared observed window2496ms; native end→final identity record1131ms. These fit the approved20s native/30s controller/5s cleanup windows under the recorded frozen control path. The1131ms value is the recorded monotonic closure tail, not a separately instrumented complete syscall trace. No timeout/signal intervention was reported. The audit did not compare container clocks to invent causal order.

## Source/snapshot bindings, normal cleanup and publication

Driver SHA `73016abf06ebeee7968c66bb0df568b60789942b3cdabfb697bcb090c14b4e40` recomputes from the canonical24entry bundle inventory;20source files match the frozen closure. Profile SHA `37bd66bff2ffc6f8c01fda8b8cec14850032854bfb5a6e19a914452f13b1bfb4` recomputes from canonical bytes. Manifest raw/snapshot, literal stdin/settings/MCP and five consumed-input bindings match. Initial BOOTSTRAP_GRAPH and96final identity records bind original/copy/consumed/profile/binaries through closure; toolchain digests agree before/after. This preserves the existing limitation against a malicious host modifying files between checks.

Both wrappers CLOSED normally. Captured final inspect shows stopped wrappers, each owned-ID rm succeeds and exact-ID inspect returns confirmed absence. Lead's separate captured exact-ID inspections agree for both IDs. Reviewer only read those records; no current Docker query was issued. The normal cleanup proof includes attachments/pins/marker/bootstrap disposed, no unresolved resource and empty failures.json. There was no actual-native crash/cancellation/daemon-unavailable cleanup exercise in this observation.

All staged IO entries match closed retained artifacts. Original report.pending/report are byteidentical and the same hardlinked inode (linkcount2), consistent with exclusive closed publication; the `.pending` name is retained protocol evidence, not an incomplete final report. Read-only inspection found no original bootstrap leftovers. [publication-and-privacy.json](publication-and-privacy.json) records these facts. The captured report remains immutable `reviewStatus:PENDING`; this independent verdict is separate and does not rewrite it.

## NP scope, gate ownership and limits

[np-observation-scope.json](np-observation-scope.json) records each NP criterion with its observed evidence and unexercised limits. NP01–NP09 have supporting facts for **this one bounded observation**, not wholesale final qualification. In particular, actual cap+1/negative input/crash/cancel/publication-failure conditions were not exercised here; previous unit controls remain historical bounded evidence. NP10 has approved SPEC/code prerequisites but **final full gates are pending outside this audit**.

The exact human authority and source/codeapproval bindings match launch and precede execution. The `synthetic_only` launch label describes the fixed fixture/key/response, not an in-memory Engine substitution: the recorded original CLI, actual inspect/preflight/selected-child events and captured Engine streams are the actual observation being accepted. No model/account service or semantic response is exercised by this isolated path.

Catalog before/after/current SHA is unchanged at `71a461b63ba7723e79510ba66bd0054ded1a67b539bfce52aff41a1318e4d21b`; verificationClass remains REFERENCE_RECON_ONLY and functional credit0. No M1/comparator receipt, model semantics,134catalog closure, production or release is granted.

Lead-owned finalcert context is PID2177621/session11228, PGprefixd2123134/55876, API3390/web4390. [gate-context-observed.json](gate-context-observed.json) records explicit launch/resource metadata only. No session wait/poll, PID operation, database/socket connection, Docker query, gate rerun or current certificate acceptance occurred. This audit leaves final gates/verifier/root integration to Lead even if that job progresses independently.

## Immutable evidence and verdict

[Inputs](inputs-manifest.json) and final evidence manifest bind all raw sources/captures and audit outputs. [integrity-before.json](integrity-before.json)/[integrity-after.json](integrity-after.json):35source pins,14frozen inputs,51archive and51original files unchanged;144prior review-root files unchanged; R1 680/680, R2 1259/1259, R3 1309/1309, ledger-design9/9, ledger-post1363/1363, ORIGIN-design11/11 and ORIGIN-post1542/1542 MATCH. No prior failed verdict/budget is reset. The previous non-blocking malformed-array diagnostic is historical and was not exercised or corrected here.

| Authoritative input | Full raw SHA-256 |
| --- | --- |
| Approved SPEC235 | `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04` |
| Existing human authority | `74e8ec0ff1e0083ac679db8a20a5eb01776aaed349489c275b2ada81f7fb2fb7` |
| Code/source freeze288 | `8d439b814d942a3455202c8134cc8280d4b32ff0b0870737b86fc7d21dffa3ca` |
| Scoped code approval result | `e5b816482dc27c343e734c1abe0ee9669291c17873077663f2acde6bee50887f` |
| Code approval manifest | `9c7a48c55fcec9ca06c9c852cd81281af244c1987b04677aa15d961d658e8209` |
| Runtime audit contract | `5b550dbabd1ad767865bd7ceaf6821915002e0a5b79df794a4aed0606e2691eb` |
| Actual launch record | `120625c52f41df6e7222580864b0e80ffd46f810a46288df8905c8e4b5c1c7b0` |
| Lead capture manifest | `e8a81334c0c516cbfae4c2cf90a5b1811534ecb5f9fbcaa64307294afe3fc23d` |
| Archived report | `f45c2c99f1eb9243147bab70b9f0c6b6b4512bbc5821ccda4fed93c23f28b473` |
| Control trace | `55fa0a7e1254c7fd76bbec92512807ea6f0a0550a1b3c761d6214f5ec2b6e4cc` |
| Observer trace | `5384224744e588bc8c7acead41d80c0397eceef5e1975a54e3ac67a0057083bf` |

**ACCEPT_BOUNDED_NATIVE_OBSERVATION** is limited to the actual port/containment/integrity/normal-cleanup facts above. Audit findings:0blocking/0new mandatory. Reviewer native executions0, Docker/HTTP/network/resource actions0, delegated agents0; code/capture edits0. Final NP10/full gates remainPENDING, M1/parity/catalogqualification/release NOT_RUN; no new authority or codefix budget.

Next action: Lead finishes its already-owned final gates/verifier and reconciles qualification/integration under the existing process. This acceptance does not authorize a second native run, new model/account scope, semantic capture or automatic integration.
