# Crítica independente da SPEC0252 r3 (HISO005-P2-BUILD-0252)

- Alvo: `docs/02_spec/0252_b6_annexb_block_function.md`, sha256 `d1e202691984cd824e2203e40cb99d90298c53ca0d8820ea312d1e63afaa7f59`, conferido no início e no fim.
- Worktree detached `/mnt/dados/cvg-work/cvg-d9ef-annexb-recon-20261021`, HEAD `24cdb463`. Engine v7 `7f25da7d…` (`semantic-kernel-v7-cjs-export-value`); b1 da recon (`tools-wide`) `47ec764f…`.
- Crítico: subagente em contexto novo, terceira rodada, só leitura no repo. Scratch em `/mnt/dados/cvg-work/annexb-recon-runtime/critic-0252-r3/`. Node 22.23.2 com `env -i`.

## Veredito: APPROVE

Não há obrigatório. O R2-M1 foi resolvido, e os R2-O1 a R2-O3 entraram sem erro de contagem, de detalhe ou de hash.

Procurei outras formas de errar o strict que nenhum aceite mata e achei quatro, com fixture e mutante medidos (R3-O1 a R3-O3). As quatro dão PROVEN falso e passam nos 58 fixtures do catálogo. Mas cada uma exige contrariar uma frase explícita da §5.2: regra de extensão, `;` ignorado, helper separado no corpo de função ou leitura do prólogo por texto. Pelo critério desta rodada, ficam como opcionais. São baratas e fecham a lacuna sem depender só do crítico de código.

## Premissa nova? Não

A r3 só fecha a definição de prólogo de diretivas, que é a do ECMAScript (sequência inicial de `ExpressionStatement` com `StringLiteral`; diretiva exata sem escape). É a mesma definição que a varredura da recon já usava: `hasUseStrict` em `scan.mjs`, linhas 59–66. Por isso os números da recon (§1.3, §3 e §4) continuam válidos sob a r3.

O resto da b1 não muda:

- o modo `require`/`import` de `load()` (1821–1825);
- a emissão antes do corpo, depois da C0 (1858–1862);
- a emissão no census como na C0. O census só devolve violações a `runSemanticBoundary` (2443–2449), e `unknown()` (405–419) só acrescenta e deduplica.

Não há migração nem mudança de variante.

## Status do R2-M1: RESOLVIDO

**Texto (§5.2).** A definição é fechada e igual nos dois níveis:

- só existe no início do `SourceFile` e no início do `Block` corpo de função;
- é a sequência máxima de `ExpressionStatement` com `StringLiteral` puro, sem template, parênteses nem outra expressão;
- termina na primeira instrução que não é assim;
- a diretiva vale só com o texto cru exato `use strict`;
- bloco que não é corpo de função não tem prólogo;
- um helper único serve os dois níveis.

**Positivos.** C12, C13 e C15 estão na AB01 (26) e na AB02 (37), com os detalhes `f@2`, `f@4` e `f@4`. O C14 entrou também (`f@3`).

**Mutantes.** A AB08 nomeia `mut-block` (C12), `mut-expr` (C13), `mut-fnlate` (C15) e `mut-tpl` (C14), além dos seis da r1 (R2-O2).

**Reexecução.** Rodei os fixtures versionados de `fixtures-c/`, copiados para o scratch, no Node 22 real e em 14 motores. Os detalhes saem em `m.js`.

| Fixture | Node 22 | v7     | b1            | Mutante que dá PROVEN | Esse mutante nos outros 57 do catálogo |
| ------- | ------- | ------ | ------------- | --------------------- | -------------------------------------- |
| C12     | carrega | PROVEN | UNKNOWN `f@2` | `mut-block`           | igual à b1                             |
| C13     | carrega | PROVEN | UNKNOWN `f@4` | `mut-expr`            | igual à b1                             |
| C14     | carrega | PROVEN | UNKNOWN `f@3` | `mut-tpl`             | igual à b1                             |
| C15     | carrega | PROVEN | UNKNOWN `f@4` | `mut-fnlate`          | igual à b1                             |

Os quatro mutantes da r1 também morrem nos fixtures nomeados:

