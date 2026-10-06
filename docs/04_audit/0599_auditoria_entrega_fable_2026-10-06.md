# AUD-0599 — Auditoria da entrega recuperada do Fable

- Data: 06/10/2026. Task: `AUD0599-FABLE-DELIVERY-20261006`, Codex.
- Base integrada: `fd41da5`, mais os oito arquivos recebidos da remediação AUD-0598. Identidade por arquivo no [manifesto recebido](evidence/AUD0599-FABLE-20261006/received-manifest.json) e no [manifesto final](evidence/AUD0599-FABLE-20261006/final-source-manifest.json).
- Veredito: **REJECT para o fechamento integral da parte A; R01–R03 corrigidos nos cenários verificados, dois P2 residuais confirmados. Produção NO_GO.** Publicar código e auditoria não concede aceite da barra 0373.
- Evidência consolidada: [proof.json](evidence/AUD0599-FABLE-20261006/proof.json). Revisão independente: [Hume](evidence/AUD0599-FABLE-20261006/independent-review.md).

## Escopo, autorização e método

O usuário pediu auditoria, commit e push da entrega recuperada. A rodada revisa a remediação existente e a veracidade dos levantamentos; não implementa as dez condições da [barra 0373](../03_build/0373_barra_producao_harness.md). Segue AUDIT, com escrita documental T1 e adoção seletiva do delta já autorizado no claim KERNEL-PLUGINS. O adendo de `ApprovalExecutionPort.release` deriva daquele pedido de remediação registrado; esta auditoria não inventa aprovação nem altera política.

Critérios congelados antes dos resultados: [SPEC 0181](../02_spec/0181_kernel_plugin_contract.md), I4/I5/I9/I11/I12; R01 pausa após reserva com aprovação real e uso único; R02 último slot após aprovação pendente; R03 uma tentativa de encerramento quando checkpoint/registro de etapa rejeita; R04 perda de log visível com negação preservada; fechamento da própria etapa na negação retomada. Inclui gates do monorepo, PostgreSQL efetivo e recuperação dos relatórios. A conformidade integral exige retirar as duas falhas esperadas do worker.

Execução em worktree detached própria, Node 22.23.2, dependências copiadas para instalação física própria, PostgreSQL 16 descartável em `127.0.0.1:55721`, com `PHASE4A_DISPOSABLE_PG=1` e `PHASE4A_PG_REQUIRED=1`. A [conferência das dependências](evidence/AUD0599-FABLE-20261006/dependency-receipt.json) encontrou 304 pacotes instalados na versão do lockfile, zero divergências e 50 entradas opcionais ausentes; não houve npm ci nesta rodada. Dados somente sintéticos; nenhum provider, canal, dado real ou deploy. Sete arquivos recebidos permaneceram byte-exatos. No oitavo, o teste novo de retomada, foi aplicada somente formatação Prettier após falha do check inicial. Nenhuma correção semântica foi feita pelo auditor.

O histórico já commitado tem sete commits acima de `origin/main`; seu código integrado participa da regressão geral. Não se afirma reauditoria individual das 174 pendências da rodada SYNC. O branch corrente é `aud0578-remediation-20260926`, não `main`; a publicação autorizada usa `HEAD:main`, fast-forward, sem mudar branch, reescrever histórico ou integrar PR-301.

## Recuperação da sessão

Foram encontrados dois `SubagentHandback` completos nas três transcrições indicadas pelo usuário. A terceira transcrição termina em leituras, sem handback. Os dois relatórios foram arquivados sem carregar a transcrição inteira nem depender do cache para futura leitura:

- [Condição 4, sessão de operador](evidence/AUD0599-FABLE-20261006/opus-condition-4.md).
- [Condições 5 a 9](evidence/AUD0599-FABLE-20261006/opus-conditions-5-9.md).
- [Proveniência e hashes das transcrições](evidence/AUD0599-FABLE-20261006/transcript-provenance.json).

