# CI003 inventário — reteste após reparo do autor

Estado: `LOCAL_API_TESTS_PASS_PENDING_PARENT_INTEGRATION`. Os mesmos 58 testes passaram na fonte do autor `765bf39d45a8f58d76513516147ad75b198360ea401e58ed1659f9fad639e93f`, sem falhas ou pendências. [Resultado executado](fixed-green-result.json) e [JSON original](fixed-green.raw.json). O teste continua SHA `05f41a201b79403ae485577725d732f8faa454320003cd78253b9bc0fed086d5`; seu [patch de um caminho](../test.patch) não mudou.

O reparo do autor recusa `path.relative(root, file) === '..'`. A versão anterior admitia esse diretório quando presente nos dois inventários; a evidência anterior de 56 PASS e duas falhas continua intacta. Este reteste cobre as APIs públicas de admissão/contexto com inventário sintético, sem executar B6 ou o adaptador nativo.

## Fonte e concorrência

O autor fixou o SHA765 em GBrain1886735. Entre a inspeção inicial e a cópia, o arquivo compartilhado mudou para SHA `f30c250a946e5238b54df7d484834ede6eabcc08eb655dc6c3a330dfd5051636`. A pré-condição barrou a cópia e nenhum teste foi iniciado nessa versão; [registro](preflight-drift.json) e [diff observado](preflight-drift.diff). O input autorizado foi recuperado do snapshot4e0 com o delta exato do autor e seu SHA inteiro foi verificado antes da execução. O [snapshot fixado](guarded-pool-fixed.source.txt) é input do autor, sem autoria produtiva desta folha. O resultado não se transfere para a versão compartilhada mais recente. Domain e declaração de tipos permaneceram iguais às cópias anteriores, conforme [preflight](preflight.json).

## Verificação e controles

- Node22.23.2, Vitest4.1.12, um arquivo focal, 58 PASS/0 FAIL/0 pending; teto externo60s, execução0.594s.
- Partição removida em cópia própria: 55 PASS/3 falhas de assertions esperadas. Limites de workers removidos: 56 PASS/2 falhas esperadas. [Controles causais](mutation-controls.json) com a mesma suite congelada.
- O primeiro pós-processador exigiu texto `AssertionError`; o matcher de promises usa `Error: promise resolved ... instead of rejecting`. A [limitação do sumarizador](control-summary-check-first.json) foi registrada; os JSONs brutos foram inspecionados e nenhum teste foi repetido ou alterado para produzir outro resultado.
- Lint, sintaxe, formato e diff passaram. [Checks](static-checks.json). Patch original SHA `5b0f57f8ea9df4f6192e7746bb4b1ca8c00de4a66ffe6dfef17865f8eee13089`, apenas `tests/coverage-project-inventory.test.js` no índice próprio.
- Os32 arquivos do manifestoRED anterior foram reconferidos sem alterações. Os JSONs `.raw.json` são cópias exatas dos produtores.

## Entrega e próxima ação

GBrain START1890620, drift1892564 e END1894509 confirmados por leitura posterior. O detalheEND cita1892566 por erro de digitação; o registro de drift correto é1892564. Hold devolvido ao autor. Lead0410 deve integrar o teste e executar sua qualificação na fonte final, incluindo S1–S7. CI003/F01, revisão integrada e produção permanecem abertos; a evidência desta folha não substitui esses gates.

Estado/log/backlog99/20/30 dirty de pares continuam somente leitura. Delta proposto: inventário local qualificado no input765 com58 PASS; INV-F01 corrigido pelo autor e contraprova antiga preservada; próxima ação=integração e qualificação da candidata pelo Lead. Objetivo sequencial ativo, sem aceite global, commit, push ou deploy.