| Mutante     | Fixture que o mata |
| ----------- | ------------------ |
| `mut-own`   | C01                |
| `mut-any`   | C01 e C02          |
| `mut-arrow` | C03                |
| `mut-ts`    | C11                |

**R2-O1 a R2-O3, conferidos.**

- **Contagens.** AB01 = 26: P01–P05, P12–P14, P16b, P17, P20, P21–P27, C01–C03 e C11–C15. Os 26 dão PROVEN na v7. AB02 = 37: os 28 da recon, C01–C03, C10 e C11–C15. Nenhum dos 37 dá PROVEN na b1.
- **Detalhes da AB02.** Todos batem com a saída medida da b1, inclusive C12 `f@2`, C13 `f@4`, C14 `f@3` e C15 `f@4`. A tabela completa está no apêndice.
- **Hashes.** `sha256sum -c fixtures-c-sha256.txt` aprova os 60 arquivos. Os 15 diretórios são idênticos (`diff -r`) aos usados pelos críticos r1 e r2 (`critic-0252/fixtures` e `critic-0252-r2/fixtures`). Os hashes dos `m.*` batem com a lista do R2-O3.

## OBRIGATÓRIO

Nenhum.

## OPCIONAIS

Os fixtures D* estão em `critic-0252-r3/fixtures/` e os hashes em `critic-0252-r3/sha256.txt`. Todos usam a entrada `E1` da recon. Nos positivos abaixo, o Node 22.23.2 real carrega `products/x.js` com exit 0, a v7 dá PROVEN e a b1 dá UNKNOWN. Os mutantes saíram da b1 por `critic-0252-r3/mutate3.py` e servem só para diagnóstico. Cada um é igual à b1 nos 58 fixtures do catálogo (43 da recon e C01–C15): mesmo status, mesmos detalhes, mesmas outras tuplas, mesmas violações e mesma `validation`.

### R3-O1 — `.ts` sem diretiva (a AB08 promete mais do que o C11 cobre)

A AB08 diz que o C11 mata o mutante "arquivo `.ts`/`.cts`/`.mts` tratado como strict". O C11 é `.cts`, então só mata mutante cuja regra inclui `.cts`. O `mut-ts` da r1 usava `/\.[cm]?ts$/`.

- **Mutante.** `mut-tsonly` (`2edfa3d7…`) usa `fileStrict = directive(…) || /\.ts$/.test(sf.fileName)`. Dá PROVEN só no D04.
- **D04.** O `m.ts` tem o mesmo texto do C11 (`af47504f…`), e a entrada faz `require('./m.ts')`. Na b1, o detalhe é `m.ts:f@2`.
- **Por que é opcional.** O erro exige criar uma regra de extensão contra o texto explícito da §5.2 ("`.ts`, `.cts` e `.mts` sem diretiva são sloppy") e ainda errar a regex.
- **Correção.** Acrescentar o D04 como positivo (C16, `m.ts`) ou reescrever o mutante da AB08 como "`.cts` tratado como strict (C11)".

### R3-O2 — A tabela do helper não está em nenhum aceite

A §5.2 pede um helper único testado em tabela, mas isso não aparece na AB06 nem na AB08. Dois erros sobrevivem ao catálogo:

- **`mut-empty`** (`17d7011f…`): `;` vazio não encerra o prólogo, no helper único, nos dois níveis. Dá PROVEN no D01 (`;` / `'use strict'` no topo, b1 `f@4`) e no D02 (o mesmo no corpo de `g`, b1 `f@5`).
- **`mut-fnsep`** (`6a68079f…`): helper separado só no corpo de função. Para no primeiro não-string, mas usa o texto cozido e `skipParentheses`. Dá PROVEN em três fixtures, todos com b1 `f@4`:
  - D05: `'use\x20strict'` no corpo de função;
  - D06: `('use strict')` no corpo de função;
  - D09: `` `use strict` `` no corpo de função.

  Uma tabela que testa só o helper não mata o `mut-fnsep`, porque ele não usa o helper.
