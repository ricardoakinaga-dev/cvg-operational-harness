# Brief da revisão R1 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A

Crítico: subagente novo, somente leitura. Não grava, não edita e não executa nada
além de leitura de arquivos, `sha256sum` e Python `-I` ou Node 22 para hash e
parsing de JSON. Proibido: serviço, import ou execução de SDK, Pydantic ou
typescript.js, compilador, Codex CLI, rede, Docker, PG, git com escrita e execução
dos scripts `.py.txt`/`.mjs.txt` da pasta. O veredito é devolvido como texto e
gravado pelo executor sem edição em `review-r1/verdict.raw.txt`.

Raiz: `docs/04_audit/evidence/CODEX100-EXEC-20261017/` (abaixo, `E/`). Objeto em
`E/g02/sdk-source-batch-2a-spec/`.

## Objeto (sha256 no momento do brief)

| Arquivo                    | sha256                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| cases-2a.json              | `dc74f91e40e6aeae96f84af0d0f99f3308a42227cec9cf97583df04fdc8b229d` |
| coverage-plan-2a.json      | `a345233d317136db698f713a46e7f1651a817fcb6eee51d9287e1cceee734489` |
| peer-v2-contract.json      | `2f886eefc18255155669f89f82db9be718ac63d3f4ade27cdfa6bd07cb14b021` |
| evaluator-r3-contract.json | `a4ac1a48922e54394f4ebfeb20e00fa7740cf6591768b3e2f9d69376a36132b3` |
| capture-contract.json      | `ec84aa7dc81e5301c91e1f6af5f19029aba35236e82ca2b35d5afbe99d7af567` |
| control-slot-contract.json | `bbb49c1ff1f46f8f0117d3c0ffb1355c050eb95984859c95bfb91d447180ada2` |
| execution-budget.json      | `8a8504cb189c823f6fd87f3b686dfe2d11514173b030e8cf12b52a0e32eeb0e0` |
| t3-assessment.json         | `a80247d42e8268d111c98717dbb1910ede4c767021c3150ef52d7bd25b3b9539` |
| next-task.json             | `8d96f504b254f3e3d8883937ebf239b7c35ec76e7c16670196f20e76a2c396ce` |
| ledger-delta-cont-d9ef.md  | `7a83dde5e176eb5aab039032265cc95a43fb59820a86f614fe1b7250544a477b` |
| input-verification.json    | `98c55747838ffb7681f5d896c1232ab062d6df16c3c265d3c0795ef74ec3b586` |
| validation.json            | `b00409dded9fa655e1baa99798a325254a791d3c679f94a4ed85051e0caaaf9d` |
| negative-controls.json     | `19bdcde9c5cdd2679c83a1252bee97693f12668f0e42e2cbd05c9d9c0752ada1` |
| verify-inputs.py.txt       | `c3243618416b3628f0089ee6d5b0b74040961e74bd22863965b97e7b6b650942` |
| build-spec-2a.py.txt       | `64df9cdc6b81a9edf081a099a2e1c5944d760761ed02407b7f5f5f478fa8a5b2` |
| build-contracts-2a.py.txt  | `7d166e29e45e690edcd74525099dadde09296fff193ea1ba9897083552dc30bf` |
| validate-spec.mjs.txt      | `03128328d6c8dc75ac9fc4182675bff45bd7d55d4675a85427f22eb94733b4f6` |
| negative-controls.py.txt   | `124a7dd363e680121379345d0afb1053ebac98d4452c019045ca9711686466f0` |

Os JSON foram gerados pelos scripts e depois formatados com Prettier
(`--ignore-path /dev/null`); a igualdade semântica foi conferida.

## Fontes autoritativas (somente leitura)

- Pedido e HOW: `E/g02/sdk-coverage-binding/next-task.json`, `HOW-next-profile.md`,
  `coverage-observed.json` e `review-r2/executor-disposition.json`.
- Fonte do SDK no pin: `E/g02/sdk-reference-profile/inputs/sdk/typescript/src/*.ts` e
  `E/g02/sdk-reference-profile/inputs/sdk/python/src/openai_codex/**` (vinculadas ao
  identity freeze da admissão).
- Contratos G01: `E/g01/sdk-open-contracts/python-contracts.json`,
  `typescript/contracts.json` e `payload-and-goal-facts.json`.
- Infra da admissão que a especificação estende: `E/g02/sdk-admission/python/*`,
  `node/*`, `fixture-cases.json`, `case-plan.json`, `interface-bindings-v2.json`,
  `errata.json` e `review-r2/**`.
- Regra de trilhas: `docs/07_agents/AGENTS.md` (D-12) e
  `docs/03_build/0384_plano_executivo_paridade_codex.md`.

## Critérios

- C1. Passo 0 correto: a entrega anterior bate com o commit `b70cb6df`; o
  unit-manifest e o identity freeze da admissão conferem; as fontes citadas batem.
- C2. **Valores esperados corretos pela leitura da fonte.** Para cada caso, os
  vetores argv, bytes de stdin, env do filho, mensagens de erro exatas, yields,
  payloads JSON-RPC e resultados (TurnResult etc.) decorrem do código do pin nas
  linhas citadas. Este é o foco principal: um valor errado vira MISMATCH falso na
  execução.
- C3. Âncoras: o trecho existe nas linhas declaradas e o sha256 é o do arquivo citado.
- C4. Os casos cobrem os 14 contratos novos do lote 2A (TS01–TS09, PY03, PY04, PY08,
  PY15, PY16), o resíduo de PY07 e TS10–TS15 e os reforços TS14 e PY10. Nenhum
  contrato do 2B ou do perfil distribuído entra. O plano de cobertura é coerente e
  não afirma crédito.
- C5. Contrato do peer v2: erro JSON-RPC sintético para pedido sem script, com código
  e classe declarados por caso, sem `server_overloaded`, sem faixa -32099..-32000.
- C6. Contrato do avaliador r3: cobre R2-F01..R2-F04 da admissão, com a cláusula de
  que falha de ordem unilateral nunca vira MISMATCH; classes de juiz coerentes.
- C7. Captura (argv, env e /work/tmp no fixture-cli e no supervisor) e vaga CONTROL
  com cliente de controle: especificadas de modo implementável, sem SDK no controle,
  CONTROL como gate.
- C8. Orçamento dentro do máximo (24 vagas, 1 CONTROL, 12 serviços, 2 revisões, 1
  reparo, 0 retries).
- C9. Avaliação T3 conforme D-12 e o 0384, com a pergunta pronta se T3 for exigida.
- C10. `next-task.json`, `state.json` (ainda stub nesta fase) e
  `ledger-delta-cont-d9ef.md` coerentes, sem afirmar execução, recibo, paridade ou
  autorização inexistente.

## Formato da resposta

Texto Markdown com: veredito (`APPROVE` ou `REVISE`), achados numerados `R1-Fnn` com
severidade (P1, P2 ou P3), obrigatório sim ou não, arquivo e caminho JSON ou linha,
evidência e correção sugerida; lista das checagens feitas; limites. `REVISE` só com
pelo menos um achado obrigatório (P1 ou P2). Links para `state.json`,
`review-r1/verdict.md` e `review-r2/verdict.md` ainda podem estar quebrados ou ser
stub nesta fase; isso não é achado.
