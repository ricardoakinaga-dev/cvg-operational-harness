# Phase 1 decisions

1. **Additive extraction.** New neutral packages are added beside the
   brownfield implementation. No broad move or deletion is allowed.
2. **Contracts first.** The contracts package is dependency-free and is the
   only shared vocabulary owned by this slice.
3. **Single-pass compatibility.** V1 remains the current runtime behavior. The
   new runtime makes one bounded decision and is not a full loop.
4. **Orchestrator is a port.** Orchestration chooses actions; it does not
   authorize or execute tools.
5. **Model gateway is mandatory.** The runtime accepts a `ModelGateway`; no
   provider SDK appears in neutral packages.
6. **Effects are governed.** The order is policy → approval if needed → tool.
   The registry is discovery/execution infrastructure, not authorization.
7. **Audit and telemetry are distinct.** Audit is evidence; telemetry is
   measurement. A failed audit sink downgrades the result to insufficient
   evidence.
8. **MCP is optional.** No MCP implementation or dependency is introduced in
   Phase 1.
9. **Channels stay outside core.** Inbound and outbound message shapes exist in
   contracts; channel adapters remain external to the factory.
10. **Secretary is a consumer.** Compatibility documentation may point at the
    old product, but the neutral core cannot import it.

These decisions are bounded by the controlled gate in
[`../02_spec/0127_harness_refoundation.md`](../02_spec/0127_harness_refoundation.md)
and the frozen quality bar in [`../refoundation/QUALITY_BAR.md`](../refoundation/QUALITY_BAR.md).
