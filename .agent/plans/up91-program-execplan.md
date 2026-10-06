# ExecPlan UP91 — programa integral

<!-- engineering-framework: active_action_id=UP91-004-R4:REVIEW -->

## Purpose / Big Picture

Implementar integralmente roadmap0363/backlog0364. Qualidade AAA significa evidência atual contra critérios explícitos, não nota inventada. Preservar 52 cartões,83 origens e13 gates; sem produção irrestrita.

## Progress

- [x] (2026-09-30T05:46:00Z) Discovery recon: baseline/claims/authority e evidência UP91-001.
- [x] Barra completa congelada antes de aceitação de código.
- [x] SPEC curta0165 e claim T2 para UP91-021-R1.
- [x] (2026-09-30T07:03:13.544010+00:00) Build T2: recuperação de efeitos e solicitação de approval extraídas; runtime1498linhas, corpos/contratos preservados.
- [x] (2026-09-30T07:03:13.544010+00:00) Gates Node22 executados no candidato d16b83ee:2481unit,288PG,12E2E,15trusted; typecheck/lint/build/coverage/mutações PASS; crítica fresca aprova apenas refactor/metadata.
- [ ] Certificado:14/16gatesPASS,format/securityFAIL e emissãoFAIL por métricasANSI; SPEC0170 preparada, sem BUILD T3.
- [ ] SPECs0166/0167 concretas e revisão explícita T3 antes de suas implementações.
- [ ] Concluir demais52 cartões,83origens e13gates com autoridade pertinente.

## Surprises & Discoveries

Worktrees históricos registrados não existem no disco. Metadados e commits preservados. Root tem mudanças simultâneas; snapshot independente é a baseline executável. Gates T3 atuais não herdam aprovação de hashes antigos.

## Decision Log

30/09: T2 puro progride enquanto T3 é especificado/revisado. Não reduzir tier nem aceite original. Snapshot é descartável e sintético; nenhuma instância compartilhada será tocada. 0364 conserva estado UP91 e0356 PR; projections não possuem autoridade própria.

## Outcomes & Retrospective

Em execução. Candidato d16b83ee executou16gates,14PASS,format/securityFAIL; certifier não emitiu resultado por metrics.unit=null. Artefatos brutos e reprodução preservados. Sem verdict PASS integral; release NO_GO. Não encerrar o objetivo na primeira fatia.

## Context and Orientation

Referências: docs/07_agents/AGENTS.md, docs/03_build/0363_program_roadmap_2026-09-30.md, docs/03_build/0364_program_backlog_2026-09-30.md, docs/03_build/0365_up91_execution_baseline.md. Baseline raiz suja e hash manifesto; snapshots não representam qualificação produtiva.

## Scope and Constraints

Todo programa, priorizado por risco e gates. Paths exclusivos no claim UP91-EXEC. PR-L04, clock/telemetria/deps e ledgers alheios somente leitura. T3 exige revisão de SPEC; T4 exige decisão hash-bound. Não usar dados reais, serviços externos reais, produção, push, deploy ou ações clínicas/financeiras/agenda.

## Architecture and Interfaces

Runtime público preservado na fatia T2. Composição interna recupera efeitos mantendo a mesma options/contexto, algoritmos, chaves, transições, erros e traces. Contratos futuros descritos em SPECs T3 antes de BUILD; não antecipar implementação.

## Milestones

### M0 — baseline/governança

M0 baseline/governança; M1 produto; M2 núcleo cognitivo; M3 desacoplamento; M4 segurança/dados; M5 operação; M6 capacidades sintéticas; M7 candidato; M8 piloto/decisão; M9 expansão. Dependências canônicas em0364 e frozen bar. Marcos finais não podem substituir experiência operacional/humana por mocks.

## Plan of Work

Lead congela barra/estado, prepara baseline e gates; BuilderA concluiu runtime e4módulos; BuilderB reconcilia Discovery/PRD eG03; BuilderC corrige2SPECs sem BUILD T3. Crítico I1 separado, contexto não herdado, somente leitura. Lead inspeciona, integra, executa regressão e aceita somente escopo comprovado.

## Concrete Steps

