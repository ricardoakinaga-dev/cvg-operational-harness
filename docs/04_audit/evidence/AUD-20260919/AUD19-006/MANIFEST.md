# Manifesto de verificação — AUD19-006

- task: `AUD19-006`; onda: `W1`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartável `postgres:16-alpine`
  (container `aud19-pg`, porta 5434, sintético).
- autorização: prompt humano de 2026-09-19 (gate `G0`); ADR-006 escolhe
  PostgreSQL existente (sem infra nova); Redis segue decisão humana futura.

## Reparos (causas estruturais)

1. Replay de token: hook `onRequest` (trusted + store) reivindica o `jti` no
   `PostgresWebhookReplayStore` (tabela existente, prefixo `operator-jti:`);
   replay/outage → 401 fail-closed. Resolver e Map local inalterados.
2. Rate limiting: `PostgresRateLimiter` (janela fixa atômica, migration
   `0023`, teto com despejo, erro → throw); hook global por IP (paridade) +
   limite escopado `tenant:sub` na rota de decisão; erro → 429 fail-closed.
   Probes (`/health`, `/live`, `/ready`, `/health/metrics`) nunca tarifados.
   O default do `buildServer` continua memory para fixtures 0000-only;
   `buildServerFromEnv` fia o PG quando a persistência é PostgreSQL.
3. Fiação: `tokenReplayStore?` + `rateLimiter?`; `buildServerFromEnv`
   repassa o store do webhook em modo trusted e injeta o limiter PG no caminho
   durável.
4. Fixtures com client falso pinam `InMemoryRateLimiter` (opção nova);
   teste de 429 movido para rota tarifada (probes isentas por desenho).

## Provas

| Prova                                                                   | Resultado                 |
| ----------------------------------------------------------------------- | ------------------------- |
| replay cross-processo + restart + outage + token fresco (PG)            | 4/4 PASS                  |
| budget compartilhado + restart + expiração + outage + HTTP 301→429 (PG) | 7/7 PASS (2 arquivos)     |
| sem env + `AUD19_PG_REQUIRED=1`                                         | FAIL fechado (2 arquivos) |
| identidade/rate/webhook existentes (44+webhook)                         | PASS                      |
| api memory 56 arq/280                                                   | PASS                      |
| `typecheck` / `lint` / `format:check` / `git diff --check`              | PASS                      |

## Arquivos desta evidência

`SPEC.md` (com ADR-006), `MANIFEST.md` (este), `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- Redis/externo segue decisão humana futura; troca isolada nas interfaces.
- Junk `jti` limitado por rate-limit + TTL + teto (residual documentado).
- Produção `NO_GO`.
