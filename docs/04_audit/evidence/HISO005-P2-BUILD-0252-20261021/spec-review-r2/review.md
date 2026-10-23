# Crítica independente da SPEC0252 r2 (HISO005-P2-BUILD-0252)

- Alvo: `docs/02_spec/0252_b6_annexb_block_function.md`, sha256 `ebbc908b20ec2780606f9c5bc7aa10e0fa1fe183073978954b6b0cd33dbaf5a6`, conferido no início e no fim.
- Worktree detached `/mnt/dados/cvg-work/cvg-d9ef-annexb-recon-20261021`, HEAD `24cdb463`. O engine é `7f25da7d…` (v7) e o checker `0c7f859d…`, os mesmos do BUILD0247.
- Crítico: subagente em contexto novo, segunda rodada, só leitura no repo. Scratch em `/mnt/dados/cvg-work/annexb-recon-runtime/critic-0252-r2/`. Node 22.23.2 com `env -i`.

## Veredito: REVISE

Há um obrigatório (R2-M1). O M1 da r1 foi resolvido, e os O1–O9 entraram sem erro de número ou de detalhe. O desenho b1 continua correto: a variante `tools-wide` da recon acerta todos os casos que testei, inclusive os quatro novos.

O problema está na prova. A AB08 lista os mutantes que têm de morrer, mas ainda deixa passar três implementações inseguras naturais do **prólogo de diretivas**. As três passam em AB01–AB08 e dão PROVEN falso.

## Premissa nova? Não

A b1 usa o que o kernel já usa: o modo `require`/`import` de `load()` (1821–1825), o AST do TypeScript e a definição de prólogo de diretivas e de strict do ECMAScript. A regra só acrescenta raiz UNKNOWN. A emissão no census segue a C0 (SPEC0247 §3.1, item 1). O census só contribui com violações para `runSemanticBoundary` (2443–2449), e `unknown()` (405–419) só acrescenta e deduplica, sem desviar o fluxo.

A correção pedida é de texto e de teste. Não pede premissa, migração nem mudança de variante.

## Status do M1 da r1: RESOLVIDO

- **§5.2 fechada.** A busca de strict começa no pai e olha só três coisas: o prólogo do arquivo, o prólogo de cada função que contém a declaração e a classe envolvente. Não contam o corpo da própria função, as funções irmãs, o tipo da função envolvente nem a extensão TS. É o mesmo que a `tools-wide` faz (`for (let a = p; …)`, `isClassLike`, `isFn && directive(body)`).
- **Positivos novos.** C01, C02, C03 e C11 entraram como positivos. Reconferi com o Node 22 real, a v7 e a b1:

  | Fixture | Node 22 | v7     | b1                    |
  | ------- | ------- | ------ | --------------------- |
  | C01     | carrega | PROVEN | UNKNOWN `f@2`         |
  | C02     | carrega | PROVEN | UNKNOWN `f@3`         |
  | C03     | carrega | PROVEN | UNKNOWN `f@3`         |
  | C11     | carrega | PROVEN | UNKNOWN `m.cts:f@2`   |

- **Mutantes da r1.** Cada um dos 11 que a r1 listou morre num aceite nomeado:
  - na AB08: própria função (C01), qualquer função (C02), arrow (C03), TS (C11) e regra ausente;
  - na AB06, como controles: P17, P20, P27 e P24;
  - na AB02: P21–P23;
  - na AB03: N03.
- **Contagens.**
  - AB01 = 22: P01–P05, P12–P14, P16b, P17, P20, P21–P27, C01, C02, C03 e C11. Os 22 dão PROVEN na v7.
  - AB02 = 33: os 28 da recon, C01, C02, C03, C10 e C11.
  - C10 é positivo: o Node carrega o produto. A v7 dá UNKNOWN por outra causa, e a b1 dá UNKNOWN `f@2`. Contá-lo na AB02 e não na AB01 está certo.
- **Detalhes da AB02.** Todos batem com a saída real da b1 (`tools-wide`): P06 `f@4`, P16 `undefined@1`, P16b `undefined@2`, P18 `g@1`, P19 `require@1`, P21/P22 `flag@5`, P23 `mode@5`, N05 `g@2`, N09 `f@4`, N10–N12 `require@2`, C01 `f@2`, C02/C03 `f@3`. A tabela completa está no apêndice.
- **AB03.** Bate com a saída medida:
  - N01, N02, N03, N13, N14, N15, C07 e C09 dão PROVEN sem tupla;
  - N04 e C06 dão UNKNOWN sem tupla;
  - C08 dá PROVEN sem tupla;
  - C04 e C05 continuam UNKNOWN, agora com `f@2`. Na v7 eles já eram UNKNOWN, e o Node não carrega o produto em nenhum dos dois.
