# SPEC0241 — Corpo integral e proveniência instalada da fronteira B6

**PROPOSTA T3. BUILD ainda não autorizado.** Preparação T1 `HISO005-P2-NEXT-RECON-20261018`; implementação futura `HISO005-P2-BUILD-0241`. Mesma frente HISO005/B6, sem reabrir as aprovações 0236, 0237 e 0240. Autoridade de segurança: [constituição D-12/T3](../07_agents/AGENTS.md), [SPEC0236](0236_b6_semantic_boundary_proof.md), [SPEC0237](0237_b6_runtime_resolution_profile.md), [SPEC0240](0240_b6_node_metadata_resolution_scope.md). Execução e continuidade pertencem ao [plano 0391](../03_build/0391_hiso005_semantic_proof_execution.md).

## 1. CURRENT — problema e evidência

A fonte qualificada é `f22a74a09fe1abefd3eaf0b11f65815b02c5c63d` (BUILD0240), com Node 22.23.2 e TypeScript 6.0.3. Os scripts promovidos ao root em `fb4a723e` têm os mesmos bytes do freeze r2. O [estado do BUILD0240](../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/state.json) registra 16 gates e 38 hashes atuais. A [medição v3](../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/real-postcert-summary.json) continua INCOMPLETE: 1.118 diagnósticos, 537 origens baseline abertas e 581 novas, 303 MATCH, zero verified e zero provas. A queda de 1.609 para 1.118 não é crédito. O ledger conserva as 1.721 tuplas históricas, as 1.072 da v2 e as 581 da v3.

A [partição reprodutível](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/cause-partition.json) confere os bytes dos relatórios selados contra os receipts:

| Grupo                                 | Ocorrências | Causa imediata                                                                     |
| ------------------------------------- | ----------: | ---------------------------------------------------------------------------------- |
| Baseline instalada                    |         303 | `UNKNOWN_INSTALLED_CLOSURE`; nenhuma closure provada                               |
| Baseline de primeira parte            |         234 | 161 dynamic code, 69 loader escape, 4 loader property; nenhuma prova emitida       |
| `UNKNOWN_FORMAT`                      |         239 | `.d.ts` (198), `.tsx` (37), JSON e CSS                                             |
| `UNKNOWN_NATIVE_BUILTIN`              |         195 | import de módulo nativo, recusado pela regra herdada                               |
| `UNKNOWN_ACQUISITION_ENOENT`          |          60 | alvo ausente na aquisição                                                          |
| `UNKNOWN_MODULE_INTEROP` / `PARSE`    |     30 / 29 | interop não modelado; parse inválido em apps/web                                   |
| `UNKNOWN_AMBIGUOUS_RESOLUTION`        |          10 | guarda de metadados da v3, incluindo uma entrada sem arquivo                       |
| `UNKNOWN_COMPILED_PROVENANCE`         |           6 | `dist` instalado do Vitest sem receipt compilado                                   |
| `UNKNOWN_FUNCTION`                    |           4 | função fora de K3 em `dist` do Vitest                                              |
| Demais motivos de resolução/workspace |           8 | config, link, self-reference, export não resolvido/não suportado, workspace legacy |

As 537 origens baseline não têm causa individual. O engine só emite provas quando `status` é PROVEN, isto é, sem nenhum UNKNOWN e sem violação. Enquanto qualquer uma das 581 entradas existir, nenhuma origem pode ser resolvida.

**Achado 1 — a fase de corpo para na primeira resolução que lança exceção.**

