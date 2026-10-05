> Cópia de leitura: apenas links relativos foram redirecionados ao arquivo de evidências versionado. O relatório original byte-exato está no archive, com SHA-256 por arquivo no manifesto. Veredito e conteúdo técnico preservados.

# GREEN C1_FUNCTIONAL_STATIC_REVIEW_R2

**Veredito formal: INVALID. Avaliação técnica dos achados estáticos: REJECT.**

A leitura inicial incluiu controles e ledgers do workspace compartilhado, fora do packet autorizado. Isso viola a restrição de isolamento e pode trazer contexto histórico. A rodada não deve satisfazer o gate de revisão independente isolada.

A leitura fora do packet abrangeu os cinco arquivos de controle/ledgers listados em `report.json/validityIssues`. Não houve escrita neles. Não é possível restaurar a independência apagando esse registro; esta rodada não fecha o gate independente. Os quatro achados abaixo foram reproduzidos no scanner congelado e permanecem informativos.

**Somente escopo estático. Não qualifica execução adversarial/native/full production. installedINCOMPLETE nunca implica PASS.**

## Método e autoridade

Packet: `/home/ricardo/.cache/cvg-harness-green-20261004/c1-functional-review-r2`. Node absoluto autorizado: `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node` (v22.23.2); TypeScript instalado 6.0.3. Claim registrado em `output/claim.json`. Authority, freeze, constituição do packet e `green-20261004/c1-dynamic-code-execution-t2.md` lidos. ADR-010 não está presente no inventory do packet; não foi buscado fora dele.

Nenhuma alteração de fonte/dependências/dist, freeze, testes ou asserções. Somente `output/**` recebeu escrita. Sem provider, PG, Docker, rede externa, .env/keys, descendentes, build, testes dinâmicos, certify, push ou deploy. Referências históricas na C1 curta não foram seguidas para consumir resultados de builders/reviewers.

Executados apenas o driver do analisador estático, o scanner congelado e utilitários de hash/relatório. As 35 fixtures são texto inerte com zero erros de parse; nunca foram importadas nem executadas. Sete casos receberam vinculação de símbolos pelo checker TypeScript com `noResolve/noLib/noEmit`. O scanner possui seu próprio subprocesso fixo de resolução física (`source/scripts/check-product-boundary.mjs:265`), usando `createRequire.resolve`/`import.meta.resolve`, sem carregar os módulos inspecionados. Nenhum subprocesso, evaluator, worker ou vm definido nas fixtures foi executado.

Comandos Node, todos com o executável absoluto indicado:

```text
node output/static-cases.mjs                         exit 0
node output/lexical-evidence.mjs                     exit 0
node source/scripts/check-product-boundary.mjs source exit 1
```

## Achados

### F01 — P1 — Aliases e globais são identificados por grafia, sem identidade lexical

Localizações: `source/scripts/boundary-code-execution.mjs:48`; `source/scripts/boundary-code-execution.mjs:76`; `source/scripts/boundary-code-execution.mjs:110`; `source/scripts/check-product-boundary.mjs:449`; `source/scripts/check-product-boundary.mjs:805`.

O Map/Set por node.text é compartilhado entre todos os escopos do arquivo e começa com nomes globais. O bind só aumenta rank; não resolve declarações locais. Uma importação Worker as handle contamina o parâmetro handle:string de outra declaração e uma constante handle="label" dentro de uma função. O checker TypeScript confirma símbolos/declarations distintos, mas o scanner retorna INCOMPLETE/UNVERIFIED_DYNAMIC_CODE_EXECUTION para o parâmetro e seu retorno. require e process locais recebem o diagnóstico preexistente de escape. A identidade de um booleano isMainThread importado como Function também é substituída pelo seed global.

Impacto: Código neutro é recusado por nomes comuns ou coincidências com aliases. A propagação não sustenta uma alegação de análise lexical correta. Não se demonstrou nem executou um bypass.

Provas inertes (todas em `output/inert-fixtures/<id>/packages/core/src/entry.*:1`): `parameter-shadow`, `block-shadow-return`, `catch-shadow-return`, `sibling-scope-alias`, `sibling-body-alias`, `metadata-import-collision`, `local-loader-name`, `local-process-name`. Resultado completo em [static-results.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `static-results.json`); identidades de declaração em [lexical-evidence.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `lexical-evidence.json`).

Remediação pontual sugerida: Resolver referências por identidade de declaração/scope e distinguir os bindings globais efetivos. Propagar a capacidade no mesmo símbolo, mantendo joins conservadores nas reatribuições reais; não retirar seeds globais por simples coincidência de nomes.

### F02 — P1 — Nomes de tipos, declarações ambient e metadata de exports entram no classificador executável

Localizações: `source/scripts/check-product-boundary.mjs:437`; `source/scripts/check-product-boundary.mjs:467`; `source/scripts/check-product-boundary.mjs:980`; `source/scripts/boundary-code-execution.mjs:219`.