- **Por que é opcional.** Os dois contrariam frases explícitas: "termina na primeira instrução que não é" e "helper único".
- **Correção.** Levar a tabela para os aceites, medida pela análise e não só pelo helper, ou acrescentar como positivos D01, D02, D05, D06, D08 e D09.
  - D08 é o C13 dentro de função: `0` antes de `'use strict'`, b1 `f@5`.
  - O `mut-expr` e o `mut-fnlate` já morrem nele, mas ele fixa a mesma regra no segundo nível.

### R3-O3 — Prólogo lido pelo texto e não pelo AST

- **Mutante.** `mut-textprefix` (`a6bbfb59…`) lê o prólogo pelo texto da instrução: o prólogo para quando o texto não começa com aspas, e a diretiva vale com `^['"]use strict['"]`. Dá PROVEN em três fixtures, todos com b1 `f@3`:
  - D03a: `'use strict' + ''`;
  - D03e: `'use strict' === 0`;
  - D03f: `'use strict' ? 0 : 1`.
- **Fixtures sem PROVEN falso.** Em D03b (`.length`), D03c (vírgula) e D03d (`||`), a v7 já dá UNKNOWN, por `UNKNOWN_PROPERTY` ou `UNKNOWN_OPERATOR`.
- **Por que é opcional.** O erro abandona a definição pelo AST da §5.2.
- **Correção.** Acrescentar o D03a ou o D03e como positivo.

### R3-O4 — A exceção de "só acrescenta" segue fora do texto (era o R2-O4)

A fase de gramática (2076–2100) só roda sem UNKNOWN e sem violação. Uma raiz `UNKNOWN_RUNTIME_SYNTAX` que fosse a única da base sumiria com a tupla nova. Isso é seguro: o status continua UNKNOWN e nenhuma violação muda. Não ocorre nos 74 fixtures nem na raiz.

As correções da r3 deixam o registro para o BUILD. É melhor uma frase na G3 ou na AB05, porque é a SPEC que define o "multiset igual".

### R3-O5 — A tabela da §6 continua malformada (era o R2-O5)

- A linha 166 tem 3 células, e o cabeçalho tem 2.
- A AB08, na linha 174, termina com uma célula vazia a mais.
- O GFM não reconhece a tabela, e os aceites aparecem como texto corrido. O `prettier --check` passa.

### R3-O6 — Redação

1. **Classe (R2-O6).** "Classe envolvente (corpo ou `extends`)" → "qualquer parte da classe". A b1 conta qualquer ancestral `isClassLike`, e as duas leituras são seguras.
2. **Referência da AB02.**
   - A AB02 diz que o multiset é "o da b1 da recon (`tools-wide`) e da revisão r1". A tabela completa, com C12–C15, está no apêndice da r2 e foi reconfirmada aqui (R2-O7).
   - A `tools-wide` só emite na passagem normal: o diff dela contra a main tem `if (!census)`. Ela não é referência para o census da §5.1/AB06, e copiá-la como está reprova o teste do census da AB06.
   - Vale dizer isso na AB02 ou na AB06.
3. **Contagens de PROVEN falsos.** A §1.3 e a §3 contam 18 PROVEN falsos (os 43 da recon), e a AB01 conta 26. Uma frase ligando os dois números evita leitura errada.

## Respostas às perguntas

1. **Fidelidade à b1.** A r3 implementa a b1 escolhida pelo usuário: toda função de bloco em código sloppy de módulo `require`, com predicado local. O BUILD vem depois do APPROVE, com a medição oficial na AB07. Não há premissa nova, migração nem troca de variante. A §8 e a AB09 respeitam o `notGranted` da decisão: sem deploy, produção nem dado real, e push só com os 5 checks verdes no SHA exato.
2. **G1–G4 valem para a b1**, medido nos 74 fixtures: 43 da recon, C01–C15 e 16 D novos.
   - **G1.** Os 51 positivos, em que o Node carrega o produto, saem não PROVEN na b1. Isso inclui 11 PROVEN falsos da v7 que o catálogo não tem: D01, D02, D03a, D03e, D03f, D04, D05, D06, D07, D08 e D09.
   - **G2.** Os negativos strict saem PROVEN sem tupla: N01–N03, N13–N15, C07, C09, D10 (`'use strict'` seguido de `;(0)`) e D11 (hashbang e comentário antes da diretiva). N04 e C06 saem sem tupla.
   - **G3.** Nos 74, as demais tuplas e as violações da b1 são iguais às da v7, com a ressalva do R3-O4.
   - **G4.** Não reexecutei a raiz. A recon mostra que as 3 funções de bloco dos 1.341 arquivos estão em módulos `import`, então nenhuma definição de strict muda o zero.