- **O1–O9.** Todos entraram na r2:

  | Opcional | Onde entrou na r2                                                                                                                                                                         |
  | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | O1       | AB04                                                                                                                                                                                      |
  | O2       | §5.1 e §5.2: `getStart`, deduplicação e gerador/`async` incluídos                                                                                                                         |
  | O3       | §5.1                                                                                                                                                                                      |
  | O4       | AB02 e AB06, com o census testado por `analyzeSemanticBoundary(…, { refusalCensus: true })`                                                                                               |
  | O5       | C07 e C08 na AB03                                                                                                                                                                         |
  | O6       | AB07. O selado confere com `b6-final-comparison.json` do BUILD0247: 11.723 diagnósticos, 10.833 tuplas, normal = strict, engine `7f25da7d`                                               |
  | O7       | AB09                                                                                                                                                                                      |
  | O8       | Âncoras 1821–1825, 1826–1837 e 1858–1862, conferidas no código                                                                                                                            |
  | O9       | G1. `EVAL_REFERENCE` está em 1747                                                                                                                                                         |

## OBRIGATÓRIO

### R2-M1 — O prólogo de diretivas ainda tem três mutantes inseguros que nenhum aceite mata

**O que falta.** A §5.2 diz "prólogo de diretivas" e "diretiva exata", mas os aceites só testam as bordas do prólogo no nível do arquivo, e só em três formas: tardia (P17), com escape (P20) e entre parênteses (P27). Ficam sem controle três erros naturais de implementação, todos do lado inseguro:

- **mut-block.** O prólogo de um bloco que não é corpo de função (`Block`, `case`, `ModuleBlock`) conta como diretiva. É o que sai de um laço genérico que olha `a.statements` em cada ancestral.
- **mut-expr.** O prólogo não termina numa `ExpressionStatement` que não é string; o laço só sai em instrução que não é expressão.
- **mut-fnlate.** No corpo de função, `'use strict'` em qualquer posição conta, como faria uma lógica separada da do arquivo. O P17 só testa o arquivo.

**Evidência.** Os três mutantes foram feitos só para diagnóstico, sobre a b1 da recon (`tools-wide`, `47ec764f…`), com `critic-0252-r2/mutate2.py`. Os hashes estão em `critic-0252-r2/sha256.txt`:

| Mutante    | Hash        |
| ---------- | ----------- |
| mut-block  | `c5b3b9a5…` |
| mut-expr   | `3ce3dca4…` |
| mut-fnlate | `401c6a64…` |

Primeiro rodei cada mutante nos 54 fixtures existentes: os 43 da recon e C01–C11. Os três saem idênticos à b1 nos 54. Batem status, detalhes `UNKNOWN_ANNEXB_FUNCTION` com o arquivo, demais tuplas, violações e `validation` (`critic-0252-r2/run2-out.json`). Logo, AB01–AB08 aprovam os três.

Depois rodei fixtures novos, todos com a mesma entrada `E1` da recon. Neles o Node 22.23.2 real carrega `products/x.js` com exit 0, a v7 dá PROVEN e a b1 dá UNKNOWN. Cada mutante dá PROVEN no fixture que o mata:

| Fixture | `m.js`                                                                                                              | Node 22 | v7     | b1            | Mutante que dá PROVEN |
| ------- | ------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------------- | --------------------- |
| C12     | `function f() { return 1 }` / `{ 'use strict'; function f(s) { return require(s) } }` / `module.exports = f`       | carrega | PROVEN | UNKNOWN `f@2` | mut-block             |
| C13     | `0` / `'use strict'` / `function f() { return 1 }` / `{ function f(s) { return require(s) } }` / `module.exports = f` | carrega | PROVEN | UNKNOWN `f@4` | mut-expr              |
| C15     | `function g() {` / `function f() { return 1 }` / `'use strict'` / `{ function f(s) { return require(s) } }` / `return f` / `}` / `module.exports = g()` | carrega | PROVEN | UNKNOWN `f@4` | mut-fnlate |

