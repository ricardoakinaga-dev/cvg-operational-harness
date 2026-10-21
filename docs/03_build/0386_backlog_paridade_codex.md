# 0386 — Backlog de paridade funcional Codex

Atualização vigente18/10/2026: **checkpoint de reinício; drivers SDK parciais, programaIN_PROGRESS**. Fontes preservadas, builder encerrado e serviços próprios0. Diagnóstico PASS_PRIMITIVE_ONLY não qualifica helpers/casosSDK. Retomar a mesma task; seisgaps/509obrigações não qualificados e SPEC0239T3pendente já solicitado.

Programa `CODEX100`, 17/10/2026. [Plano 0384](0384_plano_executivo_paridade_codex.md), [roadmap 0385](0385_roadmap_paridade_codex.md) e [catálogo](tracking/codex100_catalog_v1.json). **Este arquivo possui somente os estados DX100**. PAR permanece no 0380 e C100 no 0383. O mecanismo local0231 foi aprovado explicitamente, implementado e integrado; runtime e paridade funcional globais continuam pendentes.

## Situação vigente — 18/10/2026

Próxima ação canônica (20/10/2026, CONT-20261018-D9EF): preparar o fechamento do cartão DX100-G02 numa unidade própria, que depende de decisões do usuário listadas no [HOW final](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/HOW-final-g02.md). Concluídas localmente, em ordem:

- drivers de observação SDK ([relatório](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-observation-drivers/REPORT.md));
- admissão do perfil, com 19 casos `PASS_CLIENT_OBSERVATION` ([delta](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-admission/ledger-delta-cont-d9ef.md));
- ligação v1, com 11 contratos observados ([mapa](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-coverage-binding/coverage-observed.json));
- lote 2A: [especificação](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2a-spec/state.json) e [execução](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2a-admission/state.json), com o CONTROL em MISMATCH, 19 PASS, 3 MISMATCH atribuídos ao harness e o TS12 como `INVALID_CAPTURE`;
- ligação v2, com 21 contratos observados e 23 abertos ([mapa](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2a-binding/coverage-observed-v2.json));
- continuação do 2A: [especificação](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2a-continuation-spec/state.json) e [execução](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2ac-admission/state.json), com o CONTROL em MISMATCH e 8/8 PASS (case_input pelos bytes congelados);
- ligação v3, com 25 contratos observados e 19 abertos ([mapa](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2ac-binding/coverage-observed-v3.json));
- especificação do 2B ([estado](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2b-spec/state.json)), em dois sub-lotes: 2B-1 com 16 vagas e 2B-2 com 18.
- lote 2B-1: [execução](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b1-admission/state.json), com o CONTROL em MISMATCH e 15/15 PASS, sem capability nova;
- ligação v4, com 29 contratos observados e 15 abertos ([mapa](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b1-binding/coverage-observed-v4.json));
- lote 2B-2: [execução](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-admission/state.json), com o CONTROL em MISMATCH e 17/17 PASS; [decisão do lead](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-admission/lead-decision-f01.json) sobre o known_bad do 2B-PY13E;
- ligação v5: perfil de fonte concluído, com 33 contratos observados e 11 abertos, todos do perfil distribuído ([mapa](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-binding/coverage-observed-v5.json));
- especificação da continuação 3, em C3-1 (15 vagas) e C3-2 (14 vagas) ([estado](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/state.json)).
- continuação 3: [C3-1](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-1-admission/state.json) (14 PASS) e [C3-2](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-2-admission/state.json) (13 PASS); [ligação v6](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-binding/coverage-observed-v6.json), com 33 observados e 11 abertos;
- perfil distribuído 0.153.4: [aquisição](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-acquisition/state.json) (6 de 7, com digest), [especificação](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-spec/state.json), [DP-1](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp1-admission/state.json) (10 PASS), [DP-1R](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp1r-admission/state.json) (PK07B PASS) e [DP-2](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp2-admission/state.json) (5 PASS, binário publicado keyless).
- [ligação v7](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/coverage-observed-v7.json): 44 contratos `OBSERVED_CLIENT_PARTIAL` e 0 abertos, com o pin 0.153.4 e `NO_BUILD_LINK_DECLARED`. A R2 deu REVISE só de texto, aceito como [errata pelo lead](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/lead-decision-r2-p2.json). O [HOW final](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/HOW-final-g02.md) responde "ainda não" ao fechamento do G02: ele depende do G01, de um plano de runners e acessos para as 22 famílias do catálogo e de oráculo e dono por requisito.

Zero recibos funcionais e zero crédito de paridade; as seis lacunas SDK seguem `OPEN`. SPEC0239 aprovada; o BUILD depende de 0029 → 0030 → 0031.

[AquisiçãoSDK concluída](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-profile-artifacts/REPORT.md):7artefatos/7.116.743bytes raw, seiswheels eTS5.9.2;6RECORDs/tags/metadata/closure/301arquivos e169cópiasPython exatas.8contraprovas de dados rejeitadas. Coletor inicial exit1 apósEOF preservado; todosbytes autenticadosoffline,7HTTPtotais/0retries/sem substituição. Bibliotecas nativas ainda não carregadas; sourceclient/SDKdistribuído/CLI separados, nenhum crédito funcional.

[HOW de referênciaSDK](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-reference-profile/DELIVERY.md) concluído no recorteT1/R2/zero obrigatórios:39snapshots fonte/config,19casos propostos e sete artefatos selecionados. PythonclienteRPC eTSclienteJSONLreais, peers sintéticos identificados; tuplas de identidade/captura/contenção/cutpoints/cleanup explicitadas. TypeScript5.9.2transpile+loader não qualifica bundle tsup/typecheck/npm. Casos/SDK/compilador/aquisiçãoNOT_RUN; todos44contratos e seisgapsOPEN. Fonte/locks e metadados não dão crédito funcional.

[ContratosSDK reconciliados](../04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-open-contracts/REPORT.md),36fontes/20Python24TScontratos/350relações estáticas/33modelos declarados. [R2ACCEPT](../04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-open-contracts/review-r2/report.md),15checks/zero obrigatórios após reparar doisP2. Em resume/fork params.threadId prevalece; \_start_turn usa precedência inversa. Goalstartup/cancel/pause/interrupt/retry agora têm contratos/cutpoints explícitos.34contraprovas estáticas e16overlays de dados não são SDK/runtime executados. Seisgaps continuamOPEN; G01 permaneceIN_PROGRESS.

[PacoteT3 daSPEC0239](../04_audit/evidence/CODEX100-EXEC-20261017/g04/native-journey-recovery-plan/decision-packet.md), SHAccdf3a754c460e138307148f9eec79e0dce4a9b7ac5c9d10334716e5b5c0dd87/oitoanexos, segue pendente de resposta já solicitada. Aprovações0221/0225/0231 resolvidas. NenhumBUILD concedido ou fonte/qualificação de owner transferida.

Todos509registros/14CQ/30NJ/19EA permanecemNOT_RUN/nullreceipt. G01/G04/Q01/programaIN_PROGRESS;22famílias/49cartões/10fases preservados. Registros antigos abaixo são históricos quando divergirem desta posição.

## Contrato de execução

- 49 cartões DX100; 86 PAR diretos e 93 no fecho; 27 C100 diretos e 28 fatias técnicas compartilhadas propostas. Status e ownership de origem não são duplicados.
- Catálogo inicial: 379 obrigações funcionais, 22 controles CVG e 657 entradas de superfície. Recibos funcionais permanecem `NOT_RUN`; G01/G02 fecham variantes e referência antes de qualificar os 100%.
- Catálogo candidato corrente: **487 funcionais e 22 controles**, revisão `draft-r3-g01-factories`. Duas obrigações web acrescentadas sem alterar os 507 registros anteriores; o índice de 763 superfícies é o recorte histórico r2, ainda sem fechamento global. Nenhuma obrigação funcional qualificada.
- `READY` significa tarefa documental selecionável: G01. `TODO` não autoriza BUILD. T2 exige task/SPEC curta e checks constitucionais; T3 exige revisão humana da SPEC; capacidade externa real e candidata seguem T4.
- Cada cartão entrega comportamento e prova. “Onde” indica superfície proposta; paths definitivos, APIs, migrations, defaults e limites são definidos na SPEC antes de código. Não é claim de implementação ativo.
- Reuso exige fatia integrada, atual e qualificada. G03 aceita seu recorte e dependências, mantendo segurança e ownership. Se a fatia não for aceita, a dependência permanece aberta.
- Aceite comum: positivos, negativos, erros e estados pertinentes; cancelamento e recuperação quando aplicáveis; regressão; revisão por outro agente no BUILD; evidência autenticada no mesmo SHA/digest/config/fixtures. O verificador deve rejeitar um caso conhecido como errado.
- Capacidade incompatível com regras CVG não vira N/A: registrar divergência literal e decisão de equivalência governada, com rótulos e métricas separados.

## Resumo por fase

| Fase                                  | Cartões DX100 | ROM delta (dias) |
| ------------------------------------- | ------------- | ---------------- |
| F0 — Escopo, referência e decisões    | 4             | 15–30            |
| F1 — Jornada e execução contida       | 5             | 48–105           |
| F2 — Continuidade, contexto e modelos | 7             | 64–140           |
| F3 — Protocolo, SDK e ferramentas     | 7             | 67–144           |
| F4 — Extensões, hooks e MCP           | 5             | 56–122           |
| F5 — Autonomia e code mode            | 3             | 35–74            |
| F6 — CLI/TUI, workspaces e daemon     | 6             | 63–138           |
| F7 — Remoto, mídia e identidade       | 6             | 106–230          |
| F8 — Migração e distribuição          | 2             | 22–48            |
| F9 — Qualificação e aceite            | 4             | 46–96            |

## Cartões próprios

### DX100-G01 — Fechar inventário público e variantes do snapshot

- Estado: `IN_PROGRESS`. Prioridade: P0. Fase: F0. Trilha: **T1**. ROM delta: 4–8 dias.
- Dono proposto: L0 — Integrador: contratos, schema, gates e ledgers.
- O que/por quê: Fechar inventário público e variantes do snapshot. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: tracking/codex100_catalog_v1.json; inventário de superfícies; fonte oficial pinada.
- Como: Percorrer schemas, dispatchers, CLI/TUI, SDK, tools, extensões, cfg de plataforma e flags; resolver cada superfície e expandir payload×estado×erro×plataforma. Conservar debug/removed/development com disposição explícita; não contar stub como função entregue.
- Dependências DX100: nenhuma.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: 22 famílias e todas as superfícies com dono/fonte; zero superfície sem classificação; matriz de variantes versionada e validada por revisão, sem remoção para inflar percentual.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-CVG-21.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Incremento SDK: [contratos de linguagem](../04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/README.md) aceitos no recorte T1 por Archimedes, sem achados materiais/retrabalho. Preservados 37 exports Python/63 candidatos históricos e 34 exports TypeScript; protocolos JSONL headless e RPC app-server separados. Dez pacotes anteriores/460 payloads e catálogo487+22 intactos. Seis gaps recebem evidência de fonte, com runtime/proveniência ainda OPEN.
- Critérios públicos: [179 contratos de aceite](../04_audit/evidence/CODEX100-EXEC-20261017/g01/public-acceptance/README.md) aceitos no recorte documental por AverroesR2 após um P2 corrigido;360propostas documentais de caso,976eixos dispostos,54ainda sem cenário próprio e nomeados. Capturas/oráculos reais e drivers executáveis continuam pendentes.
- Próxima ação coordenada: DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS noG02; aquisição de dados concluída sem fecharG01/G02 ou retirar54eixos e demais lacunas.

- Reconciliação atual: [triagem dos54eixos](../04_audit/evidence/CODEX100-EXEC-20261017/g01/axis-reconciliation/README.md),15literaiscomfonte/26compostos/8governançaCVGseparada/5unknown; todos54OPEN e nenhumcasoescrito. Lead reconferiu37arquivoscontraGit/49citações e preservação54IDs/pointers/donos; crítica semântica finalR2emcurso. Não substituir decomposição103chaves/274selectors/unions por um teste genérico nem excluir eixos de custo/pausa/tenant por falta de contrato literal.

- Fechamento do complemento: [aceite limitado](../04_audit/evidence/CODEX100-EXEC-20261017/g01/axis-reconciliation/ACCEPTANCE.md), CiceroR2/12critérios/zero findings/20inputs reconferidos; atores encerrados/2reviews usadas. Nenhum dos54eixos foi coberto. Próxima prova independente: limitesi64/envelopes em referência contida, com HOW próprio antes de executar; não repetir o diagnósticoG03FAILED nem inferir aprovação0231.

- ReconciliaçãoSDKT1 atual: [aceiteR2](../04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-open-contracts/acceptance-status.json),36snapshots/44contratos/350relações/33declarações,15checks/0mandatory; seisgapsOPEN/0receipts. R1doisP2 reparados uma vez,70/95sujeitos reconstruíveis. Não fechaG01; próximo perfil de referênciaG02.

### DX100-G02 — Autenticar referência executável e oráculos

