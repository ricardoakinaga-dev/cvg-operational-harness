# 0408 — Supersessão dos insumos da composição comum e nova qualificação local

Task `GBRAIN-LOOP-U13-K04-COMMON-LOCAL-R2`. Trilha T2 pela governança D12:
composição mecânica de componentes já revisados com dependências corrigidas
dentro das faixas existentes. Nenhuma alteração de corpo de código, contrato
público, política, schema, piso ou limite. O gate abaixo autoriza somente a
operação local descrita; não concede aprovação de CI, main ou produção.

## Recon e insumos

A task0406 qualificou a candidata7200, baseada em cfb954b4. Seu gate unitário
atual passou:7.437casos/516arquivos/0falhas-pendências-todo; fonte2384 e
36componentes+6correçõesCI+22pins conferidos. A mesma sessão91189 está na
cobertura. Esse resultado permanece associado àquela fonte.

A CI40029064396 deCLOSE revelou dois pacotes moderados permitidos pelo auditor,
mas incompatíveis com o verificador que exige zero. A correção0407 foi revisada
porHerschel, aceita no escopo dos componentes e publicada como commit normal
`c6e71f79346984ea0fdab47a583111de047472fc` noPR28. GBrain88457/89300 eGETprimário
doPR confirmam publicação; a novaCI40044236342 ainda tem gates próprios.

O pacote de reconciliação92712 verificou os objetosGit completos: somente
três registros do lock mudam, cada um em versão/URL/integridade;
fast-uri3.1.8→3.1.9,4.2.1→4.2.3 eundici7.30.0→7.30.1.
LocknovoSHA51c5986bb8749312dd180f134bd6300781995436378666e311a37353f9fe24f1;
Zod4.6.7, ranges, demais registros,31package.json do inventário nativo e cinco
blobsCI anteriores permanecem iguais. Os sete blobsCI da publicação foram
conferidos. Nenhum dos dois paths alterados se sobrepõe aos36componentes.

Duas composições em índices privados deram a mesma árvore esperada:
`658f5c1bdeaa7dcfccdcc480eaad215c1969d734`.
São c6e+patch36 e HEADlocal56490e+delta0407. Patch36 mantém SHA
`d0a892379649bae2b92219b9cdd70232321eee05e3ef5d1f1647d18f8346850a`.
Essas projeções não materializaram a nova candidata nem executaram gates.

## Encerramento controlado da execução anterior

1. Preservar fonte7200, driverd17689c2, outputs e autorização0406. Não aplicar
   o novo lock na candidata ativa. Deixar a cobertura atual concluir naturalmente,
   com os limites originais. Não sinalizar seu grupo246799/start45896694.
2. Se a execução anterior terminar ou a cobertura falhar, consumir o recibo
   terminal real da mesma91189 e preservar a causa original. Nenhum sinal será
   necessário; a supersessão não pode apagar uma falha observada.
3. Se a cobertura terminarPASS e o driver continuar a barra da fonte antiga,
   encerrar explicitamente por **supersessão de insumos corrigidos aceitos e
   publicados**, não por silêncio, observação expirada ou tentativa de obter
   verde. É uma interrupção de qualificação local obsoleta, sem aceite0406.
4. O observador próprio pode usar pidfd da identidade atual apenas para esperar
   a saída. Depois doPASS, só pode tentarTERM no grupo de um gate seguro
   posterior: `coverage-critical` ou, se esse já terminou, `worker-startup`.
   Não sinalizar coverage,mutation,image,certify ou always-finalize. Se perder
   essa janela, registrar OBSERVER_WINDOW_MISSED/sem sinal e reavaliar a mesma
   execução; não perseguir outros grupos automaticamente.
5. Antes de uma única tentativaTERM, registrar autorização, snapshot do estado,
   PID/startticks/PPID/PGID/UID/cwd e membros do grupo. O líder deve ser filho
   direto do runner4189728/start45596186, ter PGID igual ao seuPID e cwd da
   candidata própria. Todos os membros devem pertencer ao UID do agente.
   Revalidar a identidade imediatamente antes do sinal. Nunca sinalizar o
   runner, um peer, nome genérico ou PID sem sua geração. Alvo já encerrado
   significa NO_SIGNAL_TARGET_GONE, não autorização para perseguir outro.
