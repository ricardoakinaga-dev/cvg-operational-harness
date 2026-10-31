# PAR-S04 BUILD, fatia 3: resumeSession e provas FP07/FP08 (SPEC 0287 §5, §8.3)

Task `AUD0625-PAR-S04-BUILD-07-20261029` (Claude Sonnet 5.5, sessão 07). Autorização: recibo [human-decisions-23](../USER-DECISIONS-20261028/human-decisions-23.json). Sobre `1760e53db` (fatia 2). Sem push.

## Entregue

- **Contrato aditivo** (`packages/contracts/src/session-persistence.ts`): `SessionPersistence.resumeSession(id, options?) → { handle, analysis }`. `TurnReport` e `SessionLogAnalysis` passaram a viver nos contratos (o harness os reexporta), porque o contrato precisa tipar o retorno.
- **`resumeSession` no adaptador PG**: `open(id, 'write')` (só `pg_try_advisory_lock`: dono vivo é `SessionAlreadyOwnedError`, sem espera nem tomada) e `analyzeSessionLog` sobre o log lido pelo leitor validado do S01. Não escreve, não fecha o turno interrompido, não reabre handle `LOST`. Se a análise falha (log não analisável), fecha o handle e devolve o erro, sem manter lock nem vaga de escritor.
- Testes: `packages/persistence/src/__tests__/par-s04-session-resume-postgres.test.ts` (5) e +1 em `tests/par-s04-session-fork-processes-postgres.test.ts`; `tests/support/par-s01-child.ts` ganhou a opção `crashed` do `seedTurns`. Skip-catalog: `SKIP-PG-S04-003` (5) e `SKIP-PG-S04-002` passou a 3; conferido 20 skipped sem banco.

## Provas da SPEC §7

| ID | Onde |
| --- | --- |
| FP08 | processos distintos: o dono vivo em outro processo dá `AlreadyOwned`; depois do `SIGKILL` o handle novo lê os 11 eventos exatos, `inheritableThrough` = 8, `openTurn` = `tc` com `op-tc` incerto, e a contagem de linhas não muda. Em PG: nenhum `INSERT` na conversa da retomada, cursor igual, handle velho continua `SessionOwnershipLostError`, o próximo turno entra com outro `correlationId` e o turno interrompido segue aberto (nenhum `turn/end` sintético; o prefixo herdável continua fechado atrás dele). Log intercalado → `SessionPersistenceCorruptionError` duas vezes seguidas, sem lock retido e com capacidade de escritor 1 |
| FP07 | kernel real, ferramenta que exige aprovação, `requestedTool` com o mesmo `operationKey`: o original termina `APPROVAL_REQUIRED` com a requisição `ap-1`; o fork copia só o turno anterior (`c0`) e **não carrega** `ap-1`, `APPROVAL_REQUIRED`, o `operationKey` nem o `correlationId` do turno pendente; o turno equivalente no fork faz uma **nova** requisição ao motor e para de novo em `APPROVAL_REQUIRED`; o corpo da ferramenta nunca roda; o log do original fica idêntico; `verifySessionFork` verde. O fork de uma sessão retomada deixa o turno interrompido e seu efeito incerto para trás |

## Limite honesto da FP07

O motor de aprovações do teste é um duplo que conta chamadas. O que a prova estabelece é do lado da sessão: **nada** de aprovação, execução ou efeito atravessa o fork, e o turno do fork pede de novo. Ela **não** prova que o motor real recusaria o reuso de um `approvalId` do original dentro do fork: esse vínculo não existe hoje (achado abaixo) e é o que o cartão próprio deve fechar.

## Achado para cartão próprio (fora do S04, reconfirmado)

**Aprovação sem vínculo à sessão.** O `#validateBinding` (`runtime-approval-store.ts`/engine) liga ação, recurso, `payloadHash`, `proposalHash`, agente, política e capacidade, **sem `sessionId`**: uma aprovação `APPROVED`, de uso único, não consumida e no prazo vale para a mesma ação e payload em outra sessão do mesmo tenant, inclusive num fork. O fork não a agrava (nada atravessa, e a fatia 1-3 não passa `approvalId` ao filho), mas o risco existe independente do S04. Recomendação: cartão que inclua `sessionId` (ou o `executionId` que a criou) no vínculo e um teste de negação cruzada entre sessões. Fica com o DF.

## Verificação

| Gate | Resultado |
| --- | --- |
| vitest (11 arquivos `par-s0*` + RED + `harness/session`, PG 16.15) | 222/222 |
| cobertura por arquivo de `harness/src/session/fork.ts` | 100% (107/107 branches, 117/117 linhas) |
| `npm run typecheck`, eslint, prettier | 0 / limpos |
| mutação de `resumeSession` (`mutate-s3.py`, `mutations-s3.json`) | 5/5 mortos: handle só leitura, handle retido na falha, análise de log vazio, retomada que fecha o turno interrompido, dono vivo contornado com leitura |

## Próximo

Fatia 4 (SPEC §8.4, decisão FK-D): a exposição no SDK ficou **fora desta onda** pelo recibo 23 (só no serviço de persistência). Com isso o BUILD aprovado está completo nas fatias 1-3; resta o fechamento (FECHAMENTO em `agent_coordination.md`, GBrain e a integração do DF).
