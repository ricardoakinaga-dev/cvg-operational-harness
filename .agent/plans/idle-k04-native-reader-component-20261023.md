# Leitor nativo privado — ExecPlan

<!-- engineering-framework: active_action_id=NR-PROFILE-R2-DISPOSITION-RECON -->

## Purpose / Big Picture

Entregar componente interno que verifica um addon produzido de fonte e lê o
estado real de Promise sem observar propriedades. Demonstração: build real,
loader real, testes adversariais e consumidor empacotado. Não fecha owner K04.

## Progress

- [x] (2026-10-24T00:24Z) GBrain/claims consultados, claim e task com seis inputs.
- [x] (2026-10-24T00:31Z) SPEC/HOW desta unidade e gate privado persistidos.
- [x] (2026-10-24T00:36Z) Implementado e verificado:52focais, doisTS100%, TSC/lint/formato e consumidor packed PASS; falhas iniciais preservadas.
- [x] (2026-10-24T00:40Z) codeR2FINAL APROVE_SCOPED_COMPONENT_R2; I01 fechado focal, ambos críticos CLOSED.
- [ ] Integração/gates amplos obrigatórios abertos; T2 IN_PROGRESS.
- [x] (2026-10-24) Primeira célula distroless verificada em imagens TEST_ONLY derivadas deOCI8f,9artefatos selados e controleGNUbuild-id.
- [x] (2026-10-24) BASE passou em128MiB com hashstream64KiB; OCIlocal8f/29blobsclosure selada apósfalhaspreservadas137/CLI/registry. BuildOCI9ce05358passou masNode1EACCES reveloudirs0444; imagem reprovada/oldCIDremovido.
- [x] (2026-10-24) Grupo funcionalassembly1/1 eexec97076terminal0: archiveonly2dirs0555/9files444,NI01–05PASS;GOOD07f0e51f/BADfb1e9978,2containers0/removidos,12506entrieseach(base12495+11) eFD19stable.
- [x] (2026-10-24) Dois rebuilds rastreados emA/B reproduzem17352B24453e/manifesto/metadata;3.372s/2.369s<30,2725headerpinsiguais/8originaisintactos,nenhumaddonload.
- [x] ArtifactR1 Bohr REVISE2P2 → grupo único de metadados → R2FINAL ACCEPT_LOCAL_OBSERVED_PROVENANCE_WITH_TP04_PARTIAL; 22 inputs preservados, reviewer CLOSED, builds2/2/reviews2/2, zero jobs. TP04 forte continua parcial, sem prova de bytes no uso ou continuidade integral de namespace.
- [ ] Novo perfil de inputs/namespace imutáveis: registrar metodologia/task/gate/freeze antes de executar; não recompilar nesta rodada nem recuperar fatos históricos por amostragem posterior.
- [x] K04-IMMUTABLE-BUILD-PROFILE: SPEC/task/gate/claim antes do código, 3.092arquivos/27aliases/661dirs pinados no tar252825600B, grupo único de preparação1/1 encerrado; observerdiscovery0 preservado/semrerun. Ohm01a16b8b revisa oito inputs congelados antes de qualquer imagem/worker. Nada compilado neste NOVO perfil ainda.
- [x] OhmR1FINAL REVISE/NO_GO R1-F01/P2timeoutmataPIDimediato. CLOSED,8inputsintactos,imagemworkerCPP0; nãoexecutar/repararfreeze. Diagnóstico separado uma campanhaOS/doiscasos0.152785s/exit0 reproduziu netovivo apósparentkill e controlekillpg/reap;4PIDs/2PGIDsausentes. Engine cancellation NOT_PROVEN.
- [ ] Nova metodologia de archive/load offline semBuildKit e contenção real de clientes/containers, gate e review disponível reconciliado; não reabrir ou renumerar rodadas anteriores.
- [x] Nova unidade K04-IMMUTABLE-LOAD-PROFILE: SPEC/task/gate/claim antescódigo; archive252835840B/imageIDb2bc9b57/DiffIDff092/16inputs pinados,4syntax e4normalizationchecks. SemDockerbuild/plugin/jobs; rootfs/worker/namespace originais imutáveis. Galileo01a16b97 revisaR2/2: prontidãointerimantesexec eúnicoFinal apósraws, mesmosinputssemreparo.
- [x] Únicaexec81228terminal1: hostescapedSIDfixturePASS; load0, configdigestimageinspect1. STOPantesCID/CPP. ReadonlytriageprovaengineIdmanifest9af9→configb2bc+layerff092bytesEXACT, semnovoLOAD. GalileoFINALNO_GO/R2-F01/CLOSED,2/2reviews/repair1/1esgotado/16inputs+33hashesintactos.0jobsreviewers/8clientgroupsausentes; imagemTEST_ONLYretida. Nãoexecutar/editar/retry/R3.

## Surprises & Discoveries

- Builder ainda tem claim PR-L04 sem resposta. Novo componente não o toca.
- CFB tem hold por vulnerabilidade transitiva corrigida pelo peer 0407;
  não usar base antiga como prova de release ou composição corrente.

