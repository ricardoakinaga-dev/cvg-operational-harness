# Roadmap AUD29 — ponteiro corrente AUD52 — 24/09/2026

Estado corrente AUD52: C1L parou com exit 64 no candidate freeze porque `docs/02_spec/0190_spec_validation.md` diverge da baseline C1J. Nenhum candidate ou teste de produto foi produzido; resultado `FAIL / OPEN`. Veja o [resultado C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md). S2/S3/S4 e M05 permanecem bloqueadas; produção `NO_GO`.

## Sequência por dependência

| Onda                               | Foco e tasks               | Saída verificável                                                                                                         | Gate de saída                                                                                                                                                                                   |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D0 — reconciliar C1F e decidir C1G | A29-01–A29-06, A29-11      | C1F `FAIL / OPEN` preservado; decisão C1G registrada; preflight interrompido antes de código                              | Decisão C1G e resultado fail-closed registrados.                                                                                                                                                |
| D1 — correção do candidate replay  | A24-03-C1H/C1I/C1J         | C1H parou por baseline stale; C1I parou por referência C1H residual; C1J executou com candidate e checks locais aprovados | C1J mantém S1 aberta porque C1J-08/09 ficaram `UNAVAILABLE`; C1K terminou `STOPPED_UNAVAILABLE`; C1L parou por drift de baseline fora do allowlist e requer packet separado para reconciliação. |
| D2 — revisão e fechamento S1       | A29-06                     | I1 independente e Final Critic separados sobre o candidate final; adjudicação B8                                          | Ambos aceitos e demais critérios críticos PASS; reviewers foram recusados por limite de threads.                                                                                                |
| D3 — continuação M07               | A29-07, A29-08             | S2/S3 fronteira neutra e exports, depois S4 corrige 11 findings por contrato/lote                                         | Gates específicos S2, S3 e S4; não herdam C1.                                                                                                                                                   |
| D4 — institucionalização           | A29-09, A29-10             | Perfil de scanner aceito no CI e navegação derivada verificável                                                           | SPEC/gates próprios, candidate final sem drift e revisão pertinente.                                                                                                                            |
| D5 — programa original             | M05 → L09 → P1–P7, H01/H02 | Composição pública sintética e demais 50 melhorias segundo 0340/0341                                                      | M07 aceita primeiro; fases externas dependem das decisões G21 e de gates próprios.                                                                                                              |

## Critérios de parada e gate corrente

- C1 e C1E são tentativas históricas; C1F executou a matriz e permaneceu `FAIL / OPEN` por proveniência incompleta e I1 indisponível. Seus outputs são preservados.
- C1G foi aprovado e interrompido no preflight TypeScript; detalhes e logs estão em [final-gate-result](../04_audit/evidence/AUD-20260924/M07-S1-C1G/final-gate-result.md). O pacote C1H corrige o root do capturador e usa evidence dir novo.
- C1I foi aprovada e interrompida no candidate freeze por referência indefinida a `C1H_NPM_VERSION_FILE`; nenhum candidate downstream ou teste existe. C1J foi aprovada e executada; seu candidate e checks locais estão em [resultado](../04_audit/evidence/AUD-20260924/M07-S1-C1J/final-gate-result.md). Os dois reviews obrigatórios ficaram indisponíveis, e C1J não pode ser repetida sob o mesmo gate.
- C1G conserva os thresholds 90/85/90/90 e quatro additions aprovadas contra R1; não inclui manifest, fonte de produto ou alteração do fixture conversacional.
- O inventário B3 pode continuar `PASS_WITH_FINDINGS` com 11 achados visíveis; isso não fecha S4 nem autoriza conformance limpa.
- I1 precisa examinar os bytes/evidências do candidato final. Falha do serviço ou revisão própria não satisfaz B8.
- M05 não recebe handoff antes de M07 aceita. G21-5/G21-6 fechados e produção `NO_GO` em todas as ondas.

## Ritmo documental

Em cada onda, registrar resultado e hashes em evidência nova; atualizar backlog da task, execution log e runtime state por último. Navegação (`0300`–`0302`, índice e README) acompanha apenas o estado corrente. Históricos S1/R1/C1E/C1F/C1G/C1H/C1I/C1J permanecem preservados. A [próxima etapa concreta](0348_next_stage_c1_decision.md) registra o pedido C1K; as seções antigas conservam seu contexto histórico.

**Próxima etapa singular:** decidir o packet C1K pelo SHA-256 `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`. Nenhum review começa antes dessa decisão hash-bound; C1J não se repete e M07-S1 continua `FAIL / OPEN`.