- **Onde.** Import estático e export-from em `block()` (linhas 1047 e 1157 do engine congelado), e import dinâmico e loader em `expression()` (linhas 807 e 834), chamam `load(resolve(...))` sem captura por aresta. A exceção atravessa o laço que carrega os módulos em ordem (linha 1367) e chega ao catch externo do worker (linha 1461). Esse catch registra a tupla no `error.file` do helper ou, sem ele, numa entrada sem arquivo.
- **Cadeia real.** A [cadeia física](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/physical-recon.json) foi reconstruída com os registros `runtimeResolution` do próprio analisador e com os bytes das referências r5/r6, de SHA igual ao medido. O corpo começa no primeiro teste ordenado e segue `vitest`, `vitest/dist/index.js`, `chunks/test.DNmyFkvJ.js`, `@vitest/runner`, `chunk-artifact.js` e `@vitest/utils/error`. Para em `@vitest/pretty-format/dist/index.js`, na aresta `tinyrainbow`, cujo manifesto declara `browser`; não há registro de resolução para ela.
- **Contadores.** 7 estados K6 (v2: 1, parada na aresta `vitest`), zero contextos de chamada e zero valores de união, contra 1.095 arquivos de código de primeira parte entregues como starts.
- **A recusa é da guarda, não da resolução.** O [oráculo nativo](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/resolve-oracle.json) resolve `tinyrainbow` para um arquivo regular, sem importá-lo; a recusa vem da guarda `browser`, mantida pela 0240. A origem que a recon 0240 deixou sem atribuição é essa assinatura do catch externo: ela recebe causa, não resolução.
- **O que mais a parada pula.** Pula também as verificações posteriores ao laço: identidade de pacotes alcançados, registros instalados não alcançados e validação de origens (linhas 1368–1426). Nenhuma tupla `UNKNOWN_INSTALLED_IDENTITY`, `UNKNOWN_UNREACHED_INSTALLED_ENTRY` ou `UNKNOWN_INVALID_ORIGIN` existe na v2 ou na v3. Há 303 registros instalados e só 21 pacotes com código adquirido, o que deixa latentes até cerca de 282 entradas de não alcançado (estimativa e limite superior).

**Achado 2 — `dist` instalado nunca pode satisfazer a regra atual.** A linha 1240 exige receipt compilado para qualquer caminho com segmento `dist`. A receita v1 cobre somente emits de `packages/shared` e `packages/contracts`: 112 arquivos, dos quais 22 foram adquiridos como código analisável. Pacotes instalados não são compilados localmente, então a exigência é impossível mesmo com identidade0234 MATCH. Código instalado em `build/`, `esm/`, `lib/` ou na raiz do pacote não passa por essa exigência. Foram adquiridos 32 arquivos instalados sob `dist`, em 12 pacotes, todos MATCH; só 6 chegaram ao corpo antes da parada.

**Achado 3 — `UNKNOWN_FUNCTION` nasce na declaração.** `functionValue()` (linha 595) recusa função assíncrona, generator, parâmetro com padrão, rest ou inicializador. A pré-declaração de bloco aplica a recusa mesmo a funções nunca chamadas. As 4 entradas medidas resumem 42 declarações recusadas em 4 arquivos, porque a deduplicação é por arquivo e motivo. O censo sintático latente encontra 251 funções recusadas nos 32 `dist` instalados e 4.426 nas fontes de primeira parte, das quais 3.919 são assíncronas.

Os [controles sintéticos privados](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/body-controls.json) rodaram no engine congelado, com 16 expectativas PASS e zero carga de alvo:

- C1 e C2: um import nativo anterior suprime as entradas de corpo de outro módulo e das instruções seguintes; sem esse import, elas aparecem.
- C3: os mesmos bytes com identidade MATCH resultam UNKNOWN_COMPILED_PROVENANCE sob `dist` e PROVEN sob `lib`.
- C4: uma função assíncrona ou com parâmetro default, nunca chamada, já é UNKNOWN.
- C5: o campo `browser` reproduz exatamente a assinatura real, com entrada sem arquivo e entrada no importador.
- C6: uma aresta de produto visível só no corpo (acesso K2 a propriedade, que o census de aquisição não avalia) dá VIOLATION quando o corpo roda. Com um import nativo num módulo ordenado antes, a mesma árvore dá UNKNOWN sem violação. Não é falso PASS, mas um FAIL que o corpo detectaria aparece como INCOMPLETE.

