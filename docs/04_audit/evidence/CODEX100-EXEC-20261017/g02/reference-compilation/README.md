# G02 — compilação offline da referência fixada

## Estado atual — CLI fonte pinado e runtime inicial aceitos

Tentativarelease387a2e8a4c/sessão75896TERMINAL0/semaborto2525.503s,ELF1477793024bytes/SHA5cce7264,pin8d9f6466,1289eventosCargo/9288fontesrechecadas. [Atestado](build-provenance.json) e [aceiteboundedG02](../../g02-reference-acceptance.json); fonte/defaultfeatures/releaseThinLTO/debug/stripfalse/codegenunits4 preservados. Scopeinativo,nenhumjobcompilador/probe próprioaretomar.

[Sonda keyless real](../keyless-cli-probe/RUNTIME-REPORT.md):4comandos/9observações/6respostas+1notification,exit0/cgroupvazio/ELFunchanged,semmodelo/tool/conta. Versãoobservada0.0.0,sem vínculoinferidoao instalado0.163.0. Revisorfresh-contextMeitneraceitourecorte; hashELFintegralconferido/recheckdeinsumosporamostragem. Outrosbinários/plataformas/opt-ins/SDK/oráculosM1/CVG/paridade continuamabertos. Seçõesseguintes sãohistóricodocompilee suasrecuperações,nãojobs atuais.

Task `DX100-G02:BUILD-PINNED-OFFLINE-REFERENCE`. [Contrato](contract.json) registrado antes de executar build scripts/proc macros upstream. Esta fase constrói o CLI da referência para comparações futuras; não implementa funcionalidades nativas no harness e não concede PASS funcional.