- Estado: `IN_PROGRESS`. Prioridade: P0. Fase: F0. Trilha: **T1**. ROM delta: 4–8 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: Autenticar referência executável e oráculos. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: fonte8d9f6466, artefato0.163.0 da0620 e futuro test-support Codex.
- Como: Vincular um executável à fonte-alvo por build reproduzível ou decisão explícita de outro pin. Definir testes reais/keyless por família, plataformas e acessos T4; schema/help são só evidência de superfície.
- Dependências DX100: DX100-G01.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Fonte e executável da comparação vinculados; cada requisito tem oráculo e dono do acesso; desconhecidos persistem sem PASS. Driver não usa credenciais/sessões pessoais.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Preparo documental inicial: [receita isolada de referência](../04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/reference/README.md), Rust1.95.0/Cargo.lock/bin codex e artefato autenticado. Toolchain ausente no PATH observado; sem instalação, compilação ou execução do alvo. Versões Python0.153.4/companheiro0.163.0/fonte pinada são identidades distintas.
- Ambiente no checkpoint anterior: [Rust1.95 isolado](../04_audit/evidence/CODEX100-EXEC-20261017/g02/reference-environment/README.md), seis componentes/versões verificados,2480entradas vinculadas por hash,4sondas bwrap e limites reais4GiB/2CPU/128tasks. Cinco scopes próprios inativos; nenhum Codex compilado/executado, sem instalação global ou PATH alterado. Essa preparação não fecha G02 nem sua dependência de G01.
- Aquisição atual: [cópia e dependências verificadas](../04_audit/evidence/CODEX100-EXEC-20261017/g02/locked-dependencies/README.md),9288paths/1311pacotes remotos/1293archives registry+18Git/8commits;78372entradas vendor. Prova direta archive→vendor e corpos Git,514metadados omitidos e18manifestações Cargo normalizadas registrados. Revisão EuclidR1 aceitou25+2inputs congelados/zero drift/zero obrigatórios; crítico encerrado, não fecha G02.
- Ligação das observações SDK concluída no recorte T1 (19/10/2026): [mapa observado](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-coverage-binding/coverage-observed.json) com 11 contratos `OBSERVED_CLIENT_PARTIAL` e 33 abertos, [seis lacunas](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-coverage-binding/gaps-review.json) `OPEN` e 0 recibos. Revisão R1 REVISE, um reparo, R2 APPROVE. Próximo: perfil de fonte, lote 2A ([HOW](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-coverage-binding/HOW-next-profile.md)); o perfil distribuído vem depois da decisão de identidade. O cartão segue `IN_PROGRESS` e não incrementa o numerador.
- Perfil distribuído ligado em 20/10/2026 no [mapa v7](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/coverage-observed-v7.json): 44 de 44 contratos com observação parcial de cliente, seis lacunas OPEN, 0 recibos. Não incrementa o numerador.
- Próxima ação (20/10/2026): preparar o fechamento do cartão, conforme a situação vigente acima; sem produção nem paridade concedida.

- Pré-requisitos atuais: job98092 terminou101 por OpenSSLheaders ausentes, falha preservada. [Sysroot privado autenticado](../04_audit/evidence/CODEX100-EXEC-20261017/g02/native-prerequisites/README.md) fornece OpenSSL/libcap,4packages/246entradas/assinaturaUbuntu+SHAindex+SHAdebs/2verificaçõesPASS,sem instalação global/postinst. Adendo vinculado ao novo job; linker/OpenSSL/libcap mínimosPASS, sem desabilitar bwrap/alterar features/otimização/lock.

- Atualização do monitor: job28877 encerrou em155.801s porDISK_MONITOR_FAILED; causaexataUNKNOWN porque primeirodu não foi capturado. Scopeinativo/nenhumprocesso. Contrato98462519 gravaerros/retryaté3somenteENOENT/mantémabortooutros e todoslimites;4934cacheentriespróprias/2.39GB hash-bound,worknovo. Verestadojob95774; nenhumartefato/qualificação concedido pelo cache.

- Checkpoint vigente: job78194/release53b4 foi encerrado porOOM confirmado no journal,11.8GiB/469s,scopeinativo. [Contrato de capacidade](../04_audit/evidence/CODEX100-EXEC-20261017/g02/reference-compilation/memory-recovery-contract.json) permite somente18GiB/jobs1/CPU4/pids256/0swap/7200s com26GiBdisponíveis no preflight;10237cacheentries6.309GB próprios hash-bound. Mesmos defaults/features/ThinLTO/codegenunits4/lock/source. Job9149 passou a histórico terminal porstorage; ELF ainda não atestado. Libcap prepara bwrap separado, que não pertence à árvore do CLI: [correção de escopo](../04_audit/evidence/CODEX100-EXEC-20261017/g02/reference-compilation/target-scope-correction.json),sem excluir essa obrigação.

- Artefato auxiliar concreto: [bwrap standalone do pin](../04_audit/evidence/CODEX100-EXEC-20261017/g02/auxiliary-bwrap/REPORT.md),Cargoexit0/defaultrelease/2529192bytes/SHA6fca7901,289membros exatos/9288fontes+246nativos intactos,scopeinativo/workerfechado. [REA MCP](../04_audit/evidence/CODEX100-EXEC-20261017/g02/auxiliary-bwrap-rea/README.md) confirmou SHA/tamanho/ELF64amd64 semexecutar; ausência.dep-v0éUNKNOWN,sem prova funcional. Layoutlibcapusr/lib64 resolvido poraliasprivadoreadonly,sem troca de biblioteca/pkgconfig/source/flags. CLIprincipalcontinua necessário; nenhumfechamentoG02/paridade.

- Sonda seguinte preparada: [CLI/app-server keyless](../04_audit/evidence/CODEX100-EXEC-20261017/g02/keyless-cli-probe/README.md),noveobservações finitas/8fontes/driver+supervisor privados. Somente após o mesmoCLIterminal0+atestado+revisãoHOW; namespaceoffline/semcredenciais/passwdsintético/4GiB2CPU256tasks180s. AindaNOT_RUN,sem substituição porcompanheiro/ELFauxiliar oureciboCodex.

- Estado corrente de storage: [relocação conferida](../04_audit/evidence/CODEX100-EXEC-20261017/g02/reference-compilation/disk-recovery/relocation.json),12074entradas/10.218GBcopiados semhardlinks+bytehash/modo/mtime/links,originalprivadoremovido sópósbackup. 9149terminou-9/DISK_RESERVE_GUARD/3334s/semOOM/scopeinativo; nova75896/release387aRUNNING,mesmo18GiB/jobs1/source/defaultrelease,monitorambosvolumes. HOWkeylessR1REVISE7obrigatórios,reparoúnico eR2APPROVE_BOUNDED_HOW/zeroabertos;5inputs+8controles+8fontesconferidos/criticfechado. Sonda aindaNOT_RUN,sóexecutar após mesmo387a terminal0+ELFatestado.

- Referência concreta atual: [CLI/source e observações aceitos](../04_audit/evidence/CODEX100-EXEC-20261017/g02-reference-acceptance.json),75896TERMINAL0/2525.503s/semaborto,ELF1.477GB/SHA5cce7264/atestado pin8d9,defaultrelease preservado. [Runtime keyless](../04_audit/evidence/CODEX100-EXEC-20261017/g02/keyless-cli-probe/RUNTIME-REPORT.md):24933exit0/4comandos/9observações/cgroupvazio,0.0.0observado,6respostas+1notification. Meitner12condições/0obrigatórios,SHAdiretoELF/recheckinsumossampling. Não retomarcompilaçãoouprobe antigos. Outrosbinários/plataformas/SDK/M1/CVG continuamabertos; REAlayoutproviderindisponívelregistradosemsetup.

- Corpus concreto: [nove observações keyless extraídas](../04_audit/evidence/CODEX100-EXEC-20261017/g02/keyless-reference-oracles/README.md),R1 ACCEPT_BOUNDED_RAW_REFERENCE_CORPUS/zero findings/11inputs+28bindings+8citações. Seisrequests/respostas e uma notificação;175discriminantes anunciados iguais à fonte,não175handlersexecutados. Overlay identifica result.capabilities ausente noinitialize real; campos/normalização futuros ainda precisam contrato autorizado. CVGnãoexecutado/zero recibos.

- Medição real adicional: [IDs/wire](../04_audit/evidence/CODEX100-EXEC-20261017/g02/lossless-wire-probe/REPORT.md),23processos/69writes/73frames,exit0/guardas23/cgroupREMOVED/ELFintacto. NewtonR2aceitou APENAS diagnóstico com8IDsdefonte inconclusivos;quatroechoesexatosincl9007199254740993,11edgessemechoatéEOFtambéminconclusivos. Barreira nãoéfence,EOFpoderemoverconexãoantesderespostas; não rotularausênciacomorejeiçãoou8valoreserrados. Oráculosi64INCOMPLETE;runtime1de1/reviews2de2gastos/zero retries. PróximaaçãoéT1replan de lifecycle/espera de respostaválidaemunidade nova,comcontrato/HOW antesdequalquerexecução. SemreciboCVG.

- Replan material concluído: [12IDs declarados com resposta antes de EOF](../04_audit/evidence/CODEX100-EXEC-20261017/g02/id-settlement-replan/REPORT.md),mesma conexão/14writes14responses/guardas eordemlower+upper/cgroupREMOVED/SHAELFintacto. HOWJasonR1P1cachefuture corrigido/26datacontrols/R2estáticoaprovado; Lead reconstruiu runtime,semcríticopós-runtime (2reviewsHOWgastas). Os11edgesOPEN/all23cases e285payloads anteriores preservados. [Bindings parciais](../04_audit/evidence/CODEX100-EXEC-20261017/g02/id-settlement-replan/reference-id-bindings.json) nãoalteramcatálogo487+22NOT_RUN ouconcedemreciboCVG. Próximaação érecon de decoder/notification/erro síncrono/FIFO para11edges;followupde fonte aindaHYPOTHESIS,nãoexecutarsemnovoHOW. Unitbudget1runtime2reviews1reworkgasto/zero restantes,sem rerun.

- PerfilSDK/HOW e aquisição limitada concluídos; [dados7artefatos](../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-profile-artifacts/REPORT.md). PróximoDX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS; execução19casos/admissão aindaNOT_RUN. CLIkeyless encerrado não será repetido, wheel/npm/runtimeCodex continuam separados de dependências.

### DX100-G03 — Reconciliar PAR, Claude100 e saldo compartilhado

- Estado: `IN_PROGRESS`. Prioridade: P0. Fase: F0. Trilha: **T1**. ROM delta: 3–6 dias.
- Dono proposto: L0 — Integrador: contratos, schema, gates e ledgers.
- O que/por quê: Reconciliar PAR, Claude100 e saldo compartilhado. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: 0380/0383 readonly; mapa de reuso e evidência das candidatas.
- Como: Definir fatias técnicas compartilhadas e um writer por caminho; preservar status e gates originais. Aceitar reuso só de artefato integrado e qualificado; recalcular ROM, dependências e reservas de schema/lock.
- Dependências DX100: DX100-G01.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Cada construção possui um dono canônico; deltas DX não duplicam aceites PAR/C100; orçamento deduplicado por ID/fatia e desvios documentados.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Recon somente leitura atualizado:55paths do kit/comparador/fixturesClaude100 estão presentes no root, byteexatos à candidata declarada. A [observação atual](../04_audit/evidence/CODEX100-EXEC-20261017/g03-reuse-observation-tui-checkpoint.json) supera a observação antiga quanto à integração física;702testes/gates são relato do dono. G03 e o aceite Codex continuam pendentes, sem duplicar mecanismo, copiar crédito ou transferir aprovação0235.
- Recon de contexto: SPEC0224PARE descreve complete-tool-v1 e BUILD próprio, enquanto0226deadoção publicada/default foi adiada. Conferir candidata/integração e aceites antes de duplicar o mecanismo; nenhuma aprovação transferida. Evidência e limites no [recon nativo](../04_audit/evidence/CODEX100-EXEC-20261017/next-native-contract-recon.json).
- Próxima ação: Conferir saldo e contratos das fatias PAR/C100 com seus donos e reestimar o grafo.

- Diagnóstico executado: [READ nonce no runtime nativo atual](../04_audit/evidence/CODEX100-EXEC-20261017/g03/native-delivery-probe/REPORT.md),27inputs intactos/1tool/2decisões/1pedidoRESPONSE. Nonce chega à StepContext e não ao ModelRequestfinal. Lead conferiu raw/bundle/proveniência,worker fechado/3scopesinativos; nenhum reciboCodex. [Disposição de reuso](../04_audit/evidence/CODEX100-EXEC-20261017/g03-native-gap-reuse-disposition.json):4fontesR19 aprovadas emmemória presentes na candidata e diferentesdo ROOT. PARE0224continua dono da correção; integração/PG/consumidor/defaultG03nãofechados e0226adiada não foi adotada.

- Diagnóstico adicional [recomposição R19](../04_audit/evidence/CODEX100-EXEC-20261017/g03/reuse-native-delivery-probe/REPORT.md) terminouFAILED_DIAGNOSTIC_FIXTURE_BUDGET/2tentativas,2scopesvazios/32inputsinalterados. Legacyobservado; completeREAD/modelnãoexecutadosporduaspré-condiçõesdocoleitor. GuardascontextProtocol/iterativepreservadas; nenhumdefeitoR19/aceitedefullbodyinferido,semterceirarepetiçãoautomática. Reuso/integraçãoG03seguemabertos.

### DX100-G04 — Fechar WHAT, equivalências e SPEC da primeira jornada

