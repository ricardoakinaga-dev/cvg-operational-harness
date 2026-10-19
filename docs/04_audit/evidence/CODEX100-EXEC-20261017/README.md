# CODEX100 — execução integral em andamento

Meta: implementar os planos 0384/0385/0386, preservando o escopo original e seus acréscimos. A implementação integral ainda não está concluída.

Checkpoint atual: [12IDs positivos com settlement real](g02/id-settlement-replan/REPORT.md),uma conexão/14writes14responses eprecedênciaown-write/nextwrite/EOFverificadas. R2aprovouHOW/reader estaticamente; Leadrecomputouruntime,scopecgroupencerrados/ELFintacto.11edgesOPEN ebindingsparciaissemcréditoCVG;old285originalretido. PróximaT1recon échecarunknownmethod/error síncrono/FIFO paraasbordas,somentehipótese,nãonovaexecução. SPEC0231pendente da perguntahumana existente.

Checkpoint vigente: [diagnóstico real de IDs](g02/lossless-wire-probe/REPORT.md),23casos/69writes/guardas23/exit0/cleanup/ELF conferidos. R2aceitou somente diagnóstico delimitado:4echoesexatos,8IDsdeclarados e11edges inconclusivosatéEOF. A prova de oráculos i64 permaneceINCOMPLETE; tentativa/reviews esgotadas eatoresencerrados. Próximo trabalhoéT1replan de lifecycle pararespostasválidas, sem rerunautomatico. SPEC0231humanpending e487+22semrecibos.

Checkpoint mais recente: [reconciliação fonte e corpus aceita](g01/axis-reconciliation/ACCEPTANCE.md), R1/R2 sem achados pendentes, atores encerrados. Nove observações reais preservadas e54eixos classificados com49citações/37fontes pinadas; todos54OPEN e487+22sem recibos. A SPEC0231 continua aguardando a pergunta humana já enviada. Próxima unidade independente prepara limitesi64/envelopes de referência, sem BUILD inferido.

Checkpoint vigente: referência Linux de fonte oficial compilada e atestada, nove observações keyless executadas e [aceitas no recorte](g02-reference-acceptance.json); processos encerrados. A versão observada foi `codex-cli 0.0.0`. A equivalência com a distribuição instalada e a cobertura de todas as variantes continuam abertas. [REA principal](g02/compiled-cli-rea/README.md) registrou provider indisponível, sem alterar configuração.

Discovery0021 e PRD0030 validados documentalmente; [SPEC0231 e pacote de decisão](g04/qualification-mechanism-design/decision-packet.md) prontos para revisão humana T3 após R2 independente sem achados. Nenhum BUILD nativo novo ou recibo funcional. O qualificador proposto não substitui a jornada READ→WRITE retida→approval→retomada→stream→restart. [Diagnóstico G03 adicional](g03/reuse-native-delivery-probe/REPORT.md) encerrou com falha de fixture/duas tentativas, sem nova repetição automática.

As referências de execução/drafts nos checkpoints anteriores são históricas. O estado vigente está em state.json e continuation.json.

- [ExecPlan](../../../../.agent/plans/codex100-exec-20261017.md), [backlog](../../../03_build/0386_backlog_paridade_codex.md), [catálogo](../../../03_build/tracking/codex100_catalog_v1.json) e [estado próprio](state.json).
- [Entrada](entry.json), [catálogo inicial](catalog-input-draft-r1.json) e [backlog inicial](backlog-input.txt): baseline preservada antes da expansão.
- [G01](g01/README.md): 108 obrigações adicionadas; 487 funcionais e 22 controles no catálogo candidato corrente. G01 permanece aberto, sem qualificação de runtime.
- [Scout G03](g03-scout-readonly.md): análise de reuso e autoridade; resultados de terceiros não constituem aceite integrado de PAR.
- [Verificação corrente](verification-current.json) e [handoff](../../../08_runtime/handoffs/codex100_exec_20261017.md): continuidade, resultados e deltas para os ledgers.
- [Revisão independente R2](review-r2.md): incremento estático aceito após duas correções P2; 16 checks T1 verdes. [Manifesto](manifest.json) identifica os artefatos deste checkpoint, sem conceder qualificação funcional.
- [Grafos e exports](g01/entrypoints/README.md): CLI e ferramentas aceitos em revisões independentes do recorte, seis checks de integração verdes e comparação de 452 schemas com 29 diferenças, que originou a reconciliação seguinte.
- [Reconciliação pinada](g01/pinned-variants/README.md): diferenças ligadas a quatro grupos de fonte, 455 documentos reconstruídos sem perda e 11 controles negativos rejeitados. [Aceite independente](g01/pinned-variants/review-r2.md) limitado ao recorte; próxima ação: tipos e dispatch das 32 operações exec-server.

O controller compartilhado AUD0592, ledgers 99/20/30 e carteiras PAR/Claude100 permanecem sob seus respectivos donos. Nenhum BUILD de runtime ou release foi concedido por esta análise estrutural.

- [Exec-server](g01/exec-server/README.md): 32 fluxos e 137 tipos selecionados, com [aceite independente limitado](g01/exec-server/review-r2.md). Vinte referências transitivas abertas; próxima unidade: adaptadores CLI/Windows/arg0.

- [CLI/Windows/arg0](g01/cli-adapters/review-r1.md): quatro adaptadores, sete ramos arg0 e 12 superfícies aceitos no recorte de fonte; 40 negativos rejeitados. Próxima unidade: factories dinâmicas de ferramentas/extensões/MCP.

- [Factories e contributors](g01/dynamic-factories/review-r1.md): nove famílias/32 ferramentas e duas obrigações web, com 507 registros anteriores byte-exatos. Revisão de fonte aceita; próximo passo: classificação dos componentes. O [verificador atual](verify_current.py) exige o catálogo487; [verificador anterior](verify_increment.py) e seus resultados preservam o checkpoint485.

- [Componentes e SDKs](g01/component-surfaces/README.md): censo completo de 163 pacotes Rust e oito manifests não Cargo, com variantes Python/TypeScript e seis lacunas obrigatórias abertas. [Revisão independente aceita](g01/component-surfaces/review-r1.md), com correção aditiva P3 de descrição e seis lacunas obrigatórias OPEN. Próximo passo:20referências transitivas do exec-server; zero recibos funcionais.

- [Tipos transitivos exec-server](g01/exec-transitive/README.md):20referências com disposição aditiva,31tipos novos e três contratos externos com fontes autenticadas. Codecs legados/privados e limites de biblioteca preservados; [Revisão independente R2 aceita](g01/exec-transitive/review-r2.md),68+6negativos rejeitados e244arquivos anteriores preservados. Próxima ação:parsersCLI; nenhum recibo funcional.

- [Parsing CLI](g01/cli-parser-semantics/README.md):305campos históricos/4Windows,18definições escalares e14parsers explícitos, com1.459famílias de aceites futurosNOT_RUN. Fonte ligada a tipos/regras/contextos; [revisão independente aceita](g01/cli-parser-semantics/review-r1.md),60negativos dos leitores+16independentes e8probes fonte. Próxima unidade:interaçõesTUI; sem qualificação funcional ou fechamentoG01.
