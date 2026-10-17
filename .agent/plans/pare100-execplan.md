# ExecPlan — PARE100 integral

Objetivo original: implementar integralmente os 36 cartões e oito fases de docs/03_build/0376,0377,0378, atingindo 100% de paridade funcional com o DeepSeek instalado pinado. O objetivo não é reduzido à rodada F0 nem à infraestrutura de provas.

## Contexto e contrato

Direção ADR-010/011, constituição CVG e coordenação. Referência768fb1f3/0.2.0-rc.1, sem copiar código. Bar original gerado dos 36 critérios da carteira e invariantes permanentes, congelado antes de implementação. Dados apenas sintéticos, nenhuma ação clínica/financeira/prontuário/agenda real, sem push/deploy/produção. T3/T4 com autoridade concreta por SPEC/candidata; não fabricar revisão de contrato futuro.

Trabalho no worktree registrado em /tmp/cvg-pare100-exec-current.json. Root anterior preservado; .gauntlet/.agent históricos não são o controle desta rodada. O novo Gauntlet usa .gauntlet do worktree e um integrador exclusivo. Agents fresh fork_context=false, modelo herdado, no descendants; 3 builders e 1 slot de reviewer. Shared contracts/ledgers/manifest/lock sob Lead.

## Concrete Steps

<!-- active_action_id: PARE100-EXEC:PLAN-TEST-CLEANUP-RECOVERY-0224 -->

1. PARE100-EXEC:PLAN-TEST-CLEANUP-RECOVERY-0224 — elaborar somente mapa documental de falhas/cleanup e estratégia coerente sob task T1 test-cleanup-recovery-r1; unidade anterior REVISE após2reworks, sem novo código/PG/critic ou gate inferido. Preservar36cards/bar41/302expectativas.

2. Congelar folhas semânticas da matriz e mapear gaps aos cartões originais, sem converter catalogação em PASS de paridade.
3. Preparar/revisar SPECs concretas do kernel único, contenção real, contratos legados e transportes SDK; executar os gates de autoridade aplicáveis antes de BUILD T3.
4. Continuar F1–F7 conforme a carteira integral, verificar artefatos públicos e auditoria independente; marcar goal completo apenas com todas as evidências exigidas.

## Verificação e recuperação

Cada lane retorna diff próprio, comando/exit, logs/hash e limitações; self-review não aceita a lane. Criar critic novo com contexto não herdado e sentinel do escopo. Depois verificar integração/typecheck/lint/unit/PG/E2E/coverage/cert necessários em candidata isolada limpa, sem artefatos de terceiros. Não repetir checks passados sem mudança/falha/risco novo.

Antes de recuperar, ler 99/20/30/coordenação e estado de execução PARE100; conferir handles live e fingerprints. Timeout de observação não encerra job e nunca autoriza reiniciá-lo. Todos os registros antigos permanecem históricos. Se root driftar, não sobrescrever; replanejar integração por arquivos próprios.

## Progresso

- SPEC0221 R2 —16/10: R1I1REVISE/P1/P2/P2 corrigida em desenho (settlement/snapshot, capability/fila e shutdown admission). Novo I1APPROVE_SPEC_FOR_HUMAN_REVIEW,32pares/33packet/seteextras/10outputs recomputados, todosSPNOT_RUN; pedido humano novo emitido/respostaPENDING, semBUILD.0220pendente/217aprovada intactas,36critérios/2DONE_LOCAL/34abertos/paridadeNOT_MEASURED. Dois críticos fechados, sem novo app/PG ou runtime.

- SPEC0221 —15/10: recuperação anterior somente leitura/NO_PROGRESS. Nova fundação pública PG proposta para015/020; API/header/cut/ownership/fence de writers antigos/flush/erros/adoption/rollback e22famílias futuras, 75bindings preservados. I1fresco em crítica,29inputs selados e465pins íntegros. Nenhum runtime/migration/checker alterado; aprovação220 continuaPENDING, goal36 aberto.

- 14/10/2026: objetivo integral ativo; baseline ca565391, root somente alterações documentais próprias anteriores; worktree novo e dependências copiadas, sem install/lock mutado. SPECs T2 e bar preparados; lanes ainda aguardam execução.