Os três são PROVEN falsos da v7 que o catálogo não tem, e a b1 correta fecha os três. Nos quatro fixtures novos (C12–C15), as demais tuplas e as violações da b1 ficam iguais às da v7.

Hashes dos `m.js`:

| Fixture | sha256      |
| ------- | ----------- |
| C12     | `abe5fc68…` |
| C13     | `9374c9a3…` |
| C15     | `9a0b303d…` |

**Por que é obrigatório.** É a mesma classe do M1 da r1. Sem os fixtures, uma implementação que lê errado o prólogo passa em todos os aceites e dá PROVEN onde o Node carrega o produto. O texto da §5.2 já exclui esses erros, mas a r1 mostrou que o texto sozinho não segura o BUILD. A garantia está na AB08.

**Correção.** Só de texto e teste, sem mudar a variante:

1. **§5.2: definir o prólogo de forma fechada.**
   - É a maior sequência inicial de instruções, em `SourceFile.statements` ou no `Block` corpo de função, em que cada instrução é uma `ExpressionStatement` cuja expressão é um `StringLiteral`.
   - Não conta template nem expressão entre parênteses.
   - O prólogo termina na primeira instrução que não é assim, inclusive expressão que não é string, `;` vazio e declaração.
   - Só o arquivo e o corpo de função têm prólogo. Bloco solto, `case`/`default`, `ModuleBlock` e ramo de `if` não têm.
   - A mesma regra vale nos dois níveis, de preferência com um único helper.
2. **Catálogo.** Acrescentar C12, C13 e C15 como positivos, com o resultado do Node 22, da v7 e da b1. Atualizar:
   - a AB01: 25 PROVEN falsos;
   - a AB02: 36 positivos, com detalhes C12 `f@2`, C13 `f@4` e C15 `f@4`.
3. **AB08.** Nomear os três mutantes com o fixture que mata cada um:

   | Mutante                                                | Fixture que o mata |
   | ------------------------------------------------------ | ------------------ |
   | prólogo de bloco que não é corpo de função             | C12                |
   | prólogo que não termina em expressão que não é string  | C13                |
   | `'use strict'` tardio no corpo de função               | C15                |

## OPCIONAIS

- **R2-O1 — Mais bordas do prólogo.**
  - C14, com `` `use strict` `` (template) no topo. O Node carrega o produto, a v7 dá PROVEN e a b1 dá UNKNOWN `f@3`. O mutante `mut-tpl` (`isStringLiteralLike` com o texto cru sem as aspas, `d7bb8db7…`) dá PROVEN e sobrevive aos 54 fixtures. Deixei como opcional porque o erro exige uma combinação menos natural.
  - Na mesma linha: `;` antes da diretiva, e as versões em corpo de função do P20 (escape), do P27 (parênteses) e do C13.
  - Alternativa: exigir um helper único e testá-lo em tabela nos dois níveis.
- **R2-O2 — Rastreabilidade da AB08.** Seis mutantes da lista da r1 só morrem como "controles" na AB02, AB03 e AB06, sem nome de mutante:

  | Mutante da r1          | Fixture que o mata |
  | ---------------------- | ------------------ |
  | tupla só com bloco avaliado | P21/P22       |
  | texto cozido           | P20                |
  | parênteses aceitos     | P27                |
  | diretiva fora do prólogo | P17              |
  | método de objeto como classe | P24          |
  | regra em `import`      | N03                |

  Listá-los também na AB08 deixa o critério do crítico de código explícito.
- **R2-O3 — Proveniência dos fixtures C.** O cabeçalho diz "hashes em `sha256.txt`", mas o `critic-0252/sha256.txt` não tem hash de nenhum arquivo de fixture.
  - C01–C10 só estão embutidos no `run.mjs` e no `run-out.json`.
  - C11 não está em nenhum arquivo com hash.
  - O scratch fica fora do repo, e o texto de C04–C10 não está em nenhum documento versionado.

  Antes do BUILD, copiar para a evidência do repo o texto e o sha256 de C01–C15. Os hashes dos `m.*` que medi:

  | Fixture | sha256 do `m.*` |
  | ------- | --------------- |
  | C01     | `fada0c82…`     |
  | C02     | `0e32645a…`     |
  | C03     | `81d7c754…`     |
  | C04     | `4bfc1096…`     |
  | C05     | `3b29f395…`     |
  | C06     | `fc933e66…`     |
  | C07     | `15d0ba23…`     |
  | C08     | `b2e5672e…`     |
  | C09     | `dd39cd56…`     |
  | C10     | `c707cd4c…`     |
  | C11     | `af47504f…`     |
  | C12     | `abe5fc68…`     |
  | C13     | `9374c9a3…`     |
  | C14     | `e4d8935c…`     |
  | C15     | `9a0b303d…`     |

  Os hashes completos estão nos `sha256.txt` dos scratches.