1. [UP91-004-R4:REVIEW] Concluir crítica da SPEC0174 e submeter seu hash exato à revisão humana T3 antes de corrigir lookup/bodyless; preservar as falhas reais e nenhum BUILD sob silêncio.
2. [UP91-021-R1:VERIFY] Confrontar gates atuais, crítica e falha integral da certificação; conservar subfatiaVERIFY e preparar reparo0170 para revisão humana, sem transferir PASS para programa completo.
3. Revisar SPECs0166/0167 e preparar pedido explícito de revisão de conteúdos T3, enquanto trabalho T1/T2 independente continua.
4. Priorizar próximo gap requerido com hipótese verificável e path livre; não iniciar fatia dependente sem insumo.
5. Registrar fatos/checkpoints, conservar first failure e projetar0364; preparar handoff dos ledgers compartilhados.

## Validation and Acceptance

Gauntlet native manager no snapshot exclusivo. Known-good/bad sentinels validam harness estrutural; alteração de corpo deve falhar. RunTurn e regressões reais; Typecheck/lint/unit/PG/E2E zero skips Node22. Coverage pertinente não reduz pisos. Certify por rodada código antes de encerramento; failure real conserva programa aberto. I1 não substitui pentest externo/humano/piloto.

## Risks and Human Decisions

T3 SPECs novas e T4 infraestrutura/IdP/providers/institucional/retention/piloto/GO precisam autoridade específica. Pacotes concretos antes de pergunta. G03 original em0354 permanece literal até decisão explícita. Trabalho disponível progride sem encerrar objetivo por gates pendentes.

## Idempotence and Recovery

Antes de retomar: conferir state/action/log, claims/bytes/hash, goal/bar/fingerprint. Drift rebaseline nativo com motivo e evidência stale. Nunca reaproveitar PASS de outro candidato nem rerodar inicializador para sobrescrever status. Patch próprio restrito; sem Git destrutivo.

## Artifacts and Evidence

Baseline, bar, projeções, checks, critic, hashes e handoff em docs/04_audit/evidence/UP91-EXEC-20260930. Fonte original do runtime preservada. Estado próprio .agent/state.json e journals append-only; 0364 é fonte de tasks UP91. Historical planning proof permanece imutável.

Checkpoint rodada2: candidato6646a560… executado1021,502s,14/16gatesPASS, kernel505/526=96,01%,10mutaçõesmortas. Parsermetrics.unit:null ainda impedeemissão.34artefatosarquivados; nenhuma alteração de produto além dos testes. SPECs010/011/014/016 revistasHOW documentalmente, críticasfresh em andamento.012/0170 humanos pendentes.

Checkpointfinalcontinuação2: nativeGauntlet round2FAIL/REJECTglobal, pre/post3b117…MATCH.8módulosHOWreadinessaceitosI1,7candidatasnovaspreparadasparasuasrevisõeshumanasnãoenviadas;012/0170pedidosoriginaisPENDING.12nextactions0364atualizadassemalteraraceites/dep/status econtrollerprojetado. SkipgovernanceunitadjudicadoFAIL e3auxiliaresSTALE explicitados. Goalcontinuaativo; semBLOCKEDporquehouvePROGRESSconcreto.

Checkpoint rodada3: native candidato867485b8…,2494unit/PG288/E2E12zero skips,14/16comandosexit0; unitadjudicadoFAILskip3drifts/formato-security3HIGH/parsernullsemcert. Kernel511/52697,15%,globalB87,84sem88margin;8novoscasosI1ACCEPT_TEST_ONLY. HYG5vazios/7rawlayout T1DONE,26→27→28journals reconciliados. HarveyI1globalREJECT,FP86da…pre/postMATCH,nativeGauntlet3FAILvalidACTIVE/FIX_RETEST. Lote7SHA312d…enviadohumanopendente;orig012/0170congelados/authorityvazio. Escopo149intacto,goalativo ePROGRESSneste turn;semfinish/GO/blockedthreshold.

Checkpoint0038: a preparação de testes0173 encontrou dois defeitos de transporte. Probes reais, controle causal Node e adapters públicos sintéticos produziram provas novas; Builder interrompido antes de criar testes. SPEC0174 T3 em revisão I1. Parent/full149 continuam abertos; nenhuma alteração de produto nesta rodada, sem repetir nativecertification inalterada.