- Progresso14/10: SPEC0211/0212 aprovadas explicitamente e BUILD iniciado; controls132+2 focusedPASS, SDK em construção; coletor quatroP1 corrigidos19tests, críticoR1FAILretido e nova revisão executável recusada por ferramenta; comparação reply realDSH iniciou. Gates iniciais verdes passam a históricos depois de alterações T3; goal integral continua ativo e sem aceite.

- 15/10: I1 exercitou reparos dos controles; novo SDK-lifetime EOF red3/green; pipeline100 diagnóstico; cobertura-r4PASS histórica antes do último SDK; boundary36diagnostics precisa0215T3; coletorR9FAIL→R10fix; bijeção44132 IDs preservada,5605projetados; SPEC0214REVISE3P1+1P2, semBUILD.

- 15/10 rodada adicional: I1 fonteSDK/controles1072+9PASS; exemplo124PASS/compiled-r4; CIbuffer5PASSI1; boundary46 aindaINCOMPLETE; SPEC0214R3/0215R3 em rechecagem antes de T3; rolecollectorR12 emBUILD T2; all36 aindaNOT_PROVEN.

- 15/10 continuação integral: R22 I1scoped136+18PASS, integraçãoW136PASS/live44132rawidênticoR20; matriz inicial44132 procedimentosPENDING,117propostas/1pendente. Certificação congelada1017504c em execução real; R1/R2 falhas de preparação preservadas. SPEC217 R1REVISE4 e218R1REVISE2 em correção/rechecagem, sem BUILD novo ou paridade medida.

- 15/10 checkpoint adicional: 0218aprovada3ac5f374,14arquivos implementados; I1R1PASS47+15, R2fixturePASS47+oráculos e fronteira/lint/format,19176inputs/50links intactos. Fonte atualPython qualificada apenas em foco; candidata integradaR5 será emitida, sem transferirR4préPython. R4unit4116/1skip,coberturaPASS ePGpendente; skipPG021 provado separadamente1PASS. SPEC217R3SHA1e5df502 emrecheck técnico121inputs, semBUILD.

- 15/10 integração principal: baseline113porhash/backups30 e smoke público compilado reais PASS. R4nativo16PASS/CONDITIONAL_GO préPython; R5NO_GOformatação/15PASS preservada. R6first5PASS ePython47separadoPASS. I1baselineclosure emcurso; propostaT1deprocedimentosPython será NOT_RUN, sem inventar equivalência. SPEC2171e5df502/d75da9e7 aguardarespostahumana, semSQL0029.

- Fechamento local 15/10: R6native16PASS, fonte1976/artefatos38intactos, PGpróprioencerrado; Python14 ePUBLICAPI integradosRoot com47+7/lint/fronteiraPASS. P100001/002DONE_LOCAL sobI1 ecritériosoriginais; FCLI001+CIperfileabertos em050. Bar36/oitofasesmantido,paridadeNOT_MEASURED; gatehumano217pendente semBUILD.

- Recuperação R5 —15/10: fontes/provas posteriores ao checkpointR4 reconciliadas; corrigido vínculo S1 com pedido confiável e compatibilidade de roles sem grants novos, inventárioRLS e finalização idempotente de prova de processo. Cert217R1 interrompida por falhas confirmadas, fonte/logs preservados, PG próprio limpo; revisão atualI0,49inputs preparados paraI1. Proposta0220R2 atualizada sem ativação do checker; paridade integralNOT_MEASURED e34cartões continuam abertos.

- Recuperação R8 —15/10: R7I1APPROVE_SCOPED_BUILD e testes terminais39store+10lifecycle/5worker recuperados; deltaHOME10PASS, fonte465pins estável. Proposta0220R3 recomposta75+4sites/497inputs, R1/R2 preservadas, 12pins históricos216 recuperáveis por SHA. Crítica frescaR8 prospectiva em execução; checker intocado e gatehumano0220 ainda não solicitado para estes novos hashes.

- R9 —15/10: críticaR8 detectou oráculoJSON incompatível comformatação e cleanup do perfil sem deadline; reparo usa tracker,16focoPASS e27asserts originais preservados. SPEC0220R4 recomposta74+4sites/465pins/497inputs, crítica fresca em execução. F-BUILD-001delta mínimo implementado e em revisão independente; nenhum checkerBUILD ou gate humano concedido.

