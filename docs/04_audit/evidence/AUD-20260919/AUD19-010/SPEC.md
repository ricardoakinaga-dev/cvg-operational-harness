# SPEC — AUD19-010 — Identidade confiável e resiliência no web

- programa: `AUD-20260919-REMEDIATION`; onda: `W2`; dependências: `AUD19-006` ✅,
  `AUD19-009` ✅ (+ contrato de identidade: token trusted do servidor).
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético,
  reversível. Sem tela de login nova (UX em `AUD19-013`); `App.tsx` preservado
  em modo simulação.

## Desenho

`apps/web/src/api/client.ts` (superfície `apiClient` e headers de simulação
inalterados por default):

1. **Auth adapter**: `AuthHeadersProvider` (`headersFor(identity)`),
   `simulationAuthHeaders` (bytes idênticos aos atuais), `tokenAuthHeaders(
getToken)` (`x-cvg-operator-token`; sem simulação junto). Fábrica
   `createApiClient({auth?, timeoutMs?, retry?, onUnauthorized?})`;
   `apiClient` = default simulação.
2. **`ApiSession`**: `{identity, token, generation}`; `setIdentity` limpa
   token e incrementa geração; `isCurrent(generation)`; `noteUnauthorized`
   (default limpa token) para o hook 401.
3. **`request()` resiliente**: timeout via `AbortController` composto com
   signal externo (default 30s); parse JSON seguro (não-JSON →
   `ApiRequestError request_failed`); retry SOMENTE GET idempotente, máx 2,
   só em erro de rede/5xx/429, sem retry com signal abortado; 401 → hook
   `onUnauthorized`; offline (`TypeError`) → `network_unavailable`.
4. Métodos passam `signal` onde já existe; demais assinaturas intactas.

## Critérios de aceite (congelados)

1. Expiração/timeout, 401 (hook+limpeza), 403/429/5xx (sem retry indevido),
   offline, troca de tenant (limpeza+geração) e resposta atrasada (`isStale`)
   com comportamento testado.
2. Default `apiClient` byte-compatível (testes existentes verdes).
3. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- editados: `apps/web/src/api/client.ts`;
- novos: `apps/web/src/api/resilient-client.test.ts`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-010/`