- Estado: `IN_PROGRESS`. Prioridade: P0. Fase: F0. Trilha: **T1**. ROM delta: 4–8 dias.
- Dono proposto: L0 — Integrador: contratos, schema, gates e ledgers.
- O que/por quê: Fechar WHAT, equivalências e SPEC da primeira jornada. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: novos artefatos Discovery/PRD/SPEC com IDs a reservar.
- Como: Confirmar modalidades de paridade, contratos e acessos. Preparar uma jornada local sintética e pacote T3 revisável; casos de bypass/auto-review e serviços proprietários mantêm decisão pendente própria.
- Dependências DX100: DX100-G02, DX100-G03.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Escopo e aceites definidos, SPEC concreta da primeira fatia pronta; gates T3/T4 atuais aprovados antes do BUILD correspondente. Aprovar plano não aprova todos os BUILDs.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Preparo documental: o [contrato proposto da jornada](../04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/reference/README.md) separa CURRENT/PROPOSED/UNKNOWN. Faltam porta de stream incremental real, loop nativo governado, journal/checkpoint, idempotência, cancelamento e retomada em processo novo pela superfície pública. Reusar a composição iterativa e ports existentes.
- Recon adicional: [fontes e contrato nativo](../04_audit/evidence/CODEX100-EXEC-20261017/next-native-contract-recon.json) distinguem loop/stepStore/journal já existentes das lacunas SDK/stream. A composição da resposta final não passa diretamente as observações na requisição construída; provar reinjeção com nonce exclusivo no resultado real de ferramenta, sem antecipar diagnóstico de runtime.
- Próxima ação deG04: revisão humana do novo contrato0239 hash-bound e qualificação dos owners antes deBUILD; tarefa independenteG02 de perfilSDK pronta enquanto isso. Nenhuma aprovação0221/0225/0231 repetida.
- SPEC completa recuperada: [R3APPROVE/zero obrigatórios](../04_audit/evidence/CODEX100-EXEC-20261017/g04/native-journey-recovery-plan/review-r3/report.md),12checks/423inputs. Oitoanexos vinculados à SPECccdf3a75; [pacoteT3](../04_audit/evidence/CODEX100-EXEC-20261017/g04/native-journey-recovery-plan/decision-packet.md) pronto, aprovação humana/BUILD ainda pendentes. R2FAILED preservada, recuperação explícita total3reviews/2repairs;30NJ+19EA/509catálogoNOT_RUN.
- ProgressoCP04/CP09: [desenho de autoridade concluído no recorteT1](../04_audit/evidence/CODEX100-EXEC-20261017/g04/execution-authority-design/REPORT.md),24inputs/24ranges originais e duas citações corrigidas aditivamente,19casos futurosNOT_RUN. Coordenador comum, guarda transacional, perda/in-flight/UNKNOWN, cancelamento/ACK e compatibilidade definidos. CarsonR1APPROVE/14checks/zero obrigatórios, ator encerrado; oito checksT1PASS. Qualificação genérica, SPEC completa e BUILD seguem pendentes; CQ01–14 preservados.
- Vínculo de portas concluído no recorte T1, R2APPROVE/zero obrigatórios: [decisão T1](../04_audit/evidence/CODEX100-EXEC-20261017/g04/persistence-port-decision/DECISION.md),31inputs/80registros(78IDs distintos)/cinco portas/nove lacunas; oito checks documentais PASS. R1-01P2 reparado uma vez: CAS não concede lease/ACK e elegibilidade epoch/worker UNKNOWN emCP09. Delimita Root, contrato aprovado e candidataWIP; não qualifica runtime nem conclui G04/Q01.

- Evidência WHAT atualizada: [diagnóstico nativo real](../04_audit/evidence/CODEX100-EXEC-20261017/g03/native-delivery-probe/REPORT.md) confirma a ausência de toolresultnonce no pedidoRESPONSEdo ROOT,apesarde sua presença no próximoStepContext. Não é mais apenas hipótese de fonte. Reusar a candidata0224condicionada e especificar os deltasSDK/stream/cancelamento/durabilidade; nenhum BUILD/T3 inferido por diagnóstico.

- Proposta concreta: [primeira jornada nativa](../04_audit/evidence/CODEX100-EXEC-20261017/g04/first-native-journey/contract-proposal.md),14requisitos/14casos/8decisõescanônicas abertas/10inputs vinculados; preservaREAD→WRITEretida→approval→resume→stream→restart e ramosresponseText/responseIntent. T1/PROPOSED/NOT_APPROVED/NOT_IMPLEMENTED,sem validaçãoDiscovery/PRD/SPEC ouautorizaçãoBUILD. ND03/05explicitamstore/fence/CAScanônicosantesde código; não criamatalho emmemória oudefault0226.

- Desenho wire adicional: [compatibilidade app-server nativa](../04_audit/evidence/CODEX100-EXEC-20261017/g04/wire-contract-proposal/decision.md),12fontes/9diferenças concretas/10casosadicionaisNOT_RUN. Propõe manterenvelopesCodex/initialize/notifications/i64semperda,numadapter sobrekernel; SDKv1JSONRPCnãoéalias. ND04seguependentedetipos/exports/parser/lifetime/limitesnaSPEC,semBUILDounovagateaprovada.

- Documento canônico iniciado: [Discovery0021](../00_discovery/0021_codex100_source_and_execution.md),DRAFT_FOR_VALIDATION/T1,problema/usuários/evidências/resultadointegral/primeirajornadacompleta. Não aprovaPRD/SPEC/BUILDouadoção0226; gatesglobaisintocados.

- Pipeline documental vigente: Discovery0021 e PRD0030 validados; [SPEC0231](../02_spec/0231_codex100_initial_qualification.md) aprovada explicitamente e mecanismo local concluído/12QK. Decisão de cinco portas aceita no recorteT1; contrato da jornada completa ainda não implementado. CP04/CP09 foi incorporado à SPEC0239; R2 final mantém duasP1 e exige replanejamento. CQ01–14 e demais ND permanecem obrigatórios. A revisão e o pedido humano pendentes descritos em checkpoints anteriores são históricos, resolvidos pela entrega0231.

- Checkpoint histórico anterior à resposta humana: [pacote de decisão0231](../04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/decision-packet.md),R2 READY_FOR_HUMAN_T3_REVIEW/zero findings após correção CROSS_CUTTING. SPEC SHA e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af congelada; aprovação humana PENDING/BUILD_NOT_AUTHORIZED. D/PRD validados T1, CQ01–14 ainda NOT_RUN.

### DX100-Q01 — Comparador Codex autenticado e jornada mínima

- Estado: `IN_PROGRESS`. Prioridade: P0. Fase: F1. Trilha: **T2/T3 conforme contrato do kit**. ROM delta: 12–24 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: Comparador Codex autenticado e jornada mínima. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: futuro tests/differential/codex e fixtures próprias.
- Como: Criar driver Codex separado dos drivers DeepSeek/Claude; executar referência e CVG com provider sintético. Normalizar apenas IDs/tempo declarados e conservar transcript/efeitos/estado.
- Dependências DX100: DX100-G04.
- Reuso PAR obrigatório na fatia: PAR-Q03, PAR-Q04, PAR-K01, PAR-K03, PAR-S01, PAR-X01, PAR-X04.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: READ, WRITE retida, approval, retomada e restart passam pelos hosts; resultado conhecido-errado, evento perdido e efeito extra são rejeitados.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Subtask QUALIFIER-001 COMPLETED_LOCAL/12QKPASS:9deltasRoot/16gates/verificador atuais; ação geral DX100-G04:SPECIFY-EXECUTION-AUTHORITY dentro da SPEC completaCQ01–14. Q01 integral IN_PROGRESS até completarCQ01–14 e demais aceites.

- Subtask proposta `DX100-Q01-QUALIFIER-001`: mecanismo da [SPEC0231](../02_spec/0231_codex100_initial_qualification.md),permitidocomo primeira dependência noPRD0030; não substitui jornadaCQ01–14. [Plano condicional](../04_audit/evidence/CODEX100-EXEC-20261017/g04/qualification-mechanism-design/build-plan-proposal.json),15inputscongeladospara críticaHOW,SEMautorizaçãoBUILD. Diagnóstico doshelpersC100reais demonstrou catálogoCodeXrecusado ealiasi64; não mascararCodeXcomoClaude oucopiaroengine. EstadoQ01continuaTODO; nenhumasubfunçãoqualificada.

- O plano auxiliar do qualificador é histórico e conserva SPEC_sha256/14af, conforme a nota R2 `historical_proposal_note`. Usar apenas sua sequência; contrato atual é a SPEC0231/e3af no pacote de decisão. Nenhum novo gate ou alteração da SPEC resulta desta clarificação.

- Subtask qualificador: HOW R2 pronto/17inputs rechecados/12aceites QK NOT_RUN; implementação condicional à revisão humana explícita do hash0231. O enabler não encerra Q01 nem a jornada nativa; todas as487obrigações e22controles seguem obrigatórios.

- Fechamento da subtask0231: [12aceites do mecanismo](../04_audit/evidence/CODEX100-EXEC-20261017/g04/qualifier-build/acceptance-status.json), todosPASS_LOCAL_MECHANISM; certificaçãoCONDICIONAL local, sem alterar estadosfuncionais do catálogo.9integraçõesguardadas e539RootfocaisPASS,0recibosfuncionais.

### DX100-K01 — Qualificar incorporação nativa e controles entre hosts

