# AUD0625-F06B-BUILD-D9 — o oráculo do servidor de falhas aceita o corpo governado

Base `claude/aud0625-wave2` @ `bfe7b3e73`, nota [0232b](../../../02_spec/0232b_model_fault_server_governed_body_note.md) aprovada pelo integrador (Claude DF) por delegação em 29/10/2026. T2, só teste; Node 22.23.2; sem push; produção `NO_GO`. A SPEC 0232 e o digest congelado `8f8ecd29…` não foram editados: a extensão é aditiva e opcional.

## Mudança

- `tests/support/model-fault-server/contract.js`: `validatePlan` aceita o campo opcional `governedSystem` (único valor válido: `true`; qualquer outro falha antes do `listen`). `governedInstruction(caseId)` = `CVG_SYNTHETIC_INSTRUCTION:<caseId>`. Com o campo, o corpo esperado é `[system, user]`; sem ele, é o corpo de um só `user` de sempre. `index.js` e `index.d.ts` exportam/tipam o novo.
- `tests/model-fault-server.test.ts`: sai o wrapper `withoutGovernedSystem`. Os 6 casos que passam pelo gateway (MF01 `ok-json` e `chunked-json`, MF02 `rate-limit`, `timeout`, `disconnect`, `invalid-json`) usam um plano governado: o prompt aprovado tem o texto da instrução, o provider real fica atrás de um espião que registra o `ProviderRequest`, e os testes afirmam o `promptBinding` (`promptId`, `promptVersion`, `registrySha256`, `rendererVersion`, `instructionSha256` da instrução, `renderedInputSha256`) e `input.system`. A chamada direta ao provider envia o mesmo `system`, então as duas requisições do mesmo plano batem byte a byte.
- Novo bloco MF08 (12 testes): digests de plano e de corpo sem o campo iguais aos congelados (`planSha256` `7ffc7543…`, `requestSha256` `7690b85c…`); corpo governado exato (system + user); servidor governado aceita o corpo governado e registra o digest; corpo antigo recusado com o campo e governado recusado sem ele (400, histórico vazio); corpo governado com outra instrução, sem system, com dois, com user antes, só system, ou com `assistant` no lugar é recusado sem reter o conteúdo; `false`, `1`, `'true'`, `null`, `{}` e `[]` no campo falham antes do `listen`.

## Provas

- `tests/model-fault-server.test.ts`: 57/57; mais `packages/model-gateway`: 14 arquivos, 246/246.
- Mutações ([mutations.txt](proofs/mutations.txt)): aceitar qualquer valor, corpo governado sem o `system`, `system` depois do `user`, campo sempre governado, campo recusado, instrução alterada, binding perdido no espião e campo obrigatório: todas mortas (a do campo obrigatório quebra o carregamento do arquivo de teste, "no tests").
- typecheck 0, eslint 0, prettier ok (Node 22).

## Observações

- A gravação (`planSha256`/`requestSha256` do `recipe`) de um plano governado muda por construção; nenhuma fixture existente usa o campo.
- O `docs:check-links` da base tem 1 link quebrado herdado da 0263 (avisado ao DF, que o corrige na wave2).
