# Brief da revisão R2 — DX100-G02:BIND-SDK-OBSERVATIONS-TO-COVERAGE

Última rodada (2/2). Não há novo reparo automático depois desta revisão. Crítico:
subagente novo, somente leitura, com as mesmas regras do
[brief R1](../review-r1/brief.md): não grava, não edita e não executa nada além de
leitura, `sha256sum` e Python `-I` ou Node 22 para hash e parsing de JSON. Proibido:
serviço, SDK, Pydantic, typescript.js, compilador, Codex CLI, rede, Docker, PG, git
com escrita e execução dos scripts `.py.txt`/`.mjs.txt` da pasta. O veredito é
devolvido como texto e gravado pelo executor sem edição.

Raiz: `docs/04_audit/evidence/CODEX100-EXEC-20261017/` (abaixo, `E/`).

## Objeto (sha256 no momento do brief)

| Arquivo em `E/g02/sdk-coverage-binding/` | sha256                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| coverage-observed.json                   | `49de5da5eff593a594c6fb41662b59b501361711a944af9afe7d1d9a9eb8dde5` |
| gaps-review.json                         | `6e6e09edd173a542f78cfa008cb23f950313975233f450745fee7f08b1458c77` |
| HOW-next-profile.md                      | `5bc5b70fcd5bf885579ae94d1e0f3f7a57be6dc629bfae2629bd8f8db3419c64` |
| next-task.json                           | `7c7f4be35b848a399de40270ed020ddb4736e9043c09af65aa7f3d3e237f6088` |
| ledger-delta-cont-d9ef.md                | `29ab0e4adbf63cb222b3f45b3cc68fc7c879446fadeef1d913a2891d8d983138` |
| input-verification.json                  | `f8c0a5b51b44e3177a28e7c8df597857d33b0fce984af4bedf422da21ef0952a` |
| validation.json                          | `73c7d378eb20887f883bb0fde731ff364cbba2efec58950ccd72f8642437d217` |
| negative-controls.json                   | `e3be7a45fff69f973e225b698167098903b2a7c2831ee5ab091a14c0b78f293f` |
| repair-r1.json                           | `d1bf490e9eebcb0b97769050efdf1c6a08c305869a645b2af9930542b2ee82b3` |
| verify-inputs.py.txt                     | `9ee013361397229ebfff0f95232f8f1149365be30d61ddd9bd7c08af8f9789db` |
| build-binding.py.txt                     | `4148c81c5b710e4ff12d8e0ffa17c2fd8581c9511b9e71369fd64e34418f5b9f` |
| validate-binding.mjs.txt                 | `3e86b10a2edbd5d420d31935524d8bf4c2bc9bc5aee922a601679d3bb87a6595` |
| negative-controls.py.txt                 | `4a0a9c834daf72c1f60c0a6e625516fa78d66e42c7892c2f8adcbf0642ffa9a8` |
| review-r1/verdict.raw.txt                | `86ff9c8f8d32196b981dd9aa0395357a7f0e3047313392790dc9c12a4cb89bdf` |

As preimagens da R1 estão em `archives/r1-preimages/` (arquivos `.preimage.txt` e os
quatro scripts), com os sha256 do brief R1; `repair-r1.json` liga cada arquivo ao
hash R1 e R2. Depois do reparo, os JSON e Markdown próprios foram formatados com
Prettier (`--ignore-path /dev/null`, porque `docs/04_audit/evidence/` está no
`.prettierignore`); `gaps-review.json` mudou só de formatação.

## Fontes autoritativas

As mesmas do brief R1, mais `E/g01/sdk-open-contracts/payload-and-goal-facts.json`
(`goal`) e `E/g02/sdk-admission/case-plan.json`.

## Critérios

- D1. Cada achado da R1 (`review-r1/verdict.raw.txt`) foi resolvido de fato, sem
  regressão. Em especial R1-F01 (resíduo de PY14 e PY10; resíduo declarado não
  exaustivo com referência autoritativa ao contrato G01) e R1-F02 (R2-F01 com `<=`,
  falha nunca `MISMATCH`, e só a parte de ordem do R1-F05).
- D2. Os critérios C1–C7 do brief R1 continuam válidos no objeto atual: 11
  `OBSERVED_CLIENT_PARTIAL`, 33 `OPEN_REQUIRED_FUTURE_PROFILE`, 38 documentos de aceite
  com sha correto, seis lacunas `OPEN`, HOW com escolha explícita e carry-over.
- D3. **Nenhum crédito ampliado** pelo reparo: os campos novos
  (`residual_planned_profile_proposal`, `authoritative_residual_refs`,
  `scope_vocabulary`, campos `*_service_r1`/`*_offline_r2`) e a tabela de resíduo do
  HOW são planejamento ou proveniência, não crédito; nenhuma linha passa a cobrir o
  requisito inteiro.
- D4. `repair-r1.json` descreve corretamente as mudanças e as preimagens conferem.

## Formato da resposta

Texto Markdown com: veredito (`APPROVE` ou `REVISE`), estado de cada achado R1
(`RESOLVED`, `PARTIAL` ou `OPEN`, com evidência), achados novos `R2-Fnn` com
severidade (P1, P2 ou P3), obrigatório sim ou não, local, evidência e correção
sugerida; lista das checagens feitas; limites. `REVISE` só com pelo menos um achado
obrigatório (P1 ou P2).