São levantamentos históricos sobre `34387c1`, não provas do checkout final. A extração de `packages/agent-runtime` já foi commitada em `4950a27`; a dependência documental da parte B em 0372 ficou desatualizada. Isso libera a dependência de integração, mas não entrega a parte B. A correção das probes públicas foi integrada em `adb9679`; `main.ts` continua sem bootstrap de sessão. O cache GREEN e suas revisões não foram promovidos nem herdados como aceite desta rodada. A [sonda de sessão](evidence/AUD0599-FABLE-20261006/session-proof/results.json) reproduziu a fronteira sem store e seu controle com store sintético por injeção Fastify; não é execução do processo oficial em produção.

## Disposição de R01–R04

| Item              | Resultado atual             | Evidência e limite                                                                                                                                                                              |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD0598-R01       | CLOSED no escopo verificado | Adaptador e máquina reais: pausa após reserva preserva APPROVED, retomada executa uma vez, pausas repetidas e replay recusado. Prova adicional da porta release com autoridade PostgreSQL real. |
| AUD0598-R02       | CLOSED no escopo verificado | Aprovação pendente → aprovação → pausa no checkpoint ou após reserva → retomada com maxToolCalls=1: COMPLETED, contador 1, corpo 1.                                                             |
| AUD0598-R03       | CLOSED no escopo verificado | Checkpoint e recordStep rejeitam: uma tentativa not_started, sem reserva nem efeito; inclui log indisponível. A falha original permanece visível.                                               |
| AUD0598-R04       | PARTIAL / OPEN              | Negação antes da reserva preserva o motivo com INSUFFICIENT_EVIDENCE. Após reserva, o single-pass perde o motivo, AUD0599-F01.                                                                  |
| Adendo 0181 §11.4 | PARTIAL / OPEN              | Com log saudável, a negação fecha a própria etapa. Com falha de log, ela permanece WAITING/RUNNING, AUD0599-F02.                                                                                |

As oito sondas da AUD-0597 foram copiadas byte-exatas, SHA-256 `1d18cb388a3d809358fcb4cd924efdddef8cae73a82c35d05803a816e1f8760b`. As cinco sondas da AUD-0598 também passaram. As 31 regressões referidas na entrega são 13 da remediação anterior, 11 novas e sete de aprovação durável em memória. Elas não cobrem os dois contraexemplos abaixo.

## Achados residuais

### AUD0599-F01 — P2: single-pass perde o motivo da negação após reserva e falha de log

**Esperado:** SPEC 0181 §11.3/R04: INSUFFICIENT_EVIDENCE deve preservar o motivo da negação e o fato de não haver efeito.

**Observado, confirmado:** aprovação e reserva reais → guarda nega → append de `tool/result` rejeita. Resultado INSUFFICIENT_EVIDENCE, corpo zero, aprovação FAILED, uma tentativa de encerramento. A resposta contém apenas a indisponibilidade do log e perde o marcador do motivo. Controle equivalente antes da reserva preserva o motivo.

**Causa:** [kernel-runtime.ts](../../packages/harness/src/kernel/kernel-runtime.ts:517) substitui a resposta por `pipeline.logFailure.response`. É lacuna residual do caller, sem alegação de nova regressão demonstrada. Impacto: operador perde a explicação do bloqueio no caminho de falha de auditoria; não foi demonstrada execução indevida.

**Remediação BUILD:** owner KERNEL-PLUGINS, preservar informações da negação também no resultado reservado. Aceite: mesma sonda após begin, INSUFFICIENT_EVIDENCE, motivo presente, corpo zero, settlement terminal e uma tentativa de fechamento. Prioridade P2, OPEN.

### AUD0599-F02 — P2: negação retomada com falha de log deixa etapa aberta

**Esperado:** SPEC 0181 §11.4: negação de uma etapa retomada fecha essa mesma etapa como FAILED, com motivo, sem registrar etapa concorrente.

**Observado, confirmado:** espera de aprovação → negação de política + falha de `tool/result`: checkpoint terminal INSUFFICIENT_EVIDENCE, corpo zero, etapa WAITING. Aprovação expirada depois de pausa no checkpoint: mesma falha deixa etapa RUNNING. Os controles com log saudável terminam a etapa original como FAILED, com `errorCode` correspondente.

