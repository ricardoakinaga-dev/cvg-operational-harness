# Brief da revisão R3 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A

Rodada única, autorizada pelo Lead em `lead-budget-extension-r3.json`; não há rodada
depois dela. Foco: os dois P2 da R2 (R2-F01 e R2-F02) e regressões do reparo. O
crítico é um subagente novo, somente leitura, com as regras do
[brief R1](../review-r1/brief.md): não grava, não edita e não executa nada além de
leitura, `sha256sum` e Python `-I` ou Node 22 para hash e parsing de JSON. Proibido:
serviço, SDK, Pydantic, typescript.js, compilador, Codex CLI, rede, Docker, PG, git com
escrita e execução dos scripts `.py.txt`/`.mjs.txt` da pasta. O veredito é devolvido
como texto e gravado pelo executor sem edição.

Raiz: `docs/04_audit/evidence/CODEX100-EXEC-20261017/` (abaixo, `E/`). Objeto em
`E/g02/sdk-source-batch-2a-spec/`.

## Objeto (sha256 no momento do brief)

| Arquivo                       | sha256                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| cases-2a.json                 | `147a906d2aa6616157c50d8e4cc9cb7e8f5d9cec7be749b77eca1e0e1dbc1c2c` |
| evaluator-r3-contract.json    | `7cc3a9de64aa67d6c815a056280a6818611df5204e0e655a865838d89a273905` |
| capture-contract.json         | `4bf83285439fef507fe44ff1275c172dafae693ea054cd43307e6d497abdccc4` |
| coverage-plan-2a.json         | `eccc13a3db743187c1e10156134ae55cf469ef410be107c6bd3d05680f7efb3a` |
| peer-v2-contract.json         | `40e3c94266b416e24fe99c03b47c2efd9e0f2f3c3ff72f208a22bac5d4f6aad7` |
| control-slot-contract.json    | `001048a4667c443ba675467f44e91d4863f0dafe0b603d452b686d9ad6d36a2d` |
| execution-budget.json         | `b8f6ede9a155e7ca1febccf9d6e9f99e3a09bc0923897e6e1f53c065dcb6fc11` |
| t3-assessment.json            | `a80247d42e8268d111c98717dbb1910ede4c767021c3150ef52d7bd25b3b9539` |
| validation.json               | `dd048736885cbf5483b9a440d0917b763825f855c27d5d8db351285848cd0e17` |
| negative-controls.json        | `7669301a19f4ee35fbb0ba4a473749c1cb9872d6d95d73f0b99049ba2358b353` |
| repair-r2.json                | `d2d1d9ef9513b5322bf4447bb80e71a77092d578a7ceb300557b9523e0053436` |
| lead-budget-extension-r3.json | `2fbf528bfe31fe62f29e11061eccbe290ebd7344461011aec67ae19177f58800` |
| build-spec-2a.py.txt          | `585154ce7810c9eb4967ace99605e03a00844b1fea54a3c4e983fd472e717a49` |
| build-contracts-2a.py.txt     | `c0ea2ec8d5f67b505819104846ad1bc77c7f580e2a6cc37d21fc64c6d5bda7ab` |
| validate-spec.mjs.txt         | `0d73fda63852f64a22779fc92a90f0f153c2c8cf546cb16c5828042a831503a3` |
| negative-controls.py.txt      | `535e46bf038326078b525b7d3c334041192fadfb44c9924440d01edc892fafe6` |
| review-r2/verdict.raw.txt     | `50d876f99321783ecf79c1d5194089b90be1c9f2aa1afbe0c3e86080d6de57ab` |

As preimagens do objeto R2 estão em `archives/r2-preimages/`; `repair-r2.json` liga
cada arquivo ao hash R2 e R3. `next-task.json`, `ledger-delta-cont-d9ef.md`,
`ledger-delta-addendum-r2.md` e `state.json` ainda refletem o estado pré-R3 e só serão
atualizados depois desta revisão, se ela aprovar; não são achado.

## Critérios

- E1. R2-F01 resolvido: o 2A-TS04 declara o gatilho do relato do schema no fixture
  congelado; o gatilho é único e o momento da leitura não corre contra o `rm` do
  thread (`thread.ts:113-114`) nem contra o `kill` do exec (`exec.ts:260`).
- E2. R2-F02 resolvido: a composição em `cases-2a.json#/composition` e
  `evaluator-r3-contract.json#/clauses[id=R3-06]/composition` é determinística e
  igual nos dois; nenhuma falha de sanidade, captura, ordem ou do avaliador produz
  MISMATCH; é coerente com a base `E/g02/sdk-admission/python/acceptance.py:521-540`.
- E3. Os P3 R2-F03..R2-F06 tratados no reparo estão corretos, e a lista de
  reclassificações em relação ao `judges()` da admissão está completa.
- E4. Sem regressão: valores esperados, âncoras, tabela de predicados (classe e
  oráculo), `known_bad.judged_by` só com client, orçamento, CONTROL e T3 seguem
  válidos; nada afirma execução, recibo, paridade ou autorização inexistente.

## Formato da resposta

Texto Markdown com: veredito (`APPROVE` ou `REVISE`), estado de R2-F01..R2-F06
(`RESOLVED`, `PARTIAL` ou `OPEN`, com evidência), achados novos `R3-Fnn` com
severidade (P1, P2 ou P3), obrigatório sim ou não, local, evidência e correção
sugerida; checagens feitas; limites. `REVISE` só com pelo menos um achado obrigatório
(P1 ou P2).