A [revisão R1](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/review-r1/review.json) acrescentou três controles no mesmo engine ([cópia do lead](../04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/review-r1-extra-controls.snapshot.json)):

- X1: com três arestas de produto só no corpo, aparece uma violação, porque o helper registra o produto e depois lança `UNKNOWN_PRODUCT_TARGET`.
- X2: alvo ausente só no corpo gera uma tupla atribuída ao alvo e oculta as entradas seguintes.
- X3: a parada oculta `UNKNOWN_UNREACHED_INSTALLED_ENTRY`.

A causa designada existe, mas suas contagens medidas (6 e 4) são artefatos da parada. Também ficam latentes 371 arquivos `dist` de primeira parte fora do receipt (194 analisáveis e 177 `.d.ts`) e arestas nativas em pelo menos 150 arquivos. Esta proposta não promete prova, queda de contagem ou fechamento de B6. A contagem deve subir quando o corpo for medido.

## 2. PROPOSED — resultado e limite do delta

Dois deltas finitos, decididos juntos:

- **D1 — medição integral do corpo.** Conter cada falha de resolução por aresta, continuar o módulo e os seguintes, cortar somente por contador determinístico e declarar cobertura e fases. Não amplia confiança. Acrescenta UNKNOWN e violações, reatribui ao importador a entrada sem arquivo de aresta e detalha `UNKNOWN_FUNCTION`. Troca a parada silenciosa por limite declarado com frontier e contagens, como o §6 da 0236 pede para qualquer barreira.
- **D2 — proveniência instalada por identidade de arquivo.** Para código instalado, a identidade0234 do pacote e do arquivo substitui a exigência de receipt compilado associada ao segmento `dist`. É ampliação positiva de premissa, portanto T3. Somente para a v4, supera a frase da 0240 §2 sobre `dist` de dependência instalada e a cláusula correspondente de MS04. Os testes v3 permanecem como testemunhos.

O resultado observável futuro é uma fronteira de corpo sem parada silenciosa, com cobertura explícita, e a remoção de uma exigência que nenhuma evidência podia satisfazer. Uma prova só existe quando corpo, sucessores e todas as regras fecham K0–K7 e não sobra UNKNOWN global. Na árvore real, a expectativa é de zero provas.

Fora do delta: K0–K7 e K3 (async, generator, padrões e defaults continuam UNKNOWN), supressão global de provas, `browser`, imports e patterns ativos, módulos nativos, interop, TSX, parse, extensão da receita compilada para outros workspaces, valores de limite, prazo de 120 s, recomputação do worker, census de recusas, resumos por nome de pacote, allowlist, dispensa de testes e teto de diagnósticos.

## 3. Contrato

### 3.1 D1 — contenção por aresta

As arestas do corpo são import estático, export-from, cada alternativa K1 finita de import dinâmico e cada alternativa de loader provado. Em cada uma, `resolve` e o `load` do alvo passam a ser chamados dentro de contenção. Só é contida a exceção cujo prefixo de motivo (texto antes de `:`) pertence à lista fechada abaixo.

A tupla contida tem a mesma forma que a aquisição já usa na linha 501: arquivo igual a `error.file` quando relativo, senão o importador; motivo igual ao prefixo; detalhe igual a `error.message` com a remoção de root existente.

