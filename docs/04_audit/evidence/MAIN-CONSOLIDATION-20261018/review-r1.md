# Revisão independente R1 — REVISE

Crítico Godel, fonte fcb194b8, somente leitura, sem execução. Dois P2 obrigatórios:

1. A portabilidade do reference root foi propagada só no reply. Completar nos filhos failure/tool, inventário independente e comparação do testemunho hash-bound; preservar pin, aliases, hashes, payload e topologia.
2. O catch de recuperação pode perder a causa original se a consulta de diagnóstico também falhar. Tornar coleta best effort, causa original preservada e falha secundária separada; prazo e asserts inalterados.

Confirmações do crítico: correções da main preservadas, fontes da fundação mantidas, overlaps mantêm comportamento ampliado e nenhum source reference-capture incorporado. Resultado é revisão de integração de fonte, não certificação.

Um único reparo agrupado autorizado nesta composição, antes de R2 do mesmo crítico. Escopo próprio adicional: novo tests/differential/reference-location.mjs; reference-agent-driver.mjs, reference-inventory.mjs, compare-model-failure.mjs, compare-tool-turn.mjs, model-failure-differential.test.ts, tool-turn-differential.test.ts e homolog.integration.test.ts na candidata. Teste discriminante: referência física relocada em mount namespace com localização original ocultada; executar suites diferenciais, mantendo todos controles negativos e witness intacto. Runner local passa somente a variável de localização; sem rede/provider real.

A suíte unit iniciada em fcb194b8 é baseline de composição; qualquer edição durante ela invalida atribuição integral ao novo HEAD. Aceite exige checks atuais e CI do HEAD final.