- Fechamento R9 —15/10: I1novoAPPROVE_SPEC_FOR_USER_REVIEW da0220R4,16nativosPASS e496inputs estáveis; pinprobes1395 são auxiliares, nuncaQ05final. T3 humano solicitado/respostaPENDING, sem BUILD0220. F-BUILD-001I1APPROVE_SCOPED_DELTA, CLI97+I1 mantido; integração/fullgates futuros. Todosagentes desta rodada encerrados; F01PGpróprio removido0clientes, PG217original reservado para continuação.

- Continuação T1 —15/10: gate0220R4PENDING revalidado sem reenvio. Avançar75folhas de sessão em18procedimentos futuros/13gaps, com44132originais e4UNKNOWN preservados; sem runtime/checker/execução de referência, semPASSfuncional.

- Sessão pública —15/10: propostaT1R3 aceita por I1fresco,75bindings originais/44132denominador/4UNKNOWN intactos,18procedimentos futurosNOT_RUN e13gaps explícitos. R1/R2REVISE preservadas; captura única/defaultread/manifestos/disposal-only/revisão constante corrigidos sem alterar runtime/referência. Três críticos encerrados,0processos de teste nesta lane; gate0220humano continuaPENDING.

- Cobertura padrão R2 —15/10: I1R1 encontrou relatório histórico aceito; reparo exige emissão atual.161foco/10Vitestreal e crítico25+15sondas/controles7,19RED; aceite somente delta,825sentinelas/465pins íntegros. Três agentes encerrados,sem sourceRoot ou gate0220;34cartões/paridadeNOT_MEASURED e gates globais pendentes.

- Falhas nativas R2 —15/10: infraestrutura0213 aprovada scoped por I1fresh após P1/P1/P2R1;19PASS explicit/default,117mutações e4fault23 preservados.17fontesW/465pins/36critérios intactos,2DONE_LOCAL/34abertos,paridadeNOT_MEASURED. Dois críticos encerrados; fonteRoot/gatesglobais/0220 pendentes.

- SPEC0222 R4 —16/10: R3REVISE/1P2 preservada e crítico encerrado; reparo normativo de ownership/detach de signal/timer,27ML/12PLNOT_RUN.43pares/48packet congelados, novo I1fresco01a1434b em revisão; sem BUILD nem pedido humano0222.465pins/493inputs/217/220/221/36critérios intactos,paridadeNOT_MEASURED.

- SPEC0222 R5 —16/10: R4I1REVISE/1MEDIUM de config sem binding no replay confirmado pelas fontes.43pares/48packet/140hashes/11artefatos verificados,12outputs arquivados e crítico encerrado. R5f1443501 propõe versão nativa por digest de binding e40famílias futurasNOT_RUN; I1novo01a14358 em crítica. Sem código/runtime/BUILD/humanquestion0222,465pins/36critérios intactos.

- SPEC0222 R6 —16/10: R5I1REVISE/1P1 de sandbox perdido pelo normalizer confirmado;43pares/48packet/142hashes/trêsextras/59outputs recompostos,60arquivados/22vazios omitidos e crítico encerrado. NovaSPECbbe359fb preserva todos os modos nativos e hashesNONE legados;47pares/52packet/41famílias futurasNOT_RUN. Novo I1fresco01a14366 em crítica; sem código/BUILD/humanquestion0222,465pins/36critérios intactos.

- SPEC0222 R6 —16/10 fechamento técnico: I1fresco APPROVE_SPEC_FOR_HUMAN_REVIEW, Lead153checks/20entradas/hash finalledger/manifest e47pares/52packet conferidos.21outputs arquivados/15vazios omitidos;002truncado parcialmente indisponível preservado como limite, sem reconstruir. SPECbbe359fb/pacote79658209 prontos para decisão humana T3,41famíliasNOT_RUN,semBUILD/runtime/integração/aceite global. Todosseiscríticos de desenho encerrados;36critérios/34abertos mantidos.

- SPEC0222 R6 —16/10 apresentação: uma pergunta nova enviada após pacote concreto e setechecks documentais finais verdes; UIaccepted=true só submissão. RespostaPENDING/BUILDfalse,sem reenvio220/221/222 ou inferência de autoridade. Próxima ação humana exata registrada no recibo,scope integral mantido.

