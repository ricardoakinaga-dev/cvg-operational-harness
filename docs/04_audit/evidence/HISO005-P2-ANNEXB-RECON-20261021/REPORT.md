# HISO005-P2-ANNEXB-RECON-20261021 — recon do Annex B.3.3 no kernel B6

Recon T1, só leitura, feita pelo Claude Code em 21/10/2026, na worktree detached `/mnt/dados/cvg-work/cvg-d9ef-annexb-recon-20261021`. Base: main `24cdb463`, kernel `semantic-kernel-v7-cjs-export-value`, engine `7f25da7d…`. Cartão: [subtask HISO005-P2-ANNEXB-RECON](../../../03_build/0370_harness_product_isolation_backlog.md). Origem: [achado do BUILD0247](../HISO005-P2-BUILD-0247-20261020/finding-annexb-block-function.json). A recon não mudou código, script, SPEC, ledger, cartão nem lockfile, e não fez commit, push, certify, e2e nem sbom.

## Resultado

1. **Defeito.** Está em `scripts/boundary-semantic-engine.mjs`:
   - 1408–1409: a função de bloco é ligada só no ambiente do bloco;
   - 1563–1566 e 1568–1578: `Block` e `if` criam ambiente filho;
   - 1517–1544: não há cópia para a `var` do escopo de função;
   - 902–915 e 1865: não há ambiente var nem wrapper, então falta a `var` com `undefined` que nasce na entrada da função;
   - 754–758: `find()` acha a ligação de fora.

   O motor não conhece modo strict, e nenhuma SPEC B6 fala de Annex B. Detalhes em [spec-proposal.md](spec-proposal.md) §1.

2. **Raiz real `228e7918`.** Os 1.410 sha256 conferem antes e depois.
   - Nos 1.341 arquivos que a B6 analisa há **0** funções de bloco em CJS sloppy. As 3 existentes estão em 2 arquivos ESM e não são lidas fora do bloco.
   - Também há 0 nos 1.349 arquivos de código dos inputs, nos 3.874 rastreados (251 CJS sloppy), nos 7.859 de `node_modules/` (432 CJS sloppy) e nos 16 de `node_modules` aninhados.
   - A B6 tem **0 provas**, então nenhuma prova atual depende do defeito.
   - Dados em [occurrences.json](occurrences.json).

3. **Controles.** São 43 fixtures sintéticos (28 positivos e 15 negativos), rodados em disco no Node 22.23.2. O resultado bate com o esperado em 43/43.
   - Kernel da main: **18 PROVEN falsos** (P01–P05, P12–P14, P16b, P17, P20, P21–P27) e 11 PROVEN corretos.
   - Também há 2 violações falsas: N10 vem do corpo e N11 do censo.
   - Comandos e saídas em [controls.json](controls.json).

4. **Custo medido.** As variantes são só de diagnóstico. Nos fixtures, as outras tuplas e violações ficam iguais às da main.

| Opção                                                         | PROVEN falsos que sobram | PROVEN corretos perdidos | Tuplas novas na raiz (A/B) |
| ------------------------------------------------------------- | -----------------------: | -----------------------: | -------------------------: |
| b) função de bloco sloppy com conflito de nome                |                        0 |                        4 |                          0 |
| b1) toda função de bloco sloppy de módulo `require`           |                        0 |                        5 |                          0 |
| controle: toda função de bloco, sem olhar modo e strict       |                        0 |                       11 |                          3 |
| a) modelar o B.3.3 (não implementada; previsto pela contagem) |        0 se for completa |                        0 |                          0 |

5. **Recomendação: opção b na forma b1.**
   - Custa zero na raiz.
   - Usa um predicado local, sem análise de escopo.
   - Pega a `var` criada com `undefined` sem precisar modelá-la.
   - Custa só uma prova correta de fixture a mais que b.
   - A decisão e o BUILD são T3 do usuário.

## Limites

- O A/B na raiz usa a mesma entrada para os quatro motores, mas não é a medição oficial: as referências da receita do BUILD0247 foram removidas.
  - A base tem 10.761 tuplas e a oficial tem 10.833. A diferença vem só da entrada: −288 `UNKNOWN_UNREACHED_INSTALLED_ENTRY`, +155 `UNKNOWN_INSTALLED_FILE_IDENTITY`, +46 `UNKNOWN_COMPILED_PROVENANCE` e +15 `UNKNOWN_INSTALLED_IDENTITY`.
  - O corpo analisado é o mesmo: 1.341 módulos, 1.690.528 nós, 134.899 estados e 229 contextos.
  - O aceite AB07 pede a medição oficial no BUILD.
- A opção a não foi implementada, porque seria o próprio BUILD T3.

## Revisão

- [R1](review-r1/review.json): pediu mudanças (CHANGES_REQUIRED) com M1 (falta a criação da `var` com `undefined`) e M2 (a N10 vem do corpo). Ambos foram corrigidos; ver [correções](review-r1/corrections-r1.json).
- [R2](review-r2/review.json): APPROVE, sem obrigatórios.

## Arquivos

- [occurrences.json](occurrences.json)
- [controls.json](controls.json)
- [spec-proposal.md](spec-proposal.md)
- [review-r1/](review-r1/review.json)
- [review-r2/](review-r2/review.json)
- [task.json](task.json): comandos, sha256 e HEAD.

Os scripts e os fixtures ficam em `/mnt/dados/cvg-work/annexb-recon-runtime/`. Este relatório foi gravado pelo lead a partir do texto do executor, porque o executor não podia gravar arquivo de relatório.
