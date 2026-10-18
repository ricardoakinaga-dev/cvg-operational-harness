# IMPLEMENTED — codec builder, component only

C100-FND-JOURNAL-0225-BUILD-001. No acceptance/DONE granted by this worker.

Two candidate files implement the frozen codec interface and a focused corruption/domain/boundary suite. Existing contracts canonicalizer is reused without modification. Encode delegates bounded strict JSON serialization before Buffer creation. Decode validates exact own data fields and prototype, caps, ASCII/padding/base64 roundtrip, length/SHA, fatal UTF-8/no BOM, pre-graph scan, and canonical equality. Errors carry only the frozen redacted reason.

Node 22.23.2: **165/165 passed, zero failed/pending**, one new test file, single worker, no file parallelism. Prettier write/check covered only these two paths and returned0. Commands, stdout/stderr (including empty strings), cwd, explicit environment and source hashes are captured in JSON. The run inherited no environment variables; environment.json allowlist destinations were relocated beneath the owned codec-builder TMP directory. Physical dependencies were used; no install occurred.

Component evidence includes strict domain and hook rejection, null/falsy/JSON-looking strings, reserved/NUL keys and apparent envelopes, aliases, Unicode without normalization, malformed envelopes/base64/padding/hash/length, fatal UTF-8/BOM, grammar/duplicates/trailing before JSON.parse, noncanonical/domain rejection, exact1MiB/+1 and escaped Unicode byte bounds, depth64/65, and isolated1000000/+1 node limits. Public codec byte dominance is tested separately. Scalar/root depth starts at1; keys count bytes, not nodes.

Limit: expanded JSONB storage cap is implied by the four fixed bounded fields; the component cannot exercise driver projection or native oversized-row handling. J01–J04 native and all other J tests are NOT_RUN here. Adapter/guard/readiness/SQL are Lead-owned; no runtime wired or activated, no functional credit or production/release inference. Nine protected input sources remain hash-identical. No commit, descendant, PG/Docker/SQL/network/provider/app, full typecheck or broad gate was run.

One implementation used; post-critique grouped rework unused, two future reviews belong to Lead. Largest gap is independent review and native integration/proofs. Next action: Lead freezes/reviews the component and continues its owned integration paths. Source SHA-256 values and paths are in IMPLEMENTED.json and source-manifest.json.
