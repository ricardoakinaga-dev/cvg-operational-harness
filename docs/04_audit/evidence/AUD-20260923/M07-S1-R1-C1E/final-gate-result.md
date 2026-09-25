# Resultado AUD32 — M07-S1-R1-C1E

**Veredito: `FAIL / OPEN`.** O gate C1E corrigiu o bloqueio de paths e congelou um candidato verificável, mas a matriz B6 falhou no teste de retomada de aprovação; o comando de coverage não publicou percentuais e I1 ficou indisponível. M07-S1 permanece `FAIL / OPEN`, produção `NO_GO`.

## Autoridade e escopo

- O usuário aprovou C1E respondendo “aprovo este gate” ao pedido de aprovação para o gate SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc` e preview SHA-256 `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`. Os dois hashes foram conferidos antes de prosseguir.
- `A24-03-C1E` foi registrada em 0344 antes de código. As únicas alterações de código/configuração desta task, comparadas aos snapshots preservados, são `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`.
- A correção do fixture C1 foi somente leitura durante C1E; seu SHA-256 continuou `ed11c801c19e5eb31f3997b8b202542cdde8593a29cea3587f1e16711601257c`.
- Rollback snapshots permanecem em [rollback-baseline](rollback-baseline/) e [manifesto de hashes](rollback-baseline.sha256). Não houve rollback; o pós-check do candidato passou.

## Candidato e inventário

- Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8`; os três preflights retornaram exit 0. Os logs de versão e durações estão em [command-records.json](command-records.json). Os timestamps UTC exatos dos preflights não foram capturados e permanecem `null`.
- O freeze terminou exit 0. O manifesto contém **977 inputs** e exatamente quatro paths aprovados: policy, scanner, teste do scanner e fixture conversacional. Fingerprint: `58dce96bb29255f77bc99c4f883f8205e4272c2a94cb26d34f10b395ab042501`.
- Verificação inicial e pós-check retornaram exit 0. A comparação entre fingerprint do manifesto e do relatório registrou `match=true`.
- Inventário terminou exit 1 de domínio, interpretado como `PASS_WITH_FINDINGS`: `inventoryComplete=true`, 11 violações visíveis (9 `DEPENDENCY_CATEGORY_MISMATCH`, 2 `MISSING_DIRECT_DEPENDENCY`), `coverage.complete=true`, `gaps=[]` e `unresolved=0`. Isso não fecha S4 nem representa conformance limpa.

## Checks autorizados

| Check | Resultado observado |
| --- | --- |
| Teste focado (3 arquivos) | Exit 1; 24 passaram, 1 falhou. Os testes de scanner e direção passaram; falhou o caso de resume de aprovação em `postgres-store.unit.test.ts:775`. |
| `npm test` | Exit 1; 2.136 passaram, 146 skips, 1 falhou; duração Vitest 296,23 s. |
| Typecheck | Exit 0. |
| Lint | Exit 0. |
| Coverage | Exit 1 pela mesma falha. O diretório C1E/coverage não foi criado e nenhum percentual statements/branches/functions/lines foi emitido; os thresholds 90/85/90/90 não foram aprovados. Duração Vitest 311,50 s. |
| Pós-check do candidato | Exit 0; fingerprint `58dce96bb29255f77bc99c4f883f8205e4272c2a94cb26d34f10b395ab042501`. |

Os testes completos foram executados uma vez cada, sem retry. As variáveis PostgreSQL foram removidas dos comandos de teste. Logs stdout/stderr, exits, durações e skips registrados estão vinculados em [command-records.json](command-records.json); a revisão local dos logs não encontrou credenciais ou dados reais.

## Falha e revisão

O caso que falhou tenta um resume autenticado com `approvalId='different-approval'`. `assertExecutionClaimFresh` rejeita esse mismatch com `STATE_CONFLICT`; o teste C1 preservou a expectativa `WAITING_APPROVAL`. O teste direto de `state.test.ts` também espera rejeição para um approval ID divergente. Portanto, a expectativa do preview C1 conflita com o comportamento e o teste de estado existentes. C1E não tinha autorização para alterar o fixture/conversa, e nenhuma mudança foi feita nesse path. O conflito e a proposta C1F estão registrados em [C1F](../../AUD-20260924/M07-S1-C1F/correction-gate-proposal.md), com a decisão humana em [decision-record.md](../../AUD-20260924/M07-S1-C1F/decision-record.md).

A tentativa de revisão fresh-context I1 foi recusada pelo serviço com `agent thread limit reached`; nenhum parecer independente foi produzido. O registro está em [i1-attempt-01.md](i1-attempt-01.md). A tentativa não é PASS e não fecha B8.

## Critérios C1E

| ID | Estado | Evidência |
| --- | --- | --- |
| C1E-01 | PASS | Diff contra os três snapshots corresponde ao preview; fixture C1 está byte-estável. |
| C1E-02 | PASS | Testes de output C1E positivo, nome não aprovado, diretórios históricos, traversal e symlink executaram no teste do scanner. |
| C1E-03 | PASS | Manifesto com 977 inputs, quatro paths e toolchain C1E vinculada. |
| C1E-04 | PASS_WITH_FINDINGS | Inventário completo, 11 findings, `gaps=[]`, `unresolved=0`. |
| C1E-05 | PARTIAL | Logs e exits da matriz estão presentes; timestamps preflight são null e as operações de snapshot estão resumidas sem duração individual. |
| C1E-06 | FAIL | O teste focado e a suíte completa falharam; coverage não produziu percentuais aprováveis. |
| C1E-07 | PASS | Pós-check sem drift para o candidato congelado. |
| C1E-08 | BLOCKED | I1 `UNAVAILABLE`; nenhum critic aceitou o candidato. |
| C1E-09 | PASS | Sem DB, serviço, rede, dados reais, ação sensível ou produção; G21-5/G21-6 fechados, production `NO_GO`. |

## Gauntlet e próximo passo

O run `m07-s1-c1e-20260924-1` preservou a barra C1E e o run PRD anterior foi arquivado integralmente em `.gauntlet-archive/m07-prd-20260923-1/`. O resultado máximo desta rodada é `FAIL`; não houve Final Critic fresh-context por indisponibilidade do serviço de agentes.

Próxima etapa única: executar a task C1F aprovada, depois de registrada em 0344 e satisfeitas suas precondições. O gate C1F autoriza somente os quatro paths descritos no preview e exige a matriz integral; M07-S1 permanece `FAIL / OPEN` até os critérios críticos passarem e I1 ser aceito.
