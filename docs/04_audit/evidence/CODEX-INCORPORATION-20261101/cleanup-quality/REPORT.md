# Qualidade do encerramento interno do kernel

O commit privado `4f86d71a4b5184e3d54a2a17e5cf5c51bd23d993`, sobre `bc863ac9147e80b30f38a0614c8a8eb35e9447f4`, acrescenta 18 casos ao teste existente e remove dois `continue` inalcançáveis de `kernel/host.ts`. Os dois `await` que mantêm a espera indefinida foram preservados. A asserção de tipo necessária ao narrowing desaparece na emissão; a comparação de 1.897 tokens confirma que a única diferença executável é a remoção das duas instruções mortas.

Os casos verificam causas primitivas e opacas, funções sem invocação, propriedades de erro sem executar getters, omissão de rejeição original pelo coordenador e preservação da causa primária durante rollback. Os 19 testes anteriores permanecem como prefixo idêntico do arquivo; o total focal é 319 testes em 15 arquivos, sem skips. O host atingiu 100% em statements, branches, functions e lines. Typecheck, lint, formato, build dos 20 workspaces e consumidor físico do pacote passaram. O pacote contém os mesmos 169 arquivos; os 210 exports e a declaração pública do host continuam iguais. Nenhum binário nativo foi carregado.

O [parecer independente](code-review-r1/REPORT.md) concluiu `APPROVE_SCOPED_CODE_FOR_GLOBAL_QUALIFICATION`, sem achados obrigatórios. Os três artefatos completos foram entregues antes do prazo; o [recibo de admissão](review-admission.json) registra os tempos, hashes e encerramento automático do ator. Os 48 inputs congelados e o suplemento de quiescência foram conferidos antes e depois.

Esta aprovação cobre o ajuste interno. Os resultados globais anteriores pertencem a `bc863ac91`; a nova revisão ainda precisa dos gates globais, cobertura e certificação. A promoção canônica, o owner completo, a qualificação ABI, KR13 e a paridade permanecem abertos. Não houve push ou liberação de produção.

Evidências: [commit e fontes](completion.json), [freeze](code-freeze-r1/manifest.json), [correspondência RED/GREEN](red-green-correspondence.json), [emissão](emission-proof.json), [pacote público](public-artifact-comparison.json) e [integridade da revisão](code-review-r1/integrity.json).
