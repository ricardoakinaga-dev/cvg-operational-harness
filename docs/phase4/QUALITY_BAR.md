# Phase 4 Quality Bar — AAA-41 v1

- Version: `AAA-41-v1`
- Frozen before implementation: 2026-09-15
- Scope: controlled local synthetic environment
- Production: `NO_GO`
- Evidence rule: a required `FAIL`, `NOT_RUN`, `SKIPPED`, `BLOCKED`, `STALE`,
  or `UNKNOWN` result prevents an unconditional Phase 4 PASS.

Each criterion is independently rejectable. The current baseline is
`NOT_PROVEN` unless an evidence path below records a current result for the
exact candidate.

| ID     | Source | Dimension         | Required target                                                                                                              | Evidence                                         |
| ------ | ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| P4-C01 | USER   | core purity       | Core capability contracts depend on no product, provider, channel, or framework package                                      | dependency-direction test and package inspection |
| P4-C02 | USER   | contract boundary | Descriptor data and executable implementation are separate; descriptors never expose handlers                                | registry API and mutation tests                  |
| P4-C03 | USER   | supply chain      | Registration is explicit, static, duplicate-free, and exact-versioned; no latest/auto-discovery                              | negative registry tests and source scan          |
| P4-C04 | USER   | governance        | Every composed execution reaches the existing Runtime policy/approval/journal/audit path                                     | public harness integration test                  |
| P4-C05 | USER   | trust             | Input/output and all non-core origins are treated as untrusted; malformed/oversized/cyclic data fails closed                 | adversarial boundary tests                       |
| P4-C06 | USER   | composition       | One registry produces a deterministic descriptor fingerprint and rejects ambiguous/missing composition                       | composition tests and fingerprint artifact       |
| P4-C07 | USER   | extensibility     | Native, Skill, Plugin, knowledge, and simulated MCP origins use the same contract without granting authority                 | multi-origin parity test                         |
| P4-C08 | USER   | MCP readiness     | MCP remains an optional simulated adapter; no network/client dependency is required                                          | optional adapter test and dependency scan        |
| P4-C09 | USER   | replaceability    | Two provider implementations can be swapped without changing Runtime/policy/approval wiring                                  | A/B public-path comparison                       |
| P4-C10 | USER   | durability        | Existing effect journal and durable approval paths preserve replay, restart, and uncertain-effect semantics                  | existing regression plus composed path           |
| P4-C11 | USER   | tenant isolation  | Capability execution retains tenant/agent/correlation scope and cannot cross tenant boundaries                               | isolation test                                   |
| P4-C12 | USER   | concurrency       | At least 20 concurrent synthetic compositions remain deterministic and do not duplicate effects                              | concurrent public-path test                      |
| P4-C13 | USER   | negative safety   | Unknown origin, version drift, invalid descriptor, invalid result, unauthorized tool, and direct bypass attempts fail closed | named negative tests                             |
| P4-C14 | USER   | conformance       | A second independent consumer can compose the registry through the public contract without deep imports                      | consumer/conformance test                        |
| P4-C15 | REPO   | evidence          | Current candidate digest, command results, skips, limitations, critic, sentinel, and report are linked                       | evidence manifest and final report               |

## Non-negotiable invariants

- A registry or origin never authorizes an effect.
- Skills, Plugins, MCP, model output, and knowledge are instructional/data
  inputs only.
- Policy precedes execution; approval remains a human gate; the Runtime owns
  sequencing; the journal owns effect fencing; audit remains causal.
- Removing an extension cannot remove the Core execution path.
- A version or composition mismatch fails closed rather than selecting a
  fallback or latest implementation.
- No evidence is valid after a source/configuration/contract change without
  recomputing the candidate and rerunning affected checks.