Fonte: pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`, cópia física própria9.288paths. Toolchain oficial Rust/Cargo1.95.0 e [dependências fixadas](../locked-dependencies/README.md) entram somente leitura. Comando preserva defaults e perfil release original:

```text
cargo build --frozen --release -p codex-cli --bin codex --jobs 4 --message-format=json-render-diagnostics
```

O alvo é o host Linuxx86_64gnu, sem flags/features substituídas. Um build desse binário não cobre automaticamente plataformas diferentes, outros binários, opt-ins ou serviços proprietários. Uma compilação bem-sucedida também não demonstra reprodução bit a bit em uma segunda compilação independente.

O processo roda em namespace sem rede, sem home/configuração/credenciais/sockets pessoais, sem Docker ou serviços do harness. Fonte/vendor/toolchain e ferramentas do sistema são somente leitura; apenas target, build-work e tmp privados recebem escritas. Antes de compilar upstream, as guardas confirmam esses limites, ausência de rotas e programas mínimos confiáveis de C/Rust testam o linker. Dois aliases públicos de compilador reproduzem os links `/etc/alternatives/cc` e `c++`, sem montar o restante do `/etc`.

O cgroup efetivo é verificado antes de entrar na namespace:12GiB, sem swap,4CPUs,256tasks, prazo7200s. O monitor do Lead aborta somente o scope/processgroup próprios se o disco livre cair abaixo de8GB ou o build exceder22GB. Essa observação periódica não é quota de filesystem; concorrência no disco continua possível.

A [primeira falha](preflight-r1-failure.json) foi do guard de symlink e ocorreu antes do scope. A [segunda](preflight-r2-recovery.json) foi a resolução de aliases do compilador no preflight; guards de kernel/namespace passaram, mas o build não começou. A [falha de linker](linker-recovery.json) veio de montar o ELF sob o caminho do alias e mudar a procura de componentes GCC. Logs, helpers originais e diretórios dessas tentativas foram preservados; nenhuma flag da referência foi relaxada para corrigir o ambiente.

O [estado vivo](live.json) identifica a tentativa e scope correntes; logs podem crescer enquanto `RUNNING`. Usar o mesmo handle de execução registrado na continuidade. Não executar novamente `run.py` para acompanhar um job vivo: o runner rejeita essa duplicação. O helper também recusa sobrescrever build-work/target existentes; qualquer nova tentativa requer diagnóstico registrado e preservação explícita dos recursos anteriores.

Saídas metadata/tree e versões de ferramentas ficam no build-work próprio; seu vínculo por hash e a proveniência do ELF serão emitidos após término. `live.json` e logs de tentativa ativa não são inputs imutáveis de revisão. O executável Codex resultante não pode ser executado nesta fase. Oráculos, fixtures reais/keyless e contrato de sondas futuros ainda são necessários; G02 global permanece aberto.

## Pré-requisitos acrescentados ao ambiente

A tentativa78aeca terminou101 em85.377s pela ausência de headers OpenSSL,sem ELF. A fonte do build bwrap também pede libcap-dev. O [sysroot privado](../native-prerequisites/README.md),246entradas/quatro packagesUbuntu autenticados,foi vinculado pelo [adendo atual](native-build-addendum.json). OPENSSL_INCLUDE_DIR/OPENSSL_LIB_DIR e includes/pkg-config apontam a ele; é somente leitura. Sem alterar Cargo.lock/source/defaults/features/perfil ou usar CODEX_SKIP_BWRAP_BUILD. Programas fixos OpenSSLversion/libcapinit/free validam o ambiente antes do build original. A primeira versão do adendo OpenSSL,antes de incluir libcap,não foi executada.

Tentativa corrente56f31f7bf6: job28877,scope próprio,guardas e probesPASS; referência ainda em compilação. `live.json` é a autoridade de estado; esses logs permanecem mutáveis até término. Não confundir o término do job98092 com o término do job atual.

## Recuperação do monitor

O job28877/release56f31f7bf6 terminou por `DISK_MONITOR_FAILED` em155.801s, sem erro de compilação upstream nesse trecho. A primeira implementação não preservou stdout/stderr do `du`, portanto a causa exata da falha de medição é UNKNOWN. O scope foi reconferido inativo,sem processos remanescentes. Arquivos temporários desaparecendo durante a medição são uma hipótese; não são apresentados como causa comprovada.

O [contrato de recuperação](monitor-recovery-contract.json) mantém todos os limites e o mesmo build default/release. O monitor agora preserva diagnósticos, tenta no máximo três medições quando apenas ENOENT de caminho desaparecido é observado e continua abortando por erro diferente, timeout, limite ou tentativas esgotadas. O encerramento de scope próprio usa SIGKILL explícito e aguarda inatividade.

A retomada verifica os hashes das4.934entradas do cache parcial próprio do jobanterior,2.390.453.032bytes regulares, antes de reutilizá-lo sob o mesmo caminho de namespace. Esse cache é input mutável de compilação, não ELF/qualificação aceita; nenhum cache externo ou de outra task foi usado. O work anterior ficou preservado e o novo work começa vazio. Essa exceção concreta substitui a exigência anterior de target vazio; nenhuma feature/flag/fonte/lock/limite mudou. Sessão de retomada95774; usar o estado vivo para o scope e resultado atuais.

## Escopo dos binários e correção de descrição

A árvore efetiva do CLI contém `codex-linux-sandbox`, mas não o workspace `codex-bwrap`, que fornece o binário separado `bwrap`. A descrição inicial de libcap como pré-requisito já necessário ao CLI foi ampla demais. OpenSSL foi a falha real desse target; libcap prepara o helper separado ainda obrigatório para cobrir a referência completa. O [registro de correção](target-scope-correction.json) vincula as fontes e mantém essa obrigação aberta. Nenhum requisito foi removido e o verificador de CLI não usa ausência de bwrap como falsa prova ou falha de compilação do CLI. O relatório nativo de aquisição anterior permanece preservado byte a byte, com esta errata posterior.

O monitor teve um segundo aborto em3817: os diagnósticos reais tinham prefixo `/usr/bin/du:`, não reconhecido pelo primeiro reparo. [Regressão real](monitor-regression-r2.json):2formas positivas e6erros inválidos rejeitados; a causa desconhecida de56f continua desconhecida. [ContratoR2](monitor-recovery-r2-contract.json) vincula7061entradas/3.267.345.615bytes do cache próprio; mesmos limites/configuração. Jobatual78194/release53b4db9508 está em compilação. Nada neste texto substitui o estado vivo nem autoriza executar o CLI produzido.

## Capacidade após OOM confirmado

O job78194/release53b4 teve OOM confirmado no [journal próprio](memory-failure-journal.txt):pico11.8GiB/0swap/469s,scopeinativo. O monitor de disco reconheceu e repetiu corretamente o ENOENTreal em252s; essa execução não parou pelo monitor. `Result=success` de uma unidade coletada e recriada ao consultar não invalida o evento `oom-kill` do journal.

O [contrato de memória](memory-recovery-contract.json) mantém perfil/defaults/fonte/lock e limita o novo scope a18GiB/4CPU/256tasks/sem swap/7200s. Cargo passa a jobs1,paralelismo de agendamento; codegenunits4/ThinLTO/otimização/debug/strip originais continuam. É exigida disponibilidade26GiB antes e imediatamente antes do lançamento; disco8GB/22GBmonitor permanece. As10237entradas/6.309.175.970bytes do cache próprio foram vinculadas antes de reutilizar,workanterior preservado. Jobcorrente9149/release1a7b51ad27; seguir live.json,sem duplicar.

## Recuperação de storage após o job9149

A tentativa release1a7b51ad27 terminou em3334.202s,exit-9/DISK_RESERVE_GUARD,scopeinativo; journal confirma ausência deOOM e pico10.8GiB. O monitor preservou o motivo, mas não o valor exato de free no cruzamento: esse valor ficaUNKNOWN. Não houveELF/execução/atestado daCLI. Logs, relatório, journal ehelpers anteriores foram preservados.

[Contrato de recuperação](disk-recovery/contract.json) e [relocação verificada](disk-recovery/relocation.json):12074entradas/10.218GBregulares do cache próprio parcial foram copiadas porcopy2 para/mnt/ia,com bytes/SHA/modo/mtime/links iguais antes/depois; só então a cópia antiga foi removida. Nenhuminput aceito vendor/source/toolchain/native/helperbwrap ou arquivo alheio foi removido/movido. ROOTfree passou a17.815GB e destino67.716GB. O cache ainda não é artefato aceito.

[Adendo de storage](storage-recovery-contract.json),SHA d4a34ccce8f49a3c86d0bc84400db73aa28d60e433c3d13bc6eeeca62ab40322,vincula10335arquivos/links para retomada; namespace/targetnão mudou. Nova tentativa **release387a2e8a4c,sessão75896,runner2387514/child2388389**; consultar live.json paraestado/unitsinais atuais e acompanhar mesmojob. Mesmos18GiB/jobs1/CPU4/256tasks/0swap/7200s/defaultrelease/ThinLTO/codegenunits4; monitor agora verifica osdoisvolumes>=8GB,>=16GBpreflight e ownwork+target<=22GB. Sem baixar a reserva ou alterar source/flags/lock para obterverde.

Verifierpós-build lê o hosttarget do adendo sem mudar o artefato esperado/target/release/codex dentrodoCargo. Sua query decleanup exige returncode0/LoadStateválido/scopeinativo e cgroup vazio/removido pelo caminho exato da prova kernel; stdoutvazio de erro não conta como inatividade. Versão anterior arquivada em disk-recovery. A [sonda keyless](../keyless-cli-probe/README.md) continua runtimeNOT_RUN/HOWR2aceito,em contrato separado antesde qualquerexecução doELF.
