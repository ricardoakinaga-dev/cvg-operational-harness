# SPEC — AUD19-006 — Replay protection e rate limiting distribuídos

- programa: `AUD-20260919-REMEDIATION`; onda: `W1`; gate: `G1` ✅ + `AUD19-002` ✅.
- aprovação técnica: prompt humano de 2026-09-19. Infraestrutura: nenhuma
  nova (decisão ADR abaixo, reversível); escopo local/sintético.

## ADR-006 (decisão registrada, escopo local)

- Alternativas: (a) Redis dedicado; (b) PostgreSQL existente com CAS
  transacional; (c) stateless criptográfico (impossível para replay:
  single-use exige memória compartilhada).
- Escolha: (b). PostgreSQL já é dependência obrigatória, tem o padrão
  CAS/`ON CONFLICT` provado neste programa e não cria serviço, credencial ou
  custo novo. Redis/externo permanece decisão humana futura explícita
  (fora deste programa); a troca é isolada atrás das interfaces criadas aqui.
- TTL: expiração do token (replay) e janela da política (rate limit);
  cardinalidade: linhas por chave com DELETE de expirados + teto de linhas
  com despejo das mais antigas; falha da dependência: fail-closed (negar).

## Desenho

1. **Replay de token do operador** (`operator-identity.ts` inalterado no
   caminho default): novo hook assíncrono em `buildServer`, ativo somente
   com `tokenReplayStore` + modo trusted + header presente. O hook decodifica
   claims (sem autenticar), valida janela temporal e faz `claim(jti)` no
   store; replay → 401. Autenticação continua no resolver por rota.
   Store PG = `PostgresWebhookReplayStore` existente (tabela
   `webhook_replay_events`, chaves `operator-jti:{jti}` — sem migration, sem
   tabela nova; cobertura do preflight já existente). Default sem store =
   comportamento atual (Map local) preservado byte a byte.
2. **Webhook replay**: já distribuído via `PostgresWebhookReplayStore` em
   produção (`server.ts:6032`); sem mudança, coberto por teste.
3. **Rate limiting**: `PostgresRateLimiter` (`rate-limit.ts`, janela fixa
   transacional, `rate_limit_buckets`, teto com despejo, erro → throw).
   Hook global: limite por IP (paridade 300/min) + verificação do limiter
   configurado (`options.rateLimiter`, default memory; `buildServerFromEnv`
   fia o PG quando a persistência é PostgreSQL) + limite escopado
   `tenant:{t}:sub:{o}` (identidade verificada) 120/min na rota de decisão.
4. **Fiação**: `BuildServerOptions.tokenReplayStore?` + `rateLimiter?`;
   `buildServerFromEnv` em produção repassa o replay store do webhook como
   token store (mesma tabela, prefixos distintos).

## Critérios de aceite (congelados)

1. Dois resolvers/processos + restart rejeitam o mesmo `jti` (PG); Map local
   inalterado sem store.
2. Budget compartilhado entre instâncias e restart; chaves escopadas
   independentes; indisponibilidade → negar (429 / 401), nunca liberar.
3. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- editados: `apps/api/src/server.ts` (hook replay + limiter + fiação),
  `apps/api/src/rate-limit.ts` (`PostgresRateLimiter`),
  `apps/api/src/operator-identity.ts` (exportar decode de claims p/ o hook);
- novos: `apps/api/src/__tests__/trusted-replay-distributed-postgres.test.ts`,
  `apps/api/src/__tests__/rate-limit-distributed-postgres.test.ts`,
  `packages/persistence/migrations/0023_rate_limit_buckets.sql`;
- registro `0023` em `defaultPostgresMigrations` + versões do preflight.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-006/`
