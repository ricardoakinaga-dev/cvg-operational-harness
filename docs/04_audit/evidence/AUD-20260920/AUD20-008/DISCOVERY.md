# AUD20-008 - Discovery de fencing do replay webhook

## Gate e escopo

- programa: `AUD-20260920-REAUDIT`;
- task: `AUD20-008`;
- finding: `A20-F10`;
- autorizacao: `G20-1`, somente local, sintetica e descartavel;
- dependencia documental: `AUD20-007` verificada;
- fora de escopo: providers, canais reais, IdP, dados reais, piloto, producao
  e qualquer efeito externo.

## Problema reproduzido por inspeção

O replay compartilhado tem um lease recuperável. Quando a reserva expira, outro
processo pode retomá-la com a mesma `event_key`. A implementação atual não
carrega a identidade da reserva para as mutações finais:

- `HmacWebhookVerifier.verifyWithLease` fecha apenas sobre `prepared.key`;
- `InMemoryWebhookReplayStore` indexa a entrada somente por chave/status;
- `PostgresWebhookReplayStore.reserve` faz takeover por chave e tempo, mas
  `commit` atualiza por `event_key`, `status = 'reserved'` e validade;
- `PostgresWebhookReplayStore.release` remove por `event_key` e status;
- `claim` usa `reserve` e `commit` em chamadas separadas, portanto também exige
  uma credencial da geração reservada.

Consequência: um holder antigo que acorda depois do takeover pode confirmar ou
remover a reserva pertencente ao holder novo.

## Mapa de autoridade

| Componente                                       | Estado atual                                    | Decisão                                  |
| ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------- |
| `apps/api/src/webhook-security.ts`               | contrato e adapters memory/PG do replay         | alterar nesta task                       |
| `HmacWebhookVerifier.verifyWithLease`            | closures carregam somente a chave               | alterar para carregar reservation        |
| `0002_capability_approvals.sql`                  | cria a tabela sem fencing                       | preservar; migration aditiva nova        |
| `PostgresWebhookReplayStore`                     | takeover, commit e release sem token            | alterar com geração + token no predicado |
| `apps/api/src/server.ts`                         | consome somente `commit()`/`release()` da lease | sem alteração de contrato de rota        |
| `packages/channel-gateway/src/effect-journal.ts` | possui `leaseOwner` em todas as transições      | fora do finding desta task               |
| `PostgresApprovalAuthority`                      | possui `reservation_generation` próprio         | fora do finding desta task               |

## Invariantes descobertos

1. Uma reserva aceita possui `key`, geração positiva e token não vazio.
2. Cada takeover aumenta a geração e substitui o token.
3. `commit` e `release` só podem mutar a mesma geração e o mesmo token que
   originaram a reserva.
4. Um holder antigo não pode alterar o estado do sucessor, mesmo com a mesma
   chave e com o sucessor ainda em `reserved`.
5. Uma entrada `committed` permanece retida até sua expiração e não pode ser
   liberada por uma lease antiga ou nova.
6. `claim` usa a mesma reservation retornada por `reserve`; se o commit falhar,
   somente tenta liberar essa mesma reservation.
7. Verificação de assinatura continua ocorrendo antes de qualquer claim/reserva.

## Desconhecidos controlados

- registros existentes da tabela criada por `0002` não possuem generation/token;
  a migration nova deve fazer backfill local dos `reserved` legados e deixar
  `committed` com token nulo;
- adapters externos que implementam apenas `claim` continuam no caminho legado
  de `verifyWithLease`, sem separar uma lease que não possa ser protegida;
- a task não prova fencing de providers, canais externos ou de leases de outras
  tabelas.

## Evidência de teste necessária

- memória: holder antigo após takeover não consegue `commit` nem `release`;
- PostgreSQL: duas reservas sucessivas sobre a mesma chave produzem gerações
  distintas e ambos os métodos rejeitam a reservation antiga;
- PostgreSQL: reservation nova continua confirmável depois das tentativas stale;
- migration/preflight: colunas e constraints de fencing são obrigatórias;
- `claim` e o caminho HTTP preservam replay committed e falha fechada.