- Sandbox procedimentos R1 —16/10: frente T1 independente autenticou427originais/53fontes,149selecionados;32entradas por símbolo/contrato a quatroprocedimentos futuros,395pendentes e177UNKNOWN intactos. Erro inicial33/source-surface e refinamento undefined/null preservados, pacote18/3pares/55inputs selado, I1fresco01a14380 em revisão. Nenhuma equivalência por nomes de modos ou nova autoridadeCVG; três gates humanos pendentes/34cartões abertos.

- Sandbox R1 —16/10 aceite scoped: I1sem achado/Lead87checks/58artefatos/35cmdmetadata autenticados,59não vazios arquivados/57vazios omitidos e todasfalhas/limites preservados.32propostas/4famílias futurasNOT_RUN,427originais/177UNKNOWN/395pendentes sem aceite semântico; oito rascunhos novos de fonte aindafora do aceite. Crítico encerrado,nenhum runtime/API/codechange ou gatemutado; próxima expansão T1 mantém36critérios e gateshumanosPENDING.

- Sandbox R2 —16/10: oito rascunhos convertidos em cláusulas de facetas e108ligações fechadas,140totais/12procedimentos futuros e287pendentes; base4/32igual,9surface selecionadas/37originais e177UNKNOWN retidos.29packet/11pares/55inputs congelados;I1novo01a1439e em revisão. Sem runtime/codechange/novosgrants ou aceitaçãosemântica; três gates humanos seguemPENDINGsem reenvio.

- SPEC0223 —16/10: taskT2deobservação privada registrada antes do código, hipótese sandbox perdido pela composição pública por capabilities; três casos sintéticos/sem efeitos e OBS-SBX01–05, resultadoNOT_RUN. Em paralelo I1Mencius01a143b3 revisa proposta documentalR3 selada4053e9b5. Nenhuma correçãoT3autorizada, gateshumanos220/221/222PENDINGsemreenvio;36critérios/34abertos preservados.

- SPEC0223 —16/10: attempt03 execução realCVG confirmou perda de sandboxWORKSPACE/gate0/corpo1 versus controle direto gate1/corpo0. InvarianteFAIL, mediçãoI0aindasemI1;1054inputs/465pins íntegros,tipo/lintPASS,11controles de dados rejeitados. Falhas de join/logtopology preservadas; nenhum reparo de produção ou T3executado. R3documental emcríticaMencius01a143b3,fullparityNOT_MEASURED/34abertos.

- Sandbox R4 —16/10: R3I1REVISE/1MEDIUM Landlock/Seatbelt, Lead222checks/27artefatos+manifest verificados e crítico encerrado. Doisbindings reparados com cláusula RUNNER_EXECUTABLE_SELECTORS, manifestec679baa/29/11/55 selado pronto para crítica;12famíliasNOT_RUN. Nietzsche01a143bb revisa mediçãoSPEC0223 independente sem editar11inputs/1054fontes. Nenhumaceite global/T3novo;36critérios/34abertos mantidos.

- Observador0223R2 —16/10: nova infraestrutura test-support com authority/receipt externos,37negativos/1positivo e4falhaslauncher exercitadas; doisruns realCVG invarianteFAIL,1061fontes/465pins intactos. Packet7559d5d5 emI1Newton01a143d0,aceitePENDING. R4documentalREVISE2 encerrada/Lead222checks; R5dc387b70 repara5bindings de timeout/probes sem estreitar140/12NOT_RUN/287pendentes. PrimeirostepobsoletoR2crítico corrigido comhandleatual. NenhumT3novo/paridadeintegral.

- Observador0223R3 —16/10: R2REVISE2P2 arquivada/Lead236artefatos+26/6/1061 conferidos e crítico encerrado. Guardas toolDuration0/journal<=audit refinadas, doisruns reais e40negativos+1positivo+4falhaslauncher passaram; invarianteFAIL sem correção de produção. Packet9743074d emI1Schrodinger01a143dc; R5documental emI1McClintock01a143d9, peak2/depth1/disjunto, sem descendentes. Integração/gateshumanos/globalpendentes,36critérios/34abertos intactos.