**Causa:** [pipeline.ts](../../packages/harness/src/kernel/pipeline.ts:265) cria um KernelStop sem a causa original; [iterative-dispatch.ts](../../packages/harness/src/iterative-dispatch.ts:426) não entra no ramo de recordDenial. Impacto: checkpoint e estado da etapa divergem, comprometendo diagnóstico e recuperação; nenhum efeito foi executado nas reproduções. Não se declara regressão diferencial contra o parent.

**Remediação BUILD:** owner KERNEL-PLUGINS, preservar a causa e finalizar a identidade da etapa também quando o encerramento do log falha. Aceite: política negada em WAITING e aprovação expirada em RUNNING, ambas combinadas com log rejeitado; mesma stepId/stepNumber, status FAILED, errorCode da negação, checkpoint INSUFFICIENT_EVIDENCE, motivo visível e corpo zero. Prioridade P2, OPEN.

Hume executou 12 cenários próprios em Node 22, sem racional do builder e somente leitura. O lead reexecutou o runner em output próprio e confirmou os mesmos achados. [Resultados independentes](evidence/AUD0599-FABLE-20261006/reviewer/results.json), [reprodução do lead](evidence/AUD0599-FABLE-20261006/lead-repro/results.json) e [prova PostgreSQL da porta release](evidence/AUD0599-FABLE-20261006/pg-proof/results.json). A última valida persistência da aprovação, reconstrução do adaptador, reserva antiga e replay; não é ensaio de pausa/crash do runtime completo com PostgreSQL.

## Verificações

| Verificação                                            | Resultado                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Suíte completa exata, Node 22 + PostgreSQL obrigatório | 349 arquivos; 2.830 PASS ordinários + 2 falhas esperadas; zero skips             |
| PostgreSQL separado                                    | 35 arquivos; 288 PASS; zero skips                                                |
| Foco final                                             | 109 PASS ordinários + 2 falhas esperadas; 8 sondas originais e 5 adicionais PASS |
| Regressões 13 anteriores + 11 novas + 7 duráveis       | 31 PASS                                                                          |
| Catálogos API/plataforma e guard de manifests          | 3 arquivos; 4 PASS                                                               |
| Typecheck e lint                                       | PASS                                                                             |
| Formato dos oito arquivos finais                       | PASS; falha inicial do teste novo corrigida somente com Prettier                 |
| Revisão independente e reprodução do lead              | 12 cenários; dois P2 confirmados, REJECT_SCOPE_TWO_P2                            |
| Porta release com autoridade PostgreSQL real           | 2 cenários PASS; reserva antiga e replay recusados                               |
| Gitleaks 8.28.0, entrega/evidência                     | zero achados; escopo local, sem scan da imagem                                   |
| npm audit --omit=dev                                   | PASS, zero vulnerabilidades                                                      |
| npm audit completo                                     | FAIL, source-map-js 1.2.1 high em desenvolvimento                                |
| Bootstrap CI sem dependências                          | FAIL confirmado: zod importado antes de install                                  |
| Links/higiene documental                               | PASS na rodada; checagem final registrada na evidência                           |

O Vitest contabiliza os dois `it.fails` conhecidos como aprovados; estão separados dos PASS ordinários. C06/I6 e C07/I7 do GovernedAgentRuntime continuam sendo lacunas, não aceite. A rodada SYNC havia perdido um arquivo de catálogo por timeout; os catálogos da API e da plataforma foram agora executados separadamente.

A primeira execução geral incluiu acidentalmente a sonda adicional da auditoria dentro de `packages/harness/src/__tests__`. Seu import de `@cvg/approval-engine`, não declarado naquele workspace, fez o guard de manifests falhar. É contaminação do harness de auditoria, não defeito imputado à entrega. Resultado FAIL preservado; as sondas extras foram retiradas da coleta geral, o guard passou e a suíte foi repetida sobre os oito arquivos finais exatos. Não houve alteração de manifest, dependência ou teste do produto para esconder a falha.

## Revalidação dos levantamentos e da barra 0373

