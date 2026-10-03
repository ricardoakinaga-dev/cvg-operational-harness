# Crítica T2 R2 — SPEC0178

**FAIL**, I1 fresh-context (`fork_context=false`), sem descendentes. Auditoria somente leitura da implementação estrutural. Não avalia SPEC0179/0180, aprovação T3, piloto, release ou cumprimento integral de0369/0370. Nenhum relatório ou racional do crítico anterior foi aberto. Constituição e coordenação foram lidas conforme solicitado; a coordenação contém referências históricas a revisões.

A barra congelada HISO-v1 contém24 critérios. Julgamento desta fatia: HISO003–008; os18 restantes constam como NOT_RUN/fora de escopo em `review.json`.

## Achados

1. **P1-R2-01 — closure de runtime oculta por declaration.** `scripts/check-product-boundary.mjs:148` utiliza o resultado de `ts.resolveModuleName` como único destino. Um core `.mjs` importa literalmente `scripts/bridge.mjs`; a presença de `bridge.d.mts` neutro faz o gate visitar somente a declaração. O `.mjs` real importa o produto e Node22 imprime `PRODUCT_LOADED`, mas o CLI retorna0, sem violations/diagnostics. Remover somente a declaration faz o mesmo gate retornar1. A variante que lê `SHIFT_PORT` também passa indevidamente. Provas: casos `negative-script-declaration-shadow`, `negative-script-no-shadow`, `negative-script-env-shadow` em `boundary-probes.json`. HISO005/ADR010/SPEC0178 exigem recusa transitiva; isso usa imports literais normais, sem execução arbitrária ou sandbox bypass. Correção recomendada: resolver/visitar tanto o destino de runtime quanto o de tipos, recusando runtime desconhecido.

2. **P1-R2-02 — aliases de loaders não propagam namespace.** `scripts/check-product-boundary.mjs:246` reconhece o namespace CommonJS de node:module apenas pela grafia `require`. `const r=require; const mod=r('node:module'); const load=mod.createRequire(__filename); load('../../../products/shift/src/index.cjs')` carrega realmente o produto e recebe exit0 do gate. `module.require('node:module')` com destructuring/createRequire também passa. Alias do próprio `module` e computed access não literal de seu require deixam a capacidade escapar; alias de `require.resolve` não produz sequer diagnóstico de capability desconhecida. Controles de require direto, createRequire direto ancorado, import não literal, reference path e devDependency são recusados; loaders neutros e método de domínio require passam. Correção recomendada: propagar capacidades em todos os loaders suportados e reprovar usos/escapes não suportados, preservando a distinção de métodos de domínio.

3. **P2-R2-03 — matriz AP→PISO ausente nos artefatos estruturais.** HISO008 exige essa matriz explicitamente (`0370:68` e quality-bar.json). O frontier registra status AP; 0370 fornece correspondência F01–F14; backlog-transfer preserva cartões. Nenhum desses é a matriz AP001–016→PISO/HISO/disposição que permite rastrear requisitos para um dono/status canônico. Não localizada em docs do produto,0370,frontier/backlog-transfer. Acrescentar correspondência e ponteiros sem criar fila paralela. Não é pedido de implementação/aprovação T3.

## Critérios da fatia

| Critério | Status integral nesta crítica | Evidência/limite |
| --- | --- | --- |
| HISO003 | PASS | SPEC/task/gate estrutural, paths, contratos preservados, recuperação e separação T3 definidos. |
| HISO004 | NOT_RUN | Parte estrutural PASS: workspace privado,17 TS byte-preserved,37 testes/demo prévios. G1 corrente completo não aceito. |
| HISO005 | FAIL | Dois bypasses P1 reproduzidos no CLI e Node22. |
| HISO006 | NOT_RUN | Discovery e inventário257 fontes (243 core/14 produto), pisos/exclusões mantidos; cobertura executável final corrente ainda sem captura completa. |
| HISO007 | NOT_RUN | Build da imagem final exit0/MATCH observado; smoke final e exclusão completa do consumidor na imagem do harness não validados independentemente. |
| HISO008 | FAIL | Transferência canônica/links/histórico passam; matriz AP→PISO exigida falta. |

## Verificação realizada

-17 fixtures de fronteira em Node22.23.2:10 outcomes esperados atendidos,7 falsos PASS. Cinco destes carregam o produto realmente; um lê env SHIFT, outro resolve path privado. Fixtures e comandos completos preservados.
- Cinco fixtures próprias de links: mapa exato com destino atualizado PASS; alvo não mapeado, origem reintroduzida, destino ausente e cadeia de moves FAIL como esperado.
- Gate sobre o root exit0:836 fontes,796 core,26 workspaces. Esse resultado não prova soundness diante dos negativos acima.
- Checker atual sobre docs/README/AGENTS/produto:20 moves resolvidos, zero links quebrados/stale/missing/absolutos não classificados.
-20 origens ausentes;17/17 TS iguais às fontes históricas;20/20 destinos iguais ao delta corrente; hash do manifesto histórico confere. Dois ajustes de deploy estão distinguidos dos moves originais.
-107/107 relatórios históricos diretos em docs/04_audit iguais à baseline. Dez cartões PISO têm uma única fonte de status e ponteiros no root. Corpos dos dez cartões preservados; PISO010 requer normalizar apenas o separador final de um LF para os dois LF do bloco extraído histórico, registrado explicitamente.

## Runtime e proveniência

Não executei install,PG,E2E,certify,suites existentes,imagem ou integração externa. Os resultados de builders foram inspecionados, sem adotá-los como aceites próprios. A execução inicial das fixtures usou Node24 por default; todas as17 provas decisivas foram executadas em Node22.23.2.

O log agregado prévio mostra2614 testes/335 arquivos PASS, mas seu sentinel difere em9 inputs do root corrente, incluindo checker/testes/manifests/backlog. A variante neutra comprova exports construídos, instalação offline,369 testes/27 arquivos e smoke limitado; contém delta intencional de manifests/lock e checker antigo, não full-goal PASS. A captura E2E final registra exit0 e DRIFT bruto; comparação independente dos manifests before/after encontrou somente playwright-results.xml alterado. O build de imagem final registra exit0/MATCH; smoke final não foi validado. Coverage final não tinha JSON concluído no fechamento do relatório, portanto NOT_RUN.

Selo independente before/after dos50 inputs: **MATCH**, sem alteração em qualquer hash individual, também igual aos50 hashes fornecidos. Digest independente da lista compacta ordenada: `ffac23c005fe766ccb02b8831d0abd5f81f61f493c39e8dca906c36e69c25dd8`. O algoritmo do agregado independente está explícito; não é atribuído ao hash agregado fornecido, cujo algoritmo não foi informado.

Recomendação: corrigir os dois caminhos do gate e completar a matriz AP→PISO; o owner deve verificar os negativos reproduzidos e concluir os gates correntes. Esta é a última crítica T2 corrente: não proponho uma terceira rodada nem concedo aceite global.

Evidência estruturada: [review.json](review.json), [probes](boundary-probes.json), [suplemento](boundary-probes-supplement.json), [links](docs-probes.json), [moves](moves-check.json), [transferência/histórico](transfer-history-check.json), [sentinel-before](sentinel-before-independent.json), [sentinel-after](sentinel-after-independent.json).
