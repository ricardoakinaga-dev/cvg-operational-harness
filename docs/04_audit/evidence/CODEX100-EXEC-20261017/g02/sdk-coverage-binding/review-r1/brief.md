# Brief da revisão R1 — DX100-G02:BIND-SDK-OBSERVATIONS-TO-COVERAGE

Crítico: subagente novo, somente leitura. Não grava, não edita e não executa nada
além de leitura de arquivos, `sha256sum` e Python `-I` ou Node 22 para hash e
parsing de JSON. Proibido: serviço, import ou execução de SDK, compilador, Codex CLI,
rede, Docker, PG, git com escrita. O veredito é devolvido como texto e o executor o
grava sem edição em `review-r1/verdict.md`.

Raiz: `docs/04_audit/evidence/CODEX100-EXEC-20261017/` (abaixo, `E/`).

## Objeto (sha256 no momento do brief)

| Arquivo em `E/g02/sdk-coverage-binding/` | sha256                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| coverage-observed.json                   | `34c0e9c05176bab4b1765f22e3a3f381ecd0fd2a76bc9f8a5205b1799ce4a4df` |
| gaps-review.json                         | `a5db1524600718c83314506f40b7df11a61204ec36dbf688595657f5bcd43a13` |
| HOW-next-profile.md                      | `f91f2e0d18a6741c0e2331aaeb333272dd649e4bfc3b7d3f75a76f7df97bbe80` |
| next-task.json                           | `3a9b01ebf3f9968ca36fe918e3ab03269621b6f6604aedddcf5c2052d37edbf5` |
| ledger-delta-cont-d9ef.md                | `ccd32f5f1ffe5502df889e43a8b013773ad21fdc9c7ce6bcdf98d44e1209f322` |
| input-verification.json                  | `8f9972516e072386aae7331e1ee5e9d504793b252624370ebdede1994123bd0d` |
| validation.json                          | `4c90819a7a958fb509f6e05164baa7ac25a0f6a99c94ea7c94097ab4d5b379b4` |
| negative-controls.json                   | `a37203b52d201d5ddd1f7ebbc5d44306b7137bcdb0d7a4b5d1e485664e74f846` |
| verify-inputs.py.txt                     | `6c19ec2960fde15b86e11b2cf92f682fc360e01683f9047350efd67df3b891c6` |
| build-binding.py.txt                     | `0e2cbea3870e2a4f12877aaba077e40bf2e59aade7f8955d1452e97192dadc55` |
| validate-binding.mjs.txt                 | `e67230a8f1df2dc6fd3220ec89190ca2159b1b1766a404e14389a0a3089378b2` |
| negative-controls.py.txt                 | `0869df8b44d0916b58a3a9d8b66ca76f47ba3bd7afff71a5c012e7bc9e6aae48` |

## Fontes autoritativas (somente leitura)

- Tarefa: `E/g02/sdk-admission/next-task.json`.
- Cobertura original: `E/g02/sdk-reference-profile/coverage.json` e `cases.json`.
- Observações: `E/g02/sdk-admission/case-results.json`, `case-results-r2.json`,
  `cases/*/acceptance.json` e `cases/*/acceptance-r2.json`.
- Freezes: `E/g02/sdk-admission/unit-manifest.json`, `checkpoint.json`,
  `source-freeze-r2.json`, `evaluator-freeze-r2.json`, `identity-freeze.json`,
  `repair-r1.json`, `review-r1/review.json`, `review-r2/review.json` e
  `review-r2/executor-disposition.json`.
- Lacunas e contratos: `E/g01/sdk-open-contracts/integration.json`,
  `python-contracts.json` e `typescript/contracts.json`.

## Critérios

- C1. O passo 0 (`input-verification.json`) está correto: hashes do unit-manifest,
  freezes e identidade conferem; a divergência de `python/acceptance.py` frente ao
  source-freeze-r2 e os três arquivos fora do manifesto estão de fato explicados
  pelas fontes, e não escondem deriva.
- C2. O mapa tem os mesmos 44 contratos, na mesma ordem e com os mesmos
  `selected_case_ids` do original; só os 11 selecionados (PY05, PY06, PY07, PY10,
  PY14, TS10–TS15) passam a `OBSERVED_CLIENT_PARTIAL`; os 33 restantes seguem
  `OPEN_REQUIRED_FUTURE_PROFILE`.
- C3. Cada observação aponta para o `acceptance.json` e o `acceptance-r2.json` do caso
  certo, com sha256 correto, outcome `PASS_CLIENT_OBSERVATION`, sem recibo e sem
  paridade.
- C4. **Nenhum crédito ampliado**: `whole_requirement_covered` falso em todas as
  linhas, recibo nulo, paridade 0; os textos `observed_scope`,
  `analytic_branch_arms_observed` e `known_bad_limits` não afirmam mais do que
  `cases.json`, os acceptance e os contratos G01 sustentam; `remaining_open_scope`
  não omite partes relevantes do contrato.
- C5. As seis lacunas em `gaps-review.json` batem com `integration.json`; o status
  `OPEN` e os rótulos de progresso estão justificados; os fatos incidentais são
  verdadeiros e não viram crédito.
- C6. O HOW faz uma escolha explícita entre o lote seguinte de contratos fonte e o
  perfil distribuído, justificada; inclui o peer que responde a pedido sem script
  (known-bad vira MISMATCH) e os P3 R2-F01..R2-F04; não autoriza nada fora do
  escopo; a alocação dos 33 abertos (2A, 2B, distribuído) bate com o mapa.
- C7. `next-task.json` e `ledger-delta-cont-d9ef.md` são coerentes com o mapa, o HOW
  e as fontes, sem afirmar recibo, paridade, BUILD ou autorização inexistente.

## Formato da resposta

Texto Markdown com: veredito (`APPROVE` ou `REVISE`), achados numerados `R1-Fnn` com
severidade (P1, P2 ou P3), obrigatório sim ou não, arquivo e linha ou caminho JSON,
evidência e correção sugerida; lista das checagens feitas; limites da revisão.
`REVISE` só com pelo menos um achado obrigatório (P1 ou P2).
