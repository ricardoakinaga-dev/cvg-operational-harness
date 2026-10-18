# SPEC0235 — estado de implementação, não aceite

Autoridade humana específica já registrada. Não pedir novamente. A candidata é `/tmp/cvg-claude100-exec-20261017/ref-port-candidate`, base26d866c3, branchcodex/claude100-ref-port-20261018. Nenhum commit próprio235, probe, contêiner de referência ou Claude com prompt até agora. Código congelado/revisão independente ainda pendentes. Orçamento desta unidade: Lead + builderOhm encerrado + futuro crítico fresco, duas correções de código; nenhuma consumida.

## Fonte escrita

Builder: protocol.mjs, client.mjs, observer.mjs, protocol.test.js — quatro hashes conferidos contra builder/source-manifest.json depois do encerramento,78testes/tipo de testeNode22/lint/formato. Lint completo do Lead ainda não executado.

Lead: schema.mjs/test, evidence.mjs, docker.mjs/test, profile.mjs/test, capture.mjs/test, inputs.mjs/test, run-state.mjs. Última execução R5:153/153 em seis arquivos,zero falhas/skips,Node22; logs/json emlead. R1fundação32/33: ambientejsdom incompatível comBufferNode, teste corrigido para ambienteNode sem mudar safe-io qualificado. PrimeiroTMPDIR apontou equivocadamente para a lane do builder; subdirs únicos foram limpos pelos testes, próximos comandos usam ref-port-lead-tmp.

Faltam controller.mjs, report.mjs e scripts/claude100-reference-port.mjs/README e seus testes. SOURCE_PATHS eminputs.mjs já referencia os arquivos futuros: não executar probe enquanto faltam. run-state.mjs ainda não tem teste próprio. Host Marker foi testado somente como arquivo sintético próprio, sem contêiner; a pasta ref-port-markers700 pode permanecer vazia. Todas as sessões focais terminaram, última48349exit0.

## Interfaces e decisões para concluir

Original build-contract.json b234 preservado; build-contract-r2.json registra terminais e decisões internas. Native argvSHA=SHA(C([file,...args])); envSHA=SHA(C(env)). Versionstdin vazio, portstdin literal; ambos usam mesmoenv. Markers binários de comprimento0 encerram exatamente cada fase/canal e cada body elegível; não contam como bytes. Capture faz join do terminal e do evento confiável porque os streams Docker podem intercalar. Never parse child output as NDJSON.

DockerTransport usa CLI fixo com --hostunixsocket/--configvazio e env construído,≤24calls,≤2s por comando,256KiB aggregate. Attach usa HTTP101 local `/v1.51/containers/ID/attach` e retorna stream próprio: handshake≤2s, stream observado≤30s,cleanup≤5s. API1.51 está na faixa1.44–1.52 observada emdocker version, mas a consulta informativa inicial não explicitou --host; o controlador REAL deve validar a faixa novamente com seu transporte local fixo. Não usar docker attach como comando vivo por30s. Esta interpretação handshake/stream deve ser julgada explicitamente pelo crítico antes de lançamento. Referências oficiais: https://docs.docker.com/reference/api/engine/version/v1.51/ e https://docs.docker.com/reference/api/engine/ .

Quinta request: não há ordinal4 no wire0–3. Builder mantém CAP/nonzero/EOF sem inventar evento; Host deve marcarINFRA_FAILURE/incomplete com trace/exit real e semPORT. Isto ainda é perguntaNP06 para o crítico, sem aceite inferido. Não adicionar campos/tipos à SPEC aprovada.

## Controlador planejado

RunState fornece clock monótono,checks,failures/causas reais e waits; record já clona dados via canonicalJson qualificado para não alterar intents antigos ao atribuir IDs depois. Capture é ligado a cada attachment por origem fixa, com controlNDJSON/stdout separado de rawbinary/stderr; EOF antes deREADY→contenção ausente; EOF semCLOSED em caminho limpo→infra. Falha conhecida do wrapper, como versão divergente, pode encerrar semCLOSED e deve continuarfalha, jamais falselyclean. Julgar esta coerência com o wire fechado antes de lançar.

Preparar inputs/bundle e todos pins antes deDocker. Toolchainfiles são lidos/hashados porFDretido e verificados no fim; source closure≤256/1MiB. prepareInputs precisa devolver manifesto cedo ou readManifest separado para preservar runId em diagnóstico parcial. Fontequalificada0229/Q03/Q04 imutável. CLIexata trêsopções; nenhuma injeção de executor/URL/modelo viaJSON. Test factories internas devem sempre marcar limitaçãoSIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE e CLI usa somente deps reais.

