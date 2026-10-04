# R2-C1 — revisão posterior independente

**Decisão: FAIL.** Há 11 controles fresh válidos com falso PASS. Nenhuma correção, commit, descendant, provider, porta ou DB foi utilizado. Escritas restritas a este diretório privado.

## Resultado e cobertura

| Evidência | Executados | PASS do controle | FAIL do controle | Inconclusivos |
|---|---:|---:|---:|---:|
| Testes canônicos, em cópia privada | 136 | 136 | 0 | 0 |
| Controles arquivados autorizados | 66 | 66 | 0 | 0 |
| Bateria fresh | 54 | 39 | 11 | 4 |
| Total | 256 | 241 | 11 | 4 |

Controles, sem testes canônicos: **120 executados; 116 válidos; 105 pass / 11 fail / 4 inconclusivos**. Os 66 arquivados preservam 19 positivos e recusam 47 negativos/unknown. API e CLI concordam em 120/120; concordância não torna um falso PASS correto. ESLint e Prettier passaram. As 61 assertions originais constam nas 90 assertions do candidato por comparação AST normalizada; limite: não comprova equivalência semântica integral do setup.

O diretório histórico autorizado tem 13 `negative-*` e 4 `positive-*`. Executei também todas as fixtures posterior e adicionais indicadas. O packet não enumera a identidade dos “14 falsos PASS históricos”; não invento um mapeamento nem atribuo 14/14 a partir do resultado do Builder. Todas as recusas fornecidas foram reproduzidas.

## R2-C1-NEW-01 — HIGH: binding aninhado elimina capacidade Node22

Em `scripts/check-product-boundary.mjs:608–619`, somente bindings com `item.name` Identifier recebem propagação. Em `:924–930`, a propriedade externa `process` de `globalThis` é aceita sem diagnosticar o binding aninhado. O nome `get` abaixo não é classificado como getter; `api`, `createRequire` e seu destino deixam de integrar a closure.

```js
const {process:{getBuiltinModule:get}}=globalThis;
const api=get('module');
console.log(api.createRequire(__filename)('../../../products/shift/src/index.cjs').marker);
```

Reprodutor completo: `probes/fresh-nested-global-process-product`. Checker: **PASS, exit 0, diagnostics=[], violations=[]**. Node v22.23.2: **exit 0, SYNTHETIC_PRODUCT_EXECUTED**. O positivo com alvo neutro também passa e executa o marcador neutro. O mesmo ocorre em ESM, aliases de globalThis/global e no destino não literal.

Em `probes/fresh-physical-nested-product`, `packages/core/src/entry.cjs` carrega `bridge`. O scanner visita `node_modules/bridge/index.d.cts` e `index.cjs`, mas perde a capacidade aninhada dentro de `index.cjs`. O Node executa `products/shift/src/index.cjs`; checker ainda retorna PASS, sourceFiles=4, edgeCount=4. Portanto visitar o primeiro destino físico não basta para comprovar a closure transitiva.

`fresh-nested-global-dynamic-target-neutral` e `...-product` colocam a string em uma variável `target`: o scanner retorna PASS para um destino não literal, contrariando a recusa conservadora obrigatória, mesmo quando o oracle consegue executá-lo.

## R2-C1-NEW-02 — HIGH: anchor mainModule desconhecido também passa

Os bindings aninhados escapam da propagação em `:610` e da recusa de mainModule em `:641–647`. Reprodutor com receptor preservado:

```js
const {process:{mainModule:host}}=globalThis;
console.log(host.require('../../../products/shift/src/index.cjs').marker);
```

`probes/fresh-nested-main-receiver-method-product`: Node22 **exit 0 / SYNTHETIC_PRODUCT_EXECUTED**, checker **PASS / exit 0**. Variante `host.require.bind(host)` também executa produto e recebe PASS. Ambos os pares neutros também passam sem `UNVERIFIED_MAIN_MODULE_BASE`, embora o bar exija INCOMPLETE quando o anchor não for estabelecido pelo checker. Este achado é outra consequência do mesmo limite de binding aninhado; não representa uma causa independente contada artificialmente.