## Decision Log

- 2026-10-24 Codex: separar fundação privada do owner integral. Contrato
  independente em SPEC.md permite código fiel à autoridade já aprovada;
  alternativa de aguardar originalReturns bloquearia também trabalho sem
  dependência desse contrato. Nenhuma decisão humana pendente é presumida.
- Perfil exato inicial e metadados gerados, sem runtime compiler/fallback.
  Custo: exige qualificar outras pernas e integrar entrega posteriormente.

## Outcomes & Retrospective

Implementação privada R2 congelada, reviewfinal aprovado. T2 amplo
IN_PROGRESS; não há aceite de produção. R1 aprovou contrato privado e apontou
I01/cobertura; grupo único1/1 chegou a100% real nos doisTS/52testes. Não reduzir
pisos nem chamar esses focais de unidade global/qualificação atual.

## Context and Orientation

Raiz compartilhada /home/ricardo/Área de trabalho/cvg-operational-harness.
Packet docs/04_audit/evidence/IDLE-CLOSURE-20261023/k04-owner-how/native-reader-component.
Task.json contém paths absolutos da nova candidata detached CFB e runtime.
Somente candidata recebe seis paths novos; evidências/continuidade na raiz.

## Scope and Constraints

SPEC.md e task.json definem autoridade, paths e limites canônicos desta task.
Seguir docs/07_agents/AGENTS.md, agent_coordination, ADR010. Dados sintéticos;
sem modificar pares, lock, builder, exports, owner ou globals. Node22.23.2,
npm10.9.8, cache/config/TMP exclusivos. Sem push/merge. T2 pelo limite nativo.

## Architecture and Interfaces

C++ State puro → produtor controlado → native/manifest+asset e metadados TS
→ preflight privado síncrono → leitor congelado. Instalação confiável, hashes
não defendem contra escritor arbitrário concorrente. Perfil estrito.

## Milestones

### Milestone 1 — entrega/leitura verificável

Build fonte real, preflight, testes NR01–06 e review até2/1. Gates amplos e
integração não são simulados pela focal e permanecem dívida T2 explícita.

## Plan of Work

Criar candidata após conferir instruções. Instalar deps byte-exatas sem
scripts em cache isolado. Implementar produtor/leitor e testes. Executar
compilação/TSC/lint/focais/pack real. Congelar código para crítico enquanto
Lead confere provenance e isolamento. Consumir parecer, corrigir grupo único
se necessário, registrar resultado e GBrain antes de integração futura.

## Concrete Steps

1. [NR-PROFILE-R2-DISPOSITION-RECON] ConsultarGBrain/claims+carteiracanônica
   para localizar responsável/etapa para disporR2-F01 epróximaunidadeidle
   elegível. Fonte: native-immutable-load-profile/OWNER_HANDOFF.md. Reconciliar
   identidadesconfig/manifest/DiffIDs semexecutar/editar/retry/R3do freeze
   encerrado; nãoinferiraprovacaohumanaoriginalReturnsouliberaçãoPRL04.
2. ConsultarGBrain/claims para reconciliar PR-L04 e completarmatriz/entrega
   canônica/proveniênciarelease. Nãoinferir hermeticidade/globalaceite.
3. Manter fullHOW0/2 antesowner, originalReturnsT3pendente e gatesunitPG-E2E
   atuais obrigatórios. Não abrir R3 deste componente ou segundo grupo.

## Validation and Acceptance

| Critério | Obrigatório | Procedimento | Oráculo | Evidência |
| --- | --- | --- | --- | --- |
| NR01–06 | sim focal | SPEC.md, Node22 real/FS/compiler/Vitest/TSC/lint/pack | todos focais passam | packet/results |
| T2 amplo | sim antes fechar T2 | unit/PG/E2E composição atual futura | NOT_RUN aqui | handoff |
| Review | sim | crítico fresco código congelado | scoped approve ou debt | packet/review |

## Risks and Human Decisions

originalReturns pendente; não adotado. Builder ACK pendente; readonly.
Matriz/libc/imagem/29bindings/GC não provados. Instalação imutável é premissa
explícita. CFB hold não é removido por componente puro.

## Idempotence and Recovery

Não recriar candidata se existir: conferir base/status. Nunca apagar outputs
de pares ou substituir raw evidence. Só limpar fixtures próprias encerradas.
Interrupção: task.json, este plano e resultados determinam próximo passo;
retomar processo vivo pelo handle, não lançar duplicado. Nenhum serviço real.

## Artifacts and Evidence

SPEC.md: critérios/gate/contrato fechado. task.json: escopo/inputs/limites.
freeze-r2.json, parent-verification-r2.json e component-r2.patch fixam entrega.
Coverage-group1:52testes/100% em2TS; pack-consumer-group1:106harnessmembers,
tara6b8f90d/51preflightsFD21→21. R1HalleyCLOSED, R2MendelAPPROVE/CLOSED/I01closed.
Deltas99/20/30
seguem handoff own pela regra5; não editar esses ledgers disputados.

Plan revision note, 2026-10-24: nova unidade privada sem reset de budgets antigos.
