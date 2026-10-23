# Crítica independente da SPEC0252 r1 (HISO005-P2-BUILD-0252)

- Alvo: `docs/02_spec/0252_b6_annexb_block_function.md`, sha256 `95acd1546aa5d0152a0fb80e5caaedbc41d430dce100930f6144612d48e85b18` (conferido no início e no fim).
- Worktree detached `/mnt/dados/cvg-work/cvg-d9ef-annexb-recon-20261021`, HEAD `24cdb463` (= `origin/main`), engine `7f25da7d…` (v7).
- Crítico: subagente em contexto novo, só leitura no repo. Scratch em `/mnt/dados/cvg-work/annexb-recon-runtime/critic-0252/`. Node 22.23.2 com `env -i`.

## Veredito: REVISE

Um obrigatório (M1). O desenho b1 está certo e é sound quando implementado como a variante `tools-wide` da recon. Mas os aceites não rejeitam quatro implementações inseguras do teste de strict, e o texto da §5.2 deixa aberta a principal delas.

## Premissa nova? Não

A b1 usa o que o kernel já usa: o modo `require`/`import` de `load()` (1821–1825), o AST do TypeScript e as regras de strict do ECMAScript. Ela só acrescenta raiz UNKNOWN.

Os dois acréscimos em relação à proposta da recon têm precedente:

- a emissão no census segue a C0 (SPEC0247 §3.1, item 1);
- a promoção por PR com os 5 checks segue a autorização de sessão já usada no BUILD0247.

As correções pedidas abaixo são de texto e de teste. Nenhuma exige premissa ou migração.

## OBRIGATÓRIO

### M1 — A detecção de strict não tem controle do lado inseguro, e a §5.2 não exclui o prólogo da própria função

**O que falta.** A §7 diz que "errar para strict deixaria PROVEN falso", mas os 43 fixtures só testam os erros de strict de três formas: diretiva tardia (P17), com escape (P20) e entre parênteses (P27). Também há o método de objeto (P24). A AB08 fala de "mutante da regra" sem dizer quais.

A §5.2 diz "prólogo … de função envolvente". Uma implementação natural, como `ts.findAncestor(n, …)`, começa na própria declaração e conta o `'use strict'` do corpo dela. O texto não proíbe isso. Mas o Annex B depende do código que contém a declaração, não do corpo dela.

**Evidência.** Fiz quatro mutantes só-diagnóstico da variante b1 da recon (`tools-wide`, `47ec764f…`). Os hashes estão em `critic-0252/sha256.txt`.

- **mut-own:** a busca de strict começa em `n`, não no pai.
- **mut-any:** qualquer função do arquivo com `'use strict'` no prólogo torna o arquivo strict.
- **mut-arrow:** arrow é tratada como strict.
- **mut-ts:** arquivo `.ts`, `.cts` ou `.mts` é tratado como strict.

Nos 43 fixtures da recon, os quatro saem iguais à b1: mesmo status, mesmos detalhes `UNKNOWN_ANNEXB_FUNCTION`, mesmas outras tuplas e mesmas violações, 43/43 em cada mutante (`critic-0252/run-out.json` e `mut-ts-vs-b1.txt`). Logo, AB01–AB07 aprovariam qualquer um deles. Mesmo assim, cada um dá PROVEN onde o Node carrega o produto:

| Fixture                  | `m.js` (entry `E1` da recon)                                                                                      | Node 22.23.2 | main v7 | b1             | Mutante que dá PROVEN |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------ | ------- | -------------- | --------------------- |
| C01 corpo próprio strict | `function f() { return 1 }` / `{ function f(s) { 'use strict'; return require(s) } }` / `module.exports = f`      | carrega      | PROVEN  | UNKNOWN `f@2`  | mut-own, mut-any      |
| C02 função irmã strict   | `function a() { 'use strict'; return 1 }` + o P01                                                                 | carrega      | PROVEN  | UNKNOWN `f@3`  | mut-any               |
| C03 arrow sloppy         | `const g = () => { function f() { return 1 } { function f(s) { return require(s) } } return f }`, exporta `g()` | carrega      | PROVEN  | UNKNOWN `f@3`  | mut-arrow             |
| C11 `.cts` sloppy        | `m.cts`: `function f(): number { return 1 }` / `{ function f(s: string) { return require(s) } }` / `module.exports = f` | carrega (strip-types nativo) | PROVEN | UNKNOWN `f@2` | mut-ts |