| #   | Situação nesta rodada                | Evidência ou lacuna atual                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NON_COMPLIANT                        | Dois it.fails do worker continuam; dois P2 de logging/etapa impedem fechamento integral da parte A.                                                                                                                                                                                                                   |
| 2   | GATES_LOCAL_PASS                     | Gates locais desta rodada na tabela acima; falhas esperadas não equivalem a conformidade.                                                                                                                                                                                                                             |
| 3   | NOT_REVALIDATED                      | Não foi repetida a pilha NODE_ENV=production com papéis separados e smoke completo no candidato/imagem finais.                                                                                                                                                                                                        |
| 4   | NOT_IMPLEMENTED no bootstrap oficial | main.ts passa resolver/telemetria, sem store; sonda Fastify sem store: login/protegida 503 e live 200; controle com store sintético: login/protegida 200 e sem sessão 401. Correção de probes públicas já integrada. Promoção GREEN segue em outra frente; não integrar PR-301.                                       |
| 5   | NON_COMPLIANT                        | Consulta antes da publicação: main em 283ab74, sem proteção; Verify e Security falharam. Reprodução sem node_modules confirma ERR_MODULE_NOT_FOUND zod antes de install. 19 alertas high abertos: oito em código ativo, onze históricos. A decomposição histórica de nove no handback é inexata; total confirmado 19. |
| 6   | PARTIAL                              | npm audit --omit=dev: zero vulnerabilidades; audit completo: source-map-js 1.2.1 high, fix >=1.2.2. Nenhuma prova de scan da imagem final. Scan local desta rodada restrito à entrega publicada, sem reatestar histórico inteiro.                                                                                     |
| 7   | NON_COMPLIANT                        | Dockerfile final bookworm-slim com shell e healthcheck em forma shell; build-runtime contém API e não worker. Sem imagem do mesmo candidato qualificada nesta rodada.                                                                                                                                                 |
| 8   | NOT_VALIDATED                        | test:restore continua in-memory; há script de dump/restore real, mas nenhuma nova prova da cadeia audit_events.kernelAudit no candidato restaurado. HashChainedAuditLedger.verify valida seus registros em memória.                                                                                                   |
| 9   | NOT_IMPLEMENTED                      | Heartbeat existente renova lease, não mede worker vivo; health conta pending sem idade. Sem scheduler/entrega de alerta de parada comprovados. Limiares e destino reais continuam decisão humana.                                                                                                                     |
| 10  | PARTIAL                              | Pausa/retomada iterativa corrigida nos cenários com aprovação real; parte B do worker e ensaio operacional não entregues.                                                                                                                                                                                             |

O audit completo aponta [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). A vulnerabilidade está marcada `dev:true` no lockfile e bloqueia o job supply-chain, embora o audit de produção passe. Não foi modificado o lockfile. Os alertas de rate limit #6/#7 possuem parecer local anterior de falso positivo, mas continuam abertos no GitHub; esta rodada não os dispensa nem altera proteção de branch.

Próximas frentes: fechar F01/F02 e reauditar parte A; executar parte B agora que a extração está commitada; promover bootstrap sob seu claim; corrigir pre-install CI, dependência e findings ativos; produzir imagem/scan/backup/alerta e ensaio operacional no mesmo candidato. As recomendações dos levantamentos são propostas, não implementações entregues. Publicação e CI do novo SHA são registrados separadamente na evidência; CI enfileirado ou falho não vira PASS.

## Publicação

Entrega `28ffc269493aff64990aa0803581ea485523d53b` e os sete commits locais anteriores publicados por push normal `HEAD:main`, de `283ab74` para `28ffc26`, com exit 0 e confirmação por `git ls-remote`. [Recibo](evidence/AUD0599-FABLE-20261006/publication.json) e [log](evidence/AUD0599-FABLE-20261006/push-delivery.log). O adendo de recibo é documental, sem mudança dos oito hashes de fonte avaliados. Não houve force, deploy, promoção de bootstrap ou aceite de produção. O [Verify do SHA publicado](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/37502885930) falhou no Initialize candidate/run bar por ERR_MODULE_NOT_FOUND de zod, confirmando a reprodução local. Security estava em execução na captura, sem aceite. Os bloqueios da barra permanecem.