- Estado: `TODO`. Prioridade: P1. Fase: F1. Trilha: **T3**. ROM delta: 5–10 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Qualificar incorporação nativa e controles entre hosts. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: harness, agent-runtime, API/worker/SDK e consumidores neutros.
- Como: Reaproveitar pipeline existente e qualificar os bindings Codex. O binário/repositório Codex serve só à referência; retirar sua disponibilidade não pode quebrar execução CVG já incorporada.
- Dependências DX100: DX100-Q01.
- Reuso PAR obrigatório na fatia: PAR-K01, PAR-K02, PAR-K03, PAR-K04.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Mesmas decisões e journal em todos os hosts; sem produto importado pelo núcleo; testes funcionam sem executável Codex no PATH do harness.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-01-01, CDX100-01-02, CDX100-01-03, CDX100-01-04, CDX100-01-05, CDX100-01-06, CDX100-01-07, CDX100-01-08, CDX100-CVG-03, CDX100-CVG-18.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-S01 — Threads: catálogo, metadata, seções e anexos

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3**. ROM delta: 10–20 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Threads: catálogo, metadata, seções e anexos. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: persistence/session, contratos e API/SDK de sessão.
- Como: Adicionar apenas deltas Codex: metadata/ownership, filtros, read state, seções, anexos e consultas paginadas. Conservar RLS, limites e CAS onde aplicável.
- Dependências DX100: DX100-K01.
- Reuso PAR obrigatório na fatia: PAR-S01, PAR-S02, PAR-S03, PAR-S05, PAR-S06, PAR-T04.
- Fatias C100 propostas, sujeitas a G03: C100-S01. O estado permanece no 0383.
- Aceite específico: CRUD, read state/revisão, listagem e anexos reproduzem contrato; conflito/cursor/tenant incorreto não expõem dados; restart conserva estado.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: 52 requisitos; lista exata no catálogo por owner=DX100-S01.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-S02 — Retomada, fork, revert e migração de históricos

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Retomada, fork, revert e migração de históricos. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: session history, export/import e lineage.
- Como: Mapear formato/turn/items/rollout para portas CVG; fork e revert de conversa preservam referências e efeitos consumados. Import de agente externo é ingestão de dados não confiáveis.
- Dependências DX100: DX100-S01.
- Reuso PAR obrigatório na fatia: PAR-S04, PAR-S07, PAR-K03.
- Fatias C100 propostas, sujeitas a G03: C100-S01. O estado permanece no 0383.
- Aceite específico: Roundtrip e migração versionados; rollback de conversa não apaga audit/journal nem repete efeito; fork conserva pai; import malformado é recusado.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-02-02, CDX100-02-03, CDX100-02-07, CDX100-02-08, CDX100-RPC-ClientRequest-thread.resume, CDX100-RPC-ClientRequest-thread.fork, CDX100-RPC-ClientRequest-thread.revert, CDX100-RPC-ServerNotification-thread.reverted, CDX100-RPC-ServerNotification-thread.compacted.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-C01 — Contexto, compactação e atualização incremental

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Contexto, compactação e atualização incremental. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: context-engine, compaction, prompt/context fragments.
- Como: Implementar deltas de retenção por fonte, reinjeção, pressão real da requisição e compactação por capabilities do provider; incluir imagens e saídas retidas. Async apenas se callable no pin e qualificada.
- Dependências DX100: DX100-S02.
- Reuso PAR obrigatório na fatia: PAR-C01, PAR-C02, PAR-C03, PAR-C04, PAR-C05, PAR-C06, PAR-M02.
- Fatias C100 propostas, sujeitas a G03: C100-C02. O estado permanece no 0383.
- Aceite específico: Resumo não amplia confiança; histórico de autorização/objetivo e tool call/result sobrevivem; janela efetiva respeita orçamento; falha de compactação é explícita.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-03-01, CDX100-03-03, CDX100-03-04, CDX100-03-05, CDX100-03-06, CDX100-RPC-ClientRequest-thread.compact.start, CDX100-CVG-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-C02 — Memória e instruções com ciclo de vida verificável

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Memória e instruções com ciclo de vida verificável. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: memory adapters, AGENTS scopes e importação.
- Como: Reusar proveniência/revisão e acrescentar deltas de memória e contexto Codex; instruções por raiz/escopo têm hash e limites. Remoção/retenção e opt-out são explícitos.
- Dependências DX100: DX100-C01.
- Reuso PAR obrigatório na fatia: PAR-C06, PAR-S05.
- Fatias C100 propostas, sujeitas a G03: C100-C01, C100-C02. O estado permanece no 0383.
- Aceite específico: Memória criada/consultada/expirada/importada sob grants; sem vazamento entre tenants; AGENTS fora da raiz recusado; informação aprendida não vira fonte institucional aprovada.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-03-02, CDX100-03-07, CDX100-03-08, CDX100-CVG-09.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-M01 — Modelos, capabilities e transportes de inferência

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3; qualificação externa T4**. ROM delta: 10–22 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Modelos, capabilities e transportes de inferência. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: model-gateway, provider adapters e catálogo.
- Como: Mapear catálogo/capabilities, SSE/WebSocket, modelo/effort/tier, structured output, retry/timeout/reroute e usage. Provider é adapter substituível, sem copiar pesos/serviços privados. Incluir a busca hospedada pelo provider: modos Cached/Indexed/Live/Disabled, capability/modelo, conteúdo texto/imagem, precedência de standalone, resultados/eventos/erros e omissão em ResponsesLite; spec isolado não é prova funcional.
- Dependências DX100: DX100-K01.
- Reuso PAR obrigatório na fatia: PAR-M01, PAR-M02, PAR-M05.
- Fatias C100 propostas, sujeitas a G03: C100-B01, C100-B02. O estado permanece no 0383.
- Aceite específico: Requisição congelada e um terminal; matriz de capabilities impede campo não suportado; fallback explícito; tokens/custo persistem; falhas/cancelamento de stream preservam causa.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-04-01, CDX100-04-02, CDX100-04-03, CDX100-04-04, CDX100-04-05, CDX100-04-06, CDX100-04-07, CDX100-RPC-ClientRequest-model.list, CDX100-RPC-ClientRequest-modelProvider.capabilities.read, CDX100-RPC-ServerNotification-model.rerouted, CDX100-RPC-ServerNotification-model.verification, CDX100-RPC-ServerNotification-model.safetyBuffering.updated, CDX100-FACTORY-WEB-HOSTED.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-M02 — Providers locais, proxy e recuperação de autenticação

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Providers locais, proxy e recuperação de autenticação. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: adapters de provider/credenciais/egress.
- Como: Acrescentar deltas OpenAI/ChatGPT-plan quando autorizado, OSS local e providers encontrados no pin; proxy/TLS e recuperação de auth com conta isolada. Não assumir entitlement por listar modelo.
- Dependências DX100: DX100-M01.
- Reuso PAR obrigatório na fatia: PAR-H03, PAR-T12.
- Fatias C100 propostas, sujeitas a G03: C100-R04. O estado permanece no 0383.
- Aceite específico: Cada provider declarado tem fixture e ensaio autorizado; segredo não entra em prompt/log; endpoint não confiável é recusado; acesso ausente bloqueia a variante em vez de fechá-la.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-04-08, CDX100-04-09.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-A01 — Compatibilidade completa dos envelopes app-server

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3**. ROM delta: 15–30 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: Compatibilidade completa dos envelopes app-server. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: contratos gerados, API, SDK e adapter app-server.
- Como: Mapear cada um dos105 requests,10 server requests e85 notifications para handlers reais CVG e schemas gerados; conter aliases legados, IDs, erros e negociação. Sem forwarding ao Codex como implementação.
- Dependências DX100: DX100-S02, DX100-M01.
- Reuso PAR obrigatório na fatia: PAR-A01, PAR-A02, PAR-A03, PAR-A05, PAR-A07, PAR-A09.
- Fatias C100 propostas, sujeitas a G03: C100-S02. O estado permanece no 0383.
- Aceite específico: 200 entradas têm casos positivos/negativos/estado válidos; versões e payloads incompatíveis falham; notificação não precede commit exigido; cada fluxo tem terminal e correlação.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: 29 requisitos; lista exata no catálogo por owner=DX100-A01.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-A02 — Filesystem RPC, watchers e exec incremental

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: Filesystem RPC, watchers e exec incremental. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: adapter fs/command e API/SDK.
- Como: Complementar read/write/copy/remove/metadata/watch/unwatch e command exec/write/resize/terminate. Watchers e handles têm ownership, limites e limpeza.
- Dependências DX100: DX100-A01, DX100-T01, DX100-X01.
- Reuso PAR obrigatório na fatia: PAR-T01, PAR-T02, PAR-A04.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Eventos fs e chunks são ordenados e recuperáveis; path/handle de outro tenant negado; watcher fecha no disconnect/stop conforme contrato; nenhuma mutação foge ao journal.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-05-05, CDX100-RPC-ClientRequest-fs.readFile, CDX100-RPC-ClientRequest-fs.writeFile, CDX100-RPC-ClientRequest-fs.createDirectory, CDX100-RPC-ClientRequest-fs.getMetadata, CDX100-RPC-ClientRequest-fs.readDirectory, CDX100-RPC-ClientRequest-fs.remove, CDX100-RPC-ClientRequest-fs.copy, CDX100-RPC-ClientRequest-fs.watch, CDX100-RPC-ClientRequest-fs.unwatch, CDX100-RPC-ClientRequest-fuzzyFileSearch, CDX100-RPC-ServerNotification-fs.changed, CDX100-RPC-ServerNotification-fuzzyFileSearch.sessionUpdated, CDX100-RPC-ServerNotification-fuzzyFileSearch.sessionCompleted.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-A03 — Transportes, backpressure, auth e reconexão

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: Transportes, backpressure, auth e reconexão. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: stdio/UDS/WebSocket hosts e cliente.
- Como: Cobrir stdio, Unix socket e WebSocket expostos; auth por token/bearer com scope, origem e revogação; lifecycle shutdown/admission, opt-outs e compressão negociada do pin.
- Dependências DX100: DX100-A01.
- Reuso PAR obrigatório na fatia: PAR-A01, PAR-A02, PAR-H03.
- Fatias C100 propostas, sujeitas a G03: C100-R02. O estado permanece no 0383.
- Aceite específico: Sem perda/duplicata após reconnect e buffer limitado; cliente lento não trava os demais; token revogado bloqueia nova ação; shutdown rejeita novos requests e encerra os próprios.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-08-06, CDX100-08-07, CDX100-08-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-D01 — SDK público e tipos de eventos/itens

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3**. ROM delta: 8–16 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: SDK público e tipos de eventos/itens. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: packages/sdk TS/Python e camada de compatibilidade.
- Como: Oferecer start/resume/run/runStreamed/input multimodal/schema/signal e tipos do SDK oficial; manter clientes nativos CVG. O SDK de referência não substitui o backend.
- Dependências DX100: DX100-A03.
- Reuso PAR obrigatório na fatia: PAR-A06, PAR-A08, PAR-A09.
- Fatias C100 propostas, sujeitas a G03: C100-S02. O estado permanece no 0383.
- Aceite específico: Exemplos reais públicos TS e Python funcionam contra CVG; cancel/schema inválido/error event são tipados; nenhuma divergência entre schema e bindings.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-09-01, CDX100-09-02, CDX100-09-03, CDX100-09-04, CDX100-09-05.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-D02 — Headless, review e saída estruturada

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3**. ROM delta: 6–14 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: Headless, review e saída estruturada. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: CLI/SDK exec e comandos review.
- Como: Implementar contratos de exec/resume/fork/review, stdin, JSONL, schema de saída, mensagem final, modos efêmero/ignore-user-config e códigos de saída.
- Dependências DX100: DX100-D01, DX100-W02.
- Reuso PAR obrigatório na fatia: PAR-H01, PAR-A05, PAR-A07.
- Fatias C100 propostas, sujeitas a G03: C100-S02. O estado permanece no 0383.
- Aceite específico: Fixtures headless validam entrada, stream, schema e exits; timeout/cancelamento não produzem sucesso falso; execução efêmera não persiste histórico pessoal.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-09-06, CDX100-09-07, CDX100-09-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-X01 — Supervisor de processos, PTY e ambiente mínimo

- Estado: `TODO`. Prioridade: P1. Fase: F1. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Supervisor de processos, PTY e ambiente mínimo. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: sandbox, supervisor de jobs/PTY e stdio.
- Como: Acrescentar semântica Codex de yield/poll/stdin/caps/process handles, preservando componente compartilhado. Aplicar política explícita de env e ownership da árvore.
- Dependências DX100: DX100-K01.
- Reuso PAR obrigatório na fatia: PAR-X01, PAR-T10, PAR-T14, PAR-Q03.
- Fatias C100 propostas, sujeitas a G03: C100-O02, C100-W02. O estado permanece no 0383.
- Aceite específico: Morte do root, timeout e double-failure conservam causa; processo próprio para/draina; outro tenant não controla handle; stdin/output e timers ficam dentro de teto.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: 22 requisitos; lista exata no catálogo por owner=DX100-X01.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-X02 — Contenção Linux, macOS e Windows

- Estado: `TODO`. Prioridade: P1. Fase: F1. Trilha: **T3**. ROM delta: 15–35 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Contenção Linux, macOS e Windows. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: adapters de sandbox por SO e runners de qualificação.
- Como: Definir equivalentes de bubblewrap/Landlock, Seatbelt e Windows no pin; política de leitura/escrita carveout/rede e estado de disponibilidade não são simulados por metadados.
- Dependências DX100: DX100-X01.
- Reuso PAR obrigatório na fatia: PAR-X02, PAR-X03, PAR-X04.
- Fatias C100 propostas, sujeitas a G03: C100-H01. O estado permanece no 0383.
- Aceite específico: Prova nativa positiva e negativa em cada SO/arquitetura contratados; sem fallback silencioso para acesso total; implementação indisponível mantém variante NOT_RUN/BLOCKED.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-07-06, CDX100-07-07, CDX100-07-08, CDX100-RPC-ClientRequest-windowsSandbox.setupStart, CDX100-RPC-ClientRequest-windowsSandbox.readiness, CDX100-RPC-ServerNotification-windows.worldWritableWarning, CDX100-RPC-ServerNotification-windowsSandbox.setupCompleted, CDX100-CVG-06.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-X03 — Política, aprovação e revisão consultiva

- Estado: `TODO`. Prioridade: P1. Fase: F1. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Política, aprovação e revisão consultiva. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: policy, approval, execpolicy e reviewer adapters.
- Como: Mapear decisão/grant/retry e perfis; separar reviewer consultivo de autoridade humana. Enumerar bypass flags e ações sensíveis como divergências abertas até decisão concreta de equivalência.
- Dependências DX100: DX100-K01.
- Reuso PAR obrigatório na fatia: PAR-K03, PAR-X04, PAR-I06, PAR-U07.
- Fatias C100 propostas, sujeitas a G03: C100-H01. O estado permanece no 0383.
- Aceite específico: Argv/cwd/tenant/escopo alterados invalidam aceite; retry ampliado requer nova decisão; reviewer não confirma ação clínica/financeira; casos incompatíveis não contam como paridade literal.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: 20 requisitos; lista exata no catálogo por owner=DX100-X03.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-T01 — Arquivos, patches, busca e saídas grandes

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3; qualificação externa T4**. ROM delta: 10–22 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Arquivos, patches, busca e saídas grandes. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: fs-tools, patch/search e artifact store.
- Como: Completar deltas apply_patch multi-arquivo, leitura/faixas, glob/grep/fuzzy e head/tail/spill. Preservar confinamento, preview, digest de base e journal. Incluir web/run standalone com seu schema completo, respostas e referências, opções e operações suportadas, configuração/provider, gates e diferenças da busca hospedada; acesso externo exige gate próprio e fontes web não viram RAG institucional automaticamente.
- Dependências DX100: DX100-K01, DX100-X01.
- Reuso PAR obrigatório na fatia: PAR-T01, PAR-T02, PAR-T03, PAR-T05, PAR-C03.
- Fatias C100 propostas, sujeitas a G03: C100-U01, C100-U02. O estado permanece no 0383.
- Aceite específico: Patch obsoleto/conflito/symlink externo recusado; nada sobrescreve trabalho alheio; resultados truncados declaram limite e permitem recuperação autorizada por referência.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-05-01, CDX100-05-02, CDX100-05-03, CDX100-05-04, CDX100-05-06, CDX100-05-07, CDX100-05-08, CDX100-FACTORY-WEB-STANDALONE.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-T02 — Code mode e ferramentas programáticas

