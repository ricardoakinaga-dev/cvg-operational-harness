# Final independent runtime review R2

Verdict: **ACCEPT_BOUNDED_DIAGNOSTIC_WITH_8_INCONCLUSIVE_SOURCE_ID_CASES**.
No mandatory findings. The bounded diagnostic completed; the new reference
oracle proof remains **INCOMPLETE**.

All166 frozen files match before/after. Independent reconstruction checked23
fixtures,69 exact raw stdin writes and delivery/flush ledgers,73 stdout frames,
stream/frame hashes and offsets,23 successful init and23 successful barrier
controls exactly once. Integers and Decimal preserve numeric distinctions;
raw tokens/frames remain the authority. No target, driver, postreader or helper
was imported or executed by this reviewer.

| Source case       | Raw ID token           | Through fixture EOF                  |
| ----------------- | ---------------------- | ------------------------------------ |
| i64-min           | `-9223372036854775808` | **INCONCLUSIVE: no target response** |
| minus-2p53-minus1 | `-9007199254740993`    | **INCONCLUSIVE: no target response** |
| minus-2p53        | `-9007199254740992`    | Exact typed/raw echo                 |
| minus-one         | `-1`                   | Exact typed/raw echo                 |
| zero              | `0`                    | **INCONCLUSIVE: no target response** |
| one               | `1`                    | **INCONCLUSIVE: no target response** |
| 2p53-minus1       | `9007199254740991`     | **INCONCLUSIVE: no target response** |
| 2p53              | `9007199254740992`     | Exact typed/raw echo                 |
| 2p53-plus1        | `9007199254740993`     | Exact typed/raw echo                 |
| i64-max           | `9223372036854775807`  | **INCONCLUSIVE: no target response** |
| string-large      | `"9007199254740993"`   | **INCONCLUSIVE: no target response** |
| string-empty      | `""`                   | **INCONCLUSIVE: no target response** |

Three of the four target responses arrived after the barrier; only minus-one
arrived before it. The other eight source fixtures have zero target frames
through EOF. These are not eight wrong values or demonstrated ID rejections.
Missing responses include0,1 and both strings, so grammar inference is
confounded. The source_echo_mismatches=8 field counts absent echoes. No
incorrect returned numeric value was observed.

All11 edges also have zero target frames through fixture EOF. Exact request
tokens, successful controls, notification and full raw streams are retained.
This proves neither invalid-grammar rejection nor universal absence/timeout.

The driver closes stdin after barrier response. Five source files were read
directly and SHA256/Git-blob matched to the readonly8d9 source snapshot.
ThreadList has serialization=None; such requests are spawned. EOF can emit
ConnectionClosed before RPC cleanup; connection handling closes routing, and
output for a disconnected connection can be dropped. These paths corroborate
a lifecycle confound, not the cause of any individual absence. The barrier is
not a completion fence. The Lead-only EOF appendix was not used as evidence.

R1-approved local inputs, copied controls,11 control pins and8 contract source
pins still match. Captured kernel proof shows4GiB/CPU2/pids256/zero swap;
all23 trusted inner prefixes match guards/argv and separated host/outer/inner
namespaces. Preserved commands/guards bind clearenv, readonly inputs, private
home/tmp and collector separation. Current full streaming ELF SHA256 is
5cce726469af232c080355eff2a49ded7b6fbe26eaf7a702e6e15ce3e89f2605
for1,477,793,024 bytes, unchanged from R1.

Attempt lossless-ef193bc016 is TERMINAL/0 after2.831s, with no primary or
secondary fault and no forced Capture cleanup. Fresh readonly exact-scope
query returned not-found/inactive/empty ControlGroup; the kernel cgroup path
is REMOVED. Terminal reports3,179,061 bytes final storage and3,206,492 preserved,
below512MiB. Disk assertions belong to the pinned successful runner; no
historical free-space samples are invented. Private-home SQLite contents
are outside semantic inputs and were not inspected.

All23 driver summaries and postreader rows agree independently with raws.
Acceptance preserves four positive observations and eight inconclusive source
cases. It grants no complete i64 proof, edge-rejection oracle, normalization
authority, functional CVG credit, Native BUILD or release. SPEC0231 remains
SHAe3af1f7f/human PENDING/NO_BUILD; full goal and prior54 OPEN axes are unchanged.

Budget exhausted: reviews2/2, attempts1/1, automatic retries0, descendants0.
No further execution in this unit. A materially changed later fixture requires
a separate contract/unit. Lead owns continuity. Only [review.json](review.json),
this report and [evidence.json](evidence.json) were written.