Os quatro são PROVEN falsos na main que o catálogo não tem. A b1 correta fecha os quatro. O C11 importa porque a raiz real é quase toda `.ts`, e os 43 fixtures não têm nenhum arquivo TS: são 126 `.js`, 3 `.mjs` e 43 `package.json`.

**Correção.**

1. **§5.2.** O strict é decidido pelos ancestrais estritos da declaração:
   - O prólogo do arquivo conta.
   - Conta também o prólogo de cada função que contém a declaração, de qualquer tipo: declaração, expressão, arrow, método, getter, setter ou construtor.
   - A busca começa no pai da declaração. O prólogo da própria função declarada não conta.
   - Classe envolvente torna o código strict.
   - Nada mais torna o código strict. Não contam a extensão `.ts`/`.cts`/`.mts` nem `tsconfig`/`alwaysStrict`. Também não contam o fato de ser arrow ou método de objeto, nem uma diretiva em função que não contém a declaração.
2. **Catálogo.** Acrescentar C01, C02, C03 e C11 como positivos, com o resultado do Node 22, da main e da b1. Atualizar as contagens: 22 PROVEN falsos e 32 positivos. Atualizar também AB01, AB02 e AB06.
3. **AB08.** Listar os mutantes que têm de morrer e o fixture que mata cada um:

   | Mutante                                | Fixture que o mata |
   | -------------------------------------- | ------------------ |
   | regra ausente                          | P01                |
   | tupla só quando o bloco é avaliado     | P21/P22            |
   | prólogo da própria função              | C01                |
   | prólogo de qualquer função             | C02                |
   | arrow tratada como strict              | C03                |
   | TS tratado como strict                 | C11                |
   | comparação pelo texto cozido           | P20                |
   | parênteses aceitos                     | P27                |
   | `'use strict'` fora do prólogo         | P17                |
   | método de objeto tratado como classe   | P24                |
   | regra também em módulo `import`        | N03                |

## OPCIONAIS

- **O1 — AB04 cita a b.** O texto diz "b perde só N06–N09", mas a b não é implementada (§4, §5.3). Dizer que esse custo é referência medida na recon (`tools-b`) e não um aceite do BUILD.
- **O2 — Detalhe e escopo da declaração.**
  - Fixar `nome@linha` com a linha 1-based de `getStart(sf)`, sem trivia, como na variante da recon, e não `pos`. Com `pos`, a P06 dá `f@3` em vez de `f@4`.
  - `unknown()` deduplica tuplas iguais. Por isso, "uma tupla por função" é, na prática, uma por par (nome, linha).
  - Dizer se gerador e `async` em bloco entram. No AST do TS eles são `FunctionDeclaration`. No Node não há Annex B para eles: C04 e C05 não carregam o produto. Incluir é conservador e não custa nada na raiz. Os dois caminhos são seguros, mas o BUILD não deveria ter que escolher.
- **O3 — O que a regra não toca.** Dizer explicitamente que a regra:
  - não liga `module.cjsUnknown`, então não dá U aos importadores, ao contrário da C0;
  - não acrescenta regra em `rules` da derivação, como a C0;
  - não mexe em `usage` nem em limites, porque a AB07 exige payload igual.

  Hoje isso só está implícito em G3, AB05 e AB07.
- **O4 — Detalhes exatos e census.**
  - AB02 e AB06 deveriam fixar, por fixture, o multiset exato de detalhes `UNKNOWN_ANNEXB_FUNCTION` que a b1 da recon produz. Exemplos: P06 `f@4`, P16 `undefined@1`, P16b `undefined@2`, P18 `g@1`, P19 `require@1`, P21/P22 `flag@5`, P23 `mode@5`, N05 `g@2`, N09 `f@4`, N10–N12 `require@2`; os demais, `f@2`/`f@3`.
  - Testar também a emissão no census com `analyzeSemanticBoundary(input, { refusalCensus: true })`, como faz o teste da 0247. `runSemanticBoundary` só aproveita as violações do census (2440–2449), e sem esse teste a exigência da §5.1 não é verificável.
- **O5 — Negativos baratos.**
  - C08: CJS sloppy só com função no topo do arquivo e no topo de corpo de função. Fica PROVEN, sem tupla.
  - C07: `"use strict"` com aspas duplas. Fica PROVEN, sem tupla.

  Os dois matam os mutantes "marca toda FunctionDeclaration" e "só aceita aspas simples". Esses mutantes são conservadores, mas mudam o custo declarado.