- **R2-O4 — "Só acrescenta" (G3 e AB05).** A fase de gramática (2076–2100) só roda sem nenhum UNKNOWN e sem violação.
  - Num módulo cuja única raiz na base fosse `UNKNOWN_RUNTIME_SYNTAX`, a tupla nova faria a gramática ser pulada, e essa raiz sumiria.
  - Isso é seguro: o status continua UNKNOWN e nenhuma violação muda.
  - Nenhum dos 58 fixtures tem esse caso, e na raiz a gramática já sai `SKIPPED`.
  - Basta registrar a exceção na AB05 ou na G3, para que um vermelho desses não pareça regressão.
- **R2-O5 — Tabela da §6.**
  - A linha delimitadora (linha 165) tem 3 células, e o cabeçalho tem 2.
  - A AB08 (linha 173) tem uma célula vazia a mais.
  - Com isso, o GFM não reconhece a tabela e mostra a §6 como texto corrido. O `prettier --check` passa.
- **R2-O6 — "Classe envolvente (corpo ou `extends`)".**
  - A `tools-wide` conta qualquer ancestral `isClassLike`, inclusive decoradores.
  - As duas leituras são seguras: o engine não tem tratamento de classe nem de decorador, então toda classe avaliada dá `UNKNOWN_UNSUPPORTED_SYNTAX`.
  - Mesmo assim, convém escrever "qualquer parte da classe" para não haver duas leituras.
- **R2-O7 — "Os demais `f@2`/`f@3`" (AB02).** A tabela completa do apêndice pode ir para a evidência, para fixar a referência do teste.

## Respostas às perguntas

1. **Fidelidade à b1.** A r2 implementa a b1 escolhida pelo usuário: toda função de bloco em código sloppy de módulo `require`, com predicado local. Não há premissa nova.
   - G1–G4 valem para a b1, medida nos 58 fixtures.
   - Na raiz, o A/B da recon dá 0 tuplas para a b1. Os 2 arquivos com sintaxe ESM têm função de bloco, mas estão em modo `import`; `diff.js` aparece como `mode: import` em `occurrences.json`.
2. **Predicado.** Do lado do pai, nenhum buraco inseguro: bloco, `if`/`else` com e sem chaves, `case`, rotulado, `try`/`catch` e laço são pegos, e a AB02 com o multiset exato mata as omissões. Do lado do strict, o texto está certo, mas os aceites têm a lacuna do R2-M1.
3. **Âncoras.** Todas conferem no engine `7f25da7d`:

   | Linhas    | O que está lá                    |
   | --------- | -------------------------------- |
   | 496–505   | `product()`                      |
   | 569–604   | `lexical()`                      |
   | 703–718   | chamada de `lexical()`           |
   | 754–758   | `find()`                         |
   | 902–915   | `call()`                         |
   | 965–978   | nomes livres; 976–977 o `require` |
   | 1084–1090 | carregador                       |
   | 1408–1409 | predeclaração da função          |
   | 1517–1544 | instrução `FunctionDeclaration`  |
   | 1548–1558 | `module.exports`                 |
   | 1563–1578 | `Block` e ramos de `if`          |
   | 1821–1837 | modo e `UNKNOWN_MODULE_FORMAT`   |
   | 1858–1862 | C0                               |
   | 1865      | corpo do topo                    |

4. **Census e versão.**
   - Census: a emissão é inócua para PROVEN e é testável pelo caminho da AB06.
   - Versão: "a seguinte à da main" resolve a corrida com a SPEC0251.
5. **AB07.** A base é a v7 `7f25da7d`. O checker `0c7f859d` é o mesmo do BUILD0247, e o selado bate com `b6-final-comparison.json`: 11.723 diagnósticos, 10.833 tuplas, normal = strict. A regra de parar se não bater é a mesma do BUILD0247.
6. **Testabilidade.** Há a lacuna do R2-M1. Os mutantes do lado do pai e os conservadores morrem.

