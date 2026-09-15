# Phase 3 — Task registration (AAA-31)

- Task: `CVG-PHASE3-RUNTIME-V2` / `AAA-31`
- Authority: explicit user master prompt (iterative governed agent loop).
- Gate: `PHASE2_HANDOFF=VERIFIED` (see `docs/phase3/PHASE_2_HANDOFF.md`) then
  controlled local `BUILD`/`AUDIT`.
- Scope: local controlled/synthetic only. No real data, provider, channel,
  RAG, sensitive action, deploy, or external effect. Production remains
  `NO_GO`.
- Deliverable: iterative governed runtime (Runtime V2) over the Phase 2
  durable execution spine, with a hybrid orchestrator, context engine,
  completion/sufficiency evaluation, durable step checkpoints, budgets, loop
  detection, pause/resume, and certification evidence.
- Non-goals: Secretary/Rick integration, real RAG, MCP, multi-agent, parallel
  tool calls, DAG workflows, long-term memory, full skill runtime.

## Required sequence (executed)

1. Refresh Phase 2 evidence and verify the current candidate.
2. Register contracts and architecture.
3. Implement step/checkpoint foundation and persistence migration.
4. Implement Runtime V2 and the hybrid orchestrator.
5. Implement context engine, evaluator and governance integration.
6. Build synthetic operational/knowledge scenarios.
7. Prove pause/resume, crash/recovery, budget, loop detection, adversarial
   containment, tenant isolation, and Runtime V1 compatibility.
8. Run the complete regression, generate evidence, run the independent
   critic, and publish the final report.
