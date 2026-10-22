# Crítica de código r1 — HISO005-P2-BUILD-0252 (SPEC0252 r3, opção b1)

**Veredito: REVISE.** Dois obrigatórios:

- **M1.** Um PROVEN falso real escapa ao predicado. Medi no Node 22.23.2.
- **M2.** Dois mutantes que criam PROVEN falso sobrevivem à suíte nova.

O resto do BUILD segue a SPEC:

- ponto de inserção, emissão no census, detalhe `nome@linha` e versão;
- expectativas tiradas da v7 e da b1 medidas;
- AB07 refeita de forma independente.

## Escopo e método

- Worktree `cvg-d9ef-annexb-recon-20261021`, base `24cdb463`, engine v7 `7f25da7d…`. O commit `1ed16fdbd` só tem docs: SPEC e evidências. O commit `b5a76d2df` traz o engine e os testes, com engine `559bc32d…`. A SPEC no commit tem sha256 `d1e20269…`, igual ao da aprovação.
- Li o código sempre pelo git. Nunca rodei nada da worktree.
- Para os probes, usei uma cópia limpa (`git archive`) em `/mnt/dados/cvg-work/annexb-build0252-runtime/critic-r1/`, com `node_modules` ligado por symlink a `tools-v8`, sempre com Node 22.23.2 (`env -i`).
- O Node 22 real usa o `hook.mjs` da recon, só para observar.
- O harness próprio `tools/mrun.mjs` roda um engine sobre os 74 fixtures do catálogo (passagem normal e census) e as 52 linhas da tabela do prólogo. Com o engine selado, reproduz exatamente as expectativas da suíte: 0 divergências contra `fixture-catalog.json` (v7 + b1).
- `tools/cmp.py` compara um mutante com o selado em tudo o que a suíte afirma: tuplas, status e violações na passagem normal; detalhes da tupla nova no census; status e detalhe nas linhas da tabela.

## 1. Fidelidade à §5 — OK

- **Ponto de inserção.** Fica em `load()`, logo depois do laço C0 (`cjsHandleCategories`), antes de `modules.set` e de `block(sf.statements, …)`, e só com `mode === 'require'`. O census passa pelo mesmo `load()`, e a vN emite nas duas passagens; a b1 da recon só emitia na normal (R3-O6).
- **O que não muda.** `unknown()` só acrescenta a tupla, com dedupe por chave canônica. Nada mexe em `module.cjsUnknown`, `rules`, `usage` ou limites.
- **Detalhe.** O detalhe é `name@linha`, com a linha 1-based de `getStart(sf)`.
- **Nome ausente.** A vN aceita declaração sem nome (`n.name?.text ?? ''`); a b1 exigia `n.name`. É inofensivo: função de bloco sem nome é SyntaxError no Node, e a mudança só pode acrescentar tupla.
- **Versão.** `semantic-kernel-v8-annexb-block-function`.

## 2. Predicado §5.2

Pontos conformes:

- O pai não é `SourceFile`, `ModuleBlock` nem `Block` corpo de função ou de bloco estático.
- Gerador e `async` entram.
- A busca começa no pai.
- `strictPrologue` é um helper único para os dois níveis: `StringLiteral` puro, termina na primeira instrução que não é, e compara o texto cru (`getText(sf).slice(1,-1) === 'use strict'`).
- Classe envolvente torna strict.
- A lógica é a mesma da b1 (`tools-wide`), fora o census e o nome ausente.

### M1 — PROVEN falso: nome computado de método, getter ou setter de objeto literal

O laço `for (let a = n.parent; …)` aceita como strict qualquer ancestral `FunctionLike` cujo corpo tenha `'use strict'`. Só que o nome computado (`[expr]`) de um método, getter ou setter de objeto literal **não é código da função**: ECMA-262 §11.2, "function code" cobre parâmetros e corpo, não o `PropertyName`. Esse nome é avaliado no código envolvente, que é sloppy. O AST põe o nome computado dentro do `MethodDeclaration`, e por isso o kernel herda o strict do corpo do método.

Fixture X06 (`m.js`; o `entry.js` faz só `require('./m.js')`):

```js
function f() { return 'k' }
const o = { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { 'use strict' } }
module.exports = 1
```

