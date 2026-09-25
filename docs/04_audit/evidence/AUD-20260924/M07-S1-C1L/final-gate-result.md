# Resultado final — M07-S1-R1-C1L

- **Veredito:** `FAIL / OPEN`; execução encerrada por baseline drift fora do escopo.
- **Autorização:** instrução do usuário registrada no decision record e vinculada ao pedido SHA-256 `0a6dd3efa5bc3a45b8e42062680b338e58e3b4e45a924dd177d6a12b77601f6c`.
- **Falha que encerrou o gate:** `candidate-freeze-initial` retornou exit `64`. O scanner informou: `workspace-dependency-audit: R1 candidate rejected: baseline input drift: docs/02_spec/0190_spec_validation.md; candidate reports stale or changed baseline inputs`
- **Evidência do drift:** `docs/02_spec/0190_spec_validation.md` tinha SHA-256 `1cb32b47f9bfb66417fc71bd423a12427d87adde5838497c40c4b64cce45990c` na baseline C1J; no início da execução C1L, o SHA-256 observado foi `9e443274378c04d8bc5796456b7731fe1f5992be0c614dc9f81627ee34d7dd06`. O manifesto já classificava o arquivo como `governance-input`; ele fica fora dos três paths de produto aprovados.
- **Candidate:** não criado. Nenhum inventário, teste focado, suíte completa, typecheck, lint, coverage, pós-check ou ciclo de reparo foi executado após o freeze. A regra congelada manda parar se a causa estiver fora do allowlist; atualizar a baseline ou mudar scanner/policy para ignorar esse drift exigiria outro gate.
- **Verificações concluídas antes da parada:** preflight e toolchain (Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8`); snapshots dos três arquivos permitidos; `git apply --check` e aplicação do preview `910f076883f247877845c32fd7b516275789004e145cb63f8112dbf2a53ba44f`; sanitização (`22` logs, zero matches); integridade histórica C1J (`PASS`).
- **Código no worktree:** o preview C1L foi aplicado somente a `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; os hashes atuais e snapshots estão em `run-disposition.json` e `rollback/`. O fixture snapshot-only foi conferido. Como o candidate freeze parou, esses arquivos **não estão validados por testes neste run**.
- **Limites preservados:** M07-S1 continua `FAIL / OPEN`; não houve reviewer, fechamento S1, avanço de M07/M05 nem ação de produção.

Evidências de comandos individuais e hashes: `command-records.json`. A verificação final de integridade do ledger não rodou porque o plano a condiciona a um candidate post-check, que não foi alcançado.