Quatro pilots anteriores extraíram `require` sem preservar o receptor e tiveram `MODULE_NOT_FOUND`. Permanecem nos logs e no JSON como **inconclusivos**, excluídos dos 11 controles válidos que falharam. `nested-global-main-resolve` era ainda uma duplicata de pilot sem uma chamada resolve real. Os quatro reprodutores finais acima corrigem somente a construção da probe, sem alterar o candidato.

## Closures físicas e scan instalado

`tools/run-physical-review.mjs`: **16/16** controles novos passam, cobrindo runtime require/import, types require/import, ciclos e symlinks para realpaths, cada um com destino de produto e neutro. Runtime usa Node como oracle; tipos usam witnesses do checker e contraste positivo/negativo. Isso sustenta a cobertura exercitada, sem tornar sound a propagação de capacidades encontrada acima.

Scan instalado executado diretamente no candidato read-only: **INCOMPLETE / exit 1**, 2.651 fontes, 544 core, 26 workspaces, 9.648 edges, 487 diagnósticos, 0 violações; aproximadamente 37,73 s sob execução concorrente de checks. Diagnósticos: 342 loader escapes, 107 loader properties, 18 process capability properties, 8 unresolved references, 8 loader primitives, 3 nonliteral references, 1 loader base. Nenhuma violação reportada sob INCOMPLETE demonstra isolamento integral. A limitação do scan é registrada honestamente e não é, por si só, o motivo do FAIL; os falsos PASS sintéticos são o motivo decisivo.

## Reexecução e proveniência

Os comandos abaixo só leem as probes existentes. O marcador de produto é artificial e local.

```bash
NODE=/home/ricardo/.nvm/versions/node/v22.23.2/bin/node
OUT=/home/ricardo/.cache/cvg-harness-audit-actions-r2-20261003/boundary-critic
CAND=/home/ricardo/.cache/cvg-harness-audit-actions-r2-20261003/boundary-candidate
CASE="$OUT/probes/fresh-nested-global-process-product"
"$NODE" "$CAND/scripts/check-product-boundary.mjs" "$CASE"
"$NODE" "$CASE/packages/core/src/entry.cjs"
CASE="$OUT/probes/fresh-physical-nested-product"
"$NODE" "$CAND/scripts/check-product-boundary.mjs" "$CASE"
"$NODE" "$CASE/packages/core/src/entry.cjs"
CASE="$OUT/probes/fresh-nested-main-receiver-method-product"
"$NODE" "$CAND/scripts/check-product-boundary.mjs" "$CASE"
"$NODE" "$CASE/packages/core/src/entry.cjs"
```

Fontes integrais das probes, fixtures completas, geradores `tools/run-*.mjs` e resultados por caso ficam neste diretório. `manifest.json` contém SHA256 dos inputs selecionados, de todos os inputs de fixtures autorizadas e de todas as probes/logs privados; symlinks têm destino registrado. Não é um SBOM ou fingerprint integral de todos os módulos da árvore instalada. `manifest.sha256` autentica o manifest.

**sourceSentinel: MATCH**: os dois hashes esperados do candidato conferem antes/depois; os dois arquivos canônicos no Root e o inventário de 539 arquivos de fixtures (conteúdo, tamanho e symlink) são iguais antes/depois. Estado operacional e .gauntlet não foram abertos ou considerados. Dependências do candidato usadas apenas para leitura; `.vite` e TMPDIR dos testes ficam no scratch.

Independência factual: contexto de papel novo, nenhuma delegação ou edição do candidato. Não li rationale, relatório funcional, summary funcional, logs brutos do Builder, histórico, pareceres anteriores ou .gauntlet. Li adicionalmente `preimage-hashes.json` e `sentinel-summary.json`, referenciados no packet, antes da orientação posterior do Lead: eram metadados de hashes/sentinels, e o segundo continha julgamentos MATCH do Builder. Por isso **não reivindico aderência perfeita ao packet-only**. Esses julgamentos não foram usados como evidência: sentinels, checks e oracles foram recomputados. Independência de família de modelos não está estabelecida.

**Aceite R2-C1 negado.** Não houve rework do candidato ou concessão de release. A decisão independe das probes inconclusivas e do mapeamento histórico ausente.
