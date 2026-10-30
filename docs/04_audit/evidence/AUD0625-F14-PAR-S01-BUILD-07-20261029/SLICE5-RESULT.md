# PAR-S01 fatia 5 — ponte `sessionEventStoreForHandle` e SDK real sobre PostgreSQL

Task `AUD0625-F14-PAR-S01-BUILD-07-20261029`, Claude Sonnet sessão 07. Base: fatia 4 (Claude DF: código APPROVE, `cdb9c160ece1`). A condição de governança da fatia 4 (classe pública `SessionAppendConflictError` além da lista da l.208 da SPEC) está com o DF/Ricardo (recibo `human-decisions-16` anunciado); nada foi mudado por causa dela.

## O que entrou

- `sessionEventStoreForHandle(handle): SessionEventStore` em `packages/persistence/src/session-persistence.ts`, exportada pelo barrel. A capacidade é um `WeakMap` privado handle → capability preenchido só pelo construtor de um handle **escritor** da fábrica. Wrapper, Proxy, clone, `Object.create`, implementação externa da interface, leitor, handle fechando/fechado ou perdido: `TypeError` síncrono, sem IO.
- `openSession`: só verifica tenant, id e versão do handle; idempotente; nunca cria. Tenant errado: `invalid_session_event`; sessão errada: `session_not_open`.
- `append`: captura e valida o input antes do primeiro await; um único ticket na fila comum do handle; **uma só transação** na conexão dona: busca por `eventId`, sequência e fingerprint pelos helpers CVG, INSERT e avanço do cursor, um COMMIT. Replay idêntico devolve o fato anterior sem nenhuma escrita; digest diferente é `session_event_conflict`. Não usa `read` seguido de `append` nem chama a fila pública de dentro de uma tarefa enfileirada.
- `read`: `afterSequence` exclusivo e `limit` viram offset e length do handle.
- Erros no adaptador antigo: `invalid_session_event` (input), `session_event_conflict` (digest/formato), `session_not_open` (stream errado/ausente) e `session_storage_unavailable` para ocupado, perdido, fechado, COMMIT incerto e IO, com a causa segura anexada e sem retry automático.
- Vários adaptadores do mesmo handle compartilham a única fila; o `append` direto mantém a sequência explícita do chamador e pode falhar como velho, sem renumerar.

## Provas (PG 16.15 descartável)

- `tests/par-s01-session-bridge-postgres.test.ts` (movido da fatia 6 para a raiz: persistence não depende do SDK): 17 testes.
  - Aceita/recusa de handles (incluindo Proxy, clone, objeto que imita a interface, leitor, fechado, perdido), sem IO para decidir.
  - Transação única medida pelo log do lease (um BEGIN, um COMMIT, ordem lookup → INSERT → UPDATE) e replay sem escrita.
  - Dois adaptadores concorrentes: sequências 1..10 contíguas e um só fato por duplicata; adaptador, `append` direto, flush e close na mesma fila.
  - Captura na chamada: mutar o objeto depois não altera o gravado.
  - Compatível com o store legado da 0028 nos dois sentidos.
  - SDK real: `createSdk` com sessão PostgreSQL executa um turno real (SDK, kernel, sessão), um segundo dono (handle novo, como depois de reinício) relê o prefixo idêntico e continua a mesma sequência; um segundo escritor é recusado enquanto há dono. O modelo é sintético; nenhum provider real.
- Mutação (`mutate-s5.py`, `mutations-s5.json`): 26 mutantes; 4 sobreviveram ou não aplicaram na 1ª rodada, 3 viraram testes ou correção do padrão e 1 é equivalente justificado (`atomic-format`: o CHECK da tabela força `format_version = 1` e o input validado é sempre 1). Resto morto.
- typecheck, eslint e prettier limpos.

## Observações

- O teste do SDK importa `@cvg/sdk` dentro de `packages/persistence/src/__tests__`. É só de teste, resolvido pelo alias do vitest; `@cvg/sdk` não foi acrescentado às dependências do pacote para não mexer em `package.json` nem no lockfile. O revisor decide se prefere mover esse arquivo para o pacote do SDK.
- Fica fora desta fatia, por ordem da recomposição: `stat`, `list`, flush agregado, `owner.shutdown`, tickets de recuperação. O kill abrupto do processo com PG vivo (S5) e a reabertura em OUTRO processo são da fatia 6; aqui o "segundo dono" é um handle novo no mesmo processo.
- `skip-catalog` e `mutation-manifest` não foram tocados.
