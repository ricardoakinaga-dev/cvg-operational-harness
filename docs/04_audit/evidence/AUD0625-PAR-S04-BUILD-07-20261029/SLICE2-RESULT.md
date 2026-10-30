# PAR-S04 BUILD, fatia 2: fork transacional e verifySessionFork (SPEC 0287 §4, §8.2)

Task `AUD0625-PAR-S04-BUILD-07-20261029` (Claude Sonnet 5.5, sessão 07). Autorização: recibo [human-decisions-23](../USER-DECISIONS-20261028/human-decisions-23.json). Sobre `fdc287fc3` (fatia 1 + correção P2 do DF). Sem push.

## Entregue

- **Contrato aditivo** (`packages/contracts/src/session-persistence.ts`): `SessionPersistence.fork(sourceId, header, options?)` e `SessionPersistenceForkOptions { through?, signal? }`. Único implementador é o adaptador PG. Nada de SDK (FK-D).
- **`fork` no adaptador PG** (`packages/persistence/src/session-persistence.ts`): uma transação `REPEATABLE READ` do tenant lê o pai inteiro pelo mesmo validador do S01 (cabeçalho, todas as páginas, `checkEvent`), roda `planSessionFork`, recusa acima de 8 MiB (`fork_too_large`), insere o stream do filho, toma o `pg_try_advisory_lock` do **filho** antes do COMMIT e copia evento a evento com o cursor (os gatilhos do 0034 exigem). O handle só nasce depois do COMMIT. COMMIT sem ACK é `SessionCommitUnknownError`; reconciliar é abrir pelo id original. O serviço escreve `isSeeded`, `parentSession` e `lineage`; cabeçalho do chamador com `lineage` ou `parentSession` diferente da origem é recusado.
- **`checkSessionFork`** (puro, `harness/src/session/fork.ts`) e **`verifySessionFork(service, filho, pai)`** (PG, handles de leitura, sem tomar posse): cabeçalho semeado, `parentSession`, `lineage` bem formada (origem, corte, profundidade = profundidade do pai + 1 ≤ 16, raiz), digest do prefixo do pai, N eventos iguais ao prefixo com só o `sessionId` trocado, prefixo analisável e herdável, corte ≤ corpo.
- Testes: `packages/persistence/src/__tests__/par-s04-session-fork-postgres.test.ts` (12), `tests/par-s04-session-fork-processes-postgres.test.ts` (2, processos distintos), `tests/par-s04-session-fork-edges.test.ts` (+4 do verificador). `tests/support/par-s01-child.ts` ganhou `seedTurns` e `fork`. Skip-catalog: `SKIP-PG-S04-001` (12) e `SKIP-PG-S04-002` (2); conferido 14 skipped sem banco.

## Provas da SPEC §7

| ID | Onde |
| --- | --- |
| FP04 | PG: filho completo, cursor, `verifySessionFork` verde; filho forjado e origem errada detectados; dois tenants com o mesmo id ficam separados; tenant B não é lido pelo A |
| FP05 | processos: o fork é morto dentro da transação, com eventos já inseridos (barreira = backend esperando num advisory lock de teste), e não resta stream nem evento; o mesmo id depois forka inteiro; fork concluído sobrevive à morte do processo e o novo dono abre exatamente o filho. Falha no meio da cópia e COMMIT desconhecido por fio instrumentado |
| FP06 | pai aberto por outro escritor: o fork funciona, o lock do pai continua com seu dono, o filho tem `writer_lock_id` e holder próprios e aceita append |
| FP09 | profundidade 16 (cadeia de 16 forks, o 17º recusado, raiz mantida), prefixo > 8 MiB, destino repetido, destino = origem sem tomar conexão, `lineage` forjado, `parentSession` alheio |
| FP10 | oráculos S01 inalterados e verdes (216/216 nos 10 arquivos `par-s0*`, harness/session e o RED) |

FP01-FP03 já na fatia 1; FP07 e FP08 vêm na fatia 3.

## Verificação

| Gate | Resultado |
| --- | --- |
| vitest (10 arquivos, PG real 16.15) | 216/216 |
| cobertura por arquivo de `harness/src/session/fork.ts` | 100% (107/107 branches, 117/117 linhas) |
| `npm run typecheck`, eslint, prettier | 0 / limpos |
| mutação do adaptador (`mutate-s2.py`, `mutations-s2.json`) | 11/13 mortos, 2 equivalentes justificados |

Mutantes mortos: fork sem transação única, tomar o lock do pai, profundidade não crescer, sem teto de tamanho, `parentSession` alheio aceito, `lineage` do chamador aceito, vaga de escritor vazada na falha, cursor não avançado, `through` ignorado, filho não semeado, destino = origem sem recusa antecipada.

Equivalentes justificados:
- **F1, sem `REPEATABLE READ`**: a cópia é limitada pelo `head` lido primeiro e o log é append-only e imutável (gatilhos do 0034), então nenhuma linha ≤ head muda entre as leituras. O isolamento fica como defesa em profundidade e por exigência da SPEC (I2); não há teste observável que o distinga.
- **F10, sinal abortado ignorado**: `#acquire(signal)` rejeita o mesmo `AbortError` e devolve a vaga; a checagem antecipada só evita a reserva (como no `create`).

Dois mutantes sobreviveram na primeira rodada e viraram testes: a vaga vazada (o teste usava outro serviço para o retry; agora o mesmo serviço, capacidade 1) e a recusa antes de tomar conexão (contagem de `acquire`).

## Decisões de implementação

- O chamador escreve `isSeeded` livremente (o tipo o exige); o serviço sempre grava `true`.
- A cópia insere evento a evento com o cursor, como o `append`, porque os gatilhos conferem sequência e cursor por linha. O custo é O(N) idas ao banco dentro do teto de 8 MiB.
- `verifySessionFork` abre os dois lados em leitura: não toma posse e funciona com o pai aberto.

## Próximo

Fatia 3: `resumeSession` (dono vivo → `AlreadyOwned`, sem escrever nada, handle antigo `LOST` continua), provas de crash e de aprovação/efeito (FP07, FP08).