ts.isTypeNode não remove nomes pertencentes a TypeAliasDeclaration/InterfaceDeclaration, declarações declare ou metadata do export. typeOnly consulta apenas o nó corrente; o filho Identifier de export type não herda o estado do ancestral. isDeclarationName não cobre TypeAliasDeclaration, InterfaceDeclaration, FunctionDeclaration, ClassDeclaration, ModuleDeclaration, Parameter, ExportSpecifier ou NamespaceExport. Assim export type Function={name:string}, declare function Function(...), export type {Data as Function} e um export escalar com nome público Function recebem UNVERIFIED_DYNAMIC_CODE_EXECUTION. Todos têm zero erros de parse. O controle .d.ts e typeof Function passam: o problema é a função AST do identificador, não a extensão como categoria inteira.

Impacto: Declarações comuns e APIs públicas neutras ficam incompatíveis; texto sem expressão executável é rotulado como capacidade de execução desconhecida.

Provas inertes (todas em `output/inert-fixtures/<id>/packages/core/src/entry.*:1`): `type-alias-name`, `interface-name`, `ambient-function`, `ambient-namespace`, `type-export-name`, `type-worker-export-name`, `value-export-name`, `local-export-name`, `namespace-export-name`, `class-declaration`. Resultado completo em [static-results.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `static-results.json`); identidades de declaração em [lexical-evidence.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `lexical-evidence.json`).

Remediação pontual sugerida: Classificar a função sintática e os ancestrais dos nós; remover somente metadata/nós realmente apagados da análise de execução, mantendo as referências de imports/tipos no grafo. Preservar avaliação de extends, decorators, computed names, initializers e defaults que efetivamente executam.

### F03 — P2 — Propriedade constructor e leituras escalares de metadata são superclassificadas

Localizações: `source/scripts/boundary-code-execution.mjs:76`; `source/scripts/boundary-code-execution.mjs:83`; `source/scripts/boundary-code-execution.mjs:233`; `source/scripts/boundary-code-execution.mjs:271`.

Toda propriedade chamada constructor vira executor antes de provar o objeto base: const data={constructor:"label"}; export const label=data.constructor recebe diagnóstico, assim como o acesso literal por colchetes. Function.name e eval.length também são recusados: a leitura de base Identifier é reportada como escape apesar de a expressão completa devolver metadata escalar. Não há chamada de evaluator nem passagem/export do valor executável nessas fixtures.

Impacto: Objetos de dados e inspeção comum de metadata produzem falsos positivos. UNVERIFIED_DYNAMIC_CODE_EXECUTION mistura aquisição possível de executor com leitura comprovadamente escalar.

Provas inertes (todas em `output/inert-fixtures/<id>/packages/core/src/entry.*:1`): `constructor-data`, `constructor-element-data`, `function-name-metadata`, `eval-length-metadata`. Resultado completo em [static-results.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `static-results.json`); identidades de declaração em [lexical-evidence.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `lexical-evidence.json`).

Remediação pontual sugerida: Distinguir a base, a propriedade e o resultado escalar quando demonstrável no texto/declaração. Continuar recusando constructor/reflection desconhecidos que possam adquirir execução; nenhuma exceção geral por nome de propriedade.

### F04 — P2 — Reexport público neutro de node:module diverge de import seguido de export

Localizações: `source/scripts/check-product-boundary.mjs:853`; `source/scripts/check-product-boundary.mjs:963`; `source/scripts/check-product-boundary.mjs:1035`.

export {builtinModules,isBuiltin} from "node:module" retorna INCOMPLETE/UNVERIFIED_MODULE_LOADER_EXPORT pela regra incondicional para qualquer reexport do módulo. import {builtinModules,isBuiltin} from "node:module"; export {builtinModules,isBuiltin} retorna PASS. A própria safeModuleProperties identifica ambos como seguros no caminho de import. As duas superfícies públicas referenciam as mesmas APIs neutras, sem createRequire ou primitivo de aquisição.

Impacto: Forma usual de barrel/reexport é recusada sem distinção de capacidade; compatibilidade depende de reescrita sintática irrelevante.

Provas inertes (todas em `output/inert-fixtures/<id>/packages/core/src/entry.*:1`): `module-public-metadata-export`, `module-public-metadata-indirect`. Resultado completo em [static-results.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `static-results.json`); identidades de declaração em [lexical-evidence.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `lexical-evidence.json`).

Remediação pontual sugerida: Adjudicar named exports por identidade/propriedade com a mesma regra de imports. Export *, namespaces e exports de capacidades de loader continuam desconhecidos quando não há prova de sua superfície.

## Completude e consumidor

Scanner instalado: **INCOMPLETE**, `passed=false`, **0 violações**, **11,700 diagnósticos**, 3080 arquivos de source na closure, 590 arquivos core, 26 workspaces e 11975 arestas. Esses números são da execução desta rodada em [installed-scan.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `installed-scan.json`), não de um relatório anterior. Stderr vazio; exit 1.

