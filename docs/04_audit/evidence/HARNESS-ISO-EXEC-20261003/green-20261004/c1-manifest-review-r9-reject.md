Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-manifest-review-r9-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

# C1_GLOBAL_MANIFEST_FRESH_REVIEW_R9

**Revisão VALID; decisão REJECT; correção do gate global INVALID.** A validade desta revisão descreve o protocolo e as evidências. O julgamento de código rejeita o gate pelos falsos PASS nativos abaixo. Não classifica os manifests atuais do snapshot como JSON inválido. Aceite limitado ao código; nenhuma certificação installed/global ou release.

396/396 casos estáticos fornecidos passaram. Dos 165 controles novos, 146 passaram e 19 falharam: 15/155 na suíte principal, 4/4 no aprofundamento de discovery e 6/6 controles nativos auxiliares aprovados. As asserções permaneceram intactas; os logs registram todas as falhas. Os 253 testes originais dinâmicos não foram executados.

Evidências: [supplied396](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [novos testes](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [novos discovery](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [auxiliares](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [12 reproduções CLI](c1-manifest-review-r9-reject-raw-evidence.tar.gz).

## R9-GM-001 — HIGH — Globs intermediários apagam workspaces e arestas sem bloquear o gate

Descoberta global precisa ser verificada; gramática não suportada precisa bloquear PASS.

**Esperado:** Expandir o glob e detectar CORE_DEPENDS_ON_PRODUCT, ou bloquear/INCOMPLETE pela descoberta não verificada.

**Observado:** packages/\*_/_ mantém coreFiles=1 e workspaceCount=1, ignora o manifesto core que depende do produto e retorna PASS, passed=true, CLI exit 0.

**Causa:** A única condição sintática é endsWith(/\*). O prefixo com glob é resolvido como diretório literal; ENOENT é descartado.

Código: [check-product-boundary.mjs:177](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `7bb27cc61ac6fe915cd321862d96585b3f7e08428cc1f6048bcb7dbd6cee57d3`.

Fixture: [discovery-packages**\_**](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `4b859b6ce30e641e4e75d3297bb434dbb886c3ec0548004a5f0585d70b99d459`.

Raw: [observação de módulo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stdout nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stderr nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz). SHA-256 stdout `93be53f5bd68ae903cd058ce50db8cbdec04b85a66587aeadfdd5c3476219908`. O report JSON contém todos os caminhos, hashes, argv e controles pareados.

Reprodução a partir de `output/runtime`, com Node 22.23.2 e ambiente vazio mais PATH/HOME/TMPDIR registrado no JSON:

```bash
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/runtime/scripts/check-product-boundary.mjs /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/new-inert-fixtures/discovery-packages_____
```

**Correção necessária:** Validar a gramática inteira antes da expansão ou implementar expansão completa; recusar descoberta não verificável.

## R9-GM-002 — HIGH — Inventário AST e inventário de manifests divergem sem verificação de cobertura

Validade GLOBAL dos manifests físicos do escopo, incluindo metadata de consumidor não alcançado.

**Esperado:** Bloquear manifest dependencies=[] ou name=42 dentro das raízes físicas auditadas mesmo quando workspaces omite a respectiva raiz; alternativamente registrar cobertura INCOMPLETE.

**Observado:** Omitir packages/_ ou products/_, ou usar workspaces=[], deixa os fontes no inventário AST, evita boundaryManifest correspondente e retorna PASS sem diagnóstico.

**Causa:** As quatro raízes físicas fornecem fontes, mas somente manifest.workspaces fornece manifests; nenhuma reconciliação exige dono/manifest validado para os fontes inventariados.

Código: [check-product-boundary.mjs:120](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `7bb27cc61ac6fe915cd321862d96585b3f7e08428cc1f6048bcb7dbd6cee57d3`.

Fixture: [omitted-core-workspace-invalid-manifest](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `61661aa5f00597108a820f516a23589345bd2da73983a01a1afd94b6d394f885`.

Raw: [observação de módulo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stdout nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stderr nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz). SHA-256 stdout `a5a1ed68e9517b0ca6a7af99510d448d98a4975830b0b43042d4396a31d4b50b`. O report JSON contém todos os caminhos, hashes, argv e controles pareados.

Reprodução a partir de `output/runtime`, com Node 22.23.2 e ambiente vazio mais PATH/HOME/TMPDIR registrado no JSON:

```bash
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/runtime/scripts/check-product-boundary.mjs /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/new-inert-fixtures/omitted-core-workspace-invalid-manifest
```

**Correção necessária:** Reconciliar cobertura física de manifests com raízes/owners auditados e separar seleção de closure da validade global de metadata.

## R9-GM-003 — MEDIUM — Alias npm inválido na raiz passa pela validação global

Aplicar validade de aliases em todos os manifests, inclusive package.json da raiz.

**Esperado:** neutral: npm:@ deve bloquear na raiz como bloqueia nos manifests de core e produto.

**Observado:** As quatro categorias da raiz aceitam npm:@ e retornam PASS/exit 0; core e produto rejeitam a mesma entrada com invalid_boundary_manifest:\*:npm_alias/exit 2.

**Causa:** boundaryManifest verifica apenas tipos de key/value. A validação do destino npm ocorre depois, somente em workspaces.values(), sem a raiz.

Código: [check-product-boundary.mjs:100](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `7bb27cc61ac6fe915cd321862d96585b3f7e08428cc1f6048bcb7dbd6cee57d3`.

Fixture: [root-dependencies-invalid-npm-alias](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `09a9006a276456a01f09420cbb661cbeeb764614c832115db91caf7b2de780e8`.

Raw: [observação de módulo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stdout nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stderr nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz). SHA-256 stdout `36168524396df5ccfe3e43d70e1ce49c8c47a694a6f296ae396c933d64543d0a`. O report JSON contém todos os caminhos, hashes, argv e controles pareados.

Reprodução a partir de `output/runtime`, com Node 22.23.2 e ambiente vazio mais PATH/HOME/TMPDIR registrado no JSON:

```bash
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/runtime/scripts/check-product-boundary.mjs /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/new-inert-fixtures/root-dependencies-invalid-npm-alias
```

**Correção necessária:** Normalizar e validar aliases na fase global de boundaryManifest para raiz e workspaces antes de montar arestas.

## R9-GM-004 — MEDIUM — Incerteza de identidade local de manifest recebe filtro de diagnóstico AST

Validade e identidade de dependências de manifests são globais; apenas diagnóstico AST pertence ao filtro da core closure.

**Esperado:** file:./absent deve conservar UNVERIFIED_LOCAL_DEPENDENCY e INCOMPLETE globalmente; ausência do destino não prova sua identidade.

**Observado:** Core conserva o unknown (CLI exit 1/INCOMPLETE). Produto não alcançado elimina o diagnóstico (PASS/exit 0); raiz não é processada (PASS/exit 0). Ocorre nas quatro categorias.

**Causa:** Diagnóstico de package.json usa o mesmo reportDiagnostic/diagnosticSources do AST e é removido por !seen.has(origin); processamento da raiz também está ausente.

Código: [check-product-boundary.mjs:392](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `7bb27cc61ac6fe915cd321862d96585b3f7e08428cc1f6048bcb7dbd6cee57d3`.

Fixture: [product-dependencies-missing-local-target](c1-manifest-review-r9-reject-raw-evidence.tar.gz); SHA-256 `a5479a501151afcfd1fa91e8eabe434f1272520fd66585850eef5efa9e179e6b`.

Raw: [observação de módulo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stdout nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz), [stderr nativo](c1-manifest-review-r9-reject-raw-evidence.tar.gz). SHA-256 stdout `36168524396df5ccfe3e43d70e1ce49c8c47a694a6f296ae396c933d64543d0a`. O report JSON contém todos os caminhos, hashes, argv e controles pareados.

Reprodução a partir de `output/runtime`, com Node 22.23.2 e ambiente vazio mais PATH/HOME/TMPDIR registrado no JSON:

```bash
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/runtime/scripts/check-product-boundary.mjs /home/ricardo/.cache/cvg-harness-green-20261004/c1-manifest-review-r9/output/new-inert-fixtures/product-dependencies-missing-local-target
```

**Correção necessária:** Preservar diagnósticos globais de manifest/identidade e manter o filtro de closure apenas para diagnósticos AST. A falta do destino é incerteza de resolução, sem alegar erro de sintaxe JSON.

Listas completas de IDs: [control-ids.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz). O JSON contém todos os 165 IDs novos, os 19 divergentes agrupados por finding, os 146 controles aprovados e os 396 nomes fornecidos. Os 253 originais foram informados PASS pelo Lead e não foram reexecutados; isso não modifica o veredito independente.

## Lexicalidade, closure e consumidores auxiliares

Parâmetros simples e não simples, transferência inicial, catch initializer ownership, bloco lexical, wrapper CJS e static block, wrappers TS, pattern writes, aliases/escapes de objetos e prova de escalares estáveis preservados nos controles novos. Unknowns alcançáveis retornam INCOMPLETE; AST do produto não alcançado permanece fora dos diagnósticos de core.

tsconfig-path-grammar.mjs é consumido pelo checker e workspace-dependency-audit.mjs. Seis controles nativos do consumidor auxiliar preservam wildcard literal $&, identidade física, MISSING_ALIAS_TARGET e public type unknown UNRESOLVED.

A validação de manifests do checker não é compartilhada por workspace-dependency-audit; a leitura expandWorkspaceOwners/readTsconfigPaths e o classificador de categorias não saneiam os quatro defeitos do gate principal. Não foi executado createReport/createCandidateManifest com baselines históricos.

tests/workspace-dependency-manifest.test.js enumera apenas apps/packages e usa um regex de imports; não fornece cobertura global de manifests de legacy/products nem corrige a perda de owners do gate. Somente análise de fonte, sem execução dessa suite.

O módulo instalado na cópia física retornou **INCOMPLETE / passed=false**, com 3.082 fontes, 592 coreFiles, 1.610 diagnósticos (128 coretests / 27 runtime / 1.455 vendor, incluindo 13 projeções dist) e zero violações de dependência de produto. Isso permanece uma observação, sem certificação. [Raw instalado](c1-manifest-review-r9-reject-raw-evidence.tar.gz).

## Integridade e isolamento

Node v22.23.2, workers normais do trusted Vitest e resolver nativo usados somente como infraestrutura. Todos os fixtures novos são JSON, texto AST e símbolos inertes; nenhum fonte de fixture foi importado ou executado. Nenhum Root, outro packet, parecer/histórico/Builder, rede, provedor, PG, Docker, .env privado, prod, dado real ou subagente foi utilizado. Escritas e temporários confinados a este output. Não foram alterados Source, barras, suites ou flags fornecidas.

Source conservou 19.334 arquivos, 48 links e 1.970 diretórios, total de 21.352 itens incluindo raiz. Zero diferenças de bytes, SHA-256, tipos, modos, mtimes e mtimes de diretórios. Inventário congelado de 19.382 entradas conferiu antes e depois. Cópia runtime sem arquivos regulares compartilhando inode com Source; todos os links originais têm destinos internos ao Source e foram copiados, sem links de diretórios para Source.

Inventário congelado SHA-256 `49d3ce9396cc413d48feed3f170ac8f7562b4ba37582ca304a9069dd764fec51`. Inventários completos antes/depois idênticos: `4d0e38cdbdf73d9a2ae9fa87bac6b914b133c68f7f0efde3966e0c0f5ca184af`. Deps `3ce28077ddab1e51a31c896a15f5a6b564f955f73a8865b2adeb575d381909de`; dist `f25ac85c628cdafb7ac7184a40023555db8bdbea193ee6b3d32a536faee80df2`.

[Antes](c1-manifest-review-r9-reject-raw-evidence.tar.gz) · [Depois](c1-manifest-review-r9-reject-raw-evidence.tar.gz) · [Prova de integridade](c1-manifest-review-r9-reject-raw-evidence.tar.gz) · [Fingerprints de código](c1-manifest-review-r9-reject-raw-evidence.tar.gz) · [Fingerprints de fixtures](c1-manifest-review-r9-reject-raw-evidence.tar.gz).

## Artefatos finitos

- [report.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [report.md](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [inventory-before.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [inventory-after.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [freeze-before-check.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [source-integrity.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [symlink-identity.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [reviewed-code-fingerprints.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [new-fixture-fingerprints.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [supplied396.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [supplied396.log](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [new-controls-vitest.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [new-controls-vitest.log](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [new-controls-raw.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [discovery-followup-vitest.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [discovery-followup-vitest.log](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [discovery-followup-raw.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [auxiliary-inert-controls.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [auxiliary-inert-controls.log](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [installed-gate.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [installed-gate.log](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [native-cli/results.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [runtime/tests/r9-independent-inert.test.js](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [runtime/tests/r9-discovery-followup-inert.test.js](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [auxiliary-inert-controls.mjs](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [native-cli-runner.py](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [installed-gate.mjs](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [verify-integrity.py](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [build-report.py](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [control-ids.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)
- [installed-diagnostic-attribution.json](c1-manifest-review-r9-reject-raw-evidence.tar.gz)

O JSON é o registro estruturado completo, com expected/observed, severidade, IDs, raw paths, hashes e reproduções. Nenhuma recomendação neste relatório autoriza escrita fora do output.
