# SPEC0282 — O 429 respeita Retry-After e as tentativas têm teto

R0, 29/10/2026. Task `AUD0625-F12C-D9-20261029`, follow-up AUD0625-F12c (dona
Claude D9) da [SPEC0268](0268_channel_uncertain_after_send.md), achado
F12 da [auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: máquina de estados do journal de
canal e política de reenvio. **Sem BUILD até revisão humana explícita deste
documento.**

## 1. Evidência atual

Base: `claude/aud0625-wave2` @ `8f511551`.

- Os adaptadores Evolution e Chatwoot transformam um 429 em
  `ChannelError('provider_rejected', …, retryable = true)`
  (`adapters/evolution.ts`, `adapters/chatwoot.ts`, `bounded-body.ts`). O
  gateway, para um erro `retryable`, chama `journal.release`, que devolve o
  registro a `PENDING` sem lease (`gateway.ts`, `effect-journal.ts`).
- `decideReserve` trata um `PENDING` sem lease como `takeover`: `attempt + 1`,
  novo lease, imediatamente. Não lê `Retry-After`, não espera e **não há teto**
  de tentativas. O mesmo vale para a cópia privada `#decideReserve` do adaptador
  PostgreSQL e para o journal em arquivo (que compartilha a regra).
- Prova (fase 1, `aud0625-f12c-retry.test.ts`, journal em memória e em
  arquivo), com um provedor que responde sempre 429:
  - 9 chamadas ao gateway fazem **9 requisições de rede** e o registro chega a
    `attempt 9`, sem nunca virar terminal (`expected 9 to be 5`);
  - com `Retry-After: 2`, o reenvio feito 1 s depois sai pela rede em vez de
    esperar (`expected 'ok' to be 'retry_later'`).
- O registro já guarda `attempt`; falta o teto e o "não antes de".
- Um 5xx continua `effectUnknown` e vira `UNCERTAIN`, nunca reenviado; esta
  SPEC não toca esse caminho.

## 2. Invariantes

1. Uma operação não recebe mais de `maxAttempts` reservas. A reserva seguinte
   a esse teto grava `FAILED` com `attempts_exhausted`, é terminal e nunca
   chega à rede.
2. Quando o provedor manda `Retry-After`, o journal guarda um "não antes de" e
   nenhuma reserva antes desse momento faz rede, cria lease ou incrementa
   `attempt`; ela responde `retry_later` com o tempo restante.
3. O `Retry-After` tem teto (`maxRetryAfterMs`): um valor maior é cortado, e um
   valor inválido é ignorado (sem espera).
4. Sem `Retry-After` o comportamento não muda: reenvio imediato, dentro do teto.
5. Só o 429 retryable usa essa regra. 4xx definitivo, 5xx (`UNCERTAIN`), 2xx e
   `CONFIRMED` não mudam.

## 3. Mudança proposta

- `ChannelErrorCodes` ganha `retry_later` e `attempts_exhausted`.
  `ChannelErrorOptions` ganha `retryAfterMs?: number`.
- Adaptadores: no 429, leem o cabeçalho `Retry-After` (segundos inteiros ou
  data HTTP), convertem para ms, cortam em `maxRetryAfterMs` e passam em
  `retryAfterMs`. Valor ausente, negativo ou ilegível não é passado.
- `ChannelEffectRecord` ganha `notBeforeMs: number | null`. O journal
  `release(identity, owner, code, retryAfterMs?)` grava `notBeforeMs = agora +
retryAfterMs` quando informado. `fail`, `markUncertain`, `complete` e o
  takeover zeram o campo.
- `decideReserve` (e a cópia do PostgreSQL) ganha duas ações, avaliadas só para
  `PENDING` sem lease e depois de `replay`, `uncertain` e `in_flight`:
  - `notBeforeMs > agora`: `retry_later`, sem gravar nada;
  - `attempt >= maxAttempts`: `exhausted`, grava `FAILED`/`attempts_exhausted`,
    lease nulo, `revision + 1`, e responde como `replay`.
    A ordem entre as duas: primeiro o teto, depois o "não antes de".
- `ChannelEffectReserveOutcome` ganha `{ outcome: 'retry_later'; record;
retryAfterMs }`. O gateway o traduz em `ChannelError('retry_later', …,
retryable = true, { retryAfterMs })`, sem emitir evento de incerteza.
- Persistência: o journal em arquivo grava o campo novo (ausente = `null`, lê
  registros antigos); o PostgreSQL ganha a coluna
  `retry_not_before_ms bigint NULL` em `channel_effect_journal` pela migration
  **`0031_channel_effect_retry_not_before.sql`** (aditiva, forward-only, sem
  tocar linhas; a 07 confirmou que a 0262 não usa a 0031). Sem a migration, o
  "não antes de" valeria só na memória e no arquivo.
- Valores padrão propostos: `maxAttempts = 5`, `maxRetryAfterMs = 300_000`
  (5 min), ambos configuráveis nas opções do gateway/journal.

## 4. Critérios de pronto

- [ ] Os 3 `it.fails` da fase 1 viram `it`, em memória e em arquivo (6 casos).
- [ ] Controles: 429 sem `Retry-After` reenvia na hora, dentro do teto;
      operação confirmada não reenvia; 4xx definitivo continua `FAILED`.
- [ ] Novos: `Retry-After` por data HTTP, inválido (ignorado) e zero; o teto
      cai exatamente na tentativa `maxAttempts`; `retry_later` não incrementa
      `attempt` nem renova lease; 5xx continua `UNCERTAIN`; registro antigo do
      arquivo (sem o campo) lê como `null`.
- [ ] Passada PG com contêiner próprio: o mesmo cenário no
      `PostgresChannelEffectJournal`, com a migration 0031 aplicada duas vezes
      sem erro; duas reservas concorrentes depois do prazo dão um só vencedor.
- [ ] Mutações mortas: sem o teto; `>` no lugar de `>=`; teto avaliado depois do
      `takeover`; sem o corte de `maxRetryAfterMs`; `retry_later` que
      incrementa `attempt`; "não antes de" não zerado no takeover; cópia do PG
      sem a regra.
- [ ] Regressão: `packages/channel-gateway` inteiro e o teste PG do journal, com
      Node 22 e `--maxWorkers=2`; typecheck, eslint, prettier, docs.

## 5. Testes

- Fase 1: `packages/channel-gateway/src/__tests__/aud0625-f12c-retry.test.ts`,
  `describe.each` sobre journal em memória e em arquivo, com 3 `it.fails`
  (`Retry-After` bloqueia o reenvio; valor enorme é cortado; teto de 5) e 3
  controles. Sem a inversão os `it.fails` falham por
  `expected 'ok' to be 'retry_later'` e `expected 9 to be 5`.
- BUILD: inversão, os casos novos do §4 e a passada PG.

## 6. Fora de escopo e limites aceitos

- Backoff exponencial sem `Retry-After`: não entra (D2).
- O teto conta reservas, não tempo de relógio; uma operação parada em `PENDING`
  sem ninguém reservando não expira por si.
- Reenvio de 5xx/`UNCERTAIN` e reconciliação humana não mudam.
- `Retry-After` em respostas que não sejam 429 é ignorado.
- Não há fila nem agendador: quem reserva de novo (a política de reenvio do
  chamador) decide quando tentar; o journal só recusa antes do prazo.

## 7. Decisões pedidas ao Ricardo

- **D1.** Teto padrão de tentativas. Recomendado: 5 (configurável).
- **D2.** Limite máximo do `Retry-After` e a regra sem cabeçalho.
  Recomendado: 5 minutos; sem cabeçalho, reenvio imediato como hoje, sem
  backoff novo.
- **D3.** A migration entra agora? Opções: (A) teto e `Retry-After` juntos, com
  a migration 0031 (recomendado: o "não antes de" precisa sobreviver a
  reinício e valer entre processos, e a coluna é aditiva); (B) só o teto agora,
  sem migration, e o `Retry-After` fica para depois (o teto não precisa de
  coluna nova porque o `attempt` já existe).
