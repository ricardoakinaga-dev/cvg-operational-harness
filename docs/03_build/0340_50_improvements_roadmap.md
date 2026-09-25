# Roadmap por fases e sprints — 50 melhorias — 23/09/2026

> Atualização da reauditoria em 23/09/2026: M07-S1 foi executada e terminou `FAIL`; a sequência corretiva atual é [0343](0343_reaudit_m07_roadmap.md), com [backlog delta 0344](0344_reaudit_m07_backlog.md) e [próxima etapa 0345](0345_next_stage_m07_correction.md). Este roteiro de 50 IDs permanece como carteira de base; M05 só recebe handoff após M07 auditada e aceita.

> Estado corrente AUD52 (24/09/2026): C1L foi executado e parou por baseline drift em `docs/02_spec/0190_spec_validation.md`, fora do escopo aprovado; nenhum candidate ou teste de produto foi produzido. Consulte o [resultado C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md) e o [backlog corretivo](0344_reaudit_m07_backlog.md). M07-S1 segue `FAIL / OPEN`; M05 permanece bloqueada por M07; produção `NO_GO`.

## Leitura

Este roteiro detalha o [plano executivo](0339_50_improvements_executive_plan.md) e referencia as 50 fichas do [backlog](0341_50_improvements_backlog.md). A ordem é por dependência e risco, não por prazo de calendário. A lista de origem é [0568](../04_audit/0568_50_melhorias_priorizadas_2026-09-23.md).

Cada sprint entrega um slice auditável, atualiza documentação e aponta uma próxima task. A passagem entre sprints exige que a task anterior tenha status real e evidência. Nenhuma fase externa inicia por inferência do PASS local. G21-5 e G21-6 continuam fechados.

## Visão de sequência

| Fase / sprint                        | IDs                          | Resultado verificável                                                        | Gate de saída                                                                |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P0-S0 — Verdade documental           | M01                          | Índices 0300–0302, 0337 e 99 reconciliados                                   | COMPLETED_DOCUMENTAL; novo freeze necessário                                 |
| P1-S1 — Contracts e composição       | M07, M05, L09                | Grafo de packages, manifests e caminho público caracterizados                | SPEC por slice; smoke sintético da composição                                |
| P1-S2 — Fronteiras de código         | M02, M03, M04                | API, PostgreSQL e loop repartidos por responsabilidade sem mudança semântica | Caracterização, typecheck, lint e regressão                                  |
| P1-S3 — Reuso e compatibilidade      | M09, M08, M06, M20           | Contratos de approval/capability, segundo consumidor e versões mistas        | Conformance, crash/replay e rollback local                                   |
| P2-S4 — Conhecimento e conversa      | M10, M11, M12, L05           | Proveniência, estado de diálogo e corpus integrado sintético                 | Evals com fonte, handoff e limites explícitos                                |
| P2-S5 — Operação visível             | M16, M17, M18, L06, L07, L08 | Trace no painel, aprovação contextual, listagens e métricas claras           | UI/API tenant-scoped e acessibilidade local                                  |
| P3-S6 — Resiliência                  | M13, M14, M15, L01, L02      | Falha de adapters, múltiplos workers, filas e guia de operação               | PostgreSQL descartável, chaos, load e revisão documental                     |
| P3-S7 — Higiene contínua             | L03, L04, L10                | Índices derivados, resumos de ledgers e catálogo histórico                   | Links, proveniência e ausência de alteração histórica                        |
| P4-S8 — Freeze e crítica             | H02, H01                     | Candidato reproduzível e parecer I1 aceito ou bloqueio declarado             | Novo candidato/run, sentinel e revisão independente                          |
| P5-S9 — Autoridade externa           | H04, H11, H13, H03           | Owners, regras de negócio, privacidade e decisão sobre G21-5                 | Assinaturas humanas e escopo aprovado ou BLOCKED                             |
| P6-S10 — Identidade e infraestrutura | H05, H06, H14, H16           | IdP, sessão, secrets e egress qualificados                                   | G21-5 aberto; evidência de ambiente aprovado                                 |
| P6-S11 — Provider, canal e safety    | H08, H09, H10, H12           | Provider, canal, fontes e negações reais qualificados                        | Receipts, handoff, fontes válidas, zero ação sensível                        |
| P6-S12 — Operação externa            | H07, H15, H17, H18, M19      | Worker, RPO/RTO, alertas, audit trail e UX observados                        | Runbooks, restore, paging, trace e parecer humano                            |
| P7-S13 — Piloto e decisão            | H19, H20                     | Piloto assistido e dossiê G21-6                                              | Decisão técnica + humana; produção continua NO_GO até autorização específica |

