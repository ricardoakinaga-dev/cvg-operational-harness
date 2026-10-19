# Brief da revisão R2 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A

Última rodada (2/2); não há novo reparo depois dela. Crítico: subagente novo, somente
leitura, com as regras do [brief R1](../review-r1/brief.md): não grava, não edita e
não executa nada além de leitura, `sha256sum` e Python `-I` ou Node 22 para hash e
parsing de JSON. Proibido: serviço, SDK, Pydantic, typescript.js, compilador, Codex
CLI, rede, Docker, PG, git com escrita e execução dos scripts `.py.txt`/`.mjs.txt` da
pasta. O veredito é devolvido como texto e gravado pelo executor sem edição.

Raiz: `docs/04_audit/evidence/CODEX100-EXEC-20261017/` (abaixo, `E/`). Objeto em
`E/g02/sdk-source-batch-2a-spec/`.

## Objeto (sha256 no momento do brief)

| Arquivo                    | sha256                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| cases-2a.json              | `edfc59dbdb4d701c4322e0dd796ed4e043e1f2c122f0f2d08bc77d212b29159b` |
| coverage-plan-2a.json      | `eccc13a3db743187c1e10156134ae55cf469ef410be107c6bd3d05680f7efb3a` |
| peer-v2-contract.json      | `40e3c94266b416e24fe99c03b47c2efd9e0f2f3c3ff72f208a22bac5d4f6aad7` |
| evaluator-r3-contract.json | `b7e89f67c766289c765d369d4a37708891a6c31282eb15945dead5d45cfda21a` |
| capture-contract.json      | `c60af851d899da2523f221bbd1c99c2815853415955f23ce0d69628fbc61bd95` |
| control-slot-contract.json | `001048a4667c443ba675467f44e91d4863f0dafe0b603d452b686d9ad6d36a2d` |
| execution-budget.json      | `b8f6ede9a155e7ca1febccf9d6e9f99e3a09bc0923897e6e1f53c065dcb6fc11` |
| t3-assessment.json         | `a80247d42e8268d111c98717dbb1910ede4c767021c3150ef52d7bd25b3b9539` |
| next-task.json             | `6e46cf272c0f0998e854c716b67ea8c849a41ff9a348a9cfd5c61a7bdc093900` |
| ledger-delta-cont-d9ef.md  | `72f8c8a844a849bb504a7fda4efe79be5f2e9bfd09bec8174e97ec9ce55ecdb2` |
| input-verification.json    | `98c55747838ffb7681f5d896c1232ab062d6df16c3c265d3c0795ef74ec3b586` |
| validation.json            | `5a53f345c0df87d523da803242dc15f0e70aee74d87a7dbf75aa229a8d755468` |
| negative-controls.json     | `b22686ab8f3fffcd8887659c1ea1613e7c8bb9e5f346e1d33cf83d0b3ee67ec0` |
| repair-r1.json             | `7db719e700e4e1b633a8f59c5ab321c6d80fbc5ee2b7274d667ceb437346f65e` |
| verify-inputs.py.txt       | `c3243618416b3628f0089ee6d5b0b74040961e74bd22863965b97e7b6b650942` |
| build-spec-2a.py.txt       | `6db1ce6ad91883fea9c9a33773394be349faaecccd891225f3f1662d17486a2c` |
| build-contracts-2a.py.txt  | `63f1832f0fe2183787af96d41a606060efc6782edc95ea13a87adca1bf6eacb8` |
| validate-spec.mjs.txt      | `988ab94b5a6bab004c8eee13f8c60dec4fc5f7b8257ac7962425c395dd4549cf` |
| negative-controls.py.txt   | `3ae8f608e9f67f17fee992cfdf9c6dc83de659bfda676cf85718f848b82f49e1` |
| review-r1/verdict.raw.txt  | `60517eb8a5fe55cc1bc60ae1d8577251ceb4bb33d317ef9856d9f9c532bb27a8` |

As preimagens da R1 estão em `archives/r1-preimages/` (`.preimage.txt` e os cinco
scripts), com os hashes do brief R1; `repair-r1.json` liga cada arquivo ao hash R1 e
R2.

## Critérios

- D1. Cada achado da R1 (`review-r1/verdict.raw.txt`) foi resolvido de fato, sem
  regressão. Em especial os cinco P2: corrida do TS15, testemunhas de /work/tmp,
  conflito R3-01/R3-06/R3-08, tabela de predicados congelada com classes (incluindo
  o gate CONTROL) e a regra de mescla do `data` do peer v2.
- D2. Os critérios C1–C10 do brief R1 continuam válidos no objeto atual. Os valores
  esperados que a R1 conferiu não podem ter regredido; os alterados pelo reparo
  (2A-TS04 `return_result`, forma C do 2A-TS10, `pause_reply` do 2A-PY10R e a resposta
  esperada do CTRL01) precisam conferir com a fonte.
- D3. A tabela `cases-2a.json#/predicate_table` é completa e coerente: classe e
  oráculo de cada predicado usado; todo predicado de `known_bad.judged_by` é `client`;
  nenhuma falha de sanidade leva a MISMATCH; nenhum predicado informativo decide.
- D4. Nada afirma execução, recibo, paridade ou autorização inexistente; o orçamento
  segue dentro do máximo; a avaliação T3 continua coerente com D-12.
- D5. `repair-r1.json` descreve corretamente as mudanças e as preimagens conferem.

## Formato da resposta

Texto Markdown com: veredito (`APPROVE` ou `REVISE`), estado de cada achado R1
(`RESOLVED`, `PARTIAL` ou `OPEN`, com evidência), achados novos `R2-Fnn` com
severidade (P1, P2 ou P3), obrigatório sim ou não, local, evidência e correção
sugerida; checagens feitas; limites. `REVISE` só com pelo menos um achado obrigatório
(P1 ou P2). `state.json` ainda é stub e os links para `review-r2/verdict.md` podem estar
quebrados; isso não é achado.