6. O driver original permanece intacto e executa seu cleanup de grupo e
   always-finalize nativos após o filho encerrar. Consumir a resposta terminal
   real91189 uma vez. Registrar os códigos/ausências efetivos, distinguindo
   interrupção voluntária da execução, falhas nativas e gates não executados.
   O erro do driver por sinal nunca será descrito como assertion de cobertura.
7. Arquivar logs e artefatos, atribuir produtores atuais e preservar os resultados
   unitários e de cobertura concluídos. A0406 fica supersedida/não qualificada;
   os resultados parciais não qualificam c6e. O coletor de bytes preparado pode
   ser usado com o recibo real, complementado pela adjudicação de cancelamento.
8. Antes de nova materialização: comprovar ausência das identidades próprias,
   localizar eventuais filhos que usam os paths privados e encerrar só processos
   com identidade/UID/cwd e origem próprios comprovados. PGantigo somente pelo
   IDe854…/labelCOMMON-R1/imagem3c5…, zero clientes e stop/rm verificados. Não
   tocar containers, processos, portas ou volumes de peers; nenhum prune.
   Conferir API35301/web45301 livres emIPv4/IPv6. Reter arquivos de diagnóstico
   privados quando necessários; não apagar evidência para aparentar limpeza.

## Nova candidata e recursos

Somente depois da execução anterior terminal, coleta e cleanup:

- Nova worktree detached em
  `/home/ricardo/cvg-u13-k04-common-20261024/candidate`, basec6e+patch36exato.
  Conferir árvore658f5c1b,36blobs/modos,7blobsCI e22pins. Nenhuma edição de corpo.
- Registrar a composição com commitLOCAL de apenas36paths explicitamente
  conferidos, sem hooks/assinatura/push/merge. Antes do primeiro gate, código
  limpo e HEAD/tree próprios registrados; main e índice compartilhados intactos.
- Node22.23.2 e deps privadas físicas. Bootstrap de dependências, se necessário
  para os helpers, é somente cópia física privada sem caches/aliases para o
  recurso antigo; a instalação canônica `npm ci --ignore-scripts` será executada
  no novo catálogo e deverá instalar as versões do novo lock sem alterá-lo.
- Cache/npmrc/Dockerconfig/logs/outputs privados; scanner físico oficial8.28
  SHA5fd1b3b0…copiado para bin próprio. Sem HOME override, credencial pessoal,
  apt,sysctl,instalação de host, modelo,provider ou canal real.
- TMPnovo0700 `/home/ricardo/cvg-u13-common2-tmp`, ext4NVMe persistente, sem
  reaproveitar o namespace de execução antigo.
- PGnovo descartável cvg-u13-k04-common-20261024-pg,
  labelGBRAIN-LOOP-U13-K04-COMMON-R2,imagemcachedsha256:3c5c8892…,
  loopback32803,DBcvg_u13_common2_test/rolepostgres,SQLTCP da instância final,
  tmpfs512MiB/1GiB/1CPU/128pids/sem volumehost. Apenas dados sintéticos.
- API35301/web45301 próprios, novamente verificados livres antes de uso;
  PGproof auxiliar e imagemDocker apenas recursos próprios identificados.

## Catálogo e evidências

Extrair novamente o catálogo das fontes materializadas. A fonte publicada atual
tem35gates externos/16internos; qualquer diferença exige reconciliação antes de
executar, sem omitir requisitos. Executar todos os comandos nativos, inclusive
instalação, tipos, lint, build, unit, cobertura, critical/mutation, PG/proofs,
E2E/browsers, skip, imagem, SBOM, licenças, segurança,certify,verificador,diff e
artefatos. PG é obrigatório. Nenhum reuso0261, filtro, skip novo ou retry atéverde.

Identidade e run serão emitidos pelos helpers nativos depois da composição;
nenhuma previsão de inventário é certificado. Manter LOCAL_UNSEALED verdadeiro,
zero sealsGitHub confiáveis e nenhuma variável que forje execuçãoGitHub.

Preservar os limites3600s por gate/9000s parentcertify/globalwrapper18000s,
defaults e overrides originais,100% das quatro métricas por arquivo nos quatro
grupos neutros e agregado90/85/90/90. Playwright mantém sua configuração e o
validador original que rejeita resultados com retries/flaky. PrimeiroFAIL para a
sequência externa; always-finalize nativo sempre. Fonte e inputs congelados
durante a execução; nenhuma transferência dos PASS7437 de7200.