- R5documental —16/10 aceite restrito: I1APPROVE_PROPOSAL_SCOPED,Lead222hashchecks/36artefatos/140bindings/27cláusulas recompostos,37arquivos arquivados e crítico encerrado. Aceite03bbeb07 só de proposta futuraNOT_RUN, sem matriz/semântica/API/runtime/ABI/BUILD/global. Falhas/limites scope-kind e after-post/streams/bootstrap preservados. ObservadorR3Schrodinger01a143dc continua crítica separada;24/6/1061imutáveis,36critérios/34abertos eT3pendentes mantidos.

- Observador0223R4 —16/10: R3REVISE1P2 arquivada/Lead441artefatos+24/6/1061 conferidos e crítico encerrado. Modelo temporal local explícito,45negativos/1positivo/4falhaslauncher e28payloads/fullvalidate_run rejeitados, doisruns reais invarianteFAIL. Packet76b64bd9 emI1Hume01a143e8,aceitePENDING. R5documental03bbeb07 aceito só como planoNOT_RUN;36critérios/34abertos/465pins/T3pendentes mantidos, nenhum reparo de produção.

- BUILD0224 —16/10: aprovação humana exata registrada; contratos/codec/CAS/orquestrador/contexto/runtime públicos implementados emW.118focados PASS incluindo três comparações de conteúdo com referência real; quatroPG/processos PASS como prova de store,87artefatos/41hashes recompostos. Candidata61fontes/manifest7449a3f6 congelada paraGaussI1; Herschel produz restart do runtime público em novo teste disjunto. FullunitsRUNNING, tipos/lintPASS antes da última adição de testes, BUILDsemaceite/TRintegrais e gatesglobais pendentes. Próxima ação singular permanece BUILD-TOOL-RESULT-0224;36cartões/34abertos e gateshumanos220/221/222 preservados.

- BUILD0224R2 —16/10: I1R1REJECT com4repros/80artefatos/144sentinelas verificados, reparos implementados e5assertsLeadPASS.143focos/892pacotes/tipos/lint/4PGstorePASS;5retomadaspúblicasPG comSIGKILL ecorpoúnico +1CASracePASS, NULjournalcontinuaRED.63fontes/packet6b16ece0emEuclidI1; controle deversão aponta statusinesperado a resolver apóscrítica. OhmpreparaT1proposta0225semBUILD, container224parado. Globalqualificação/certificação/fullTR/36cartõessemaceite,220/221/222PENDING.

- 16/10 transição de foco: R3corrigiu null e versão semschema; provas atuais156focos/905pacotes/tipos/lintPASS, PGpublic7PASS/1NULFAIL. SPEC225PT foi congelada04b92ba4,25fontes/14provas/6df4e9ab, HarveyI1emreview; futurecodec/migration aindaBUILDfalse eJ01–J16NOT_RUN. Originaldraft/manifeststaleapósfollowup preservados; Leadcandidatefonteautenticadaseparada. Açãoagorareview225, objetivo36cartões e gatespendentesintactos.

- SPEC225 —16/10 prontidão humana: HarveyI1APPROVE_SPEC_FOR_HUMAN_REVIEW/6PASS_SPEC, Lead46artefatos/132inputs recompostos e crítico encerrado. Pacotehash04b92ba4/6df4e9ab pronto; pergunta aindaNOT_SUBMITTEDantesdoschecksT1, semBUILD225. ArendtTR05boundCASprossegue independente sob224, somente novoarquivo/recurso próprio.

- Submissão225 —16/10: perguntaúnicaenviada/UIaccepted=true, respostaPENDING/BUILDfalse. OitochecksT1passaramantesdesubmissão, hash04b92ba4inalterado. Lane224boundCASdeu1focoPASS eLeadverificou1023artefatos/176registros/6snapshots11tabelas/triggersepatrole; globaltypesapósnovoarquivoPASS. Todosagentsencerrados/sóPG224parado; cacheprivado/streamszeradosindexadosfora deprovascanônicas. Próximaaçãoéacompanharreplyreal,semreenviaroupressuporaprovação.

- Recuperação após checkpoint —16/10: integridade final do estado/fingerprint anterior validada por helper (digest7fd8925b), classificação da rodada anterior PROGRESS por conclusão dessa verificação. Retomada atual identificou revisão independenteR3 ausente e campo de submissão225 obsoleto. Nova crítica autorizada224 iniciada em packet67/34 independente; corrigida somente a etiqueta225, sem autoridade nova ou alteração de SPEC.

