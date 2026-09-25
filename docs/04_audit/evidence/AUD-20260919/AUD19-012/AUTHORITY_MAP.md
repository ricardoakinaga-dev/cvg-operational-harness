# Mapa de autoridade e supersessão — AUD19-012 (2026-09-20)

Fonte canônica por tema; em conflito, a fonte marcada `AUTORIDADE` vence e as
demais são lidas por supersessão explícita, nunca apagadas.

| Tema                             | Autoridade                                                                     | Suplentes / histórico                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Pipeline e regras operacionais   | `docs/07_agents/AGENTS.md` + `AGENTS.md` (`AUTORIDADE`)                        | —                                                                                                 |
| Estado corrente do programa      | `docs/99_runtime_state.md` (entrada mais recente, `AUTORIDADE` para "agora")   | entradas antigas = histórico                                                                      |
| Backlog do programa              | `docs/03_build/0330_audit_20260919_backlog.md` (`AUTORIDADE`)                  | `docs/30_backlog_master.md` (espelho executivo)                                                   |
| Plano/roadmap                    | `0328`/`0329` (`AUTORIDADE` documental)                                        | —                                                                                                 |
| Identidade do candidato Phase 4  | `certification/phase10-result.json` `candidateId` (`AUTORIDADE` congelada)     | `PHASE_4_HANDOFF.md`, `GATE_VALIDATION.md` (devem citar a âncora; gate `verify:phase4a:identity`) |
| Identidade do candidato Phase 4A | `docs/phase4a/evidence/CANDIDATE.json` no re-freeze `AUD19-016`                | `df2c0b1a…` histórico de 2026-09-17                                                               |
| Aprovações dos críticos 4A       | `docs/phase4a/evidence/RESULT.json` + `critics/INDEX.md` (`AUTORIDADE`)        | textos `PENDING` = estado pré-relatório                                                           |
| Política de dados                | `AGENTS.md` "Nao usar dados reais" (`AUTORIDADE`)                              | menções a "anonimizados" lidas como fixture sintética (notas `AUD19-012`)                         |
| Postura de produção              | `NO_GO` até gate humano posterior explícito (`AUTORIDADE`)                     | menções a AAA-21 = histórico                                                                      |
| Certificação global corrente     | `npm run certification:verify` (`AUTORIDADE` mecânica; hoje `CANDIDATE_DRIFT`) | `phase10-result.json` = artefato histórico coerente, não certificação atual                       |

## Supersessões registradas neste programa

- `AUD19-001/HASH_TRANSITION.md`: 9 hashes de formatação.
- `AUD19-002`: `GATE_VALIDATION.md` digest `…d9f7…` → âncora `…0665…dbba73e`.
- `AUD19-012`: README (seção Estado atual), índices `0300/0301/0302`
  (`WAITING_HUMAN_APPROVAL` → `IN_PROGRESS`), 13 links `](../` → `](` nos
  registros mestres, política de dados (`0109` + notas em `0490`/`0491`),
  `critics/INDEX.md`.