3. **Predicado e prólogo.**
   - Do lado do pai, nenhum buraco: bloco, `if`/`else` com e sem chaves, `case`, rotulado, `try`/`catch`/`finally`, laço, função em expressão, arrow, método e getter são pegos, e o multiset exato da AB02 mata as omissões.
   - Do lado do strict, os erros naturais morrem em fixtures nomeados: própria função, irmã, arrow, extensão `.cts`, bloco, expressão antes, tardio no arquivo e na função, template, escape, parênteses, método como classe e regra em `import`.
   - Sobram os quatro do R3-O1 a R3-O3, todos contra o texto. Também testei D07, um `class {}` irmão não chamado, para pegar vazamento de flag de classe: a b1 acerta. Não fiz mutante para ele, porque esse erro exige uma implementação exótica.
4. **Âncoras.** Conferi por amostragem no engine `7f25da7d`, que não mudou desde a r2: 496, 569, 703, 754–758, 902, 965–978, 1084–1090, 1408–1409, 1517, 1548, 1563, 1747 (`EVAL_REFERENCE`), 1821–1837, 1858–1862 e 1865. A versão no código é `semantic-kernel-v7-cjs-export-value` (linha 27). `analyzeSemanticBoundary(input, { refusalCensus })` existe (linha 370) e é a forma usada no teste da 0247.
5. **Census e versão.** A emissão no census é inócua para PROVEN e testável pela AB06. Nomear "a seguinte à da main no BUILD" (`v8-annexb-block-function` sobre a v7) resolve a corrida com a SPEC0251.
6. **AB07.** O selado do BUILD0247 confere com `b6-final-comparison.json`:
   - raiz `228e7918…`;
   - 11.723 diagnósticos e 10.833 tuplas, nos modos normal e strict;
   - engine `7f25da7d`.

   A regra de parar se a base não bater está escrita.
7. **Testabilidade e clareza.** Todos os aceites são executáveis. A única lacuna de prova é a do R3-O1 a R3-O3, opcional. A clareza perde com a tabela malformada (R3-O5).

## Checks rodados

- `sha256sum` da SPEC no início e no fim; HEAD `24cdb463`.
- `git status`: nada rastreado alterado por mim. Só criei `spec-review-r3/`.
- `sha256sum -c` dos 60 arquivos de `fixtures-c/`, e `diff -r` contra os fixtures dos scratches r1 e r2.
- `critic-0252-r3/run3.mjs`: 74 fixtures no Node 22 real (gancho `hook.mjs` da recon) e em 14 motores, sem erro, limite nem `validation` falsa.
  - Os 74 fixtures: 43 da recon, C01–C15 versionados e D01–D11.
  - Os 14 motores: v7, b1, os 4 mutantes da r1, os 4 da r2 e os 4 da r3.
  - Saídas: `run3-out.json` (bruto), `summary3.txt` (resumo) e `sha256.txt` (hashes).
- Leitura do engine em `load()`, `unknown()`, nomes livres, gramática e status; do `scan.mjs` e do `occurrences.json` da recon; e do `b6-final-comparison.json` do BUILD0247.
- `prettier --check` na SPEC: passa.

Nada foi alterado na SPEC, no código, nos scripts, no ledger ou no lockfile. Sem certify, e2e, commit ou push.

## Apêndice — resultados medidos (Node 22.23.2, v7 `7f25da7d`, b1 `47ec764f`)

**Catálogo.** Igual ao apêndice da r2, reconfirmado. Os detalhes da b1 estão em `m.js`, menos o C11, que está em `m.cts`.