Conferir reports/logs/contagens/inventários/hashes/run/candidate/executionId e
produtores atuais. Nunca converter relatório herdado ou mtime de cópia em
execução nova. Registrar git.dirty bruto: outputs nativos atribuídos ao produtor
não são códigoWIP. Nenhum arquivo será apagado/commitado para ocultar esse
estado; inputs de fonte devem permanecer exatamente congelados. Documentos e
evidências anteriores imutáveis permanecem preservados.

## Gate e pronto

`IMPLEMENTATION_READY_LOCAL_T2`: task, estaSPEC/hash, claims e insumos aceitos
registrados antes de qualquer sinal ou nova materialização. Lead autoriza apenas
a transição local e os gates descritos. Não há novo delta públicoT3/T4; original
Returns/K04full continua com seu responsável e revisão humana própria.

Pronto somente com nova fonte materializada exatamente, identidade real, todos
os gates atuais completosPASS, artefatos íntegros/produtores verificados e cleanup
próprio. Se falhar, preservar evidência e registrar próximo reparo delimitado;
não repetir atéverde. Nenhum reset de reviewbudget NativeBinding/receiver/fixture
ou0407. U13operacional, CI/main,24unidades/42critérios e produção permanecem
sujeitos às provas e decisões próprias; nenhum release é concedido aqui.

## Adendo R2 — armazenamento da fixture após falha observada

A execução91189 terminou naturalmente com código1 emphase2/test:postgres.
Não houve sinal aplicado pelo observador83711. As evidências originais estão
preservadas emcommon-local-r1/terminal-r1,postgres-exhaustion-forensics-r1 e
cleanup-r1. O PostgreSQL registrouPANIC/ENOSPC empg_wal e encerrou comPID0,
exit1/OOMKilledfalse; o tmpfs de dados estava limitado a512MiB. A coleta contém
116snapshots íntegros. Os18processos originais não existem e o contêiner próprio
foi removido; portas e labels conferidos. Os84FAIL/105setupSKIP permanecem
resultados negativos da tentativa anterior, sem reexecução ou dispensa.

Este adendo substitui prospectivamente apenas a previsão de backingPGdata512MiB.
A estratégia de interrupção não é mais necessária: a fonte anterior já terminou
por falha nativa. Nenhum observador novo será iniciado. O original201fb211 e
suas autorizações/snapshots ficam preservados; a execuçãoR2 deve usar uma nova
versão de task/SPEC/autorização, explicitamente selecionada por task-current.json.

O novoPG terá um **volume gerenciado pelo Docker, novo e exclusivo**:
`cvg-u13-k04-common-20261024-data`, labelGBRAIN-LOOP-U13-K04-COMMON-R2.
Não haverá bind de diretório de host, reuso de dados ou acesso a volume de peer.
Uma sonda do mesmo cachedimage, sem rede, read-only/cap-dropALL/nonewprivileges,
mem64MiB/CPU1/PIDs16 e mountREADONLY, fará somente df no volume novo. Exigir
pelo menos8GiB disponíveis antes de iniciarPG e registrar filesystem/bytes/inodes;
isto é medida de espaço disponível, não uma quota ou reserva garantida.
A sonda --rm e seus objetos próprios devem estar ausentes ao terminar.

O servidor mantém imagemsha256:3c5c8892…, memória1GiB/CPU1/PIDs128,
loopback32803,DBcvg_u13_common2_test/rolepostgres e ambiente sintético. Remover
somente o mounttmpfs dePGdata e usar o volume próprio. Fsync,synchronous_commit,
WAL,checkpoints e demais configurações padrão doPostgreSQL não serão afinados
para obterPASS. Não mudar comandos,caps,timeouts,assertions,skips,fsync de código
ou pisos. Conferir SQLTCP da instância final e armazenar seus settings observados.
O volume será retido em caso de falha para coleta; limpeza apenas identificada.

Todos os requisitos de fonte, commit local, isolamento, catálogo atual e gates
fresh deste documento permanecem. A nova candidata só será materializada depois
da confirmação da coleta/cleanup anterior e sob o novo hash congelado. A correção
0407 e a capacidade da fixture são novos insumos explícitos; os resultados antigos
não qualificam a nova fonte. Não criar retry automático ou retomar a tentativa
antiga. Este é o primeiro perfil do novo recurso, definido antes do primeiro uso.
