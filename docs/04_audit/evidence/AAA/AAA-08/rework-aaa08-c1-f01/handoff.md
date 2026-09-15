# Handoff do rework AAA-08 / AAA08-C1-F01 → coordenador

- Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW** (não DONE; sem autoaprovação).
- Escopo: somente o binding capability/action/resource. Nenhuma outra task iniciada; nenhum registro compartilhado (ledger, backlog, runtime, log, 0327) alterado; nenhum arquivo de outros agentes editado.
- Contrato: `aaa_execution_contract.md` rev2 `9df1a05f…` **preservado**. O binding é proposto como adendo versionado em `contract-addendum-proposal-action-binding.md`; revisão obrigatória antes do consumo como contrato congelado.
- Paths exatos alterados:
  - `packages/policy-engine/src/capabilities.ts` — mapa fechado `CAPABILITY_ACTIONS` + `actionMatchesCapability`; alias `read` declarado apenas para capabilities `*.read`.
  - `packages/policy-engine/src/engine.ts` — `action_capability_mismatch` depois de tenant/resource e antes de grants/role/documentos.
  - `packages/policy-engine/src/__tests__/capability-scope.test.ts` — matriz negativa/positiva.
  - `packages/policy-engine/src/__tests__/policy-engine.test.ts` — actions canônicas/alias declarado; nenhuma barra reduzida.
  - `packages/agent-runtime/src/__tests__/capability-action-binding.test.ts` — regressão de fronteira pública com executor falso.
  - `runtime.ts`, `grants.ts`, `packages/policy/` e contratos: inalterados.

## Resultado do finding

| Antes (probe do coordenador)                                                  | Depois                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| `modify` + `draft` + `confirm/reschedule/cancel` → `ALLOW/executed/1 chamada` | `DENY action_capability_mismatch` → `denied/0 chamadas` |

- Preservado: `modify`+draft permitido (executa com 1 chamada no falso); `cancel` legítimo `REQUIRE_APPROVAL`; `confirm/reschedule` `DENY capability_not_granted`; tenant mismatch tem precedência; policy de tenant não expande.

## Comandos e exit codes

| Comando                                                    | Exit  | Resultado                                                             |
| ---------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| probe antes (`node --import tsx action-binding-probe.mjs`) | 0     | contraexemplo confirmado (3x ALLOW/1)                                 |
| RED focado                                                 | 1     | 6 falhas preservadas                                                  |
| GREEN focado pós-formatação                                | 0     | 4 arquivos/38 testes                                                  |
| probe depois                                               | 1     | 3x DENY/0; exit 1 porque o contraexemplo mudou                        |
| runtime+chaos                                              | 0     | 3 arquivos/27 testes                                                  |
| `npm test`                                                 | 0     | 177 arquivos/904 testes PASS, 27 skips preexistentes                  |
| `test:coverage`                                            | 0     | 86,44/81,55/89,72/87,53 (acima do config; barra v2 numérica pendente) |
| `typecheck` / `lint`                                       | 0 / 0 | PASS                                                                  |
| `prettier --check` (arquivos alterados)                    | 0     | PASS                                                                  |
| `git diff --check`                                         | 0     | PASS                                                                  |

## Hashes do novo candidato

Em `rework-aaa08-c1-f01/changed-hashes.txt`; manifesto completo em `rework-aaa08-c1-f01/manifest-rework-c1-f01.json`. Evidências anteriores (`manifest.json`, `review-coordinator-r2/`) preservadas sem alteração.

## Revisão independente pedida

1. Reproduzir o probe e confirmar `DENY`/zero chamadas nos três casos.
2. Refutar o mapa de aliases: existe alguma action legítima não declarada?
3. Conferir a ordem tenant → resource → action → grants/role/documentos.
4. Confirmar `modify`+draft permitido, `cancel` com aprovação, `confirm`/`reschedule` sem grant.
5. Revisar o adendo antes de tratá-lo como contrato; se rejeitado, o rework deve ser revertido/reescrito.

## Bloqueios e limites

- Nenhum gate de produção, dado real, provider/canal ou ação sensível foi tocado.
- `format:check` global segue vermelho apenas em `apps/api/src/server.ts` (janela AAA-15), não nos arquivos deste rework.
- AAA-07 continua aguardando a revisão final de AAA-05; AAA-09/10/11 não iniciadas.
- Próxima ação: revisão independente deste rework e do adendo; integração dos registros pelo coordenador.