Contagem fechada: P0 1, P1 10, P2 10, P3 8, P4 2, P5 4, P6 13, P7 2 = 50 IDs. Os IDs são entregas distintas; o fechamento de uma não fecha automaticamente outra.

## Dependências críticas

1. M01 corrige a navegação antes de ampliar o programa; não altera o candidato certificado.
2. M07 caracteriza dependências antes de M05, M02–M04 e M06. M05 prova o caminho público; M08/M09 definem os contratos de reuso; M06 demonstra o segundo consumidor. M20 depende das fronteiras estáveis.
3. M10/M11 fornecem evidência e estado para M12. M16 aproveita correlação existente e deve anteceder H18 externo. M17 depende de contexto de approval preservado; M18 depende de consultas mensuradas.
4. M13–M15 são provas sintéticas de falha e capacidade; não substituem H07/H15/H17. O conjunto P1–P3 exige novo freeze H02; H01 revisa esse candidato exato.
5. H04/H11/H13 produzem decisões necessárias ao pacote H03. A autoridade de G21-5 é separada da decisão técnica local. Sem H03 aprovado, P6-S10–S12 e P7-S13 não iniciam.
6. H05/H06/H14/H16 estabelecem identidade e fronteiras de infraestrutura antes de H08/H09/H10/H12. H07/H15/H17/H18/M19 dependem do ambiente e das integrações qualificados.
7. H19 exige P6-S10–S12 aceitos, kill switch e operador humano. H20 exige H19 e I1 aceito, além do pacote G21-6. Nenhum sprint presume autorização de produção irrestrita.

## Contrato de cada sprint

### Entrada

- Confirmar arquivos e status atuais em docs/99_runtime_state.md, docs/20_master_execution_log.md e docs/30_backlog_master.md.
- Selecionar um ID READY de acordo com o backlog; abrir Discovery/PRD/SPEC da fatia e congelar critérios observáveis.
- Verificar se há gate de ambiente/autoridade ainda fechado. Nesse caso, trabalhar apenas no pacote documental permitido e deixar a execução externa BLOCKED.

### Execução

- Implementar a menor entrega vertical da task, preservando fixtures sintéticas e limites de autonomia.
- Atualizar contratos e documentação junto com o comportamento, sem reescrever evidência histórica.
- Para código, executar gates focados e a barra de sprint exigida pela constituição; para release candidate, repetir o CI bar integral no mesmo run/candidate.
- Registrar o que foi realmente observado; NOT_RUN não vira PASS.

### Saída

- Anexar evidência com run, candidate, ambiente e limitações; fazer AUDIT contra critérios da task.
- Atualizar backlog, execution log e runtime state nessa ordem.
- Entregar a próxima task com ID, fase, dependências, gate, arquivos esperados e primeiro passo executável. Se bloqueada, indicar exatamente a decisão ou evidência que falta e oferecer a próxima task local independente.

## Progresso inicial

Os dois insumos estão salvos em docs/04_audit/0567_documentation_and_implementation_assessment_2026-09-22.md e docs/04_audit/0568_50_melhorias_priorizadas_2026-09-23.md. P0-S0 / M01 está concluída documentalmente. Em P1-S1, M07 Discovery, PRD e SPEC foram aprovados para as etapas respectivas; o gate BUILD M07-S1 foi aprovado, executado e terminou `FAIL` por coverage, com 22 achados de manifests e I1 indisponível. A [reauditoria 0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md) também registra Node 24 no run frente ao Node 22 suportado e limitação de replay do fingerprint serializado. O [roadmap corretivo 0343](0343_reaudit_m07_roadmap.md) governa o próximo trecho. M05 Discovery foi aprovada com rota `/v1/executions` → outbox operacional → worker `operational-harness` → `createOperationalHarness()` e par legado `published-agent`/`kernel`, mas segue M07 e não está pronta para handoff. L09 depende de M05. O gate anterior não autoriza correção de código, manifests ou slices seguintes. M01 alterou arquivos do manifesto REM21-019; H02 precisa congelar novo candidato antes de promoção.