## Checks rodados

- `sha256sum` da SPEC no início e no fim; HEAD `24cdb463`. `git status` mostra só as pastas sem rastreio.
- Leitura da decisão do usuário, da r1 (review, json e corrections), dos números da recon (`controls.json` e `occurrences.json`), da SPEC0247 §3.1, do diff `tools-wide` contra a main e do engine nas âncoras, em `unknown()`, no census e na fase de gramática.
- `critic-0252-r2/run2.mjs`:
  - os fixtures novos C12–C15 rodaram no Node 22 real (gancho `hook.mjs` da recon) e em 10 motores: v7, b1, os quatro mutantes da r1 e os meus quatro;
  - os 54 fixtures existentes rodaram na v7, na b1 e nos meus quatro mutantes.
  - Resultado: todos os mutantes novos saem iguais à b1 nos 54. Nos 58 fixtures, a b1 tem as demais tuplas e as violações iguais às da v7.
- BUILD0247: `b6-final-comparison.json`, `real-v7r1-summary.json` e `tools-v7r1.json`, comparados com os hashes dos scripts na HEAD.
- `prettier --check` na SPEC: passa.

Nada foi alterado na SPEC, no código, nos scripts, no ledger ou no lockfile. Sem certify, e2e, commit ou push.

## Apêndice — status v7 → b1 e detalhes `UNKNOWN_ANNEXB_FUNCTION` medidos

**Positivos que eram PROVEN na v7**

| Fixture  | v7 → b1          | Detalhe       |
| -------- | ---------------- | ------------- |
| P01–P05  | PROVEN → UNKNOWN | `f@2`         |
| P12–P14  | PROVEN → UNKNOWN | `f@3`         |
| P16b     | PROVEN → UNKNOWN | `undefined@2` |
| P17      | PROVEN → UNKNOWN | `f@3`         |
| P20      | PROVEN → UNKNOWN | `f@3`         |
| P21, P22 | PROVEN → UNKNOWN | `flag@5`      |
| P23      | PROVEN → UNKNOWN | `mode@5`      |
| P24–P26  | PROVEN → UNKNOWN | `f@2`         |
| P27      | PROVEN → UNKNOWN | `f@3`         |
| C01      | PROVEN → UNKNOWN | `f@2`         |
| C02, C03 | PROVEN → UNKNOWN | `f@3`         |
| C11      | PROVEN → UNKNOWN | `m.cts:f@2`   |
| C12      | PROVEN → UNKNOWN | `f@2`         |
| C13      | PROVEN → UNKNOWN | `f@4`         |
| C14      | PROVEN → UNKNOWN | `f@3`         |
| C15      | PROVEN → UNKNOWN | `f@4`         |

**Positivos que já não eram PROVEN na v7**

| Fixture  | v7 → b1               | Detalhe       |
| -------- | --------------------- | ------------- |
| P06      | UNKNOWN → UNKNOWN     | `f@4`         |
| P07–P11  | UNKNOWN → UNKNOWN     | `f@2`         |
| P15      | UNKNOWN → UNKNOWN     | `f@2`         |
| P16      | VIOLATION → VIOLATION | `undefined@1` |
| P18      | UNKNOWN → UNKNOWN     | `g@1`         |
| P19      | VIOLATION → VIOLATION | `require@1`   |
| C10      | UNKNOWN → UNKNOWN     | `f@2`         |

**Negativos e controles**

| Fixture                      | v7 → b1               | Detalhe     |
| ---------------------------- | --------------------- | ----------- |
| N01–N03, N13–N15             | PROVEN → PROVEN       | sem tupla   |
| N04                          | UNKNOWN → UNKNOWN     | sem tupla   |
| N05                          | PROVEN → UNKNOWN      | `g@2`       |
| N06–N08                      | PROVEN → UNKNOWN      | `f@2`       |
| N09                          | PROVEN → UNKNOWN      | `f@4`       |
| N10, N11                     | VIOLATION → VIOLATION | `require@2` |
| N12                          | UNKNOWN → UNKNOWN     | `require@2` |
| C04, C05                     | UNKNOWN → UNKNOWN     | `f@2`       |
| C06                          | UNKNOWN → UNKNOWN     | sem tupla   |
| C07–C09                      | PROVEN → PROVEN       | sem tupla   |

Todos os detalhes estão em `m.js`, menos o C11, que está em `m.cts`.
