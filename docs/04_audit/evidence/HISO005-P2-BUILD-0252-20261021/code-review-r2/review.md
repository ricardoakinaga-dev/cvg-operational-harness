# Crítica de código r2 — HISO005-P2-BUILD-0252 (SPEC0252 r3, opção b1)

**Veredito: APPROVE, sem obrigatórios.** Os dois obrigatórios da r1 foram resolvidos e conferi cada um de forma independente. O diff `24cdb463..9a571d36b` em `scripts` e `tests` segue a §5. A AB07 da época r2 bate. Ficam três opcionais, nenhum deles de código.

## Escopo e método

- O commit novo `9a571d36b` muda só `scripts/boundary-semantic-engine.mjs` (engine `a1ef8120…`) e `tests/b6-0252-annexb-block-function.test.js` (`452c765a…`). Os dois arquivos da worktree hoje têm esses mesmos bytes.
- Li tudo pelo git e montei uma cópia limpa (`git archive 9a571d36b`) em `/mnt/dados/cvg-work/annexb-build0252-runtime/critic-r2/`. Nada rodou a partir da worktree.
- Usei Node 22.23.2 com `env -i` e o `hook.mjs` da recon, só para observar.
- O harness `tools/mrun.mjs` roda um engine sobre os 88 fixtures de `fixture-catalog-r1b.json` (passagem normal e census) e as 60 linhas de `prologue-table.json`.
- `tools/cmp2.py` faz duas coisas:
  - compara o engine selado com as expectativas da suíte, isto é, v7 + b1 (ou `EXPECTED_X` nos X) e as linhas da tabela;
  - compara cada mutante com o selado em tudo o que a suíte afirma.

## M1 da r1 (PROVEN falso por nome computado) — RESOLVIDO

- **Correção.** O laço virou `for (let c = n, a = n.parent; …; c = a, a = a.parent)`, com `ts.isFunctionLike(a) && a.body === c && ts.isBlock(c) && strictPrologue(c.statements, sf)`. A classe continua tornando strict por qualquer parte.
- **Equivalência.** Com `c = n` em vez de `c = n.parent`, o resultado é o mesmo: na primeira volta `a = n.parent`, que nunca é função nem classe, e nenhum `a.body` pode ser a própria `FunctionDeclaration`.
- **Medida.** O engine `a1ef8120` dá saída idêntica à da minha correção da r1 (`d548c5f5`) em todas as entradas da suíte (88 fixtures em normal e census, 60 linhas).
- **Comentário no código.** Ele explica que nome computado e parâmetro ficam fora do código da função. Parâmetro também é exato: parâmetro não simples com `'use strict'` no corpo é SyntaxError. O mutante "parâmetro conta" (mutH) é equivalente e não muda nenhuma entrada.

Os fixtures X versionados em `fixtures-x/`:

- `sha256sum -c` aprova os 56 arquivos.
- X01–X12 são idênticos byte a byte aos meus da r1.
- Os 14 X embutidos no teste são idênticos aos de `fixtures-x/`.
- Rodei de novo no Node 22:
  - X01–X03, X06–X11, X13 e X14 carregam o produto (11 positivos);
  - X04, X05 e X12 não carregam;
  - isso bate com a coluna `positive` do catálogo.
- `EXPECTED_X`, escrito à mão em `gen_test.py`, coincide com a saída medida da minha correção nos X01–X12 da r1.
- X13 (`f@3`, `g@4`) e X14 (`f@3`: `g` herda o strict do corpo de `f`) estão certos pela ECMAScript e pela medida.
- O gerador usa só as colunas `v7`, `b1` e `node22` (`test-generation.json` `columnsUsed`). Nenhuma expectativa vem do vN.

Testes novos:

- X_FALSE_PROVEN: X06, X07, X08, X10, X13 e X14, todos base PROVEN e vN UNKNOWN.
- Contagem de tuplas nos X de nome computado.
- X12 sem tupla.
- Detalhes exatos de X13 e X14.
- Conjunto X na AB04 separado do custo da SPEC.

## M2 da r1 (exatidão do texto cru) — RESOLVIDO

- A tabela `PROLOGUE` ganhou `trailing space`, `leading space`, `semicolon inside the quotes` e `prefix`, nos níveis `file` e `function`. São 60 linhas no total.
- `prologue-table.json` (`allOk`, 60 linhas, vN `a1ef8120`) mostra as 8 linhas novas sloppy no Node 22 (produto carregado), PROVEN na v7 e UNKNOWN com o detalhe na vN.
- Meus mutantes mortos:
  - mutA `trim`: 4 linhas;
  - mutB `includes`: 8 linhas.