- Estado: `TODO`. Prioridade: P1. Fase: F5. Trilha: **T3**. ROM delta: 15–30 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Code mode e ferramentas programáticas. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: host de execução programática e células isoladas.
- Como: Mapear runtime/células/exec/wait/cancel do code-mode do pin, tool search e callbacks. Programas do modelo só usam proxies de capabilities governadas; runtime é separado do core.
- Dependências DX100: DX100-A02, DX100-X02, DX100-X03, DX100-O01.
- Reuso PAR obrigatório na fatia: PAR-O10, PAR-O12, PAR-E01, PAR-E02.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Célula não acessa segredo/host fora do grant, cancelamento fecha callbacks/filhos e não perde efeito; limites de tempo/memória/saída são impostos e testados.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-22-01, CDX100-22-02, CDX100-22-03, CDX100-22-04.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-H01 — Configuração em camadas e requisitos gerenciados

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L0 — Integrador: contratos, schema, gates e ledgers.
- O que/por quê: Configuração em camadas e requisitos gerenciados. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: schema de configuração/requirements e diagnóstico.
- Como: Qualificar as103 chaves principais e variantes aninhadas; implementar precedência/origem/strict/reload/profile e filtros de env. Local/workspace não redireciona credenciais nem remove grants superiores.
- Dependências DX100: DX100-K01, DX100-X03.
- Reuso PAR obrigatório na fatia: PAR-H02, PAR-H03, PAR-K05.
- Fatias C100 propostas, sujeitas a G03: C100-H02. O estado permanece no 0383.
- Aceite específico: Cada chave tem semântica, tipo/default/reload e casos inválidos; dump é redigido; schema sincroniza forms/CLI; desconhecido e downgrade de policy falham.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-10-02, CDX100-10-03, CDX100-10-04, CDX100-10-05, CDX100-10-06, CDX100-RPC-ClientRequest-experimentalFeature.list, CDX100-RPC-ClientRequest-experimentalFeature.enablement.set, CDX100-RPC-ClientRequest-config.read, CDX100-RPC-ClientRequest-config.value.write, CDX100-RPC-ClientRequest-config.batchWrite, CDX100-RPC-ClientRequest-configRequirements.read, CDX100-RPC-ServerNotification-configWarning, CDX100-CVG-12.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-H02 — CLI completa, diagnósticos e compatibilidade de flags

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: CLI completa, diagnósticos e compatibilidade de flags. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: host CLI CVG e adapter de comandos Codex.
- Como: Mapear enums/subcomandos/aliases/flags, completion, doctor, update e help, inclusive variantes porSO e hidden úteis. Ferramentas internas têm disposição explícita G01, não desaparecem do inventário.
- Dependências DX100: DX100-D02, DX100-H01, DX100-R01.
- Reuso PAR obrigatório na fatia: PAR-H01, PAR-H02.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Todas as entradas CLI têm target, teste de parser e fluxo real; help/exit refletidos; update verifica origem/assinatura e não altera dados; nenhum bypass é habilitado implicitamente.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-10-01, CDX100-10-07, CDX100-10-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-E01 — Skills, plugins, marketplaces e compartilhamento

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: Skills, plugins, marketplaces e compartilhamento. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: skill/plugin adapters e catálogo de origem.
- Como: Acrescentar manifests Codex, fontes locais/remotas, aliases, descoberta progressiva, dependências e add/list/read/reconcile/share/upgrade/remove. Conteúdo importado permanece não confiável.
- Dependências DX100: DX100-H01, DX100-C02.
- Reuso PAR obrigatório na fatia: PAR-T07, PAR-H04, PAR-K04.
- Fatias C100 propostas, sujeitas a G03: C100-T01, C100-T02, C100-E02. O estado permanece no 0383.
- Aceite específico: Catálogo e conteúdo têm hash/origem; troca exige nova revisão; instalação não concede grant; compartilhamento/checkout só em destino autorizado e auditado.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: 27 requisitos; lista exata no catálogo por owner=DX100-E01.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-E02 — API de extensões e ferramentas incrementais

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: API de extensões e ferramentas incrementais. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: extension adapters, registry e contribuições por capability.
- Como: Mapear contributors de contexto/tool/model/session/lifecycle, worlds e schemas dinâmicos. Plugins são capabilities separadas dos controles obrigatórios, com lifecycle/quiescência.
- Dependências DX100: DX100-E01, DX100-A01.
- Reuso PAR obrigatório na fatia: PAR-E01, PAR-K04, PAR-K05.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Reload mantém gerações e grants; extensão não substitui approval/policy; schema alterado invalida contexto antigo; listener com falha e dispose têm resultado causal.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-11-07, CDX100-11-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-F01 — Hooks por evento, trust e runners

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: Hooks por evento, trust e runners. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: hooks declarativos e adapter Codex.
- Como: Completar matriz evento×handler×origem×escopo, bundle fingerprint, revisão/timeout/async/concurrency e saídas. Reusar runners existentes apenas na semântica equivalente.
- Dependências DX100: DX100-E01, DX100-X01, DX100-X03.
- Reuso PAR obrigatório na fatia: PAR-K09, PAR-K10, PAR-X01.
- Fatias C100 propostas, sujeitas a G03: C100-K01, C100-K02. O estado permanece no 0383.
- Aceite específico: Todos eventos disponíveis no pin têm positivos/negativos; hook alterado perde trust; timeout/drain/falha fechada não liberam ação; ponte Codex não vira execução lateral.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-12-01, CDX100-12-02, CDX100-12-03, CDX100-12-04, CDX100-12-05, CDX100-12-06, CDX100-12-07, CDX100-12-08, CDX100-RPC-ClientRequest-hooks.list, CDX100-RPC-ServerNotification-hook.started, CDX100-RPC-ServerNotification-hook.completed, CDX100-CVG-14.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-P01 — MCP completo, autenticação, recursos e elicitação

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: MCP completo, autenticação, recursos e elicitação. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: MCP client/server adapters e SDK bidirecional.
- Como: Cobrir transportes, OAuth/login/reload, resources/prompts/tools, cancelamento, erros, progress e elicitação do pin. Autorizar servidor/catálogo/call separadamente.
- Dependências DX100: DX100-A01, DX100-X02, DX100-H01.
- Reuso PAR obrigatório na fatia: PAR-P01, PAR-T12, PAR-H03.
- Fatias C100 propostas, sujeitas a G03: C100-P01, C100-P02. O estado permanece no 0383.
- Aceite específico: Interop real com servidor sintético nos transportes; credencial redigida e revogada; tool ID/metadata não amplia grant; aprovação/elicitação vinculada ao request atual.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-13-01, CDX100-13-02, CDX100-13-03, CDX100-13-04, CDX100-13-05, CDX100-13-08, CDX100-RPC-ClientRequest-config.mcpServer.reload, CDX100-RPC-ClientRequest-mcpServerStatus.list, CDX100-RPC-ClientRequest-mcpServer.resource.read, CDX100-RPC-ClientRequest-mcpServer.tool.call, CDX100-RPC-ServerRequest-mcpServer.elicitation.request, CDX100-RPC-ServerNotification-item.mcpToolCall.progress, CDX100-RPC-ServerNotification-mcpServer.startupStatus.updated, CDX100-RPC-ServerNotification-mcpServer.event.stream.notification.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-P02 — Apps, conectores, UI MCP e descoberta adiada

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: Apps, conectores, UI MCP e descoberta adiada. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: connector/app adapters e componentes de UI seguros.
- Como: Mapear app/list/read/installed, sugestões/tool search, tool UI resourceUri e preferred display mode; widget isolado e aprovado não herda credenciais do host.
- Dependências DX100: DX100-P01, DX100-E02.
- Reuso PAR obrigatório na fatia: PAR-P01, PAR-A07, PAR-H04.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Discovery não executa efeito; widget não escapa sandbox/origem e possui CSP; instalação/revogação refletida; acesso indisponível mantém capability pendente.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-13-06, CDX100-13-07, CDX100-RPC-ClientRequest-app.read, CDX100-RPC-ClientRequest-app.list, CDX100-RPC-ClientRequest-app.installed, CDX100-RPC-ServerNotification-app.list.updated.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-O01 — Árvore de subagentes e mailbox

- Estado: `TODO`. Prioridade: P1. Fase: F5. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Árvore de subagentes e mailbox. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: delegation/agent tree e portas de comunicação.
- Como: Reusar supervisão e complementar versões/perfis Codex, full-history fork, mensagens e notificações. Filhos têm interseção de autoridade e contabilização agregada.
- Dependências DX100: DX100-S02, DX100-X03.
- Reuso PAR obrigatório na fatia: PAR-O01, PAR-O02, PAR-O13, PAR-K06.
- Fatias C100 propostas, sujeitas a G03: C100-O01, C100-O03, C100-B01. O estado permanece no 0383.
- Aceite específico: Pai/filho/irmão têm identidade estável; filho não amplia grants; mensagem não confiável não muda policy; stop/close/respawn respeitam árvore, orçamento e tenant.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-14-01, CDX100-14-02, CDX100-14-03, CDX100-14-04, CDX100-14-05, CDX100-14-06, CDX100-14-07, CDX100-14-08, CDX100-CVG-05, CDX100-CVG-07.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-O02 — Goals, planos, filas, side conversations e jobs

- Estado: `TODO`. Prioridade: P1. Fase: F5. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Goals, planos, filas, side conversations e jobs. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: goal/plan/todo/queue e control plane.
- Como: Mapear status de objetivo, steering/interrupt, mailbox/queue, plano revisável, input síncrono/assíncrono e forks efêmeros/side/btw. Budget e pausa duráveis precedem autonomia.
- Dependências DX100: DX100-O01, DX100-A03.
- Reuso PAR obrigatório na fatia: PAR-O03, PAR-O08, PAR-O09, PAR-T11, PAR-K06.
- Fatias C100 propostas, sujeitas a G03: C100-L01, C100-O02, C100-O03. O estado permanece no 0383.
- Aceite específico: Input durante turno tem ordem registrada; goal só nasce sob pedido explícito; restart mantém pendência; plano read-only não muda arquivo; interrupção não promete desfazer efeito consumado.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-15-01, CDX100-15-02, CDX100-15-03, CDX100-15-04, CDX100-15-05, CDX100-15-06, CDX100-15-07, CDX100-15-08, CDX100-RPC-ClientRequest-thread.goal.set, CDX100-RPC-ClientRequest-thread.goal.get, CDX100-RPC-ClientRequest-thread.goal.clear, CDX100-RPC-ServerNotification-thread.goal.updated, CDX100-RPC-ServerNotification-thread.goal.cleared, CDX100-RPC-ServerNotification-thread.queue.changed, CDX100-RPC-ServerNotification-turn.plan.updated.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-W01 — Worktrees, multiambiente e atribuição Git

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Worktrees, multiambiente e atribuição Git. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: workspace/worktree adapters e git attribution.
- Como: Adicionar contratos Codex para criação/seleção/cwd/add-dir/múltiplas raízes, diffs e cópia entre ambientes; isolamento por tarefa e registro de ownership.
- Dependências DX100: DX100-S02, DX100-T01, DX100-X02.
- Reuso PAR obrigatório na fatia: PAR-T09, PAR-T05.
- Fatias C100 propostas, sujeitas a G03: C100-W01, C100-W02. O estado permanece no 0383.
- Aceite específico: Nenhuma limpeza/merge toca tarefa alheia; dirs extras só após grant; arquivos/branch/base vinculados; artefato entre ambientes conserva digest e destino permitido.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-16-01, CDX100-16-02, CDX100-16-03, CDX100-16-04, CDX100-16-07, CDX100-16-08, CDX100-CVG-15.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-W02 — Revisão de mudanças e apply de resultado

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Revisão de mudanças e apply de resultado. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: review/diff adapters e UI de aprovação.
- Como: Implementar review local/headless, achados estruturados, comparação de base/dirty tree e apply revisável; revisor não escreve nem concede autoridade.
- Dependências DX100: DX100-T01, DX100-S02.
- Reuso PAR obrigatório na fatia: PAR-T05, PAR-I06.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Achados referenciam arquivo/linha/base atuais; resultado obsoleto é recusado; apply usa preview/digest e preserva alheios; confirmação humana necessária continua vinculada.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-16-05, CDX100-16-06, CDX100-RPC-ClientRequest-review.start.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-U01 — Interface terminal e interação completa

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: **T3**. ROM delta: 18–38 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: Interface terminal e interação completa. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: host TUI CVG ou consumidor de engenharia isolado.
- Como: Mapear cada SlashCommand: menus, mentions, paste/clipboard, raw/inline/fullscreen, teclado/vim/keymap, status/tema/export e seleção de agentes. A semântica precisa de ensaio visual/teclado real.
- Dependências DX100: DX100-H02, DX100-O02, DX100-W01, DX100-P02.
- Reuso PAR obrigatório na fatia: PAR-U01, PAR-U02, PAR-U03, PAR-U04, PAR-U05, PAR-U06, PAR-U07, PAR-U08.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Todos comandos públicos e variantes porSO têm jornada equivalente; reconexão/acessibilidade e input sob stream funcionam; nenhum comando oculta erro ou perde rascunho.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-17-01, CDX100-17-02, CDX100-17-03, CDX100-17-04, CDX100-17-05, CDX100-17-06, CDX100-17-07, CDX100-17-09.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-U02 — Preferências, animações e pets da TUI

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: **T3**. ROM delta: 5–12 dias.
- Dono proposto: L2 — API, SDK, CLI e TUI.
- O que/por quê: Preferências, animações e pets da TUI. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: componentes opcionais do host TUI, fora do kernel.
- Como: Cobrir recursos de personalização/pets expostos no pin com assets próprios/licenciados; manter opção de ocultar e redução de movimento. Não confundir com plugin de pets do ChatGPT Work.
- Dependências DX100: DX100-U01.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Seleção/ocultação/persistência e fallback terminal reproduzem contrato; assets não executam código; UX pode ser desligada sem alterar funcionamento do motor.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-17-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-R01 — Daemon local e controle remoto consentido

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Daemon local e controle remoto consentido. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: daemon/service hosts e remote-control adapter.
- Como: Completar start/status/stop/install/proxy/attach, sessões concorrentes e auth/revogação; remoto usa grants explícitos e vínculos de conexão, sem socket público por padrão.
- Dependências DX100: DX100-A03, DX100-H01, DX100-X01.
- Reuso PAR obrigatório na fatia: PAR-A02, PAR-H03.
- Fatias C100 propostas, sujeitas a G03: C100-R02. O estado permanece no 0383.
- Aceite específico: Reinício recupera estado e fecha handles próprios; sessão remota não recebe grant implícito; revogação efetiva antes de novo dispatch; falha de auth fecha conexão.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-18-01, CDX100-18-02, CDX100-18-03, CDX100-RPC-ServerNotification-remoteControl.status.changed.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-R02 — Exec-server e ambientes locais/remotos

