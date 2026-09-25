# Mapa de autoridade — AUD-20260920-REAUDIT

Este mapa substitui o mapa de `AUD19-012` apenas para leitura do estado
corrente. O documento antigo permanece imutável como evidência histórica do
candidato `d7f5…`.

| Tema                        | Autoridade corrente                                                                | Histórico / observação                                     |
| --------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Regras operacionais         | `AGENTS.md` + `docs/07_agents/AGENTS.md`                                           | nenhuma exceção implícita                                  |
| Estado atual                | entrada mais recente de `docs/99_runtime_state.md`                                 | entradas anteriores são históricas                         |
| Decisão da nova auditoria   | `docs/04_audit/0565_code_reaudit_2026-09-20.md`                                    | `0564` é baseline anterior                                 |
| Plano/roadmap/backlog       | `0331` / `0332` / `0333`                                                           | `0328`–`0330` encerraram `AUD19`                           |
| Candidato certificado AUD19 | `certification/phase10-result.json` + `candidate-manifest.json` para `d7f5…`       | artefato histórico, não deve ser reescrito                 |
| Phase 4                     | `certification/logs/historical/2026-09-16-phase4a/frozen-anchor.json` para `6185…` | não confundir com candidato Phase 10                       |
| Phase 4A                    | `docs/phase4a/evidence/CANDIDATE.json` para `df2c…`                                | candidato histórico de 17/09                               |
| Próximo candidato           | inexistente até BUILD, qualificação e freeze autorizados                           | docs desta rodada causam drift esperado contra `d7f5…`     |
| Produção                    | `NO_GO` até nova decisão humana                                                    | nenhuma task `AUD20` concede produção                      |
| Dados reais/efeitos         | proibidos pelo AGENTS                                                              | approval/handoff continuam obrigatórios                    |
| `G20-1`                     | prompt humano corrente                                                             | autoriza somente BUILD local/sintético de `001`–`018`      |
| `G20-5`                     | inexistente nesta rodada                                                           | `019/020`, externos, piloto e RPO/RTO continuam bloqueados |

## Regras de supersessão

1. Fonte histórica nunca é editada para parecer corrente.
2. `certification:verify` prova coerência do certificado e compara a árvore
   atual; depois desta entrega documental, drift em relação a `d7f5…` é
   esperado.
3. Um novo certificado exige novo candidate ID e novo run; não se faz rebind
   silencioso do certificado `AUD19-016`.
4. Decisão técnica e autorização humana permanecem separadas.
5. Validação externa e piloto dependem de `G20-5`, mesmo que todos os gates
   internos passem.
