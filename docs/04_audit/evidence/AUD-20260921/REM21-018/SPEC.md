# REM21-018 — SPEC

## File plan aprovado

### Identidade e RNG

1. `packages/harness/src/effect-journal.ts`
   - importar `randomUUID` de `node:crypto`;
   - adicionar `attemptIdFactory?: () => string` às opções;
   - criar helper exportado para produzir `attempt_<uuid>` e validar valor não
     vazio/limitado;
   - usar o default seguro e a factory apenas como seam determinística de teste.
2. `packages/persistence/src/operational-execution-postgres.ts`
   - importar `randomUUID` de `node:crypto`;
   - adicionar `executionIdFactory?: () => string` às opções;
   - extrair helper exportado para `exec_<uuid>` com validação de saída;
   - remover completamente o fallback `globalThis.crypto/Math.random`.
3. `apps/web/src/features/journeys/index.tsx`
   - substituir `emptyKey` por `createDomainId('journey')` de `@cvg/shared`;
   - manter o prefixo/shape aceitável para idempotência e a semântica de
     rascunho controlado.

### Configuração

4. `packages/shared/src/env.ts`
   - expor no `EnvSchema` `CVG_IDENTITY_MODE`, `OUTBOX_DURABLE_INBOUND`,
     `PORT` e `CVG_API_PORT` com parsing seguro;
   - rejeitar `CVG_IDENTITY_MODE` fora de `simulation|trusted` no limite comum;
   - manter os requisitos de produção existentes e não duplicar o guard de
     keyring/durable inbound que pertence à composição API.
5. `.env.example`
   - reorganizar por perfil, com comentários curtos e valores exclusivamente
     locais/sintéticos;
   - incluir as 19 chaves ausentes, `CVG_WORKER_CONTROLLED_SMOKE`,
     `CVG_API_PORT`, flags `VITE_CVG_*` e a classificação das variáveis de
     teste/CI;
   - declarar que health (`/live`, `/health`, `/ready`) e telemetria JSONL/stdout
     não têm exporter/timeout env nesta versão;
   - deixar keyrings/provider/webhook como vazios ou `replace_me`, nunca como
     material utilizável.

### Provas

6. `packages/harness/src/__tests__/effect-journal.test.ts`: factory fixa e
   formato do default.
7. `packages/persistence/src/__tests__/operational-execution-postgres.test.ts`:
   helper de ID sem exigir `TEST_DATABASE_URL`.
8. `apps/web/src/features/journeys/journeys.test.tsx`: capturar POSTs e validar
   idempotency keys UUID-like; a geração deve continuar funcionando em jsdom.
9. `packages/shared/src/__tests__/http-security-env.test.ts` ou novo teste
   focado: schema de identidade/porta/outbox e rejeição de valor inválido.
10. `tests/rem21-018-config.test.ts`: parser seguro de `.env.example`, inventário
    de chaves, secret scan e matriz sintética dos validadores API/worker/
    homolog/iterativo. Variáveis de banco de integração, CI e Playwright ficam
    explicitamente fora do inventário de runtime.

## Ordem de execução

1. Atualizar ledgers para `SPEC_APPROVED_CONTROLLED_BUILD`.
2. Implementar os slices de identidade e configuração com `apply_patch`.
3. Rodar testes RED/GREEN focados e scan dirigido.
4. Corrigir apenas falhas causadas pelo slice; não ampliar para refactor.
5. Rodar typecheck, lint, format, docs, diff e regressão Node 22.
6. Submeter o candidate a crítico fresco read-only, verificar sentinel e
   retestar qualquer gap material.
7. Registrar BUILD-AUDIT, hashes, decisão e atualizar runtime/log/backlog.

## Riscos e controles

- `randomUUID` Node é usado somente em módulos server-side; o browser usa o
  helper Web Crypto já coberto em `@cvg/shared`.
- Factories podem tornar testes determinísticos, mas não serão usadas por
  composição de produção.
- O exemplo pode ficar mais extenso; o teste de inventário evita que nova chave
  documentada seja confundida com secret real.
- A matriz não simula produção real: guards externos, IdP, providers, RPO/RTO,
  G21-5/G21-6 e signoff continuam explicitamente não executados.