- Estado: `TODO`. Prioridade: P1. Fase: F7. Trilha: **T3**. ROM delta: 18–38 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Exec-server e ambientes locais/remotos. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: exec-server protocol, ambiente e transporte.
- Como: Mapear discover/capabilities, files/processes, ambiente remoto e reconnect do executor do pin, inclusive sandbox integrity e protocolos. Sem colocar segredo da aplicação no ambiente executável.
- Dependências DX100: DX100-R01, DX100-W01, DX100-X02.
- Reuso PAR obrigatório na fatia: PAR-A04, PAR-X01, PAR-H03.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Executor só atende comandos concedidos; rede/reconnect/restart têm idempotência e bounds; capabilities ausentes não são anunciadas; prova com host separado e controles negativos.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-18-04, CDX100-18-05, CDX100-18-06, CDX100-RPC-ServerNotification-thread.environment.connected, CDX100-RPC-ServerNotification-thread.environment.disconnected.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-R03 — Cloud tasks, handoff IDE/desktop e gateway

- Estado: `TODO`. Prioridade: P1. Fase: F7. Trilha: **T3 + T4 para ensaio real**. ROM delta: 20–45 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Cloud tasks, handoff IDE/desktop e gateway. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: adapters cloud/IDE/desktop e handoff de sessão.
- Como: Incorporar contratos que o repo expõe para listar/criar/acompanhar/aplicar tasks e abrir/continuar no cliente; definir equivalência de serviço gerenciado sem fingir acesso privado. Inclui pesquisa desde F0.
- Dependências DX100: DX100-R02, DX100-D01, DX100-U01.
- Reuso PAR obrigatório na fatia: PAR-H03, PAR-A07.
- Fatias C100 propostas, sujeitas a G03: C100-R01, C100-R03, C100-R04. O estado permanece no 0383.
- Aceite específico: Ensaio autorizado com referência acessível e cliente real; anexar/revogar/apply preservam identidade e origem; mock não fecha a variante externa.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-18-07, CDX100-18-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-I01 — Imagens e geração de artefatos multimodais

- Estado: `TODO`. Prioridade: P1. Fase: F7. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: Imagens e geração de artefatos multimodais. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: image/media adapters, output assets e UI.
- Como: Mapear view_image, anexos, detalhe/dimensões/resize e geração de imagem exposta por extensão. Preservar proveniência, limites e autorização do provider.
- Dependências DX100: DX100-M01, DX100-P02, DX100-T01.
- Reuso PAR obrigatório na fatia: PAR-M03, PAR-T04.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Arquivo inválido/grande e tenant alheio negados; budget inclui mídia; saída tem digest/MIME; geração real só no grant T4; sem promoção de dado a instrução.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-19-01, CDX100-19-02, CDX100-19-03.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-I02 — Voz, realtime e transcrição

- Estado: `TODO`. Prioridade: P1. Fase: F7. Trilha: **T3**. ROM delta: 18–38 dias.
- Dono proposto: L3 — Extensões, MCP, hooks e mídia.
- O que/por quê: Voz, realtime e transcrição. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: voice-host, realtime/WebRTC adapters e UI de áudio.
- Como: Mapear sessão realtime, SDP/itens/deltas/transcrição/interrupção/voz e cleanup; latência e reconexão têm critério definido porSPEC. Áudio é somente sintético nos ensaios.
- Dependências DX100: DX100-I01, DX100-A03, DX100-M02.
- Reuso PAR obrigatório na fatia: PAR-I01.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Input/stop/erro/desconexão têm estados corretos; transcripts não viram prontuário; consentimento e retenção explícitos; referência e CVG no mesmo contrato de mídia.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-19-04, CDX100-19-05, CDX100-19-06, CDX100-RPC-ServerNotification-thread.realtime.started, CDX100-RPC-ServerNotification-thread.realtime.itemAdded, CDX100-RPC-ServerNotification-thread.realtime.item.started, CDX100-RPC-ServerNotification-thread.realtime.item.transcript.delta, CDX100-RPC-ServerNotification-thread.realtime.item.completed, CDX100-RPC-ServerNotification-thread.realtime.transcript.delta, CDX100-RPC-ServerNotification-thread.realtime.transcript.done, CDX100-RPC-ServerNotification-thread.realtime.outputAudio.delta, CDX100-RPC-ServerNotification-thread.realtime.sdp, CDX100-RPC-ServerNotification-thread.realtime.error, CDX100-RPC-ServerNotification-thread.realtime.closed.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-I03 — Browser/computer use e automação do host

- Estado: `TODO`. Prioridade: P1. Fase: F7. Trilha: **T3 + T4 para automação externa**. ROM delta: 20–45 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Browser/computer use e automação do host. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: adapters de browser/desktop separados do core.
- Como: Conferir que partes são implementations e quais são gates de requisitos do repo; integrar apenas por capabilities com domínio/origem/telas/ações permitidas e approval. Páginas são dados não confiáveis.
- Dependências DX100: DX100-R02, DX100-I01, DX100-X03.
- Reuso PAR obrigatório na fatia: PAR-I07, PAR-I08, PAR-X04.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Prova real contra página/desktop sintético isolado, inclusive cancelamento; ação sensível não executa automaticamente; conta/serviço indisponível não é tratado como paridade.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-19-07, CDX100-19-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-N01 — Identidade, conta, consentimento e verificação

- Estado: `TODO`. Prioridade: P1. Fase: F7. Trilha: **T3 + T4 para identidade/conta externa**. ROM delta: 18–38 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Identidade, conta, consentimento e verificação. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: auth/account, credential broker e approval proof adapters.
- Como: Mapear API key/OAuth/workload identity/gateway, verificação de usuário/attestation, logout/revogação, usage/rate-limit e preferências. Não copiar branding/entitlements nem adotar identidade pessoal no núcleo.
- Dependências DX100: DX100-X03, DX100-A03, DX100-M02.
- Reuso PAR obrigatório na fatia: PAR-H03, PAR-A07.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Renovação e cancelamento vinculados à conexão/usuário; segredo redigido; atestado inválido e replay falham; e-mail/consumo de crédito exigem fluxo autorizado e sintético.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: 40 requisitos; lista exata no catálogo por owner=DX100-N01.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-V01 — Observabilidade, feedback e privacidade

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: **T3**. ROM delta: 8–18 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: Observabilidade, feedback e privacidade. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: observability, event correlation, feedback/export adapters.
- Como: Reusar audit/OTel e mapear avisos, deprecation, token/usage e feedback/upload com consentimento e redação. Distinguir log de operação de telemetria opcional do produto.
- Dependências DX100: DX100-A01, DX100-H01.
- Reuso PAR obrigatório na fatia: PAR-I02, PAR-I03, PAR-I05, PAR-I09.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Eventos correlacionados por thread/turn/tool e sem segredo; opt-out não desliga auditoria obrigatória; export/destino autorizado; erro de sink tem resultado normativo.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-21-01, CDX100-21-02, CDX100-21-03, CDX100-21-04, CDX100-21-05, CDX100-21-06, CDX100-21-07, CDX100-21-08, CDX100-RPC-ClientRequest-feedback.upload, CDX100-RPC-ServerNotification-error, CDX100-RPC-ServerNotification-warning, CDX100-RPC-ServerNotification-deprecationNotice, CDX100-CVG-04.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-Z01 — Migração de configuração e agentes externos

- Estado: `TODO`. Prioridade: P1. Fase: F8. Trilha: **T3**. ROM delta: 10–22 dias.
- Dono proposto: L1 — Núcleo, dados, modelos e identidade.
- O que/por quê: Migração de configuração e agentes externos. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: importers de config/skills/hooks/history e migrações.
- Como: Mapear externalAgentConfig detect/import/progress/recordHistory/readHistories e legacy rollout migration. Preview, origem, backup sintético e reversibilidade antes de aplicar.
- Dependências DX100: DX100-S02, DX100-E01, DX100-H01, DX100-N01.
- Reuso PAR obrigatório na fatia: PAR-S07, PAR-H02.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Import parcial/falha não sobrescreve configuração válida; conteúdo não confiável não ganha grants; progress consistente; rollback preserva evidência e trabalho de outro agente.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-22-05, CDX100-22-06, CDX100-RPC-ClientRequest-externalAgentConfig.detect, CDX100-RPC-ClientRequest-externalAgentConfig.import, CDX100-RPC-ClientRequest-externalAgentConfig.import.recordHistory, CDX100-RPC-ClientRequest-externalAgentConfig.import.readHistories, CDX100-RPC-ServerNotification-externalAgentConfig.import.progress, CDX100-RPC-ServerNotification-externalAgentConfig.import.completed, CDX100-CVG-16.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-Z02 — Empacotamento, distribuição e atualização por plataforma

- Estado: `TODO`. Prioridade: P1. Fase: F8. Trilha: **T3 + T4 para candidata/publicação**. ROM delta: 12–26 dias.
- Dono proposto: L4 — Supervisão, hosts, plataformas e remoto.
- O que/por quê: Empacotamento, distribuição e atualização por plataforma. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: build/release artifacts e instalação por plataforma.
- Como: Planejar pacotes/CLI/SDK/assets porOS/arquitetura do snapshot; dependências e licenças verificadas. Exportar schemas e atualização autenticada; publicação tem autorização própria.
- Dependências DX100: DX100-U02, DX100-R03, DX100-X02.
- Reuso PAR obrigatório na fatia: PAR-Q08, PAR-Q10.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Build reproduzível e instalação/update/rollback sintéticos em plataformas contratadas; artefatos assinados/SBOM e hashes conferidos; sem executar upstream runtime como backend CVG.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-22-07, CDX100-22-08.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-Q02 — Qualificar todas as famílias, superfícies e controles

- Estado: `TODO`. Prioridade: P0. Fase: F9. Trilha: **T3**. ROM delta: 18–38 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: Qualificar todas as famílias, superfícies e controles. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: catálogo/medidor Codex e receipts por candidato.
- Como: Executar matriz atômica referência/CVG por variante; comprovar campos/defaults/erros/estados e plataformas; CVG_CONTROL usa SPEC aprovada. Divergência e missing oracle não contam.
- Dependências DX100: DX100-K01, DX100-S02, DX100-C02, DX100-M02, DX100-A02, DX100-A03, DX100-D02, DX100-X02, DX100-X03, DX100-T02, DX100-H02, DX100-E02, DX100-F01, DX100-P02, DX100-O02, DX100-U02, DX100-R03, DX100-I02, DX100-I03, DX100-N01, DX100-V01, DX100-Z01, DX100-Z02.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Todos requisitos qualificados no mesmo SHA/digest/inputs; zero pendência/skip oculto; toda superfície rastreada; governada e literal reportadas separadamente.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-Q03 — Recuperação, segurança e performance sob concorrência

- Estado: `TODO`. Prioridade: P0. Fase: F9. Trilha: **T3**. ROM delta: 12–26 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: Recuperação, segurança e performance sob concorrência. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: fault-injection, native runners e carga sintética.
- Como: Testar crash/journal/restore, cancelamento em cada fronteira, recusa de contenção e corrida entre clientes/filhos. Congelar SLOs antes de medir; não copiar percentual de benchmark de modelo.
- Dependências DX100: DX100-Q02.
- Reuso PAR obrigatório na fatia: PAR-Q07, PAR-X03.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Sem efeito duplicado/vazamento/perda de autorização; limites e primary cause preservados; testes contra caso ruim falham; p95/memória/carga atendem alvo aprovado.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-Q04 — CI e medidor sem falsos positivos

- Estado: `TODO`. Prioridade: P0. Fase: F9. Trilha: **T3**. ROM delta: 8–16 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: CI e medidor sem falsos positivos. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: CI de paridade Codex e manifestos da candidata.
- Como: Agregar receipts autenticados porID/versão/plataforma e detectar drift sem alterar denominadoresDeepSeek/Claude; checar fonte/código/config/model/testkit/fixtures e revisão.
- Dependências DX100: DX100-Q03.
- Reuso PAR obrigatório na fatia: PAR-Q06, PAR-Q08.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Ausente/stale/tampered/duplicado/candidato distinto bloqueiam100%; nenhuma porcentagem por linhas/símbolos; controles conhecidos-ruins reprovam.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: CDX100-CVG-20, CDX100-CVG-22.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

### DX100-Q05 — Auditoria independente e aceite final dos 100%

- Estado: `TODO`. Prioridade: P0. Fase: F9. Trilha: **T4**. ROM delta: 8–16 dias.
- Dono proposto: L5 — Referência, evals, CI e auditoria.
- O que/por quê: Auditoria independente e aceite final dos 100%. Acrescentar os aceites Codex necessários, preservando a base e os controles CVG.
- Onde: pacote hash-bound e auditoria independente.
- Como: Auditor novo reproduz provas e integridade em candidata congelada; usuário decide aceite e qualquer equivalência pendente. Produção0374 permanece separada.
- Dependências DX100: DX100-Q04.
- Reuso PAR obrigatório na fatia: nenhum direto.
- Fatias C100 propostas, sujeitas a G03: nenhuma direta. O estado permanece no 0383.
- Aceite específico: Todas as 22 famílias, funções/superfícies/controles, plataformas e gates atuais aprovados; se houver divergência aberta não declarar100literal; decisão humana registrada.
- Prova futura: recibo por requisito com fonte, variante, oráculo, resultados, inputs e revisão; `NOT_RUN` até execução.
- Requisitos atribuídos: Habilitador ou qualificação transversal; não incrementa o numerador ao concluir o cartão.
- Risco e recuperação: falha não autoriza ampliar grant ou repetir efeito incerto; preservar journal e causa inicial e recuperar somente recursos próprios.
- Próxima ação: Conferir dependências e gate; preparar SPEC e fixture da fatia antes do BUILD.