- R4 —16/10: nova críticaR3 reproduziu replay semjournal. Correção mantém invocação inicial e recuperação confirmada nativa; marca privada do executor preservada nas cópias, helper fora do export público. Tipo inicial falhou apenas campos de schema dafixture, corrigidos; pacote912PASS com exceção explícita dafixturePGatribuída. Candidata inicial c0ad5529preservada e final75c1fecd7780639a2c76f83aa641cf80e3fa909ef02a96d908bc5ffc5a5ab941 congelada. Próxima revisão focadaR4 aindaNOT_RUN; sem aceitefullTR/paridade, NUL/225pendentes.

- R5 —16/10: a críticaR4 encontrou journal vazio tratado como autoridade. ReproduçãoLead2FAILpreservada, guardajournalget corrigida;17assertsLead e14novoscontroles/46focosPASS, tipo/lint/formatoPASS. LorentzI1novo em revisão focada; fonte228d9e5c congelada. Primeiro patch falhou atomicamente por formatting e foi reaplicado, sem mutação naquela tentativa; nenhumafalha apagada.

- R5aceite restrito —16/10: LorentzAPPROVE_SCOPED_RECOVERY/45PASS, sete critérios, Lead107artefatos/302checksdepacket/416fontes transitivas e sete observações críticas recompostos; encerrado. Sem novos defeitos bloqueantes nessa fronteira. R5não concede fullTR/PG/equivalência/global. Próxima ação autorizada amplia evidência JSONpública(TR02) com taskantesdecódigo;225continua pendente eNULFAIL.

- JSONpúblico —16/10: primeira execução expôs42erros de montagem dafixture (campos retornados colocados em opções); corrigidos só no teste e falhas preservadas.75testes do arquivo passaram,43novos cobrem tiposJSON/limites exatos/maisum e recusa de getter/toJSON sem execução. Observador positivo aceito e três cópias adulteradas rejeitadas.67inputsR5 preservados e testeLead snapshotado; Hubble implementa PG real em lane separada, tipo global/revisão apósentrega.

- MatrizJSON integrada —16/10: Hubbleentregou357artefatos/352fontes readonly conferidos e encerrou224;34casosPGobservados12completos/1contexto/4overflow/15invalid/2NULFAIL. Original35testes17PASS18falhas deexpectativa preservadas; fontefinalcca43tipada e congelada, sem execução inferida. HuygensnovoI1vai rodá-la em namespace novo, junto43casosmemória, sobresourceclaim próprio; duasfalhasNUL continuam barrandofullTR.

- JSONR6aceite —16/10: HuygensAPPROVE_SCOPED_JSON_OBSERVATION,43memória/35PGtests,34casosPG com2NULrequiredFAIL. Lead487artefatos/886bindings599fontes e1738checks recomputados, revisorencerrado/224parado. F02accountingmaisforteviacheckeroffline/F03semprocesslossbound/F04SQL42703opcionalretidos; não háfullTR02/06 ouparidade. Próximo gapautorizado épreflightpúblicopróximo8MiB(TR08), taskregistradaantesdecódigo.

- 16/10 R7: quatro observações públicas de capacidade aceitas no escopo após I1 Bohr, sem alterar runtime. Controle privado sem a guarda rejeita duas recusas; tipo/lint e585checks independentes PASS. Limiar exato, saídas máximas e saldos/model admission seguem abertos; próximo task receiptcapacity sob224 aprovado.

- 16/10 R9: observação pública de receiptcapacity aceita no escopo após Sagan I1 em cópia cega/ambiente validado. F1cobrança viva não reconhecida e F2checkpoint não terminal exigem preflight nativo antes do débito; próxima task registrada sem código. Fonte71R9 e cortes R8/R7 preservados; programa integral aberto.

- 16/10 R10: preflight local do recibo antes do débito e handoff terminal aceitos no escopo após I1/controle negativo.10focados+18I1/976regressãoPASS126SKIP, tipo/lint e1095checks independentes PASS. Cache externo inicial do revisor excluído da evidência primária, ressalva explícita; metadadosLead corrigidos sem evidência editada. Próxima provaPG registrada, sem recurso iniciado ou promoçãoROOT; programa36 permanece aberto.