| Fixture                         | Node 22.23.2      | v7     | v8 (`559bc32d`) | b1 recon | Correção sugerida            |
| ------------------------------- | ----------------- | ------ | --------------- | -------- | ---------------------------- |
| X06 arrow no nome computado     | carrega o produto | PROVEN | **PROVEN**      | PROVEN   | UNKNOWN, `f@2` (normal e census) |
| X07 IIFE `function(){}`         | carrega o produto | PROVEN | **PROVEN**      | PROVEN   | UNKNOWN, `f@2`               |
| X10 o mesmo dentro de função    | carrega o produto | PROVEN | **PROVEN**      | PROVEN   | UNKNOWN, `f@3`               |
| X08 controle (método sem diretiva) | carrega        | PROVEN | UNKNOWN `f@2`   | —        | UNKNOWN `f@2`                |
| X12 controle (classe)           | não carrega       | UNKNOWN | sem tupla      | —        | sem tupla                    |

Isso viola a G1 da SPEC: "nunca dá PROVEN quando o Annex B.3.3 … pode mudar a ligação". A b1 da recon tem o mesmo defeito, então as expectativas tiradas dela não podiam pegá-lo. A redação da §5.2 ("o prólogo … de cada função que contém a declaração") é ambígua: o código seguiu a leitura sintática dela. A §7 manda tratar qualquer dúvida como sloppy.

Correção mínima testada em cópia (`critic-r1/fix`, engine `d548c5f5…`):

```diff
-        for (let a = n.parent; a && !strict; a = a.parent)
+        for (let c = n.parent, a = c.parent; a && !strict; c = a, a = a.parent)
           strict =
             ts.isClassLike(a) ||
             (ts.isFunctionLike(a) &&
-              !!a.body &&
-              ts.isBlock(a.body) &&
-              strictPrologue(a.body.statements, sf))
+              a.body === c &&
+              ts.isBlock(c) &&
+              strictPrologue(c.statements, sf))
```

A função só torna strict quando a subida chega a ela **pelo corpo**. Parâmetros nunca contam, e isso é exato: um parâmetro não simples com `'use strict'` no corpo é SyntaxError. A classe continua strict em tudo, inclusive no nome computado, o que está certo (X12).

Com a correção:

- os 74 fixtures (normal e census) e as 52 linhas da tabela ficam idênticos ao selado;
- X01–X04, X06, X07 e X09–X11 passam a ter a tupla (X05 e X08 já a tinham), e X06, X07 e X10 deixam de ser PROVEN;
- X12 continua sem tupla.

O que precisa ser feito:

- aplicar a correção;
- acrescentar X06, X07 e X10 ao catálogo como positivos (Node 22 + v7 + b1-corrigida medidos) e X08/X12 como controles;
- acrescentar o mutante "nome computado de método conta como código da função" (o código atual), morto por X06;
- registrar uma errata da §5.2: "contém" quer dizer que a declaração está no corpo da função, e o nome computado de método ou acessor de objeto literal pertence ao código envolvente. A mudança é só mais conservadora e não é premissa nova. Cabe ao lead decidir se isso exige r4 e nova crítica de SPEC.

Como o sha do engine muda, a AB07 (raiz real), o catálogo vN, a tabela do prólogo e os mutantes da AB08 têm de ser refeitos sobre o engine novo. A expectativa é de 0 tuplas na raiz: a contagem da recon não tem função de bloco em CJS sloppy, e a correção só alcança funções de bloco dentro de nome computado.

Busquei outras rotas de "strict falso" e não achei outra:

- **Classe.** Todas as partes da classe são strict, inclusive `extends` e nome computado; X12 confirma.
- **Parâmetros.** Não podem conter função quando o corpo é strict (SyntaxError).
- **Diferenças de parser TS × V8:**
  - comentário HTML `<!--`/`-->`: só levam o TS a "sloppy", que é conservador;
  - marcadores de conflito, ZWSP e NEL: SyntaxError no Node.
- **Modo.** Arquivo sem extensão em pacote `type: module`, carregado por `require`, sai `UNKNOWN_ANCESTOR_FORMAT` (probe Y01). ESM detectado em arquivo `require` só acrescenta tupla.

## 3. O teste novo

