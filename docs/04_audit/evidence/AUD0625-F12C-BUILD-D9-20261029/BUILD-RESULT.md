# AUD0625-F12C-BUILD-D9 — SPEC 0282: o 429 respeita Retry-After e as tentativas têm teto

Branch `claude/aud0625-f12c-d9`, fase 1 `ab790b1c9` (base `claude/aud0625-wave2` @ `8f511551`). SPEC 0282 sha256 `0d84cd2c…`, aprovada pelo Ricardo com D1 = teto 5, D2 = `Retry-After` cortado em 5 min (sem cabeçalho, reenvio imediato limitado pelo teto) e D3 = A (teto e `Retry-After`, com a migration 0031) em `human-decisions-9.json` (sha256 `34877f73a2a97d3f77d6f52de3f1eac5d8a4e9ddc11620172c6e9ebc12412351`, copiado byte a byte e conferido). BUILD T3 local e sintético, Node 22.23.2, sem push, produção `NO_GO`.

## Mudança

- `errors.ts`: códigos `retry_later` e `attempts_exhausted`; `ChannelError.retryAfterMs`.
- `effect-journal.ts`: `ChannelEffectRecord.notBeforeMs?`, `DEFAULT_CHANNEL_MAX_ATTEMPTS = 5`, `maxAttempts?` na reserva, outcome `retry_later { retryAfterMs }`, `release(..., retryAfterMs?)`, `notBeforeAfter` e `isFutureNotBefore` (valor não numérico é ignorado). `decideReserve` ganha as ações `exhausted` (teto primeiro: grava `FAILED`/`attempts_exhausted`, responde como `replay`) e `retry_later` (sem gravar), só para `PENDING` sem lease, depois de `replay`, `uncertain` e `in_flight`; o takeover zera o `notBeforeMs`.
- Journal em memória, em arquivo (registro antigo sem o campo lê como sem espera) e PostgreSQL, incluindo o `#decideReserve` privado do adaptador PG, que recebe as mesmas duas regras e persiste a coluna.
- Migration `0031_channel_effect_retry_not_before.sql` (`ALTER TABLE channel_effect_journal ADD COLUMN IF NOT EXISTS retry_not_before_ms bigint`), registrada nas três listas que a 0030 usa (`postgres-migrations.ts`, `tenant-preflight.ts`, `postgres-persistence-mode.test.ts`). A coluna anulável não muda o perfil de privilégios nem o inventário do tenant-schema (a tabela já está nele com UPDATE).
- `bounded-body.ts`: `parseRetryAfter` (segundos inteiros ou data HTTP; ausente, zero, negativo, fração ou ilegível = sem espera; corte em `MAX_RETRY_AFTER_MS`) e `responseErrorOptions`. Os adaptadores Evolution e Chatwoot passam o `retryAfterMs` no 429.
- `gateway.ts`: opções `maxAttempts` e `maxRetryAfterMs`, repassa o teto à reserva, corta o `retryAfterMs` de novo na hora de liberar e traduz `retry_later` em `ChannelError('retry_later', retryable)`.

## Provas

- Os 3 `it.fails` da fase 1 viraram `it` (memória e arquivo, 12/12). Novo `aud0625-f12c-retry-unit.test.ts` (36): `parseRetryAfter`, o teto cai exatamente na reserva seguinte a `maxAttempts`, `retry_later` não concede lease nem muda `attempt`/`revision`, o fim da espera libera e zera o campo, o teto vence uma espera pendente, valores não finitos significam sem espera, `UNCERTAIN` não vira `retry_later`, registro antigo do arquivo e valor malformado, os dois adaptadores (segundos, data HTTP, malformado) e as opções do gateway.
- PostgreSQL 16.15 em contêiner próprio: `channel-effect-journal-postgres` 16/16 com 4 testes novos (a espera sobrevive a outra conexão e outra instância e termina no instante certo com a coluna conferida direto no banco; teto durável e sem escrita extra depois dele; dois reservadores depois da espera dão um só vencedor; a migration 0031 é aditiva e roda duas vezes); `postgres-persistence-mode`, `tenant-schema-inventory-postgres` e `outbox-durability` 86/86.
- Mutações ([mutations.txt](proofs/mutations.txt)): sem o teto, `>` no lugar de `>=`, teto uma reserva cedo, `retry_later` que incrementa `attempt`, espera que não zera no takeover, `release` que ignora o `Retry-After`, espera avaliada antes do teto, arquivo que não persiste o `exhausted`, corte do gateway e do adaptador, gateway que não repassa `maxAttempts`, e no PG: sem a regra da espera, sem o teto, coluna não gravada, espera que não zera: todas mortas. `Q14` (espera malformada) é equivalente.
- `packages/channel-gateway` + o teste PG do journal: 24 arquivos, 287/287; `npm run typecheck` 0; eslint 0; prettier e docs:check-links (ver o commit).

## Observações

- O teto conta reservas (incluindo as que vieram de lease expirado), não 429: uma operação cujo trabalhador caiu cinco vezes também termina em `attempts_exhausted`. É o que a SPEC pede (§6, o teto conta reservas).
- Chamadores diretos do journal que não passam `maxAttempts` recebem o padrão 5. O `exam-egress` não é afetado: o 429 nele é recusa definitiva, nunca `release`.
- O `Retry-After` de um 429 cujo corpo estoura o limite (`oversizedResponseError`) não é lido, porque nesse caminho os cabeçalhos já não estão disponíveis; o reenvio é imediato, limitado pelo teto.