## Reuso e dependências canônicas

A lista é índice de dependências; não duplica estado de execução. Cada ID/fatia aparece uma vez no orçamento de seu dono.

| Origem | IDs diretos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fonte do estado                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| PAR    | PAR-A01, PAR-A02, PAR-A03, PAR-A04, PAR-A05, PAR-A06, PAR-A07, PAR-A08, PAR-A09, PAR-C01, PAR-C02, PAR-C03, PAR-C04, PAR-C05, PAR-C06, PAR-E01, PAR-E02, PAR-H01, PAR-H02, PAR-H03, PAR-H04, PAR-I01, PAR-I02, PAR-I03, PAR-I05, PAR-I06, PAR-I07, PAR-I08, PAR-I09, PAR-K01, PAR-K02, PAR-K03, PAR-K04, PAR-K05, PAR-K06, PAR-K09, PAR-K10, PAR-M01, PAR-M02, PAR-M03, PAR-M05, PAR-O01, PAR-O02, PAR-O03, PAR-O08, PAR-O09, PAR-O10, PAR-O12, PAR-O13, PAR-P01, PAR-Q03, PAR-Q04, PAR-Q06, PAR-Q07, PAR-Q08, PAR-Q10, PAR-S01, PAR-S02, PAR-S03, PAR-S04, PAR-S05, PAR-S06, PAR-S07, PAR-T01, PAR-T02, PAR-T03, PAR-T04, PAR-T05, PAR-T07, PAR-T09, PAR-T10, PAR-T11, PAR-T12, PAR-T14, PAR-U01, PAR-U02, PAR-U03, PAR-U04, PAR-U05, PAR-U06, PAR-U07, PAR-U08, PAR-X01, PAR-X02, PAR-X03, PAR-X04 | [0380](0380_backlog_paridade_100_deepseek.md) |
| C100   | C100-B01, C100-B02, C100-C01, C100-C02, C100-E02, C100-H01, C100-H02, C100-K01, C100-K02, C100-L01, C100-O01, C100-O02, C100-O03, C100-P01, C100-P02, C100-R01, C100-R02, C100-R03, C100-R04, C100-S01, C100-S02, C100-T01, C100-T02, C100-U01, C100-U02, C100-W01, C100-W02                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [0383](0383_backlog_paridade_claude_code.md)  |

O [DAG e ROM](../04_audit/evidence/CODEX100-PLAN-20261017/plan-index.json) preserva os fechos e as fatias técnicas propostas. Não exige 100% de DeepSeek/Claude antes do Codex; exige os aceites das fatias utilizadas. Sem G03, o grafo é cenário conservador, não agenda autorizada. PAR-Q02 e C100-Q01 não são drivers Codex.

## Famílias e atribuição