- **Origem das expectativas.** `gen_test.py` gera a partir de `fixture-catalog.json`, medido antes da mudança com a v7 (`7f25da7d`) e a b1 (`47ec764f`). Ele afirma que as outras tuplas da b1 = v7 e que validation é true. Não é tautológico: o status da vN vem da b1, não da própria vN. A positividade vem do Node 22 real.
- **AB01–AB06.** Estão cobertos:
  - AB01: 26 + 11 D, com tupla no arquivo da declaração;
  - AB02: 51 positivos e os detalhes nomeados pela SPEC;
  - AB03: strict, classe, C08 e C04/C05;
  - AB04: custo exato N05–N09 e nenhum PROVEN novo;
  - AB05: multiset sem a tupla nova e violações de P16, P19, N10 e N11;
  - AB06: controles do predicado e census com `refusalCensus: true` em todos os fixtures.
- **Notas R3.** R3-O1 (D04), R3-O2 (D01, D02, D05, D06, D09 e a tabela com `;`, escape e parênteses no corpo de função) e R3-O3 (D03a/e/f nos falsos PROVEN; D03b–d, D07, D08, D10 e D11 como controles) estão presentes.
- **Tabela do prólogo.** São 52 linhas: 20 em `file`, 20 em `function` e 6 strict em `block` e em `own`. Ela mede pela análise nos dois níveis. As expectativas estão escritas à mão, mas `prologue-table.json` confirma cada linha no Node 22 real (`allOk`, 32 PROVEN falsos da v7).
- **M2 — mutantes de exatidão vivos.** A §5.2 exige que o texto cru seja **exatamente** `use strict`, mas a tabela não fixa espaço nas pontas nem prefixo ou sufixo dentro das aspas. Dois mutantes naturais sobrevivem a todas as entradas da suíte (74 fixtures em normal e census e 52 linhas, sem nenhuma diferença), e os dois criam PROVEN falso:

  | Mutante                                          | Suíte | `'use strict '` no arquivo (Y02) | `' use strict'` em função (Y03) | `'not use strict'` (Y04) |
  | ------------------------------------------------ | ----- | -------------------------------- | ------------------------------- | ------------------------ |
  | mutA: `.slice(1,-1).trim() === 'use strict'`     | vivo  | **PROVEN** (Node carrega)        | **PROVEN** (Node carrega)       | UNKNOWN                  |
  | mutB: `.getText(sf).includes('use strict')`      | vivo  | **PROVEN**                       | **PROVEN**                      | **PROVEN**               |

  O que precisa ser feito: acrescentar à tabela `PROLOGUE` (e a `prologue_node22.py`) as linhas sloppy `'use strict '`, `' use strict'`, `'use strict;'` (com o `;` dentro das aspas) e `'not use strict'`, nos níveis `file` e `function`. Depois, confirmar no Node 22 e incluir mutA/mutB na lista de mutantes.
- **Fragilidade.** Não achei nada relevante:
  - os diretórios temporários são do `ownedRunParent`, com limpeza no `afterAll`;
  - o cache `results` só memoriza a chamada limpa por fixture;
  - os testes chamam o engine num processo Node 22 limpo.

## 4. AB08 — mutantes

**Lista do executor.** Ela bate com a SPEC: os 18 nomeados na AB08 (mut-own, any, arrow, ts, single-quote, all, removed, normal-only, block, expr, tpl, fnlate, evaluated, cooked, parens, outside-prologue, object-method-class, import). Inclui ainda as notas R3 (mut-tsonly, mut-empty, mut-fnsep, mut-textprefix) e 3 extras (cjs-unknown, pos-line, no-generator). Cada substituição tem um fixture assassino coerente.

**`mutants.json` quando li** (incompleto, rodando): 4/4 mortos, todos pelos assassinos nomeados.

| Mutante  | Testes falhando |
| -------- | --------------- |
| mut-own  | 12/141          |
| mut-any  | 13/141          |
| mut-arrow | 6/141          |
| mut-ts   | 7/141           |

**Mutantes meus, em cópia** (comparados em tudo o que a suíte afirma):

