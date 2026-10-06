# Baseline da execução UP91 — 30/09/2026

Objetivo persistente: implementar todo o [roadmap0363](0363_program_roadmap_2026-09-30.md) e [backlog0364](0364_program_backlog_2026-09-30.md), sem reduzir 52 cartões,83 origens ou13 gates. Release continua **NO_GO**.

Recon concluída em 2026-09-30T05:43:01.750608+00:00. [Baseline com hashes e worktrees](../04_audit/evidence/UP91-EXEC-20260930/baseline.json). HEAD: `f8ccc845e6f177959bc5d40e0cec59c71e595b5b`; bytes locais sujos, não apenas commit, são a referência. Worktrees históricos ausentes no disco não provam integração; commits/metadados e claims preservados.

## Ownership e autoridade — fotografia inicial, com retificações abaixo

| Fatia                      | Holder/superfície                                    | Autoridade atual                           | Ação                          |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| UP91-021-R1                | Codex Builder; runtime e três novos módulos internos | T2 + SPEC0165, organização pura            | BUILD e regressão isolados    |
| UP91-009/010/011           | Codex documentação; SPEC0166                         | T3 antes de BUILD, revisão humana pendente | Elaborar contrato e negativos |
| UP91-012/013/014/015/016   | Codex documentação; SPEC0167                         | T3 antes de BUILD, revisão humana pendente | Elaborar contrato e negativos |
| PR-L04                     | Claude; server/legacy/journeys/config/lockfile       | Claim concorrente preservado               | Somente leitura               |
| Clock0162                  | Claim histórico BUILD e I18 revisão                  | Hash atual não herda aprovação do anterior | Não editar nem integrar       |
| Telemetria0163             | I11 revisão                                          | Revisão T3 atual pendente                  | Não editar nem integrar       |
| Dependências0164           | SPEC existente; lockfile compartilhado               | T3 atual pendente                          | Não editar lockfile           |
| Ledgers99/20/30 e0356/0357 | Alterações de terceiros                              | Handoff próprio                            | Não sobrescrever              |

UP91-001 pronto: baseline/ownership registrados, hashes conferidos e caminho independente identificado. Gates T3/T4 exigem conteúdo revisado/autoridade específica; pedido amplo não inventa essa evidência. Não foi concedido GO de produção, uso de dado real, push ou deploy.

## Barra e execução

A barra congelada de todo o programa está em [quality-bar.json](../04_audit/evidence/UP91-EXEC-20260930/quality-bar.json); planejamento original é evidência histórica. A máquina Gauntlet será inicializada exclusivamente no snapshot, preservando a `.gauntlet` preexistente da raiz. Estado contínuo próprio: `.agent/state.json`; backlog canônico continua0364. Nenhum segundo backlog mutável é criado.

Sem resultados de implementação neste baseline. Próxima ação: UP91-021-R1 BUILD T2 e preparação paralela de SPECs T3. Certificação final, infraestrutura, validação externa e piloto continuam necessários.

## Retificação de autoridade observada após a baseline

A coordenação F05 registra aprovação humana T3 em29/09 da SPEC0164 no hash`e485c7d37354ca33a9054ad47d05ec0aa8e601358f0f779cac70ed097705e6bd`, condicionado à liberação/claim exclusivo do lockfile. O hash atual coincide, mas o cabeçalho da SPEC ainda diz HUMAN_T3_APPROVAL_PENDING/BUILD_NOT_AUTHORIZED. Registrar essa divergência documental; não revogar nem pedir novamente aprovação já registrada, nem declarar lockfile liberado. Gate/ledgers e SPEC alheia permanecem somente leitura. Advisory/delta fora desse contrato exige análise própria; aprovação desse corte não cobre alterações extras ou release. A tabela inicial descreve a leitura do cabeçalho antes dessa reconciliação, não inexistência de autorização anterior.

## Retificação e continuidade — rodada 3

A tabela inicial não substitui a autoridade posteriormente reconciliada: o pacote F05 registra a aprovação humana sintética da SPEC0164 no hash `e485c7d37354ca33a9054ad47d05ec0aa8e601358f0f779cac70ed097705e6bd`, condicionada à liberação e claim do lockfile PR-L04. Não há novo pedido da mesma aprovação nem liberação presumida. As novas revisões 012,0170 e lote7 permanecem pendentes no seu hash.

[Relatório corrente](../04_audit/evidence/UP91-EXEC-20260930/round3-report.md):8novasregressõesconectadas/I1localaceito, native867485b8unit2.494/PG288/E2E12PASScomoobservações;certglobalFAILsememissão, kernel97,15/globalB87,84. [Gauntlet3](../04_audit/evidence/UP91-EXEC-20260930/gauntlet-round3-record.json) FAIL/I1globalREJECT,wholeownartifactFP86da…pre/postigual,ACTIVE/FIX_RETEST. Parent52/83/13e149barintactos;T1HYGfatiaconcluída,noparentAAA/go.

Lead manteve recursos e claims próprios para continuidade; ledgers99/20/30/0190/0356concorrentes recebem [handoff](../08_runtime/handoffs/up91_execution_20260930.md). Última rodada teve progresso concreto; goalintegral permaneceativo, semblockedthreshold satisfeito.