- **O6 — Base da AB07.** Nomear a base: v7 `7f25da7d` medida na mesma época, com a receita reconstruída. Antes do A/B, conferir com o selado do BUILD0247: 11.723 diagnósticos, 10.833 tuplas e normal = strict. Se não bater, parar, como o BUILD0247 fez contra o selado do BUILD0245.
- **O7 — AB09 contra §8.** A AB09 diz "sem push", e a §8 fala em PR e merge. É a mesma convenção da 0247 (MC09 e PR #12), mas convém dizer que a AB09 limita o executor do BUILD. A promoção é o PR do branch candidato, com os 5 checks verdes no SHA exato, sob a autorização de sessão.
- **O8 — Âncoras que faltam.**
  - Modo `require`/`import`: 1821–1825.
  - `UNKNOWN_MODULE_FORMAT`: 1826–1837.
  - Ponto de inserção, logo depois da C0: 1858–1862.

  A G2 e a regra "só em módulo `require`" dependem dessas linhas. A SPEC0247 ainda cita 1689–1693, da v5.
- **O9 — Alcance da G1.** O Annex B em código de `eval` (B.3.3.3), em código global (B.3.3.2) e via `Function`/`vm` fica fora da varredura sintática. Esses casos já têm raiz: em CJS, `EVAL_REFERENCE` da C0; em geral, nome livre dá `UNKNOWN_BINDING`. Basta dizer isso, para que a G1 não pareça prometer mais do que a b1 faz.

## Respostas às quatro perguntas

1. **Fidelidade.** A SPEC implementa a b1 que o usuário escolheu, sem premissa nova.
   - G1–G4 valem para a b1 implementada como na `tools-wide`. Os 28 positivos da recon e os meus cinco (C01, C02, C03, C10 getter e C11) dão UNKNOWN com tupla.
   - O predicado da §5.2 pega:
     - bloco, `if`/`else` com e sem chaves, `case`, rotulado, `try`, `catch` e laço;
     - em código sloppy, a declaração dentro de método de objeto, getter e arrow.
   - O predicado não pega o topo de arquivo nem o topo de função (C08 continua PROVEN).
   - A regra de strict erra para o lado seguro:
     - diretiva com escape, entre parênteses ou tardia conta como sloppy;
     - TS sem diretiva conta como sloppy;
     - extends de classe é strict no V8 (C06: o Node não carrega o produto), o que bate com a regra da classe.
   - O único risco é de implementação (M1).
2. **Correção técnica.**
   - Todas as âncoras conferem com o código. O census decidido como a C0 é inócuo para PROVEN.
   - A regra da versão ("a seguinte à da main") resolve a corrida com a SPEC0251.
   - A recon mediu 0 tuplas novas na raiz. Varri os literais de todos os testes B6 (0228–0247 e integrações) e não há função de bloco sloppy, então "nenhum outro PROVEN muda" é cumprível.
   - Com a C0 e com `UNKNOWN_MODULE_FORMAT` a tupla só acrescenta.
   - Com a b1 correta, não achei PROVEN falso restante.
3. **Testabilidade.** Há lacuna real (M1). Também convém melhorar O4 e O5.
4. **Clareza.** Fora do M1, o BUILD consegue implementar. O1, O2, O3, O6 e O7 tiram escolhas residuais.

## Checks rodados

- `sha256sum` da SPEC no início e no fim.
- HEAD da worktree = `24cdb463` = `origin/main`; `git status` só com as pastas sem rastreio.
- Diff da proposta r2 da recon contra a SPEC: só a §5.1 (census), os títulos, a §4 e a §8 mudaram.
- Âncoras conferidas: 496–505, 569–604, 703–718, 754–758, 902–915, 965–978, 1084–1090, 1408–1409, 1517–1544, 1548–1558, 1563–1578, 1821–1837, 1858–1865.
- SPEC0247 §3.1, item 1 (C0 no census) e `runSemanticBoundary`: o census só contribui violações.
- `critic-0252/run.mjs`: 10 fixtures novos (C01–C10) com o Node 22 real (gancho `hook.mjs` da recon) e com main, b1, mut-own, mut-any e mut-arrow; os 43 da recon com b1 e os três mutantes.
- C11 `.cts` em `c11-out.json`, e mut-ts contra b1 nos 43 em `mut-ts-vs-b1.txt`.
- `scan-tests.mjs`: o predicado b1 sobre todos os literais de `tests/b6-*.test.js`, `tests/b6-*.integration.js` e o checker D8. Nenhuma ocorrência.
- Links relativos da SPEC: todos existem.

Nada foi alterado na SPEC, no código, nos scripts, no ledger ou no lockfile. Sem certify, e2e, commit ou push.