Antes de cada create, write/sync intent próprio exclusivo, nunca retry de create incerto. Responder perda deID poruminspect do nomeexato e exigirlabels/image/config; mismatches não são recursosadotáveis. Cleanup de ID conhecido exige labels/image/nome próprios, stop/remove/inspectausência; falha geraUNRESOLVED/handoff. Deadlinecleanup compartilhado começa antes deSTOP. Markervivo até containers encerrados; depois verify pins e close todosFDs/attachments antes depublicação.

Perfil: observerREADY realP → hostresolve/congela perfil completo → CONFIGUREcliente{P,profileSha,envSha} → READYecho → inspect/preflightpass → versão → zero descendentes via docker top próprio → ARM/ARMED → START_PORT → POST/503FINISHED → END real → STOP/CLOSED/EOF →cleanup. Só a faseport conta. Controller calcula Native START hashes contra perfil e PID/PPID; nativeCode nunca vem do wrapperexit.

Reportwriter deve preservar nativebytes/eligiblebodies e traces com rawNDJSONbase64 + registros de origem. Observações só referenciam REQUEST/RESPONSE reais, com bodysha/bytes conferidos e responsebody/header fixos. Request com RESPONSEFAILED pode aparecer em reportINFRA, nuncaPORT. Body sem evento completo fica como partial noobservertrace, sem observação inventada. Public checks têm13IDs e refs reais; ControlTrace pode carregar inventários de toolchain/stagingHOST, pois rolelist não tem artifact-inventory separado. Cleanup.json pode carregar stagedInventory de raws, sem auto-hashcircular. Validate retainedartifact hashes/bytes, bundle/profile/input refs e frames antes depublicar.

Usar evidence.createEvidence (safe-io fdanchored qualificado) e cap próprio8MiB. Stage report.pending.json, fechar todosFDs e recursos, link exclusivo final. Nenhumpassofalível depois depublicar; no erro deIO/close/link, nenhum reportcompleto enganoso. CLI imprime somente uso/erro antes de eventualpublicação, sucesso silencioso eexitcode do report. Catálogo134 e produção permanecem sem crédito.

Depois de implementação/testes e revisão: freeze/codecritic antes de qualquer wrappermain real/contêiner de referência/Claude; fonteaceitaentãoactuallimitedprobe. Gates integrais Node22 em candidata própria, PG55876/API3390/web4390 reservados/verificarantesdecriar; publicbuild-runtime comTMPDIRref-port-build-tmp se dist necessário, sem tsc extra/cachecompartilhado. Não repetir certify ao editar só docs.

## Atualização de recuperação — 2026-10-18T02:05:40.233527+00:00

Controller/report/CLI/README e testes agora existem, incluindo run-state/CLI.180/180testes Node22 PASS em all-r2, sem skips. all-r1 179/180 preservado: tabela it.each foi corrigida para passar cada argv como uma célula, sem alteração do parser ou weakening. Controller cobre11 cenários simulados, inclusive RESPONSEFAILED e PRIVACY+cleanup. Relatório revalida argv/env/stdin, START/END e bytes de versão. Nenhum contêiner do probe ou Claude iniciado. Builder encerrado, nenhuma correção independente consumida. Código congelado em source-freeze-r1.json para crítico fresco; textos anteriores sobre arquivos faltantes são históricos.

## Correção1/2 — 2026-10-18T02:25:43.198396+00:00

R1PeirceREJECT/seisobrigatórios,16contraprovas;certparcialR1encerradacomárvore8processosvalidada/155brutosarquivados,semcertificaçãofinal. PGpróprio52c19a1b/55876mantido,nenhumClaude/probecontainer. Contratocorrection-r1-contract.mdcongelado;Ohmretomadoapenasbootstrap/CLI+teste. Lead alterouevidence/inputs/controller/report+regressões:todosinsumosfísicospinados,emptybindinventariadoporFD,checagemfísicantesdenativeepublicação,signalsescopados,remoçãoapóswrappernonzero,orphanjoinfalha,proofcheckerrecomputainspect/preflight/namespace/templates/frames/caps/cleanup. AlteraçãofísicaqueimpedepublicaçãocoerentedeixaparcialsemreportfinaleDRIFT_RUNTIME,neversuccess. Cincofocaisphysical-r1PASSantesdepequenowrapdeerroDRIFT/statcleanup,retessetefuturoobrigatório;lintLeadexit0antesdessasescritas,portanto repetirnosourcefreezeR2. Nenhumaceitedasnovascorreçõesainda.
