# Independent HOW review R1

Verdict: **APPROVE_BOUNDED_LOSSLESS_REFERENCE_HOW**. No mandatory findings.
Eight frozen inputs and ten frozen criteria were reviewed. This approves the
bounded reference experiment design; actual runtime completion remains unproved.

The plan contains 23 distinct raw tokens: ten i64 values, two strings and eleven
edges. The new driver creates one fresh stdio Capture per case, sends initialize,
raw-ID thread/list and barrier thread/list, then drains through EOF. All23 cases
and69 delivered writes are required. Typed control matching and final inspection
reject missing or duplicate controls, including late duplicates. Target responses
after the barrier remain captured. Missing targets mean only absence before
this fixture EOF; edge rejection is never forced.

The raw request file, delivery ledger, stdout/stderr and frame byte hashes are
the authority. Python parsed floats are diagnostics. Source echo disagreement
is recorded explicitly and receives no functional MATCH. Neither successful
controls nor process exit0 grant CVG functionality or normalization authority.

The base collector is imported only inside main under a non-main name. Its
Capture, double namespace, readonly mounts, guard prefixes, pipe draining,
deadlines and first-failure handling are reused unchanged. The recomputed runner
diff exactly matches the submitted diff: cases in the review gate, base/plan
control copies, and a distinct attempt prefix. Eleven transitive control hashes
and eight source hashes match. Both direct-input hash passes match8/8.

A complete streaming read of the regular, nonsymlink ELF matched1,477,793,024
bytes and SHA256 `5cce726469af232c080355eff2a49ded7b6fbe26eaf7a702e6e15ce3e89f2605`.
The ELF64 little-endian machine62 header and terminal387a record binding match
provenance at pin8d9. This review did not rerun dependency/build verifiers or
independently rehash their complete trees. The previous accepted packet remains
readonly and supplies the inherited implementation boundary.

The recorded16 observer checks comprise2 positive data cases,12 rejected
mutations and2 numeric/type mismatch cases. Their categories agree with the
inspected branches and driver digest. They were not reexecuted by this critic;
recorded Popen_calls=0 is evidence supplied by that data artifact.

Before execution the Lead must explicitly accept the five gated input hashes.
The gate was observed as NOT_APPROVED_DO_NOT_EXECUTE and was not changed.
The single authorized attempt must prove current resource headroom, real
4GiB/CPU2/pids256/zero-swap guard, namespace proofs,180s scope deadline,
8MiB captures,512MiB monitored storage and8GB/6GB disk thresholds. Storage
monitoring is not a kernel filesystem quota. Preserve the primary failure and
secondary cleanup failures, verify the exact owned cgroup empty/inactive before
copying, retain control copies/raws and verify the final ELF SHA. These are
runtime acceptance obligations, not claims that they have already passed.

Afterward, reconstruct all23 cases and69 writes directly from preserved bytes,
check successful controls exactly once through EOF and retain every source echo
mismatch as a finding. Partial output or cleanup uncertainty cannot be accepted
as completed observation. No target, helper, app, SDK or provider code was
imported or executed here; only trusted standard-library parsing/hashing and
source inspection were used.

One critic and one review round were used; one review remains eligible for
runtime after Lead acceptance. No rework was used, no experiment was run by the
critic, at most one experiment remains and automatic retries stay zero.
SPEC0231 at SHAe3af1f7f remains human PENDING/NO_BUILD. Previous15/26/8/5
triage and all54 OPEN axes are unchanged. No functional receipt, BUILD grant,
release or approved normalization follows from this verdict.

Only [review.json](review.json), this report and [evidence.json](evidence.json)
were written. The delegated task/user instruction defines this narrow claim;
continuity, resource preflight and any runtime data reader remain with the Lead.
