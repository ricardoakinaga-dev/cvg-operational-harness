# Delta proposto para os ledgers — HISO005-P2-REFERENCE-RECIPE-T2-20261019 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, a coordenação, o catálogo central nem a raiz. Evidência: [contrato](task-contract.json), [aceites RT01–RT08](acceptance-status.json), [estado](state.json), [promoção preparada](promotion-deltas-prepared.json), [recibo de liberação](runtime-release-receipt.json).

## `docs/99_runtime_state.md`

- `last_completed_action`: receitas de referência B6 corrigidas em T2 (commits detached `a5b8a888` e `d6203875` sobre `228e7918`, candidata `/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019`). A listagem da árvore é paginada por subárvore quando um processo passaria do teto de 8 MiB, que continua igual. Páginas com pathspec literal e validadas. A amostragem da receita instalada tolera entrada que o npm remove; a varredura final segue estrita. Crítica R1 REVISE (2 P2, corrigidos) e R2 final APPROVE, ambas confirmando T2.
- `status`: `READY_FOR_NEXT_STEP`.
- `next_action`: PR do lead com os 4 caminhos depois do PR #4 da consolidação; eles não colidem com os 7 caminhos do BUILD0241.
- B6: continua `INCOMPLETE`. Com referências da própria fonte (instalada da árvore completa, compilada da raiz avaliada, PROVEN), a medição nos mesmos inputs do BUILD0241 dá os mesmos 2.410 diagnósticos, tupla a tupla, com zero provas e zero violações.

## `docs/20_master_execution_log.md`

### 19/10/2026 — HISO005-P2-REFERENCE-RECIPE-T2-20261019 (Claude Code, CONT-20261018-D9EF)

- Contrato antes do código: problema P1–P4, correção F1–F3 e trilha T2. Nenhum teto da SPEC0234 nem o teto de 8 MiB por processo muda, e a definição da fonte e o formato dos recibos também não. Margens medidas: snapshot instalado ~4,272 GB contra 4 GiB; tar compilado ~4,10 GB contra 4 GiB. A pergunta T3 fica pronta para quando a árvore crescer.
- Primeira falha antes de editar: receita instalada real em `228e7918` com PROCESS_OUTPUT_LIMIT. Testes determinísticos com 3 vermelhos. Depois, a receita compilada real com o módulo antigo deu ENOBUFS.
- R1 (crítico novo, não-fork) deu REVISE com dois achados. R1-01: página endereçada por pathspec com mágica ou nome não UTF-8 gerava recibo parcial silencioso. R1-02: spread estourava a pilha acima de ~125 mil linhas. Correções em `d6203875`: pathspec literal, validação de página e acumulador. Os 3 testes novos falham nos bytes R1.
- Testes: receitas 56/56; focal B6 819/819 numa execução única nos bytes congelados. Uma execução anterior, sob carga média 28, teve 3 estouros de tempo em testes do engine; repetidos isolados, deram 180/180. Lint e formato verdes.
- R2 final: APPROVE, zero obrigatórios, T2. Confirmou de forma independente as 81.607 linhas da árvore real na ordem e o `sourceSha256` do recibo instalado.
- Referências pela receita corrigida, sem snapshot de desvio:
  - instalada da árvore completa de `228e7918`: 304 pacotes, 18.786 entradas, 17.344 arquivos, uso de 4.272.609.211 bytes;
  - compilada com `--source-root` igual à raiz avaliada: leitor PROVEN, 121 arquivos.
- Medição B6 normal/strict sobre a candidata do BUILD0241 (só leitura, mesmos inputs): INCOMPLETE com 2.410 diagnósticos, 0 provas e 0 violações, idêntica tupla a tupla ao BUILD0241. Mudou só a proveniência compilada, de UNAVAILABLE para PROVEN. A v3 nos mesmos inputs dá 1.588. Conservação §3.5 sem defeito.
- Liberação: sem PG, portas ou processos; 18,3 GB de referências e fixtures removidos depois de registrar os hashes; worktree auxiliar removido. A candidata detached fica como âncora dos commits.

## `docs/30_backlog_master.md`

- HISO005-P2-REFERENCE-RECIPE-T2-20261019: `COMPLETED_LOCAL`, promoção pendente com o lead.
- Risco T3 registrado: o snapshot da referência instalada está a ~22 MB do teto de 4 GiB da SPEC0234, porque a evidência de auditoria rastreada soma 3,99 GB. Pergunta pronta: "Você aprova elevar o teto de 4 GiB da referência instalada da SPEC0234 ou tirar docs/04_audit/evidence do snapshot das receitas de referência?"
- Observações P3 para backlog técnico:
  - subárvore vazia (só por plumbing) recusada quando paginada;
  - tolerância a readlink/ENOTDIR na amostragem sem teste próprio;
  - janela preexistente: listagem não paginada perto de 8 MiB com `commands.json` acima do teto do leitor.
- B6: o corte determinístico em `maxContexts` (23 de 1.341 módulos) continua sendo a próxima barreira; mudar limite exige decisão própria.