- **CDX-01 — Kernel, execução e budgets**: fonte `codex-rs/core/src/session/turn.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-02 — Threads, histórico e persistência**: fonte `codex-rs/thread-store/src/store.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-03 — Contexto, instruções e memória**: fonte `codex-rs/core/src/context_manager/history.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-04 — Modelos, providers e inferência**: fonte `codex-rs/model-provider/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-05 — Arquivos, patches, busca e artefatos**: fonte `codex-rs/apply-patch/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-06 — Subprocessos, shell e PTY**: fonte `codex-rs/core/src/unified_exec/mod.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-07 — Permissões, sandbox e revisão**: fonte `codex-rs/core/src/tools/orchestrator.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-08 — App-server e protocolo bidirecional**: fonte `codex-rs/app-server-protocol/src/protocol/common.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-09 — SDK e execução headless**: fonte `sdk/typescript/src/thread.ts`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-10 — CLI, configuração e diagnósticos**: fonte `codex-rs/core/config.schema.json`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-11 — Skills, plugins e extensões**: fonte `codex-rs/ext/skills/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-12 — Hooks e lifecycle**: fonte `codex-rs/hooks/src/engine/mod.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-13 — MCP, apps e conectores**: fonte `codex-rs/core/src/mcp.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-14 — Subagentes e comunicação**: fonte `codex-rs/core/src/agent/control.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-15 — Goals, planos, filas e autonomia**: fonte `codex-rs/ext/goal/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-16 — Workspaces, Git e revisão**: fonte `codex-rs/worktree/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-17 — Interface terminal e preferências**: fonte `codex-rs/tui/src/slash_command.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-18 — Daemon, exec-server e superfícies remotas**: fonte `codex-rs/cli/src/remote_control_cmd.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-19 — Mídia, realtime e automação visual**: fonte `codex-rs/core/src/image_preparation.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-20 — Identidade, conta e atestação**: fonte `codex-rs/login/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-21 — Observabilidade, avisos e feedback**: fonte `codex-rs/otel/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.
- **CDX-22 — Code mode, migração e distribuição**: fonte `codex-rs/code-mode/src/lib.rs`; requisitos e donos específicos no catálogo. Prioridade não retira essa família da meta.

## Estado inicial e próximo passo

A entrega deste backlog está concluída documentalmente; o programa está por iniciar. **Selecionar DX100-G01** com claim documental; depois G02/G03 e G04 antes da primeira construção. Acesso ausente bloqueia a qualificação da variante, preservando o requisito. As decisões 0221/0222/0225/0228 e a produção 0374 conservam seus estados canônicos, hashes e condições; consultar os donos antes de executar.

## Continuidade CODEX100-EXEC — 17/10/2026

Pedido de implementação integral recebido; objetivo ativo sem redução de escopo. DX100-G01 em execução documental, com catálogo aditivo e contratos experimentais; G02/G03/G04 e as demais fases seguem dependências/gates. Estado e provas no pacote CODEX100-EXEC-20261017 e ExecPlan próprio; nenhum BUILD autorizado por inferência.

### Checkpoint G01 — expansão aditiva de contratos

- Catálogo `draft-r2-g01`: **485 obrigações funcionais e 22 controles CVG**, com 763 entradas no inventário de superfícies. Os 379 itens funcionais iniciais e seus campos normativos foram preservados; 106 novos itens obrigatórios acrescentados, sem comprovante funcional novo.
- Fonte app-server: 175 ClientRequests, 11 ServerRequests, 87 ServerNotifications e uma ClientNotification; 32 métodos separados do exec-server. O schema experimental do companheiro confirma 269 entradas. Cinco declarações ausentes têm disposição baseada em fonte: três chamadas legadas com dispatch e dois eventos internos experimentais. O vínculo fonte/binário continua pendente.
- Após correções da primeira revisão: 10.911 registros sintáticos app-server, 4.617 de configuração e 186 obrigações explícitas de resposta. As projeções de resposta têm 30.707 registros, com três respostas legadas sem schema exportado. Tipos transitivos, erros e reconciliação fonte/schema permanecem abertos. Contagens não medem cobertura funcional.
- Inventariados 162 manifests Cargo, 34 exports SDK, atributos CLI em 30 arquivos e fontes de ferramentas em 19 arquivos. A revisão inicial encontrou omissões de restrições e respostas; inputs e parecer preservados para revalidação.
- Evidências: [pacote G01](../04_audit/evidence/CODEX100-EXEC-20261017/g01/README.md). G01 permanece `IN_PROGRESS`; parâmetros exec-server, tipos transitivos, grafo CLI/cfg/aliases, alcance SDK/tools/componentes e revisão de escopo continuam obrigatórios.
- Próxima ação corrente: expandir as operações exec-server; a reconciliação dos 29 schemas foi aceita no recorte estático descrito abaixo. Conservar as relações CLI/factories externas ainda abertas e os cinco contratos excluídos deliberadamente do JSON. Nenhum BUILD de runtime iniciado.
- Revisão independente R2: `ACCEPT_BOUNDED_INCREMENT`, com os dois achados P2 do extrator corrigidos e inputs autenticados. O parecer não concede fechamento de G01, completude CLI/SDK, paridade funcional, gate ou aceite de reuso.

### Checkpoint G01 — grafos CLI/ferramentas e referência de schemas

- CLI: 30 variantes raiz ligadas a dispatch, 52 variantes aninhadas, 105 tipos, 305 campos e 127 relações. Revisão independente `ACCEPT_BOUNDED_CLI_GRAPH`; oito checks estáticos verdes e sete controles negativos rejeitados. Quatro relações de schema efetivo, gramática dinâmica Windows, arg0 e alcance de chamadas aninhadas continuam abertos.
- Ferramentas: 39 registros textuais, incluindo um exclusivo de teste, com 38 demais registros e 36 implementações ligadas à fonte. Após três correções P2, revisão `ACCEPT_BOUNDED_GRAPH`; oito controles negativos rejeitados. Guards de compilação, teto de sandbox herdado e relações de exposição preservados. Não é prova de disponibilidade ou execução em produção.
- A política de geração explica as cinco ausências do JSON público. Comparação de 452 schemas do pin e companheiro: 423 idênticos e 29 estruturalmente diferentes. Fonte/binário continuam sem vínculo autenticado; a matriz anterior conserva sua autoridade limitada ao companheiro.
- [Pacote do recorte](../04_audit/evidence/CODEX100-EXEC-20261017/g01/entrypoints/README.md): seis checks de integração verdes, sem nova qualificação funcional ou alteração do catálogo. G01 continua `IN_PROGRESS`; demais 48 cartões não encerrados nesta unidade.

### Checkpoint G01 — matriz vinculada ao pin

- Os 29 schemas diferentes têm 215 ocorrências estruturais ligadas a quatro grupos: imagens (192), metadata patch (16), sessão de voz (4) e metadata MCP (3). São representações repetidas e descrições, sem acréscimo automático ao denominador funcional.
- [Matriz pinada](../04_audit/evidence/CODEX100-EXEC-20261017/g01/pinned-variants/README.md): reconstrói 452 schemas públicos, configuração e dois payloads raw; conserva 274 contratos e 186 obrigações de resposta. As 103 chaves de configuração permanecem presentes. Dados do companheiro e evidências anteriores preservados.
- Corrigidos dois achados P2: indexação dos 798 tipos do namespace `v2` e retenção obrigatória das quatro explicações de grupo. São 34.400 posições, 6.002 referências e 6.600 perfis sintáticos. Onze controles negativos rejeitados; duas gerações com seeds diferentes produziram os mesmos hashes.
- Revisão `ACCEPT_BOUNDED_SOURCE_RECONCILIATION`, restrita a esse recorte. G01 permanece `IN_PROGRESS`; exec-server, CLI manual/Windows/arg0, factories externas, tipos/variantes restantes e G02 continuam pendentes. Catálogo preservado em 485 funcionais e 22 controles, sem qualificação funcional nova.

### Checkpoint G01 — exec-server: fluxos, tipos e codecs

- [Inventário e revisão](../04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-server/README.md): 32 operações preservadas — 25 pedidos e uma notificação controlador→executor, cinco notificações e um pedido reverso executor→controlador. Resposta HTTP adiada e evento de auditoria de rede separados de suas respostas internas/de concessão.
- Tipos selecionados: 137 definições, 403 campos, 51 variantes, 13 pares wire/domínio; integração das operações com 12 conversões e 78 vínculos. Vinte referências transitivas permanecem abertas; o parser não equivale a rustc ou JSON Schema de entrada.
- Verificadores: 12 negativos de fluxos e seis de integração rejeitados; pacote de tipos com 13 checks somente leitura, incluindo seis grupos negativos. Não somar esses números como porcentagem de paridade.
- Anscombe aceitou o recorte após dois achados P2 corrigidos. Dezoito inputs R2 arquivados byte a byte; formatação posterior e digests derivados discriminados. Atestação de 34 fontes contra objetos Git do pin; 46 arquivos de grafos e 37 da matriz anterior, além do catálogo, preservados.
- Herschel e Anscombe encerrados; ownership retorna ao Lead. Catálogo mantém 485 funcionais e 22 controles, zero recibo funcional. G01 e programa integral continuam em andamento; G02/G03/G04 e BUILD mantêm suas dependências e gates. Próxima ação conforme o cartão G01 e o estado próprio.

### Checkpoint G01 — adaptadores CLI, Windows e arg0

- [Pacote e revisão](../04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-adapters/review-r1.md): quatro relações manuais agora têm delegação e mutações resolvidas na fonte. São sete mutações únicas, corpos de augment/update e conversão completa de ResumeArgs. Parser e herança efetiva de clap continuam `NOT_RUN`.
- Windows: quatro campos, grupo de identidade obrigatório, conflitos/dependência de argumentos, exigência posterior de elevated, cfg de módulo/despacho e negação do modo remoto. Preservada a possibilidade de provisionamento concluir e persistência falhar; sem rollback inferido.
- Arg0: sete ramos ordenados, oito literais, 11 corpos de entrada/helper, 99 trechos e 24 fontes autenticadas; hook Linux anterior ao parser e fallback separados. Sem executar helper ou aplicar patch.
- Integração: 12 superfícies vinculadas a seis IDs existentes e seus donos. Onze negativos de adaptadores, 21 de arg0 e oito de integração rejeitados. Wegener aceitou o recorte; 19 inputs congelados, 29 fontes distintas e 253 ocorrências de spans conferidos independentemente.
- Darwin e Wegener encerrados. Os 142 arquivos dos três pacotes anteriores e o catálogo permanecem intactos; 485 funcionais e 22 controles, zero recibo funcional. G01 e objetivo integral permanecem em andamento. Próxima ação conforme cartão G01/estado próprio.

### Checkpoint G01 — factories, contributors e duas lacunas web

- [Pacote e parecer](../04_audit/evidence/CODEX100-EXEC-20261017/g01/dynamic-factories/review-r1.md): nove famílias de contributors de produção e 32 ferramentas ligadas a factories, tipos, schemas/defaults, saídas/erros, gates e handles. Censo de 5.343 blobs Rust: nove implementações de produção/seis de teste e nove registros de produção/sete de teste. Oito arquivos/11 ferramentas/836 escopos da primeira etapa preservados.
- Pipelines: 30 fontes, 24 módulos integrais, 69 corpos selecionados e 18 regras ancoradas. Quatro famílias (extensão, MCP externo, callbacks dinâmicos, hosted), seis estágios de router/seis variantes de exposição; metadata em cache separada da preparação atual de chamada. Projeção de schema não vira validação de execução ou grant.
- Catálogo: web/run standalone e busca hospedada têm obrigações explícitas distintas, atribuídas a T01/M01. Dez grupos standalone (busca, imagem, open/click/find/screenshot, finance/weather/sports/time) e response_length permanecem mandatórios. Catálogo atual 487 funcionais/22 controles; 507 registros anteriores byte-exatos, 49 cartões/22 famílias e zero recibo funcional.
- Hume aceitou 39 inputs locais e dois da raiz; conferiu 1.146 spans contributors e 99 pipelines. Os três leitores readonly passaram, com 63/13/8 negativos; seis adulterações do catálogo também foram rejeitadas antes da revisão. Números verificam evidência, não porcentagem de paridade.
- P3 herdado de S01 motivou conferência de seis contadores do backlog; cinco rótulos corrigidos por derivação do catálogo, sem alterar owner/requisito/estado/aceite. Snapshot julgado preservado; delta posterior discriminado.
- Arendt/Hume encerrados; 169 arquivos dos quatro pacotes anteriores preservados. O verificador/resultados de 485 permanecem históricos; o verificador atual exige a revisão e a expansão 487/509. Schemas runtime externos, efeitos, tipos/scalars/plataformas/componentes e G02/G03/G04 seguem abertos. G01/meta integral IN_PROGRESS, sem BUILD nativo.

### Checkpoint G01 — classificação de componentes e SDKs

- Censo fonte: 164 manifests Cargo, 163 pacotes e um manifest virtual; inclui o linter independente fora de codex-rs. O inventário anterior de 162 pacotes permanece histórico. Todos recebem papéis/propósitos/donos com fontes e consumidores declarados; teste, desenvolvimento e publish=false não excluem funções.
- 527 registros de candidatos a target, sem equivalência com targets compilados; 1.070 declarações de dependência local conservam normal/dev/build, cfg, features e opcionalidade. Bibliotecas transitivas/macros/build/plataformas continuam sem resolução semântica executada.
- Oito manifests não Cargo, 34 exports TypeScript e 37 exports raiz Python preservados. Interfaces síncronas/assíncronas, geração Pydantic, RPC e bootstrap têm inventário próprio; TypeScript não comprova Python.
- Seis variantes obrigatórias OPEN: GAP-PY-API e GAP-TS-LANGUAGE (DX100-D01), GAP-PY-RPC e GAP-GENERATED (DX100-A01), GAP-PROVENANCE e GAP-PLATFORM-PACKAGING (DX100-Z02). A [matriz de integração](../04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/integration.json) vincula IDs existentes aos contratos de idioma/distribuição; não concede aceite genérico nem altera o catálogo normativo congelado.
- 494 pares requisito–fonte vinculados, oito delegados à frente não Rust, 681 blobs Git/10.147 spans Rust e 10.358 spans não Rust conferidos; 214 arquivos de cinco pacotes anteriores preservados. Catálogo487+22 intacto, todos NOT_RUN, zero recibos funcionais e nenhum fechamento geral de G01.
- [Pacote de componentes](../04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/README.md), contratos e 24 inputs congelados para revisão independente. Estado da revisão registrado no fechamento abaixo; não inferir aceite deste checkpoint de implementação documental.

- Fechamento do recorte de componentes: [Mencius aceitou24inputs congelados](../04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/review-r1.md), sem bloqueantes;45negativos dos leitores e8adicionais rejeitados. P3 descritivo de cancelamento Python corrigido em adendo fonte-bound, mantendo inputs intactos. Sartre/Mencius encerrados; próxima ação `DX100-G01:RESOLVE-EXEC-TRANSITIVE-TYPES`. G01 e meta integral continuam IN_PROGRESS.

### Checkpoint G01 — expansão dos tipos transitivos exec-server

- Implementação documental em revisão independente: 20 referências históricas preservadas, 14 vínculos internos e seis vínculos aos três contratos externos. Os137tipos/32fluxos originais permanecem intactos;31declarações adicionadas,46campos/payloads,45variantes,19relações com codecs privados e64corpos fonte. O join tem168tipos selecionados;13operações alcançam os novos tipos e17atravessam contratos externos.
- Fontes url2.5.8/uuid1.20.0/serde_json1.0.149 autenticadas por checksums do Cargo.lock, sem instalar/importar/executar crates. Vinte e quatro membros selecionados/2.677spans externos,246declarações locais de features/dependências; unificação Cargo/targets/grammar/runtime permanecem OPEN. A leitura é de fonte, não prova de comportamento ou segurança de terceiros.
- Disposição aditiva para initialized.params Value, historicamente chamado builtin. Quatro refsValue ficam no transporte compartilhado; CapabilityRootLocation é preservado fora do alcance dos payloads atuais. Nenhum desconhecido é removido para produzir zero artificial.
- [Pacote](../04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/README.md):68negativos dos leitores/join/integração rejeitados e244arquivos de seis pacotes anteriores preservados. Primeiro congelamento R1 arquivado; R2 altera somente formato de README/digests derivados, com fontes/inventários/leitores sem mudança. Parecer final e continuidade registrados no fechamento abaixo.
- Catálogo487+22 intacto,zero recibos funcionais. Seis lacunas SDK/Python/TS/RPC/distribuição,parsers/cfg/TUI/plataformas/efeitos eG02/G03/G04 continuam mandatórios. A próxima unidade de parsing tem recon305campos (227args,33flatten,16subcommand,21skip,8manual),14parsers explícitos; não está qualificada nesta rodada.

- Fechamento exec-transitive: [Einstein aceitou R2](../04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/review-r2.md),33inputs atuais e30R1arquivados; nenhum bloqueante.68negativos dos leitores mais6independentes rejeitados.31tipos adicionados,3archives autenticados,128fontes Git únicas/24membros selecionados e3.259spans;244arquivos dos seis pacotes anteriores intactos. R1→R2 só formato/digests derivados. Raman/Einstein encerrados. Próxima ação `DX100-G01:RESOLVE-CLI-PARSER-SEMANTICS`; catálogo487+22,zero recibos,G01/goal IN_PROGRESS.

### Checkpoint G01 — parsing CLI em revisão

- [Pacote de parsing](../04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/README.md):305campos históricos e4adicionaisWindows,105tipos/82variantes do grafo preservados,18definições escalares/34variantes/46impls.14seleções explícitas em10expressões mantêm precedência sobre candidatos implícitos;39funções/helpers eTypedValueParser completo.
- Source rules preservam defaults/aliases/cfg/relações/grupos completos, quatro adapters e12superfícies manuais. Envsplit/keytrim/valor, caminho relativo/cwd/socket, ranges/erros e configTOML/fallback/alias/precedência ficam distintos de schemas ou tipos declarados. Mutações de host e validação pós-parse são mantidas como fonte, sem grant CVG por aceitação de flag.
- Integração liga309campos ao requisito/dono CLI e registra1.459famílias de aceites futuros, todasNOT_RUN.69blobsGit/3.146ocorrências de spans,313arquivos dos sete recortes anteriores preservados.60controles dos leitores/integração rejeitados; ainda não são testes de parsing do alvo.
- Vinte e três inputs congelados para revisão independente. Escalares std/externos e seleção efetiva Clap/macros/cfg/env/cwd/plataforma continuamOPEN; seisgapsSDK e cinco limites externos anteriores permanecem obrigatórios. Parecer final e fechamento do recorte registrados abaixo; G01/meta integral continuam IN_PROGRESS.
- Próxima unidade preparada: interface terminal,65variantesSlashCommand/291AppEvent e1.131arquivosRust de origem com testes/suporte ainda sujeitos a classificação. A declaração de enum não prova disponibilidade/dispatch/efeito.

- Fechamento parserCLI: [Hubble aceitou23inputs](../04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/review-r1.md),sem achados obrigatórios/rework.309campos,18escalares/34variantes/46impls,14parsers/10expressões/39corpos;60negativos dos leitores mais16independentes e8probes de fonte,69blobs/3.146spans(1.426coordenadas únicas),313arquivos anteriores intactos.1.459famílias futurasNOT_RUN,não testes executados. Parfit/Hubble encerrados. Próxima ação `DX100-G01:MAP-TUI-INTERACTION-SURFACES`; catálogo487+22,zero recibos,G01/goal IN_PROGRESS.

### Checkpoint G01 — vínculos de comandos, eventos e interações TUI

- [Aquinas aceitou42inputs locais e2de raiz](../04_audit/evidence/CODEX100-EXEC-20261017/g01/tui-interactions/review-r1.md), sem achados obrigatórios/retrabalho; dois workers e crítico encerrados.65SlashCommand,291AppEvent/477campos,8requisitos U01/14famílias e34âncoras vinculados.63braços bare/26inline,aliasStrum/Goal,tiersdinâmicos,guards/draft/histórico e ownership de domínio preservados.
- Censo1.131Rustsrc+3targets,1.466paths auxiliares;698candidatosnão exclusivosdeteste/432deteste/1retidonãoresolvido,13.722imports/1.282declaraçõesmodulares/11includes. Cfg,macros,paths e chamadas são candidatos de fonte, sem prova de compilação/produção.
- Integração1.135blobsGit/55.812spans(44.022coordenadas),340arquivos e8manifestos anteriores preservados.82negativos dos leitores/manifestos/integração,6probesCFG e22negativos independentes passaram.370famílias futurasNOT_RUN e2famílias dinâmicas não são recibos; os291efeitos de eventos mantêm ownerdetalhadoOPEN.
- Catálogo487funcionais+22controles permanece byteexato, estados/CVGNOT_RUN e0recibos; observações históricas da referência preservadas. G01 e meta nativa integral IN_PROGRESS, sem NativeBUILD/gate/release. Próxima ação `DX100-G01:CONSOLIDATE-VARIANT-REGISTRY`; recon identifica179placeholders genéricos a complementar, sem reduzir escopo.
- SidecarG03readonly observou55pathsClaude100 byteexatos à candidata indicada pelo dono; os702testes são relatório de terceiro, sem novo gate/aceiteCodex. Evitar duplicar kit/comparador/fixtures, mantendo G03 obrigatório. [Observação atual](../04_audit/evidence/CODEX100-EXEC-20261017/g03-reuse-observation-tui-checkpoint.json).

### Checkpoint G01 — registro unificado de fontes e variantes

- [Dirac aceitouR2](../04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/review-r2.md),70inputs locais+2raiz intactos e32snapshotsR1byteexatos. UmP2 de associação irrelevante ToolSearchHandler→busca de arquivos foi removido, com regressão de domínio;178outros registros idênticos, sem novos achados. Worker/crítico encerrados;um retrabalho.
- Nove pacotes/386arquivos+9manifestos preservados.19.947fragmentos tipados e4filhos packaging de suporte, sem contar metadados/tipos privados como funções;todos487requisitosfuncionais recebem relações candidatas de fonte.179placeholders complementados por1.828ligações/124spanssementes/976dimensõespropostas, com aceite semântico específicoOPEN. Catálogo487+22byteexato, estados/CVGNOT_RUN,0recibos.
- Owners normativos preservados;1.078relações de outro papel de fonte e226sem ownerliteral retidas separadamente, sem transferência de dono. SeisgapsSDK/cincolimitesexternos/291correlaçõesTUI e15.153fragmentos tipados sem atribuição continuam explícitos.71controles dos leitores/normalizador/join;R1probesRFC6901/getter eR2regressão1positivo/8negativos independentes, sem transformar controles de igualdade em provas funcionais.
- [Primeira jornada proposta](../04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/first-native-journey.json):18variantes futurasNOT_RUN. Fontes CVG mostram SDKsingle_pass, ModelGatewaycomplete-only e composição iterativa condicionada aorchestrator/stepstore;stream/toolloop/cancel/resume exigem SPEC concreta e referência autenticada. Proposta não é SPEC0231 nem aprovaçãoBUILD.
- Próxima ação `DX100-G01:EXPAND-SDK-LANGUAGE-CONTRACTS`, [recon40fontesSDK](../04_audit/evidence/CODEX100-EXEC-20261017/next-sdk-language-recon.json):37exportsPython/63membros/34exportsTS;PythonAST e possível ASTTypeScriptparse-only sob novo contrato, sem imports/execução do alvo. G02/G03/G04 e49cartões/22famílias permanecem obrigatórios;G01/meta integralIN_PROGRESS. Ledgers concorrentes porhandoff/regra5;sem NativeBUILD/release/commit/push.
