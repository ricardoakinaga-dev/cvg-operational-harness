# Agent evals

## Veredito

Os evals têm formato comportamental, mas executam `createDeterministicEvalAgent()`, não o published runtime nem o kernel (`scripts/phase10-eval-report.ts`; `packages/agent-evals/src/agent.ts`). `npm run test:evals` passou 8/8 testes, provando o runner, não qualidade do agente real.

Gaps:

- `hallucinationRate` deriva de falha de `structuredValid`, não de factual hallucination (`metrics.ts`);
- multi-turn é concatenado em uma regra determinística, não mantém dialogue state;
- sem provider/model variance, factual judge, provenance validation ou tool-result replanning;
- sem golden traces de ambos runtimes;
- certification artifacts são snapshot-bound e alguns apontam para commits anteriores.

## Arquitetura futura

1. adapter comum para published/kernel/future orchestrator;
2. offline unit/contract evals;
3. stateful scenario + golden conversations;
4. groundedness por claim/source/version;
5. tool selection/action appropriateness e effect-free dry run;
6. adversarial prompt/tool/RAG injection;
7. regression por versioned dataset;
8. production shadow apenas após authority, sem effects.

Score: **4/10**. Evals precisam medir comportamento do artifact real antes de bloquear release/extraction.