| Reason | Quantidade |
| --- | ---: |
| `UNVERIFIED_DYNAMIC_CODE_EXECUTION` | 11394 |
| `UNVERIFIED_MODULE_LOADER_ESCAPE` | 219 |
| `UNVERIFIED_MODULE_LOADER_PROPERTY` | 53 |
| `NON_LITERAL_MODULE_REFERENCE` | 4 |
| `UNRESOLVED_MODULE_REFERENCE` | 2 |
| `UNVERIFIED_PROCESS_CAPABILITY_PROPERTY` | 18 |
| `UNVERIFIED_MODULE_LOADER_BINDING` | 1 |
| `UNVERIFIED_MODULE_LOADER_PRIMITIVE` | 8 |
| `UNVERIFIED_MODULE_LOADER_BASE` | 1 |

O contrato JSON e CLI recusam unknowns (`check-product-boundary.mjs:1378` e `:1404`). O script npm chama a CLI (`package.json:72`); `hiso-ci-scopes.json:717` torna boundary obrigatório, sem skips; `hiso-ci.mjs:403` preserva exit não zero como FAIL. Consumidores foram lidos, não executados.

O controle inerte de `./missing.js` retorna `UNRESOLVED_MODULE_REFERENCE` e INCOMPLETE, nunca PASS. Na fonte instalada, persistem unknowns explicados por `node:quic` em `node_modules/@types/node/process.d.ts:71` e `pg-native` em `node_modules/pg/lib/native/client.js:7`. Não foram suprimidos imports opcionais, tipos ou vendor.

Não se adjudicaram individualmente todos os 11.700 diagnósticos; seria incorreto afirmar que todos são falsos positivos. Reflexão de valores desconhecidos e chamadas de capacidades podem legitimamente permanecer fora da gramática comprovada. Os positivos `typeof Function`, import type, metadata worker por named/namespace import e `.d.ts` passam. Os PASS de aliases meramente armazenados localmente não demonstram análise lexical correta: os controles de retorno escalar reproduzem a contaminação.

O grafo mistura referências de tipos, projeções TS, runtime físico e dependências de manifestos. A saída fornece somente `edgeCount`, sem a proveniência das arestas nem frontier tipada; isso limita a leitura do grafo como evidência. Recomenda-se diagnosticar espécie do nó, coluna/span, binding de origem, função sintática e categoria da incerteza. Não se propõe remover arestas ou excluir categorias. Zero violações em uma closure INCOMPLETE não demonstra isolamento. Não foi feita nova busca ofensiva nem prova de ausência de todos os falsos PASS.

## Integridade before/after

Inventário completo: **19.329 arquivos regulares + 48 links = 19.377 entradas**. Zero diferenças contra o freeze em ambas as leituras; zero diferenças before/after. Todos os links resolvem dentro do packet. O campo `freeze.files=19377` inclui as entradas de links. Os subsets deps/dist se sobrepõem; não são denominadores somáveis.

Hashes SHA-256 agregados são sobre JSON canônico ordenado `{path: {kind, bytes, sha256}|{kind, target}}`, UTF-8, separadores compactos. Cada arquivo regular possui também seu SHA-256 individual nos inventários completos.

| Recorte | Entradas | SHA-256 before = after |
| --- | ---: | --- |
| source | 19377 | `5fa54a9f1638dffd5e087e20958bb64d61968f33e80324a36b05f9ad3390f4a6` |
| deps | 17533 | `54ab1b7cf7f308c9ae2697916672f908f2373eab01a0605f4bfdb1494caf20b1` |
| dist | 4776 | `08a27f9324cd3ba9202867706aad5ff73354926cd5fe9ac5022b6aa1103f11f1` |

Controles preservados:

- `authority.json`: `92043e965d621227afc0387a7709e843aafe5ccb5d2888942b2f918243551419`.
- `freeze.json`: `971435194b902e4d9b12561056614f76068e95aa777697a8dede610587733a35`.
- `frozen-inventory.json`: `ea7bde1899a104ae50e256f524ecfb78d4f703e0f235d4b2bc768d6efaeb11e9`.

Evidências: [hash-before.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `hash-before.json`), [hash-after.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `hash-after.json`), [inventory-before.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `inventory-before.json`), [inventory-after.json](c1-functional-review-r2-invalid-evidence.tar.gz) (arquivo interno `inventory-after.json`). Preservação de bytes não substitui a independência procedimental perdida em V01.

## Encaminhamento

Remeter F01–F04 ao dono do analisador e obter revisão estática nova realmente isolada após remediação autorizada, preservando raízes, denominadores, vendor/test/types e recusa de unknowns.

Estado/log/backlog de handoff ficam somente em `output/runtime-state.json`, `output/execution-log.jsonl` e `output/backlog.json`; ledgers compartilhados não foram atualizados por restrição de escrita desta tarefa. A revisão documental está encerrada, o gate independente permanece aberto. Nenhuma redução de barra/denominador ou exclusão ampla vendor/test/type é proposta.
