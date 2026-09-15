# Model Gateway

## Conclusão

O package é um candidato forte a `MOVE_WITH_REFACTOR`, mas está pouco integrado ao runtime default. Score arquitetural sugerido: **7/10**; integração real no produto: **3/10**.

## Capacidades confirmadas

- contrato `ModelProvider` e profiles: `packages/model-gateway/src/contracts.ts:105-149`;
- providers determinístico, OpenAI-compatible HTTP e Ollama: exports em `packages/model-gateway/src/index.ts`;
- routing por task/profile/classificação/localidade e fallback: `router.ts:60-112`;
- timeout/AbortSignal, retries técnicos e fallback: `gateway.ts:156-424`;
- structured output fail-closed: `gateway.ts:427-455`;
- circuit breaker por provider/model: `circuit-breaker.ts:38-156`;
- budget scopes request/session/tenant/agent/day: `budget.ts:31-150`;
- prompt aprovado, efetivo, tenant-aware e hash-pinned: `prompt-registry.ts:59-151`;
- guards de URL/redirect/tamanho nos providers HTTP;
- lifecycle events de routing/call/fallback.

## Gaps

- budget store fornecido é in-memory;
- sem streaming, repair loop ou retry semântico;
- sem SDK-backed adapters e sem catálogo operacional amplo de providers;
- o conteúdo recuperado do Prompt Registry não é automaticamente inserido nas mensagens enviadas;
- o runtime default bypassa este package e usa provider controlado fake;
- composição do kernel instancia apenas provider determinístico;
- não há evidência de workload real, custo/latência de provider ou failover em ambiente aprovado.

## Extração

Mover contratos/router/errors primeiro; corrigir o contrato de aplicação do prompt e criar testes de compatibilidade dos adapters antes de separar repositório. Provider credentials, policy de egress e budgets duráveis permanecem extensões/configuração, não core.
