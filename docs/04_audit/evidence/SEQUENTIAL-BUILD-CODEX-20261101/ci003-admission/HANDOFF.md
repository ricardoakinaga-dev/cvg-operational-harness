# CI003 — admissão de opções de cobertura: entrega ao Lead0410

OfertaGBrain1855799, gateHOWR2 aprovado1859652 e ACK de API3535a510. Subtarefa internaT2 da mesma CI003, sem nova carteira. A implementação local desta folha está concluída; integração, revisão independente do runner e S1–S7 continuam com o Lead.

## Artefatos concretos

- Base `feeda7e8ff3938b70bceb470a34f02161128ca06` em candidata própria `/mnt/dados/cvg-work/ci003-admission-codex-20261101/candidate`.
- [Patch de somente dois arquivos](implementation.patch): `scripts/lib/coverage-profile-options.mjs` e `tests/coverage-profile-options.test.js`.
- [Hashes das fontes](source-freeze.json), [resultado](result.json), [HOW/aceites](HOW.md), [testes brutos](green-final.json), [controles mutantes](mutation-controls.json), [checks finais](static-checks-final.json).
- Patch SHA-256 `ae3120b8c0311a5d0e99793c5695a1dede171d9d51760f58ce5377cf1825792a`. Fontes da folha ficam congeladas até intake; novo ajuste requer coordenação.

## Contrato entregue

`parseScheduledCoverageOptions(argv, env)` retorna novo vetor canônico com `--reporter=default/json`, repetível e na ordem recebida, e no máximo um `--outputFile=<valor>`, que exige reporterjson. Formas com igual e valor separado são aceitas. Qualquer presença de `VITEST_MAX_WORKERS`, mesmo herdada ou com valor vazio/undefined/2/3, recusa; não há leitura de seu valor.

Todas as outras opções/posicionais/separador/bypass são recusadas. Output vazio/whitespace, controlesC0/DEL/C1 e hífen inicial, inclusive após espaços, são recusados; paths/Unicode/espaços válidos ficam literais. Erros não refletem os valores. Inputs e ambiente não são alterados; o helper não importa módulos nem faz spawn/IO. O runner continua responsável por construir `run --coverage` com config fixa, controlar ambiente efetivo e confinar o destino dos relatórios.

## Verificação executada

Node22.23.2 e Vitest4.1.12 instalado, sem install ou alteração de dependências. Config/cache/resultados próprios. RED inicial: helper ausente na base. Após implementação,84 testes PASS,0FAIL/pending; lint, formato, sintaxe dos dois arquivos e diffcheck PASS.

Os mesmos84 testes foram executados contra duas cópias conhecidamente incorretas: passthrough de flags produziu36 falhas de assertions; admissão de worker override produziu9. Os dois processos saíram1 como esperado. As fontes da candidata permaneceram iguais aos hashes congelados durante os controles; reexecução final do helper correto confirmou84PASS.

Nenhum teste de aplicação, PG/E2E, certificado ou perfil real de scheduling foi executado nesta folha. Esses resultados não fecham F01/S2/S7 nem qualificam CI003 inteira. A preparação inicial do sparse index foi corrigida na própria candidata antes do GREEN; o erro de setup não foi atribuído ao produto.

## Intake e continuação

Lead0410 confere base/digests, aplica somente os dois caminhos em sua candidata de cobertura, conecta o parser ao runner e conserva os negativos no mesmo comando de teste. A revisão independente e os gates completos permanecem seus. Nenhum patch foi aplicado ao root compartilhado ou à candidata CI002 emQA, e não houve commit, push ou deploy.
