<!-- Portable rendering; verbatim original tools-review-r1.raw.txt -->

**NEEDS_CHANGES** — three mandatory P2 findings.

1. **Test-only registration loses its compile-time guard.**  
   [tool-graph.json:18](tools-r1-inputs/tools/tool-graph.json:18) classifies `TOOL-REG-001` as an unqualified runtime-input family. Upstream [spec_plan.rs:319](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/spec_plan.rs#L319) places `append_source_tools` under `#[cfg(test)]`; the recorded excerpt starts at line 321 and omits that attribute. `build_core_tool_registry` similarly loses its attribute at upstream line 291. Preserve these guards and distinguish **39 textual registration sites, including one test-only site**, from production registration sites.

2. **The verifier can accept incorrect registration-to-handler relationships.**  
   [verify_tool_graph.py:21](tools-r1-inputs/tools/verify_tool_graph.py:21) checks aggregate connectivity, but never matches each site’s bindings to its source expression. Swapping `PlanHandler` and `SleepHandler` between `TOOL-REG-010` and `TOOL-REG-019` preserves every checked count, set, excerpt and special assertion. Emptying `per_handler_predicates` also goes unchecked. The four negatives at lines 64–68 therefore do not establish semantic binding/guard verification. Add controls and validation for these corruptions. This conclusion follows from code inspection; no probes were executed.

3. **An inherited registration guard lacks source expansion.**  
   The summaries mention a “Core startup sandbox ceiling,” but the graph contains no excerpt for `require_managed_sandbox`. Upstream [spec_plan.rs:1177](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/core/src/tools/spec_plan.rs#L1177) rejects **all four core registration families** when the thread or any selected environment violates the managed-sandbox requirement. The generator’s source-function selection at [build_tool_graph.py:280](tools-r1-inputs/tools/build_tool_graph.py:280) omits `add_core_tool_sources`. Include and connect that static guard; this is within the claimed bounded registration graph, separate from deferred runtime qualification.

Verification: **6/6 frozen package hashes and 53/53 source hashes match; all 280 excerpts match.** Independent enumeration confirms 39 registration calls. No incorrect current implementation binding or resolved base name was found among the 36 bindings.

The supplied `upstream8d9f6466` path is absent; inspection used `/tmp/cvg-rea-codex-20261017/upstream`, clean at the required commit.

Unchecked: CLI, concrete contributor/MCP inventories, delegated behavioral/schema expansion, and runtime variants. No writes, generators, tests, network, target execution or descendants. No G01 closure, runtime, gate or reuse approval.
