<!-- Rendered copy with portable links; verbatim original: review-r1.raw.txt -->

**NEEDS_CHANGES** — two P2 findings require correction within the bounded extraction evidence. No P0/P1 established.

1. **P2, mandatory — schema traversal silently loses constraints and nested map types.**  
   [extract_contracts.py:122](review-r1-inputs/g01/extract_contracts.py:122) drops `not`, `exclusiveMinimum` and `format`; traversal also stops at schema-valued `additionalProperties`.

   Concrete losses:
   - Upstream [config.schema.json:4332](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/config.schema.json#L4332) prohibits mixing `filters` with `exclude` or `include_only`. The corresponding [matrix rows:125648](review-r1-inputs/g01/variant-matrix.json:125648) become empty constraints. Independently, [shell_environment_policy.rs:106](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/config/src/shell_environment_policy.rs#L106) enforces this rejection.
   - Upstream [config.schema.json:4962](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/config.schema.json#L4962) requires positive `mouse_scroll_speed`; [matrix:137228](review-r1-inputs/g01/variant-matrix.json:137228) loses that bound.
   - `ShellEnvironmentPolicyFilter` retains a raw reference but never expands its `include|exclude` enum or marks expansion pending.

   **Remediation:** preserve/traverse these constructs, or emit explicit unsupported-keyword/unexpanded-type obligations. Label existing node counts as partial projections until reconciled.

2. **P2, mandatory — request responses disappear from the variant matrix without explicit coverage gaps.**  
   [extract_contracts.py:165–176](review-r1-inputs/g01/extract_contracts.py:165) walks request envelopes and parameters, but never expands their response types.

   For example, [currentTime/read matrix:52909](review-r1-inputs/g01/variant-matrix.json:52909) contains 13 request-side nodes and no response obligation. Upstream [current_time.rs:16](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/app-server-protocol/src/protocol/v2/current_time.rs#L16) requires `currentTimeAt: i64`, expressed in whole Unix seconds. Likewise, `thread/queue/add` omits its `queuedSubmission` response.

   **Remediation:** add response-side expansion or explicit `OPEN` response obligations per request, including response sender. Completing those expansions can remain future G01 work; making the omissions visible is required now.

**Verified:** all ten frozen hashes matched before and after review; 110 referenced upstream source paths matched their digests; source-only excerpts and both pinned raw-event schema copies matched. All 401 original requirement records remain semantically identical. The 106 additions produce exactly **485 functional requirements + 22 controls**. Structural counts reproduce; they do not measure functional coverage.

**Advice:** include the current catalog digest in the next review manifest. Its unchanged SHA-256 during this review was `56e58dbb2603d69d71c5cfa6507a47226ac69f3f2a69afea2d4359ed4d26ba4b`.

The five source-only dispositions are supported at their stated bounded level; no fresh defect established there. Companion/source binding, delegated helpers, transitive types, exec-server payloads/reachability and CLI/SDK completeness remain acknowledged gaps.

Read-only review; no files modified, generators, tests, certification or network used. No verdict on full G01, parity, runtime, gates or reuse.