| Classe                         | Motivos contidos por aresta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve()` do engine          | `UNKNOWN_RESOLUTION`, `UNKNOWN_NATIVE_BUILTIN`, `UNKNOWN_EXTERNAL_PATH`, `UNKNOWN_FORMAT`, `UNKNOWN_MODULE_INTEROP`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Seleção e metadados do helper  | `UNKNOWN_AMBIGUOUS_RESOLUTION`, `UNKNOWN_UNSUPPORTED_EXPORTS`, `UNKNOWN_UNRESOLVED_EXPORT`, `UNKNOWN_BLOCKED_EXPORT`, `UNKNOWN_EXPORTS_DEPTH`, `UNKNOWN_EXACT_EXPORTS_TARGET`, `UNKNOWN_TARGET_URL`, `UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION`, `UNKNOWN_PACKAGE_SELF_REFERENCE`, `UNKNOWN_PACKAGE_SCOPE`, `UNKNOWN_PACKAGE_NAME`, `UNKNOWN_PACKAGE_ESCAPE`, `UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST`, `UNKNOWN_CJS_FILE_PACKAGE`, `UNKNOWN_ABSOLUTE_PACKAGE_ENTRY`, `UNKNOWN_WORKSPACE_CONFIG`, `UNKNOWN_WORKSPACE_LINK`, `UNKNOWN_SYMLINK`, `UNKNOWN_ANCESTOR_SYMLINK`, `UNKNOWN_ANCESTOR_FORMAT`, `UNKNOWN_LINK_FORMAT`, `UNKNOWN_METADATA_ENCODING`, `UNKNOWN_INPUT_ENCODING`, `UNKNOWN_INVALID_MANIFEST`, `UNKNOWN_PATH` |
| Produto, após violação gravada | `UNKNOWN_PRODUCT_TARGET` (o helper chama `product()` antes de lançar; a contenção nunca remove a violação)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Aquisição por errno            | `UNKNOWN_ACQUISITION_ENOENT`, `UNKNOWN_ACQUISITION_ENOTDIR`, `UNKNOWN_ACQUISITION_ELOOP`, `UNKNOWN_ACQUISITION_EACCES`, `UNKNOWN_ACQUISITION_EISDIR`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Todo o resto continua global no catch externo, como hoje:

- limites `UNKNOWN_ANALYSIS_LIMIT:*` (salvo o corte de corpo da §3.2) e `UNKNOWN_RESOLUTION_LIMIT:*`;
- mutação e snapshot: `UNKNOWN_INPUT_MUTATION`, `UNKNOWN_RESOLUTION_MUTATION`, `UNKNOWN_ROOT_MUTATION` e `UNKNOWN_INVALID_SNAPSHOT`;
- raiz e sessão: `UNKNOWN_ROOT`, `UNKNOWN_ROOT_ALIAS`, `UNKNOWN_ROOT_ACQUISITION`, `UNKNOWN_CLOSED_SESSION`, `UNKNOWN_ACQUISITION_PLATFORM` e `UNKNOWN_ACQUISITION_CLOSE`;
- perfil e entrada: `UNKNOWN_RUNTIME_PROFILE`, `UNKNOWN_INVALID_LIMITS`, `UNKNOWN_CENSUS_MODE`, callbacks, toolchain e input inválido;
- qualquer outro sufixo de `UNKNOWN_ACQUISITION_` (por exemplo EMFILE, ENFILE, EIO ou IO) e qualquer erro fora do padrão `UNKNOWN_*`.

O BUILD confere essa lista contra o código antes de editar. Um motivo encontrado e não listado é global por padrão e fica registrado no contrato da task; não entra na lista sem nova revisão.

O valor da aresta contida é U: bindings, namespace, reexport ou retorno. Não há seleção de alvo alternativo, troca de modo ou condição, fallback para declaração ou nova tentativa. Toda contenção registra UNKNOWN. Um módulo com aresta contida nunca é PROVEN, e o status global continua UNKNOWN. A análise prossegue nas instruções seguintes e nos demais módulos, em ordem. A deduplicação de UNKNOWN passa a usar a chave canônica em conjunto; a semântica e a ordenação final não mudam.

### 3.2 D1 — corte determinístico, fases e cobertura

Nenhum valor de limite muda: 100.000 estados, 120 s, 12.000 arquivos, 2 M nós e os demais. Não há canal novo de prazo, margem por relógio, flag ou env.

O corte do corpo é somente determinístico: estouro de `maxStates`, `maxContexts`, `maxCallDepth` ou `maxUnionValues` durante a fase de corpo encerra apenas essa fase e registra `UNKNOWN_ANALYSIS_LIMIT:<cap>`. A recomputação do worker reproduz o mesmo ponto de corte, então `validation` continua válida e normal/strict continuam iguais. Depois de um corte, rodam as verificações pós-corpo (identidade dos pacotes alcançados, registros instalados não alcançados e validação de origens) e a revalidação final. Todo UNKNOWN e toda violação coletados são preservados.

O `timeoutMs` checado em `bump()` e o prazo do pai continuam globais e fail-closed. Census, análise e recomputação seguem no mesmo orçamento de 120 s, sem divisão nova. Se o prazo estourar, vale o envelope atual: `empty()` mais as violações transmitidas, com a fronteira perdida. Isso é condição de parada da promoção (§5) e exige decisão própria sobre limite ou estratégia de recomputação.

O payload semântico ganha campos determinísticos:

- `bodyCoverage`: módulos do corpo (total, iniciados e concluídos) e arestas contidas;
- `phases`: aquisição, corpo, pós-corpo, gramática e revalidação, cada uma como `COMPLETED`, `CUT:<cap>` ou `SKIPPED:<motivo>`.

O worker os emite em todo caminho de saída: conclusão, corte ou erro global. Quando o pai substitui o resultado por `empty()`, `phases` é `null` e o motivo do envelope fica registrado. A checagem de gramática nativa continua rodando somente sem UNKNOWN e sem violação.

O census de recusas (`node22-linux-v2-refusal-census-v1`) não recebe a contenção. Seus UNKNOWN e violações permanecem iguais aos da v3 nos mesmos inputs, e seu tempo não cresce.

### 3.3 D1 — detalhe de `UNKNOWN_FUNCTION`

O detalhe passa a ser uma categoria fechada: `NO_BODY`, `GENERATOR`, `ASYNC`, `PARAMETER_PATTERN`, `PARAMETER_REST`, `PARAMETER_INITIALIZER` ou `ANONYMOUS_DECLARATION`. Uma função em várias categorias gera todas elas. Há no máximo uma entrada por arquivo e categoria. K3 e o momento da recusa não mudam: toda categoria continua UNKNOWN, inclusive em função nunca chamada.

### 3.4 D2 — identidade por arquivo para código instalado

**Arquivo instalado e chave do pacote.** Arquivo instalado é aquele cujo caminho canônico relativo contém o componente `node_modules`. A chave do pacote tem uma única derivação: o último `node_modules`, mais dois componentes quando há escopo ou um quando não há. Quando a aresta tem owner do helper, a chave do owner e a derivação física precisam coincidir. Um link de workspace resolve para o caminho canônico em `packages/...` e continua sendo primeira parte.

**Premissas.** Para todo arquivo instalado carregado no corpo, com ou sem `dist`, valem todas estas premissas:

- o pacote está em `input.installed` com `identityStatus` MATCH e `referenceDigest` hexadecimal;
- o checker fornece o inventário de referência0234 do pacote e o seu `inventorySha256`, conferido contra a referência que ele já valida;
- o engine recomputa o digest canônico desse inventário com o algoritmo do comparador0234 e exige igualdade;
- a entrada do caminho relativo ao pacote existe, é do tipo arquivo e tem SHA-256 igual ao snapshot adquirido, antes e depois da análise.

**Falha.** A falha de qualquer premissa produz `UNKNOWN_INSTALLED_FILE_IDENTITY` com o caminho, já no carregamento e sem fallback. Isso vale inclusive para a falha da premissa de pacote, para pacote aninhado e para entrada de outro pacote. Diretórios que o inventário0234 não inclui, como os com prefixo ponto, resultam em ausência e, portanto, UNKNOWN. A comparação de `input.installed` antes e depois, que o checker já faz, passa a cobrir os campos novos. A finalização de identidade após a execução permanece. As regras de pacote continuam: `UNKNOWN_INSTALLED_IDENTITY`, `UNKNOWN_UNREACHED_INSTALLED_ENTRY` e `verified: true` somente com MATCH e closure integral PROVEN.

**Efeito.** Satisfeitas as premissas, o segmento `dist` de arquivo instalado deixa de exigir receipt compilado. Receipt nunca serve de autoridade para arquivo instalado. Arquivo de primeira parte sob `dist`, inclusive alcançado por link de workspace, conserva a receita v1 sem mudança: os 371 arquivos fora de shared e contracts continuam `UNKNOWN_COMPILED_PROVENANCE`. O corpo instalado ainda precisa de K0–K7 integral; identidade e proveniência não provam semântica.

### 3.5 Conservação de recusas, violações e census negativo

Esta regra vale para execuções v3 e v4 sem estouro de prazo, ENOBUFS ou erro de worker, com os mesmos inputs e limites. Toda tupla UNKNOWN da v3 (arquivo, motivo, detalhe) persiste na v4, salvo três exceções nominais:

1. A tupla sem arquivo produzida pelo catch externo a partir de exceção de aresta passa a ser atribuída ao importador, com o mesmo motivo e detalhe. A tupla atribuída ao alvo por `error.file` persiste igual.
2. `UNKNOWN_COMPILED_PROVENANCE` de arquivo instalado desaparece quando a identidade por arquivo confere, ou vira `UNKNOWN_INSTALLED_FILE_IDENTITY`.
3. `UNKNOWN_FUNCTION` sem detalhe vira entradas por categoria do mesmo arquivo.

Tuplas de envelope ficam fora da regra de persistência, mas entram no ledger: `UNKNOWN_ANALYSIS_LIMIT`, `UNKNOWN_REVALIDATION`, `UNKNOWN_WORKER_ERROR`, `UNKNOWN_INVALID_WORKER_RESULT`, `UNKNOWN_INPUT_REVALIDATION` e `UNKNOWN_INSTALLED_REFERENCE`. Qualquer outro desaparecimento é defeito.

O multiset de violações da v3 está contido no da v4. Produto já conhecido prevalece sobre contenção e corte, com stream e união no pai inalterados. Nenhum UNKNOWN substitui violação. O census mantém seus resultados v3 (§3.2). O ledger conserva 537, 1.721, 1.072 e 581 tuplas e acrescenta as novas sem crédito por troca ou desaparecimento de motivo.

## 4. O que permanece UNKNOWN

- **Kernel (K3 e demais regras):** async, generator, padrões, rest, defaults, declaração anônima, classes, laços, getters, Proxy, chamadas sem resumo e todo import dinâmico (`UNKNOWN_DYNAMIC_IMPORT_PROMISE`).
- **Metadados:** `browser` (inclusive `tinyrainbow`), imports e patterns ativos, perfis customizados.
- **Módulos nativos:** cada aresta é contida, mas continua `UNKNOWN_NATIVE_BUILTIN`.
- **Resolução e workspace:** formato, parse, interop, alvo ausente, links e config de workspace legacy, self-reference, config de resolução e exports não suportados.
- **`dist` de primeira parte:** fora da receita compilada v1.
- **Pacotes instalados:** `verified: false` sem closure integral, identidade por arquivo divergente e registros não alcançados (`UNKNOWN_UNREACHED_INSTALLED_ENTRY`).
- **Limites:** corte `UNKNOWN_ANALYSIS_LIMIT` provável na árvore real, e o envelope de prazo.
- **Supressão global:** qualquer UNKNOWN impede todas as provas.

## 5. Versão, integração e recuperação

O kernel recebe a versão nova `semantic-kernel-v4-integral-body`, com premissa `installed-file-identity-v1` no trace. O perfil de resolução `node22-linux-exact-metadata-v1`, a receita `shared-contracts-fresh-force-v1` e o census de recusas não mudam. Prova v3 nunca é aceita como v4. Worker e pai revalidam perfil, inventário por arquivo, snapshots e hash do helper. Default/P1, contratos públicos de runtime e SDK permanecem byte-equivalentes nos mesmos inputs.

A implementação ocorre em candidata física nova, baseada em `f22a74a0` ou no commit qualificado vigente que a contenha, após autoridade explícita deste SHA e reconciliação atual. Fontes previstas:

- engine: D1 e D2;
- checker: inventário por arquivo, contadores, fases e trace;
- teste novo `tests/b6-0241-integral-body.test.js`.

Os testes existentes que fixam recusa de `dist` instalado ou parada continuam como testemunhos v3. Uma migração literal só é feita quando necessária e registrada antes da edição; primeiras falhas ficam preservadas. Produto, manifests, lock, runtime público e APIs ficam fora. Recursos, gates e promoção exigem claim; o root compartilhado não é candidata certificada.

O rollback é a fonte v3 qualificada `f22a74a0` numa candidata própria. A promoção é interrompida diante de qualquer uma destas situações:

- perda de violação ou prova indevida;
- tupla v3 desaparecida fora das três exceções;
- origem perdida ou certificado obsoleto;
- obrigatório de revisão;
- medição real v4 com estouro de prazo, ENOBUFS ou erro de worker, que perde a fronteira em relação à v3.

A nova implementação tem no máximo duas revisões, sem terceira rodada nem reabertura do BUILD0240.

## 6. Riscos

- **Limite move a parada.** Estimativa grosseira, não medição: cerca de 120 mil nós fora de corpos de função e 118 mil em corpos exportados, nos 837 arquivos com bytes ligados, contra 100 mil estados. O corte determinístico pode deixar a cobertura parcial. Isso fica declarado, sem aumento; mudar limite exige decisão própria.
- **Prazo.** O census leva cerca de 15 s e cada passagem do worker cerca de 18,6 s com o corpo parado. Com o corpo integral, análise e recomputação podem passar de 120 s. Nesse caso o envelope apaga a fronteira e a promoção para (§5). Isso é resultado de medição, não autorização para mudar prazo.
- **Saída e entrada.** Mais UNKNOWN aumentam o stdout do worker; acima de 64 MiB, ENOBUFS leva a `empty()`. O inventário por arquivo dos 303 pacotes (cerca de 63 mil entradas) aumenta o input do worker e da recomputação.
- **A contagem sobe.** Mais UNKNOWN não é regressão de confiança, e menos UNKNOWN não é crédito. Os cerca de 282 não alcançados latentes devem aparecer.
- **Detalhe.** A tupla contida reutiliza `error.message` e se funde com a tupla da aquisição quando são iguais. Caminho fora do root no detalhe segue a regra atual de remoção de prefixo, sem normalização nova.
- **Custo.** A cascata de U após contenção pode multiplicar entradas. A chave canônica evita deduplicação quadrática.
- **Confiança em D2.** A premissa vira a referência instalada do lock. A amarração por arquivo e por `inventorySha256` e a revalidação reduzem a janela entre verificação e uso, mas não provam semântica.
- **Violação oculta pela parada.** Hoje uma violação só visível no corpo de módulo posterior fica INCOMPLETE (C6, X1). D1 deve revelá-la como FAIL. Não existe falso PASS, mas a árvore real teve só 7 módulos com corpo avaliado, então violações desse tipo não foram procuradas.

## 7. Aceites futuros — todos NOT_RUN

Nada abaixo foi demonstrado para uma implementação 0241, que ainda não existe. Os controles C1–C6 e X1–X3 rodaram somente no engine v3. Método: fixtures físicas privadas, Node pinado, env mínimo, sem importar ou avaliar alvo.

| ID   | Critério obrigatório de BUILD                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IB01 | Default/P1/SDK byte-equivalentes; census de recusas com resultados iguais aos da v3; v3 congelada medida nos mesmos inputs; primeiras falhas C1–C6 e X1–X3 preservadas.                                                                                                                                                                                                                                                                                       |
| IB02 | Pares C1/C2/X2 na v4: entradas de corpo posteriores aparecem, tupla da aresta contida na forma da §3.1, status UNKNOWN e zero provas. Módulo fechado exceto por uma aresta contida nunca é PROVEN. Par X3: após aresta contida, `UNKNOWN_UNREACHED_INSTALLED_ENTRY` aparece e `phases` declara pós-corpo concluído.                                                                                                                                           |
| IB03 | Cada motivo da lista da §3.1 tem caso contido; cada classe global (limites, mutação, raiz, perfil, errno fora da lista, erro não `UNKNOWN_*`) continua no catch externo, com `phases` declarado.                                                                                                                                                                                                                                                              |
| IB04 | Arestas de produto só no corpo, várias no mesmo módulo e em módulos distintos, inclusive após aresta que lança (C6, X1): a v4 mostra todas as violações e FAIL; a v3 mostra só a primeira ou nenhuma, preservada como primeira falha. Multiset de violações v3 contido no v4.                                                                                                                                                                                 |
| IB05 | Corte por cada contador de corpo reduzido internamente: preserva UNKNOWN e violações, registra `UNKNOWN_ANALYSIS_LIMIT:<cap>` e `CUT:<cap>`, roda pós-corpo e revalidação, `validation` válida, nenhum `empty()` e normal/strict iguais; positivo imediatamente abaixo de cada cap; `timeoutMs` continua global; nenhum limite aumentado.                                                                                                                     |
| IB06 | `UNKNOWN_FUNCTION` por categoria, todas as categorias de cada função, uma entrada por arquivo e categoria; C4 continua UNKNOWN; função simples não chamada continua PROVEN.                                                                                                                                                                                                                                                                                   |
| IB07 | D2 positivo: instalado sob `dist` com MATCH, `inventorySha256` recomputado igual, entrada por arquivo igual e corpo fechado é PROVEN com premissa de identidade no trace; par C3 `dist`/`lib` com o mesmo resultado.                                                                                                                                                                                                                                          |
| IB08 | D2 negativo continua UNKNOWN em cada caso: arquivo ausente do inventário, SHA divergente, link, tipo diferente, mutação após identidade, `inventorySha256` divergente, pacote MISMATCH/UNAVAILABLE/ausente, chave do owner divergente, pacote aninhado sem identidade própria, entrada de outro pacote com o mesmo caminho relativo, diretório com prefixo ponto, receipt citando instalado e `dist` de workspace (via `node_modules/@escopo/x`) sem receipt. |
| IB09 | Conservação da §3.5 conferida por multiset nas fixtures e na árvore real, com tuplas de envelope separadas; ledger 537 + 1.721 + 1.072 + 581 + novas, com hashes ou null e sem crédito; normal/strict iguais sem estouro.                                                                                                                                                                                                                                     |
| IB10 | Regressões 0228/0234/0236/0237/0240 preservadas; crítica fresca com zero obrigatórios; 16 gates Node22, verificador com 38 hashes da nova fonte e consumidor físico fresco.                                                                                                                                                                                                                                                                                   |
| IB11 | Medição B6 integral pós-gates com `bodyCoverage`, `phases` e qualquer corte declarados; estouro de prazo ou ENOBUFS registrado como parada; nenhuma promessa de ganho; B6 só é aceita pelo contrato integral.                                                                                                                                                                                                                                                 |
| IB12 | Promoção somente dos deltas próprios por pré-imagens e claims; protegidos, índice e HEAD preservados; cleanup por identidade; evidências anteriores imutáveis; sem push, deploy ou produção.                                                                                                                                                                                                                                                                  |

## 8. Autoridade

D2 amplia premissa positiva: arquivo hoje UNKNOWN por regra impossível pode vir a ser provado com identidade por arquivo. Para a v4, D2 supera a frase da 0240 §2 sobre `dist` instalado e a cláusula correspondente de MS04. D1 é conformidade de medição com a 0236, mas muda o payload, a cobertura e a atribuição de tuplas; é decidido junto para não fragmentar a frente. D-12/T3 exige **"revisão explícita da SPEC pelo usuário antes do BUILD"**. As aprovações 0236, 0237 e 0240 continuam resolvidas e não serão repetidas.

Esta preparação, os oráculos e os controles readonly não autorizam código 0241, produção, release, dados reais, efeitos sensíveis, push ou deploy.