- **PROVEN → UNKNOWN**, com detalhe:
  - `f@2`: P01–P05, P24–P26, C01, C12;
  - `f@3`: P12–P14, P17, P20, P27, C02, C03, C14;
  - `f@4`: C13, C15;
  - `undefined@2`: P16b;
  - `flag@5`: P21, P22;
  - `mode@5`: P23;
  - `m.cts:f@2`: C11.
- **UNKNOWN → UNKNOWN**, com detalhe:
  - `f@4`: P06;
  - `f@2`: P07–P11, P15, C04, C05, C10;
  - `g@1`: P18;
  - `require@2`: N12.
- **VIOLATION → VIOLATION**, com detalhe: P16 `undefined@1`, P19 `require@1`, N10 e N11 `require@2`.
- **Negativos.**
  - PROVEN → PROVEN, sem tupla: N01–N03, N13–N15, C07–C09;
  - PROVEN → UNKNOWN: N05 `g@2`, N06–N08 `f@2`, N09 `f@4`;
  - UNKNOWN sem tupla: N04, C06.

**Fixtures novos D** (`critic-0252-r3/fixtures/`):

| Fixture | `m.*` (resumo)                                         | Node 22         | v7      | b1               | Mutante que dá PROVEN                 |
| ------- | ------------------------------------------------------ | --------------- | ------- | ---------------- | ------------------------------------- |
| D01     | `;` / `'use strict'` / P01                             | carrega         | PROVEN  | UNKNOWN `f@4`    | `mut-empty`                           |
| D02     | `function g() { ; 'use strict' … }` (P12 com `;`)      | carrega         | PROVEN  | UNKNOWN `f@5`    | `mut-empty`, `mut-fnlate`             |
| D03a    | `'use strict' + ''` / P01                              | carrega         | PROVEN  | UNKNOWN `f@3`    | `mut-textprefix`                      |
| D03b–d  | `'use strict'.length` / `, 0` / `\|\| 0` / P01         | carrega         | UNKNOWN | UNKNOWN `f@3`    | —                                     |
| D03e    | `'use strict' === 0` / P01                             | carrega         | PROVEN  | UNKNOWN `f@3`    | `mut-textprefix`                      |
| D03f    | `'use strict' ? 0 : 1` / P01                           | carrega         | PROVEN  | UNKNOWN `f@3`    | `mut-textprefix`                      |
| D04     | `m.ts` com o texto do C11                              | carrega         | PROVEN  | UNKNOWN `m.ts:f@2` | `mut-tsonly`, `mut-ts`              |
| D05     | `'use\x20strict'` no corpo de `g`                      | carrega         | PROVEN  | UNKNOWN `f@4`    | `mut-fnsep`                           |
| D06     | `('use strict')` no corpo de `g`                       | carrega         | PROVEN  | UNKNOWN `f@4`    | `mut-fnsep`                           |
| D07     | `function h() { return class {} }` / P01               | carrega         | PROVEN  | UNKNOWN `f@3`    | — (sem mutante)                       |
| D08     | `0` / `'use strict'` no corpo de `g`                   | carrega         | PROVEN  | UNKNOWN `f@5`    | `mut-expr`, `mut-fnlate`              |
| D09     | `` `use strict` `` no corpo de `g`                     | carrega         | PROVEN  | UNKNOWN `f@4`    | `mut-tpl`, `mut-fnsep`                |
| D10     | `'use strict'` / `;(0)` / P01                          | não (strict)    | PROVEN  | PROVEN, sem tupla | —                                    |
| D11     | hashbang / `/* c */ 'use strict'` / P01                | não (strict)    | PROVEN  | PROVEN, sem tupla | —                                    |

Hashes dos `m.*`:

| Fixture | sha256      |
| ------- | ----------- |
| D01     | `abc5687a…` |
| D02     | `51f5771f…` |
| D03a    | `55c6286d…` |
| D03e    | `d9c2d5cb…` |
| D03f    | `9b54c210…` |
| D04     | `af47504f…` |
| D05     | `7af17043…` |
| D06     | `ac23e879…` |
| D07     | `11a65807…` |
| D08     | `dd2bc8a3…` |
| D09     | `c30db1bb…` |

Os hashes completos estão em `critic-0252-r3/sha256.txt`.