| Mutante                                                                  | Resultado                     | Relevância                                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| código atual × correção M1 (nome computado conta como função)            | vivo (é o próprio defeito)    | **obrigatório (M1)**                                                                                                   |
| mutA `trim`                                                              | vivo                          | **obrigatório (M2)**, cria PROVEN falso                                                                               |
| mutB `includes`                                                          | vivo                          | **obrigatório (M2)**, cria PROVEN falso                                                                               |
| mutC: não desce na declaração já pega (`return void found.push`)         | vivo                          | opcional: o arquivo já tem tupla, sem PROVEN falso; só o multiset de detalhes de funções de bloco aninhadas fica sem fixar |
| mutD: pula a regra quando `cjsUnknown`                                   | morto (P19, N10, N11, N12)    | —                                                                                                                      |
| mutE: sem a exclusão de `ModuleBlock`                                    | vivo                          | nenhuma: só acrescenta tupla, e namespace com valor é recusado pelo strip-only do Node 22                             |
| mutF: sem `ts.isBlock(a.body)`                                           | vivo                          | nenhuma para PROVEN: só lança exceção com arrow de corpo expressão como ancestral                                     |

## 5. AB07 — refeita de forma independente sobre os `.json.gz`

- **v7 × v8.** Normal e strict, sem `semanticTelemetry`: a única diferença de payload é `/semanticBoundary/kernelVersion`.
- **Contagens da v8.** 11.723 diagnósticos e 10.833 tuplas; 0 provas, validation true, 0 `UNKNOWN_ANNEXB_FUNCTION`. Normal = strict, com payload idêntico.
- **Base × selado do BUILD0247** (`real-v7r1-*`). Diagnósticos e tuplas iguais (MATCH), como afirma `base-vs-sealed.json`. O payload, porém, difere em `/semanticBoundary/compiledProvenance/referenceDigest` (`e4e4c39a…` contra `2d94ee8b…`), com a mesma receita, os mesmos 121 arquivos e o mesmo `compilerTreeSha256`. Isso não falha o critério da SPEC (diagnósticos e tuplas), mas `base-vs-sealed.json` não o registra (O1).
- **Época.** `epoch-r1.json` mostra a raiz `228e7918` com 1.410/1.410 inputs no início e no fim e 0 arquivos mudados.

## 6. Regressões e versão

- O literal mudou nas 7 suítes (0236, 0237 ×2, 0240, 0241, 0244, 0245 e 0247), todas para `semantic-kernel-v8-annexb-block-function`.
- Fora de `docs/`, `git grep` não acha mais nenhum `semantic-kernel-v7`, `cjs-export-value` ou `7f25da7d`.
- `check-product-boundary.mjs` usa a constante `SEMANTIC_KERNEL_VERSION`, e o hash do engine entra no perfil em tempo de execução, sem pin literal.
- Nenhum registro de motivos precisa da tupla nova; a validation aceita a tupla.

Ainda falta verificar (não exigido nesta rodada): os gates estáticos, a suíte B6 completa (0228–0252), a unitária e o consumidor fresco no Node 22. Depois da correção do M1, também é preciso refazer a AB07, o catálogo vN, a tabela do prólogo e a AB08 sobre o engine novo.

## Opcionais

- **O1.** Registrar em `base-vs-sealed.json` a diferença de payload `compiledProvenance.referenceDigest` contra o selado e a causa (referência compilada reconstruída: mesma receita, mesmos arquivos, mesma árvore do compilador).
- **O2.** Acrescentar um fixture com função de bloco aninhada dentro de outra função de bloco (`{ function g() { { function f(){} } } }`) para fixar o multiset de detalhes e matar o mutC.
- **O3.** Registrar no relatório do BUILD as notas R3-O4 a R3-O6, que ainda estão pendentes.
- **O4.** No comentário da tabela do teste, citar `prologue-table.json` como a prova Node 22 das expectativas escritas à mão.

## Artefatos do crítico

Tudo fica em `/mnt/dados/cvg-work/annexb-build0252-runtime/critic-r1/`:

- `fx/` (X01–X12) e `fx4/` (Y02–Y04), com sha256 em `critic-fixtures-sha256.txt`;
- a correção em `fix/` e `fix.diff`;
- os mutantes `mut*/`;
- `ref-v8.json` e `out-*.json`;
- o resumo em `critic-mutants-summary.txt`;
- as ferramentas em `tools/` (`mrun.mjs`, `cmp.py`, `run.sh`, `mk.sh`).

Engines usados:

| Engine       | sha256      |
| ------------ | ----------- |
| v8 selado    | `559bc32d…` |
| fix          | `d548c5f5…` |
| mutA-trim    | `3eaa56d2…` |
| mutB-includes | `3b103a3c…` |