- `mutants.json` também registra `mut-trim` e `mut-includes` mortos pelos assassinos nomeados.

## Resto do diff e evidências

- **Engine.** Fora do laço, só mudaram comentários. Ponto de inserção, census, detalhe, `cjsUnknown`, `rules`, `usage`, limites e versão estão iguais à r1, que já estava conforme.
- **Suíte contra as expectativas.** O engine selado tem 0 divergências contra as expectativas da suíte (88 fixtures e 60 linhas) e nenhum positivo PROVEN.
- **Verde e primeira falha.**
  - Verde 165/165 (`green-0252-r1b`), com os bytes do engine `a1ef8120` e do teste `452c765a`.
  - Primeira falha na v7: 132/165 falham (`first-red.json`, r1b), e a r1 de 109/141 continua registrada.
- **AB08 (`mutants.json`).** 29 mutantes, todos mortos, todos pelos assassinos nomeados, com engine `a1ef8120` restaurado depois de cada um. São os 18 da SPEC, os 4 das notas R3, `mut-computed-name` (X06/X07/X10), `mut-trim`, `mut-includes`, `extra-no-recurse` (X13) e mais 3 extras. A rodada interrompida no engine antigo ficou separada em `mutants-r1-interrupted.json` (6/6 mortos).
- **Mutantes meus, no engine novo:**

  | Mutante                                    | Morto por                                                 |
  | ------------------------------------------ | --------------------------------------------------------- |
  | computed-name (o código antigo)            | 9 X                                                       |
  | não descer na declaração já pega           | X13                                                       |
  | classe só pelos membros                    | C06                                                       |
  | parar na primeira função                   | N04, N14, C06, X12                                        |
  | parâmetro conta (mutH)                     | equivalente, sem efeito                                   |

- **AB07 da época r2, refeita sobre os `.json.gz`:**
  - **v7 × v8b**, normal e strict sem telemetria: só `/semanticBoundary/kernelVersion` difere.
  - **v8b**: 11.723 diagnósticos, 10.833 tuplas, 0 provas, validation true, 0 `UNKNOWN_ANNEXB_FUNCTION`. Normal = strict, idêntico.
  - **Base × selado do BUILD0247**: só `compiledProvenance.referenceDigest` difere (`e4e4c39a…` contra `2d94ee8b…`). Isso agora está registrado em `base-vs-sealed.json` com valores e nota (O1 da r1 resolvido).
  - **`tools-v8b`**: o engine é o `a1ef8120` do commit `9a571d36b`.
  - **`epoch-r2.json`**: 1.410/1.410 inputs no início e no fim, 0 arquivos mudados.
- **Gates estáticos (`gates-r1b.json`, head `9a571d36b`).** Todos PASS: prettier nos arquivos tocados, eslint, typecheck, skip:governance e docs:check-links.
- **Literal de versão.** Continua certo nas 7 suítes, e nada fora de `docs/` depende da v7.

## Opcionais

- **O1.** A worktree tem `M certification/skip-inventory.json`, um efeito colateral do gate `skip:governance`: `runId`, `candidateId` e `generatedAt` mudaram e `entries` foi de 35 para 39. Esse arquivo é rastreado e está fora do escopo do BUILD. Não deve entrar no commit nem no PR. O executor deve desfazer essa alteração dele antes da promoção ou registrá-la.
- **O2.** Registrar no relatório do BUILD a leitura da §5.2 ("função que contém" = a declaração está no corpo dela; nome computado de método ou acessor de objeto literal é código envolvente) como interpretação mais conservadora, apoiada pela G1 e pela §7. Também registrar as notas R3-O4 a O6. Fica para o lead decidir se a leitura vira errata r4.
- **O3.** Antes da promoção, registrar os números que ainda rodam: suíte B6 focal (0228–0252), perfil nativo, unitária e consumidor fresco no Node 22.

## Artefatos do crítico

Tudo fica em `/mnt/dados/cvg-work/annexb-build0252-runtime/critic-r2/`:

- `src/` (archive de `9a571d36b`) e `fix/` (a correção da r1);
- os mutantes `mut*/`;
- as saídas `out-*.json`;
- o resumo em `critic-r2-summary.txt`;
- as ferramentas em `tools/` (`mrun.mjs`, `cmp2.py`, `embedded.mjs`);
- `nodecheck/` (os X rodados no Node 22).
