# R2 FINAL — ACCEPT_BOUNDED_SOURCE_CONTRACTS

`DX100-G01:RECONCILE-OPEN-SDK-CONTRACTS`. **mandatory_count: 0; findings novos: nenhum.** Os dois P2 de R1 estão resolvidos como contratos de fonte T1. O parecer original permanece **REVISE/2P2**, íntegro e reconstruível. R2 consome a revisão2/2 após o único reparo agrupado1/1; não há terceira revisão nem extensão automática.

Freeze R2 `2ad3f8dda60ed7c5317dd666934718b486047430c1e5432ba760437949ba001a`,95 arquivos. [Parecer JSON](review.json), [observações independentes](data-observations.json), [primeiro inventário](first-hash-inventory.json), [último inventário](last-hash-inventory.json) e [manifesto dos outputs](manifest.json).

## Disposição dos achados R1

**R1-01/P2 — RESOLVED_SOURCE_CONTRACT — SK02/SK03/SK06.** [PY04](../python-contracts.json#L78), linhas78–101, corrige a prosa e os futuros positivos/conhecidos ruins. [client.py arquivado](../inputs/P02.source.txt#L485), linhas485–491 e505–511, coloca `threadId` antes de `**params`; paramsB/null prevalece, enquanto params None/{} mantém A. Nas linhas672–678 a ordem de `_start_turn` é oposta e A/input normalizado X prevalecem sobre B/Y. `_params_dict`, linhas84–110, preserva dict e separa `model_dump(by_alias=True, exclude_none=True, mode=json)`. Os [fatos](../payload-and-goal-facts.json#L3), linhas3–376, coincidem com as três AST Dict e os16 overlays de dados recalculados independentemente. A referência fork e a distinção modelo Pydantic/dict null estão presentes. Nenhuma função SDK ou biblioteca Pydantic foi executada.

**R1-02/P2 — RESOLVED_SOURCE_CONTRACT — SK02/SK06.** [PY13](../python-contracts.json#L300), linhas300–329, e [PY14](../python-contracts.json#L332), linhas332–368, agora especificam os corpos antes ausentes:

- [async_client.py](../inputs/P03.source.txt#L244), linhas244–290: worker daemon/Future, `shield(wrap_future(operation))`, callback registrado antes do reraise de CancelledError, resultado falho→return, resultado bem sucedido→cleanup daemon, try cancel e finally finish/unregister. Não prometem join/ACK ou cleanup concluído ao entregar cancelamento.
- [client.py](../inputs/P02.source.txt#L568), linhas568–597: pause via set(status=paused), Exception suprimida seguida de interrupt; seleção de ID em [goal.py](../inputs/P05.source.txt#L180), linhas180–189, prioriza current/completed/started/None. Somente InvalidRequestError com o prefixo exato admite candidato extraído OR current; ID ausente/igual barra retry, ID diferente admite uma segunda tentativa cujo Exception é suprimido. Não há loop nem terceira tentativa. Extração truthy de ID igual impede fallback para outro ID no estado.

Inspecionei os corpos/handlers/finally via AST e seis combinações plain-data do candidato/guard, incluindo extracted=same e state=different. Os [fatos de goal e cutpoints](../payload-and-goal-facts.json#L378), linhas378–440, e os futuros de PY13/14 nomeiam cancel antes/depois do resultado, falhas, pause/interrupt, IDs e limite de tentativas. O contraste com [ordinary-turn cancel](../inputs/P03.source.txt#L301), linhas301–326, e [normal goal close/stream cancel](../inputs/P05.source.txt#L417), linhas417–448, permanece explícito. Essa é inspeção de contrato; nenhum callback, thread, RPC, efeito ou schedule do SDK foi observado.

## Quinze checks substantivos

| ID | Grupo | Resultado |
| --- | --- | --- |
| R2C01 | Freeze R2 e identidade do sujeito | SATISFIED_STATIC |
| R2C02 | Reconstrução R1 e história independente | SATISFIED_STATIC |
| R2C03 | Delta restrito do reparo | SATISFIED_STATIC |
| R2C04 | R1-01: ordem AST e16 overlays | SATISFIED_STATIC |
| R2C05 | Null/modelo/serializer e oráculos corrigidos | SATISFIED_STATIC |
| R2C06 | R1-02: worker/Future/shield | SATISFIED_STATIC |
| R2C07 | Callback diferido e cleanup em finally | SATISFIED_STATIC |
| R2C08 | Pause seguido de interrupt e fronteira de exceção | SATISFIED_STATIC |
| R2C09 | Prioridade de ID, prefixo, OR/fallback e segundo interrupt | SATISFIED_STATIC |
| R2C10 | Cutpoints futuros e distinção ordinary/goal/close | SATISFIED_STATIC |
| R2C11 | Detector de relações afetadas | SATISFIED_STATIC |
| R2C12 | Regressões Python/fonte/generated/proveniência | SATISFIED_STATIC |
| R2C13 | Regressão TS e wrappers | SATISFIED_STATIC |
| R2C14 | Gaps, catálogo, checkpoint e T3 | SATISFIED_STATIC |
| R2C15 | Higiene, orçamento e seal | SATISFIED_BOUNDED_REVIEW_DELIVERY |

Critérios/fontes e evidências de cada grupo estão em `review.json`. SK01–07 atendem no recorte delimitado. SK08 tem a revisão final e os outputs selados; encerramento do ator/integração de continuidade do programa pelo Lead seguem a entrega, sem outra revisão.

Os dois checkers existentes foram executados **uma vez cada**, apenas em `--check`, ambos exit0: [Python](python-check.log),8 grupos/24 contraprovas de dados; [TS](typescript-check.log),12 fontes/24 cenários/10 contraprovas. As seis novas contraprovas discriminam precedência, shield, finally, pause/interrupt e terceiro site de interrupt. Inspecionei seu vínculo com a AST, sem tratar hashes, declarações do Lead ou seu relatório como aprovação independente. Parser TS6.0.3 local não faz typecheck/import do alvo. Histórico do helper de reparo com falha de indexação aninhada foi lido e preservado; não foi replayado nem confundido com falha/runtime do SDK.

Reconstruídos independentemente70 sujeitos R1 (5 preimagens+65 inplace); só PY04/PY13/PY14 mudaram entre20 contratos, com17 preservados. Oito outputs R1 e os18 scout TS mantêm hashes originais.36 fontes foram comparadas de novo aos bytes de `git show` no pin8d9f6466, snapshots e worktree;730 excertos Python são exatos, incluindo os724 anteriores.350 arestas/7multihop/32callable/8aliases e33 declarações/modelos permanecem os mesmos recortes. Não há nova pretensão de dispatch completo.

Checkpoint anterior2690:2687 exatos e três controles próprios autorizados alterados, zero drift indevido. Seis gaps/owners/requisitos OPEN; catálogo509NOT_RUN/null,487 funcionais+22 controles/22 famílias. SPEC0239ccdf3a75/oito anexos/pedidoT3pending e14CQ conferem. Nenhuma fonte/SPEC/catálogo/master/programstate foi modificada pelo crítico. Planejamentos `Next-task.json`/`reference-prerequisites.json` estão fora dos95 e não foram usados neste veredito.

## Limites do aceite

Aceito **somente contratos de fonte T1 selecionados**. Sem PASS runtime/funcional, sem biblioteca/modelos Pydantic qualificados, sem autenticação de wheels/npm/binários instalados ou suporte de plataforma comprovado. Default accept do cliente não concede autoridade institucional; EOF parcial TS não é terminal nativo; cancel/close/sinal não prova fim do processo nem ausência de efeito. Todos os seis gaps continuam OPEN, G01 global aberto, zero recibos; SPEC0239 continua pendente e nenhum BUILD/release foi autorizado.

R2final encerra o orçamento técnico desta unidade:2reviews/1repair usados,0 restantes,0descendentes. Escrita somente `review-r2/**`. Lead deve integrar este parecer à sua continuidade e encerrar o ator; não iniciar terceira revisão ou rework automático. O manifesto inclui sha/bytes dos outputs e autoentrada null explicada para evitar autorreferência.
