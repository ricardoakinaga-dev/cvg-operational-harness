# AUD20-008 - SPEC de fencing do replay webhook

## Gate e escopo

- programa: `AUD-20260920-REAUDIT`;
- task: `AUD20-008`;
- finding: `A20-F10`;
- autorizacao: `G20-1`, somente local, sintetica e descartavel;
- dependencia: `AUD20-007` verificada;
- fora de escopo: journal outbound do canal, approval reservation, providers,
  canais reais, IdP, dados reais, piloto, producao e efeitos externos.

## Contrato selecionado

Introduzir `WebhookReplayReservation`:

```ts
{
  key: string
  generation: number
  token: string
}
```

`reserve(key, expiresAtMs)` retorna a reservation ou `false`. `commit` e
`release` recebem a reservation inteira, nunca uma chave isolada. O token é
opaco e gerado pelo authority; a geração é monotônica enquanto a linha é
retomada. O token não é uma credencial de usuário e não será exposto em logs,
respostas HTTP ou eventos.

O fallback de stores antigos que expõem apenas `claim` permanece somente como
compatibilidade do caminho indivisível: não existe lease separada para esse
store, portanto não há `commit`/`release` por chave que a task possa deixar
stale.

## Modelo em memória

- cada chave mantém `status`, `expiresAt`, `generation` e `token`;
- `reserve` rejeita entrada ativa; takeover da mesma entrada persistida cria uma
  generation incrementada e novo token;
- se uma entrada expirada já foi podada da memória, a nova entrada começa em
  generation `1`; o token novo continua sendo a barreira contra holders stale;
- `commit` exige entrada ativa, `status = reserved`, generation e token exatos;
- `release` exige os mesmos campos e remove somente a reservation correspondente;
- `committed` rejeita release e novas reservas até expirar.

## Modelo PostgreSQL

A migration aditiva `0025_webhook_replay_fencing.sql` adiciona:

- `lease_generation bigint NOT NULL DEFAULT 0`;
- `lease_token text`;
- constraint de geração não negativa;
- constraint de estado: `reserved` exige generation positiva e token não vazio;
  `committed` exige token nulo.

Registros legados `reserved` recebem generation `1` e token sintético único no
backfill; registros `committed` permanecem com token nulo. A reserva nova:

1. remove entradas expiradas antes de tentar criar uma nova reservation;
2. tenta `INSERT` com generation `1` e token novo;
3. em conflito, faz `UPDATE` condicional do lease stale ainda retido, somando a
   geração e trocando o token;
4. retorna a reservation devolvida pelo banco.

`commit` usa `UPDATE ... WHERE event_key = $1 AND status = 'reserved' AND
expires_at > CURRENT_TIMESTAMP AND lease_generation = $2 AND lease_token = $3`.
Ele limpa o token ao marcar `committed`. `release` usa os mesmos predicados e
remove apenas a linha da generation/token recebida.

## Compatibilidade de inicialização

O preflight PostgreSQL passa a exigir `lease_generation`, `lease_token` e as
constraints de fencing. A versão `0025` entra na cadeia de migrations
verificada; `0002` não será editada.

## Critério de aceite

1. Holder A reserva `K/G1/T1`.
2. Após expiração, holder B retoma `K/G2/T2`.
3. `commit({K,G1,T1})` e `release({K,G1,T1})` retornam `false` e não alteram
   `G2/T2`.
4. `commit({K,G2,T2})` retorna `true`; replay posterior retorna `false` para
   nova reserva enquanto a retenção ainda estiver válida.
5. Os mesmos cenários passam no adapter em memória e no PostgreSQL descartável.
6. O caminho HTTP continua liberando a reservation correta em erro downstream
   e comprometendo-a somente após processamento/audit bem-sucedido.

## Verificação

- testes focados de `webhook-security` e preflight;
- `npm run test:postgres` com `TEST_DATABASE_URL` descartável;
- typecheck, lint, format e `git diff --check`;
- coverage crítica, mutation guard, certificação e evidência própria da task.

## Fora de escopo

- alterar `ChannelEffectJournal`, que já usa `leaseOwner` como token de fencing
  em suas transições;
- alterar `ApprovalEngine`/`PostgresApprovalAuthority`, que já persistem
  `reservationGeneration` e fazem CAS nessa autoridade;
- liberar `G20-2`, integrações externas, piloto ou produção.
