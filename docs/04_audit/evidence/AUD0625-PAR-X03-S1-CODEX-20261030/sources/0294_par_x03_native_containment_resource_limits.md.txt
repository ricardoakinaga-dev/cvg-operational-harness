# SPEC0294 — Contenção nativa e limites de recursos (PAR-X03)

R2, 30/10/2026. Codex AUD0625; atribuições DF25699 item2 e DF27441. Estado **PROPOSED_FOR_HUMAN_T3_REVIEW — SEM BUILD; R2 AGUARDA CONFERÊNCIA NÃO AUTORA**. A [re-revisão da 07](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/revision-r2/REVIEW-07-R1.md.txt), fonte `db75978b1c58e8aea05fd1b726de0e71699a98d4`, considera a R1 apta a apresentar D1–D7 ao Ricardo e fecha os sete achados antigos, mantendo quatro P2 e seis P3 novos. Esta R2 propõe absorvê-los; não declara fechamento independente nem decisão humana. A [R1 congelada](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/revision-r2/SPEC-R1.md.txt) e todos os seus artefatos permanecem preservados. Responde à [crítica da 07 sobre R0](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/revision-r1/REVIEW-07-R0.md.txt), fonte `4a6aaee6236a4de337534b27cb751bd9cb168606`. A [R0 congelada](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/revision-r1/SPEC-R0.md.txt) e suas provas permanecem preservadas. A carteira [0380](../03_build/0380_backlog_paridade_100_deepseek.md), PAR-X03, é a definição de produto deste incremento: provar contenção e limites de código externo. Não há produto novo, novo release ou alteração do Assistente de Plantão. A direção ADR010 permanece.

Base imutável: X02 R2 `1a46f31bb5cc509bc5b2f998a2c6b155c2a4a0f3`, que incorpora X01 `6fc4da8dc`. [DISCOVERY](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/DISCOVERY.md), [fontes e hashes](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/source-index.json), [sondas atuais](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/probe-summary.json). Os recibos19/20 e o parecer do X02 não concedem o nível B nem esta SPEC.

## 1. CURRENT: o que existe e o que falta

O X01 entrega `namespace-observed`, `ownerIndependent:false`, prazos no dono e limpeza observada. O X02 aplica Landlock por helper revisado, com prova em canal privado, e mantém execução fora do workspace/tmp. A [0286c](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/sources/docs/02_spec/0286c_par_x01_i8_persistent_output_note.md.txt) dispõe I8: fila persistente limitada com backpressure, encerramento pelo lifetime; não se reabre essa decisão aqui.

Sondas locais com Node22.23.2, bubblewrap0.9.0 e Landlock ABI8: **11 controles PASS, cinco RED de requisitos futuros, zero skip**. No payload nativo: no_new_privs=1; seccomp=0; não existe relatório de recursos por lançamento; ownerIndependent=false. Os cinco RED são seccomp, CPU, memória, pids e o pré-requisito declarativo de supervisão independente. O último NÃO testa parar o dono; nenhum deles demonstra pressão de recursos aplicada. Esses são gaps do X03, não regressões do X02.

Os limites declarados do X02 foram reproduzidos: shm_open funciona sem Landlock e recebe EACCES sob ele; readdir de `/` e `/dev` funciona sem helper e é negado sob ele; ioctl de comando desconhecido e sem efeito em `/dev/zero` muda de ENOTTY para EACCES. O helper trata IOCTL_DEV no ABI8, mas nenhuma regra o concede. Não se afirma essa proteção em ABI3/4, onde o direito não existe.

O cgroup da sessão tem cpu.max, memory.max e pids.max sem teto e não é gravável nem exclusivo desta tarefa. Nenhuma raiz delegada qualificada foi fornecida. Portanto provas reais de throttling, OOM e saturação de pids estão **NOT_RUN — raiz própria ainda não qualificada**, sem criar cgroups, carga sem contenção ou fork bomb no host. A leitura adicional da R1 confirmou que `user@1000.service` é candidato gravável, de UID1000, com cpu/memory/pids habilitados e zero processos diretos; isso torna o provisionamento plausível, não testado nem estável por si. [Observação somente leitura](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/revision-r1/host-delegation-readonly.json).

## 2. TARGET e fronteiras

Um perfil estrito de qualificação, escolhido pelo anfitrião, combina namespaces, Landlock, no_new_privs, filtro seccomp e limites verificáveis. O payload não fornece caminhos de cgroup, programa BPF, direitos, helper, quotas ou raiz de trabalho. A implementação fica em `packages/sandbox`; consumidores continuam usando o serviço único do X01. Não há spawn novo em apps/packages fora dele.

São três afirmações distintas:

1. `namespace-observed`: estado atual A, sem independência do dono.
2. A com limites cgroup observados: fatia intermediária permitida, ainda A e ownerIndependent=false; nunca renomeada B por ter cpu.max.
3. B completo, `cgroup-guardian`: guardião nativo, admissão antes do payload, recursos e deadlines independentes do event loop do dono. Só este pode declarar ownerIndependent=true depois da prova de dono parado.

Não se adota a implementação histórica 81C4 por cópia. Sua arquitetura é uma alternativa a avaliar sob as mesmas provas atuais. cgroup limita CPU/memória/pids; não substitui Landlock, seccomp, quota de disco ou um guardião.

## 3. Invariantes propostas

- **X3-I1 — admissão anterior ao efeito:** perfil estrito sem cgroup delegado, controlador, limite, filtro ou prova obrigatória recusa antes da sentinela do payload. Nunca degrada para A silenciosamente. O modo A existente continua explícito.
- **X3-I2 — identidade fechada:** guardião nativo, helper, filtro, runtimes, entrada de qualificação e perfil têm build reproduzível identificado por fonte/toolchain e digest de origem revisada. O host compara o digest do guardião antes de cada lançamento, com fd/inode fixados contra troca entre validação e exec. A revisão independente cobre o guardião fora do sandbox, com os privilégios do UID; nenhuma pinagem sozinha o qualifica. Fixar qualquer helper por digest não o qualifica. Para helper não qualificado, spawn_failed continua significando sem prova, não ausência de efeito (disposição X02 R2).
- **X3-I3 — pertencimento sem janela:** o launcher/guardião nativo prepara cgroup exclusivo e limites, confirma os valores lidos e cria o bwrap nele por clone3/CLONE_INTO_CGROUP antes do exec. Não vale mover um filho já criado por Node para cgroup.procs depois do spawn. A fatia A com quotas já exige esse binário. Guardião e workload são folhas irmãs; a raiz intermediária não contém processos.
- **X3-I4 — recursos:** CPU usa quota/período de cpu.max; memória usa memory.max e memory.swap.max=0 no perfil de teste; pids.max conta também threads. Nenhum número é inferido de um booleano capabilities. Falta de controle exigido recusa.
- **X3-I5 — independência:** B significa deadline e limpeza sem progresso do dono, não entrega de resultado a dono morto nem origem de um pedido de cancelamento num event loop parado. O guardião nativo usa relógio monotônico e pidfd/generation do dono, em sessão/grupo próprio e sem PDEATHSIG. Só ele encerra seu workload. Nunca mata por nome ou UID.
- **X3-I6 — encerramento:** em lançamento com guardião, JS só envia comandos e observa; não executa sua escada de kill. O guardião escolhe a primeira causa e usa cgroup.kill, populated=0 e reap do bwrap/init. A escada atual do JS continua apenas em A sem guardião. Falha conserva o slot fechado; o janitor da seção4.4 reconcilia somente leases próprios comprovados. Não remove raiz delegada nem cgroup de terceiros.
- **X3-I7 — limites do filesystem:** `/dev/shm`, listagem de `/` e `/dev` e IOCTL_DEV continuam sem grant nesta fatia. Compatibilidade que exija ampliá-los recebe decisão T3 própria. Execução no workspace/tmp continua negada. Symlink/hardlink não ampliam os grants.
- **X3-I8 — seccomp:** política compilada no helper do X02, escolhida por id fechado do perfil; não recebe bytecode BPF do anfitrião/payload nem usa --seccomp do bwrap. Arquitetura/policyDigest são conferidos na prova versionada. No_new_privs e Seccomp são observados no payload e comparados ao estado anterior ao helper; filtro herdado não qualifica a política do perfil.
- **X3-I9 — disco honesto:** cpu/memory/pids não são limite de disco. Tmpfs privado tem tamanho finito verificado; RLIMIT_FSIZE pode limitar um arquivo, mas não prova teto agregado do workspace. Perfil que exija disco agregado precisa quota/volume limitado comprovado ou recusa.
- **X3-I10 — evidência:** qualificações são vinculadas a commit, kernel/ABI, bwrap, helper, filtro, perfil e imagem. SKIP, host ausente, prova parcial e controle conhecido-ruim que não é rejeitado não viram PASS_CURRENT.
- **X3-I11 — produção:** D-C da [0288](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/sources/docs/02_spec/0288_par_x02_landlock_ruleset_and_honest_containment.md.txt) permanece: runtime sem bwrap/helper e PROCESS unavailable. Qualificação de dev/CI não concede execução de processos na imagem de produção.

## 4. Contratos PROPOSTOS, não implementados

### 4.1. Topologia escolhida e posse do encerramento

```text
observador de teste (processo separado, nunca pausado)
  └─ dono Node da fixture/serviço
      └─ launcher/guardião C (setsid; fora da quota do workload)
          └─ bwrap em workload cgroup, criado por CLONE_INTO_CGROUP
              └─ init do PID namespace → helper X02 → exec do payload

raiz delegada exclusiva/instância/run-id/  [sem processos diretos]
  ├─ supervisor/  [guardião, orçamento de supervisão próprio]
  └─ workload/    [bwrap/init/helper/payload/threads/descendentes]
```

O guardião é filho do dono e pai direto do bwrap. Tem **uma única thread durante toda a execução**, não usa PR_SET_PDEATHSIG e não pertence ao grupo do dono. O --die-with-parent do bwrap passa a ligá-lo à thread que o criou no guardião, que só termina depois do fechamento. A morte da geração do dono, confirmada por pidfd, **ou** EOF do canal privado de comandos provoca CLOSING imediato, sem esperar lifetimeMs: fixa `owner_lost` se ainda não existe causa anterior e limpa pelo mesmo executor único. EOF com dono ainda vivo também fecha a execução, pois o canal exclusivo foi perdido. `owner_lost` é razão interna do registro final do lease, não novo ProcessCause público; uma causa primária anterior permanece imutável. XN11 mede essa reação e sua limpeza antes do deadline de lifetime, com observador externo e orçamento de cleanup próprio. Em A sem guardião, morrer o dono já derruba bwrap: é controle verde de regressão, não prova discriminante de B. O discriminante é pausar/travar o **Node separado que é dono**: B encerra no deadline nativo; A/A com quotas não passa essa propriedade.

No caminho com guardião, o JS nunca mata o workload. stop/abort/dispose enviam comandos idempotentes, com sequência e id do lançamento, ao guardião. Ele serializa eventos, fixa a primeira causa e faz uma única limpeza: pedido gracioso aos membros próprios com identidade conferida; depois cgroup.kill=1; espera cgroup.events populated=0, reap do bwrap e fechamento dos canais. O init do PID namespace recolhe os órfãos dentro desse namespace; o guardião não atribui isso ao seu próprio subreaper. Se ele usar PR_SET_CHILD_SUBREAPER, seu waitpid cobre somente filhos que realmente adotou no namespace do host. Registrar separadamente status observado do bwrap, populated e filhos de fato adotados; não fabricar wait de netos internos nem tratar subreaper como prova de esvaziamento do namespace. ProcessCleanup.observed ganha cgroup; clean exige toda essa conjunção. Falta de prova conserva cleanup_failed. Guardião morto não é substituído por uma segunda escada de kill concorrente do JS; fecha-se admissão e aciona-se reconciliação.

### 4.2. Canais e admissão

O dono cria os pipes stdin/stdout/stderr do payload. O guardião repassa apenas suas pontas corretas ao bwrap, sem reler os bytes; os dados fluem dono↔payload. O teto de fila/saída continua no JS: com o dono parado o payload pode bloquear ao escrever, e B não promete consumo de saída independente. O deadline e a limpeza nativos continuam funcionando nessa condição. O guardião é o **único leitor dos canais de status do bwrap e de prova do helper**, não do stdio do payload.

Os fds do guardião (canal de comandos/resultado, pidfd, lock/lease, diretórios da raiz e folhas, status/prova) são CLOEXEC desde a criação. Duplicações também o preservam. Só os descritores do protocolo documentados para bwrap/helper são repassados ao respectivo estágio e fechados antes do exec final; no payload restam somente stdin/stdout/stderr. XN12 inventaria /proc/self/fd no ELF e prova a ausência dos fds privados. Captura pidfd/generation do dono e identidade do grupo antes de admitir; não recebe BPF.

Admissão, status e resultado usam frames versionados, chaves e motivos fechados, nonce/id da execução e sequência; cada documento tem teto4KiB. O parser rejeita comprimento maior antes de alocar, frame truncado, NUL, versão/chave desconhecida, sequência fora de ordem e outro nonce. Fuzz determinístico e corpus adversarial exercitam comandos malformados, grandes, repetidos e tardios sem exec/kill indevido; entrada hostil não pode trocar a primeira causa nem causar limpeza dupla. O canal de resultado é não bloqueante: se o dono parou/morreu ou o pipe encheu, a limpeza prossegue e a prova final fica no lease, conforme seção4.4. O pipe é notificação, não o único armazenamento da prova.

Estados do guardião: NEW → PREFLIGHT → ISOLATED → RUNNING → CLOSING → CLOSED; falha antes do payload faz REFUSED → CLOSING → CLOSED. Cancel durante setup impede exec. Comandos repetidos devolvem o mesmo fechamento; comando tardio não troca causa já fixada. Startup e lifetime nativos contam do CLOCK_MONOTONIC capturado na entrada do launcher, sem renovar por status/bytes; não incluem a espera entre o spawn do Node e essa entrada. O prazo JS do dono começa antes do spawn e permanece correndo em paralelo em A com quotas; ao vencer envia comando, cuja causa é serializada pelo guardião. Em B, o prazo nativo é a autoridade do workload após admissão: não se somam prazos JS e nativos nem se depende do JS pausado. O dono mantém somente uma guarda finita de lançamento/admissão para detectar ausência do guardião antes de payload; se houver frame admitido, transfere a autoridade e não cria segunda escada. Falta de prova desse estado fecha admissão e reconcilia pelo lease. Cleanup tem prazo nativo próprio após CLOSING. A com quotas conserva ownerIndependent=false; medir separadamente spawn→entrada, entrada→admissão e deadline→CLOSED por cada relógio, correlacionando nonce/sequência sem subtrair timestamps de processos não qualificados como equivalentes. Não há promessa de tempo real contra kernel ininterruptível: falta de prova vira cleanup_failed.

O anfitrião captura resourceProfile, id da política compilada, digests, limites e raiz. O guardião valida cgroup v2/ownership/identidade de filesystem e descendência sem symlinks; cria folhas próprias, escreve e relê limites, só então cria bwrap no cgroup por clone3. Recurso obrigatório ausente recusa antes do payload, sem fallback. Não há garantia de ausência de efeito para binário arbitrário fixado por digest: a regra exige os componentes qualificados, como no X02 R2.

Pedido inválido conserva ProcessServiceError invalid_request/invalid_env/invalid_limits. A recusa de pré-requisito do perfil ganha **ProcessServiceError.code=admission_refused**, com motivo fechado: cgroup_unavailable, controller_missing, delegation_invalid, kernel_feature_missing, limits_unconfirmed, swap_unavailable, seccomp_profile_unavailable, architecture_unsupported ou qualification_missing. Erro não leva caminho/valor do host. Se o preflight nativo já começou, o launcher é encerrado/reaped e seus recursos revertidos antes de rejeitar launch; o comentário atual de ProcessServiceError, que diz que nenhum processo foi criado, deve ser restringido aos erros antigos. PROCESS indisponível por D-C continua unavailable; perfil/código inválido não vira indisponibilidade de infraestrutura.

### 4.3. Relatório versionado e compatibilidade T3

ProcessOutcome ganha containment.version=1 e uma união discriminada. Os campos antigos profile, ownerIndependent e landlock continuam como **espelhos exatos**, deprecados; seus tipos são alargados explicitamente e seus consumidores atualizados na mesma fatia. Não fingir que essa mudança é compatível só por ser aditiva. O adaptador runContained, tipos exportados por sandbox/index e testes de serviço/launch/persistent são os consumidores atuais a conferir; nenhum consumidor externo é dado como migrado.

```ts
type ReadReason =
  | 'controller_missing'
  | 'kernel_too_old'
  | 'read_failed'
  | 'report_missing'
  | 'counter_out_of_range'
  | 'not_required'
  | 'quota_unavailable'
type AdmissionReason =
  | 'cgroup_unavailable'
  | 'controller_missing'
  | 'delegation_invalid'
  | 'kernel_feature_missing'
  | 'limits_unconfirmed'
  | 'swap_unavailable'
  | 'seccomp_profile_unavailable'
  | 'architecture_unsupported'
  | 'qualification_missing'
type Counter =
  | { value: number; reason: null }
  | { value: null; reason: ReadReason }
type ResourceLimits = {
  cpuQuotaUs: number
  cpuPeriodUs: number
  memoryMaxBytes: number
  swapMaxBytes: 0
  pidsMax: number
  tmpfsMaxBytes: number
  workspaceQuotaBytes: number | null
}
type Resources =
  | { state: 'not_required' }
  | { state: 'not_applied'; reason: AdmissionReason }
  | {
      state: 'unknown'
      reason: 'guardian_report_missing' | 'guardian_died' | 'read_failed'
    }
  | {
      state: 'applied'
      backend: 'cgroup-v2'
      groupId: string
      limits: ResourceLimits
      events: {
        oomKill: Counter
        pidsMax: Counter
        nrThrottled: Counter
        throttledUsec: Counter
      }
      peaks: { memoryBytes: Counter; pids: Counter }
    }
type SeccompReport =
  | { state: 'not_required' }
  | { state: 'unknown'; reason: 'report_missing' | 'proof_invalid' }
  | {
      state: 'applied'
      mode: 2
      arch: 'x86_64'
      profileId: 'elf-qual-v1' | 'elf-sentinel-deny-v1'
      policyDigest: string
    }
type ContainmentV1 =
  | {
      version: 1
      status: 'observed'
      profile: 'namespace-observed'
      executor: 'owner' | 'guardian'
      ownerIndependent: false
      resources: Resources
      seccomp: SeccompReport
      landlock: ProcessLandlockReport
    }
  | {
      version: 1
      status: 'observed'
      profile: 'cgroup-guardian'
      executor: 'guardian'
      ownerIndependent: true
      resources: Extract<Resources, { state: 'applied' }>
      seccomp: Extract<SeccompReport, { state: 'applied' }>
      landlock: ProcessLandlockReport
    }
  | {
      version: 1
      status: 'unverified'
      profile: 'unverified'
      executor: 'owner' | 'guardian'
      ownerIndependent: false
      requestedProfile: 'namespace-observed' | 'cgroup-guardian'
      reason: 'guardian_report_missing' | 'guardian_died' | 'proof_invalid'
      resources: Extract<Resources, { state: 'unknown' }>
      seccomp: SeccompReport
      landlock: ProcessLandlockReport
    }
```

`executor` identifica o caminho selecionado pelo host: A puro usa owner, A com quotas e B usam guardian; no estado unverified não afirma que esse executor terminou a limpeza. Limites configurados são números conhecidos; workspaceQuotaBytes=null significa que esse perfil não declara quota de workspace. Perfil que a exija e não a tenha recusa com motivo fechado limits_unconfirmed; não substitui ausência de limite por Counter. Counter fica apenas nas leituras/eventos/peaks. Números presentes são inteiros seguros, não negativos; quotas obrigatórias são positivas. Contadores events são deltas antes/depois; ausente não vira zero. Peaks opcionais em kernel anterior podem ser null com motivo; limite ou contador obrigatório ausente impede qualificação. IOCTL_DEV tem estado próprio handled/granted: antes do ABI5 é unhandled/false, nunca negação provada. Paths do host são proibidos também em secondaryErrors e mensagens.

Não se cria ProcessCause por recurso. Throttling de CPU nunca muda causa. OOM é relatado por delta oom_kill e status observado (signal SIGKILL, ou exit137 quando só esse status chegou); não inferir OOM de137 sozinho. pids.events/max com EAGAIN/exit não zero prova fork recusado, não uma causa nova. Se cancel/deadline chegou primeiro, ele continua causa e os eventos entram como diagnóstico secundário. Se falta relatório terminal, campos ficam unknown e cleanup_failed; não inventar exit0/clean nem causa do payload. Um timeout do observador continua timeout do observador, identificado à parte.

O adaptador deve recusar sucesso quando containment é unverified/versão desconhecida ou cleanup_failed, sem apagar a causa observada. runContained continua A por padrão; perfil que exija B é recusado por serviço sem qualificação B, nunca executado como A por um cache antigo de serviceFor. A extensão dos espelhos e essa migração pertencem à decisão X3-D4.

### 4.4. Delegação, pisos e reconciliação de órfãos

Exige cgroup v2 unificado, filesystem cgroup2, raiz exclusiva pré-provisionada ao serviço e cpu/memory/pids habilitados no subtree_control de cada pai. O artefato de provisionamento proposto é `deploy/systemd/user/cvg-process-qualification@.service`, com Delegate=cpu memory pids e DelegateSubgroup=supervisor. Seu texto revisável está em [unit proposta, somente documento](../04_audit/evidence/AUD0625-PAR-X03-SPEC-CODEX-20261030/revision-r2/provisioning-unit.proposed.service.txt). Nesta rodada não existe unit instalável nova, instalação ou start; sua materialização nesse caminho exige T3 e revisão da fatia1. O responsável é a implementação do perfil em packages/sandbox, com revisão independente do template, da entrada de qualificação e do preflight. Não se escreve em user@1000.service nem se altera Delegate/sysctl automaticamente.

A unit nasce com o dono/observador na folha supervisor; a raiz da unit permanece vazia. O controlador cria `runs/<nonce>/` vazio, com folhas supervisor (guardião) e workload (bwrap). Assim a folha supervisor da unit, que contém processos, nunca distribui controllers para filhos. Antes de criar workload, o guardião validado se coloca na folha de supervisão própria; isso não é anexo tardio do payload. O preflight confirma ControlGroup da unit, ownership e cpu/memory/pids em cada ancestral/pai, root cgroup.procs vazio, posição real do dono e ausência de symlinks; não aceita somente o texto da unit. [Documentação oficial de Delegate e DelegateSubgroup](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html#DelegateSubgroup=): o segundo atua no processo principal e está disponível desde systemd254. Este é o piso do template proposto, sujeito à confirmação da versão instalada e do efeito; não presumir que user-manager pode delegar controladores que não recebeu. Pai que distribui controllers fica vazio de processos diretos; dono e observador ficam fora da quota do workload, guardião em supervisor e workload em folha irmã. A primeira fatia verifica escrita/leitura/remoção **apenas num filho próprio vazio**, após T3; a qualificação executável ainda exige um filho nativo inofensivo criado por CLONE_INTO_CGROUP, pertencimento confirmado e reap/remoção. O serviço deve nascer no domínio delegado apropriado: permissão de mkdir não prova permissão para mover/criar processos entre subtrees. Diretório gravável é candidato, não qualificação.

Preflight por recurso/API, não só os.release: clone3/CLONE_INTO_CGROUP, pidfd_open/poll, cgroup.kill, cpu.max/stat, memory.max/events/oom.group, pids.max/events. O piso efetivo de B é Linux5.14 pelos mecanismos usados, sujeito a backports e probes; memory.peak/pids.peak são opcionais com Counter anulável. Exige memory.swap.max=0 lido de volta no perfil de teste; falta do arquivo recusa esse perfil, sem swap ilimitado oculto. Habilita memory.oom.group=1 e confere. Acrescenta --unshare-cgroup e comprova cgroupfs ausente; o payload não vê nem pode escrever o próprio cgroup.procs ou o pai. Falta de cpu delegado torna XN08 NOT_RUN e estrito admission_refused, não passa por memória/pids.

O identificador de instância é validado pelo host contra `[a-z0-9-]{1,64}` e o nonce é hexadecimal aleatório de tamanho fixo; ambos são definidos fora do payload, sem separadores de caminho. Cada run tem lease sob `${XDG_RUNTIME_DIR}/cvg-process-qualification/<instância>/leases/<nonce>/`, em runtime tmpfs do usuário. O preflight exige XDG_RUNTIME_DIR absoluto do UID corrente, em filesystem tmpfs verificado, sem symlinks, diretório da instância/lease0700 e arquivos0600 de nlink1; caminho fornecido pelo payload nunca é aceito. Sem runtime qualificado há admission_refused/delegation_invalid. O lease registra boot-id, id de instância, nonce, PID+starttime do dono/guardião e inode/device do cgroup. O guardião mantém lock num arquivo `lock` de inode estável; não substitui esse arquivo por rename.

Antes de notificar CLOSED, o guardião grava `final.json` limitado a4KiB nesse mesmo lease: versão/nonce/boot-id, primeira causa pública quando existente e razão interna (incluindo owner_lost), origem da causa, status do bwrap, evidência de populated=0 ou erro, reap realmente observado, limites/contadores anuláveis com motivos, instantes monotônicos e resultado de fechamento. Escreve um temporário regular por dirfd/O_NOFOLLOW, sincroniza, renomeia atomicamente para final.json e sincroniza o diretório; falha de gravação conserva cleanup_failed/unverified e o lease para diagnóstico. O tmpfs conserva a prova durante pausa do dono, não promete persistir reboot: boot-id divergente recusa reuso. O janitor nunca remove esse registro só porque o workload esvaziou; há retenção até consumo/arquivamento confirmado pelo dono ou operador, sem expirar evidência não consumida para admitir novo run.

O dono que retoma e o janitor leem final.json por dirfd, conferindo owner/modos/regularidade/tamanho, nonce/boot-id, identidade do lease e a geração do guardião fixada antes da admissão. Um JSON bem formado ou checksum autodeclarado não basta. A evidência vem do guardião qualificado e de diretório fora das montagens/grants do payload; código hostil já no host com mesmo UID não é separado por esse mecanismo. A prova terminal válida recuperada do lease pode confirmar a limpeza mesmo se o pipe não entregou o frame; ausência, escrita parcial, identidade incerta ou versão desconhecida permanecem unknown/cleanup_failed. Não inferir clean apenas de arquivo, morte do dono ou populated atual. XN11 enche o pipe e pausa o dono, verifica final.json por observador externo e o relê ao retomar; XN12 injeta falha de escrita/rename e prova que não aparece clean falso. Na partida, o janitor do mesmo serviço procura **somente leases da sua raiz/instância**, toma lock não bloqueante e confirma ausência das duas gerações e identidade do grupo antes de cgroup.kill/remover folha vazia. Prefixo de nome sozinho nunca autoriza matar. Identidade incerta, lock vivo ou grupo fora da raiz fecha admissão e pede operador, sem tocar no recurso. Janitor pode recuperar diretório vazio sem fabricar reap de processo que não observou: preserva o registro cleanup_failed/unverified quando falta prova. XN12 inclui crash entre mkdir, limite, clone e remoção, e outro serviço com prefixo parecido que deve permanecer intacto.

### 4.5. Seccomp no helper do X02

Um só helper qualificado aplica no_new_privs, Landlock e depois a política seccomp compilada, antes de exec. O id fechado elf-qual-v1 e o manifesto/digest compilados entram na identidade do helper e do perfil; não são programa BPF recebido por fd. Primeiro perfil só para ELF sintético x86_64; Node/MCP/LSP não são suportados por esse filtro. Manifesto exato de syscalls/argumentos e bytecode ainda exige freeze/revisão antes de BUILD executável; tracing não concede grants.

Para o perfil v1, arquitetura diferente de AUDIT_ARCH_X86_64, modo i386/compat e bit x32 são recusados. A política usa KILL_PROCESS para arch/syscall não permitido (observação SIGSYS, causa signal); syscall sentinela inofensivo do teste é negado por uma variante **também compilada/revisada**. Não contar negação já feita pelo host como efeito deste filtro: observar seccomp do bwrap antes do helper, Seccomp2 do payload e policyDigest exato. Controlar mesmo ELF/ambiente com política sem a negação sentinela.

A prova privada v2 tem versão, bloco Landlock e seccomp com applied/mode/arch/profileId/policyDigest, teto4KiB e chaves fechadas; v1 do X02 permanece para A legado. Perfil que exige v2 recusa v1, digest/arquitetura divergente ou documento incompleto. Helper fecha o fd de regras antes do filtro, aplica filtro, escreve a prova v2 só após sucesso, fecha fd de status (também CLOEXEC) e exec. write/close/exec necessários constam da política revisada. Não há bwrap --seccomp que restrinja o helper antes de seus landlock/prctl. O leitor do guardião compara direitos cobertos e digest esperados, não apenas applied=true. Helpers não qualificados continuam sujeitos ao limite de garantia do X02 R2.

## 5. Matriz nativa e controles

Todos os arquivos abaixo são canários sintéticos exclusivos. Nunca ler `/etc/shadow`, chaves ou home reais. O harness de teste pode montar fixtures chamadas `/etc/shadow` e `/home/x03/.ssh/id_ed25519` em namespace descartável; o controle sem Landlock só enxerga essas fixtures. Provas primitivas de helper e provas pelo serviço são identificadas separadamente; o aceite inclui o caminho real do serviço.

| ID   | Prova pelo limite real                                              | Controle discriminante / condição de aceite                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XN01 | no_new_privs=1 e filtro próprio aplicado                            | Seccomp anterior ao helper no bwrap e Seccomp2 no payload, arquitetura/digest conferidos; mesma fixture sem a negação sentinela passa, variante compilada mata com SIGSYS. NNP de um só aplicador pode ser equivalente                                                                                                   |
| XN02 | escrita em árvore externa gravável pelo namespace e fora do ruleset | EACCES com helper; gravação do mesmo canário sem Landlock                                                                                                                                                                                                                                                                |
| XN03 | leitura de shadow e ssh sintéticos                                  | bytes nunca chegam ao payload; controle com montagem de teste e sem Landlock lê o canário, sem tocar dados reais                                                                                                                                                                                                         |
| XN04 | rede fora da contenção                                              | só listener loopback sintético próprio; controle conecta, lançamento estrito não conecta; nenhuma chamada a Internet/serviço real                                                                                                                                                                                        |
| XN05 | symlink, hardlink, rename e truncation de fuga                      | mesmo ELF/ambiente e helper desligado permitem a operação no canário; com ele o alvo permanece igual; distinguir ENOENT/EROFS de negação causal                                                                                                                                                                          |
| XN06 | `/dev/shm`, readdir raiz/dev e ioctl                                | manter resultados declarados; em ABI<5 relatar ioctl_dev unhandled, não prova de negação; perfil que exige a prova requer ABI≥5; abrir dispositivo antes do ioctl                                                                                                                                                        |
| XN07 | execução fora dos binários do perfil                                | ELF em workspace/tmp negado; ELF no manifesto roda; mutante que repõe EXECUTE é rejeitado                                                                                                                                                                                                                                |
| XN08 | CPU por cgroup e descendentes                                       | quota50_000/period100_000, até400ms CPU e guarda externa3s; afirmar delta de nr_throttled/throttled_usec e pertencimento, nunca duração de relógio. Sem sinal discriminante é inconclusivo                                                                                                                               |
| XN09 | memória do workload                                                 | C toca até80MiB em passos4MiB, memory.max64MiB/swap0/oom.group1, evento+status observado; controle maior sob guarda externa128MiB. Contar baseline e shmem; sem admissão da seção5.1 não executar                                                                                                                        |
| XN10 | limite de pids/fork                                                 | medir overhead bwrap/init/helper e limitar a overhead+8; até24 forks finitos mantidos vivos por barreira, EAGAIN e pids.events/max; controle overhead+24 sob guarda externa40, ou NOT_RUN se não couber                                                                                                                  |
| XN11 | dono pausado e dono encerrado                                       | dono é Node filho separado do Vitest; SIGSTOP/event loop travado distingue B de A. Crash é regressão verde também em A; no guardião, owner_lost fecha imediatamente, antes de lifetime, com prova no lease. Pausa/pipe cheio: deadline nativo, final.json e releitura após retomada; relatório false sozinho não prova B |
| XN12 | admissão, causa e cleanup                                           | pré-requisito ausente, cancel em setup, report perdido e crash na criação/remoção; guardião único, janitor por lease/identidade, causa imutável; recurso de outra instância permanece intacto                                                                                                                            |
| XN13 | disco/tmpfs                                                         | tmpfs16MiB com --size verificado e crescimento até20MiB; contabilizar shmem em memory.max para testar ENOSPC sem OOM prévio; quota do workspace separada e guarda externa obrigatória                                                                                                                                    |
| XN14 | imagem D-C                                                          | CI constrói target runtime da fonte congelada, registra image-id/digest e executa fixture PROCESS negativa nele; dev/CI positiva separada; não instalar bwrap/helper no runtime nem publicar imagem                                                                                                                      |
| XN15 | regressão X01/X02 e consumidores                                    | causas/status/FDs/env/tetos/iterator/abort/limpeza preservados; testes integrais relevantes sem skip no host qualificado                                                                                                                                                                                                 |

Os números são **orçamentos de fixtures C descartáveis**, não defaults de produção ou limites de Node. O admission controller do harness de testes confere orçamento externo, recursos livres e ownership antes de XN08–XN13. Limites internos só são retirados para um controle quando a guarda externa continua finita. Não provisionar permissões administrativas nem executar pressão nesta rodada de SPEC.

### 5.1. Orçamento externo e interações

Antes de qualquer pressão: MemAvailable do host ≥1GiB, headroom de memória de cada ancestral finito ≥256MiB, lease exclusivo do caso, guarda externa128MiB/pids40/CPU finita e observador com deadline. Se não satisfizer, NOT_RUN com motivo; nunca reduzir guardas nem elevar quotas para fazer o teste passar. Os testes de pressão rodam serializados nesse lease.

Pids conta bwrap, init, helper e threads. Primeiro calibrar overhead com uma execução C inofensiva, sem forks e com teto40, e encerrá-la/reap. Nas execuções-alvo novas, fixar antes do clone o teto overhead+8, e no controle overhead+24, ambos dentro40; confirmar a calibração antes dos forks. Todos os filhos aguardam barreira finita e são reaped. Overhead que não caiba ou varie torna o caso inconclusivo/recusado; nunca amplia orçamento nem anexa cgroup depois do exec.

Tmpfs é memória cobrada no cgroup. Exigir tamanho16MiB por --size e baseline de RSS/shmem medido; manter pelo menos16MiB de margem no memory.max64MiB no teste de disco. XN09 e XN13 são execuções distintas, evitando atribuir OOM a uma quota de disco. Preflight confirma --size/--tmpfs na versão do bwrap (0.9.0 local oferece), tamanho lido no mountinfo/statfs e contador shmem. CPU só é qualificada pelos contadores, nunca por um limiar de duração.

XN14 entra num job de qualificação após BUILD T3: construir target runtime do Dockerfile do commit testado com bases já fixadas, reter image-id/digest local, executar o adaptador de prova negativa nesse mesmo artefato sem provider/rede/dados reais, e guardar saída/unavailable. Nenhum push é necessário. Se o job de build não estiver disponível, imagem fica NOT_RUN; o Dockerfile não substitui o artefato.

## 6. Fatiamento após decisão T3 e freeze técnico

**Fatia 1.** Contratos/compatibilidade e preflight da raiz; congelar ContainmentV1, admission_refused, manifesto de syscalls, protocolo v2 e protocolo/digest/FDs do guardião com revisão técnica. Materializar e revisar a unit nomeada na seção4.4 e sua entrada de qualificação, sem habilitação automática. Após T3 e revisão do provisionamento, teste vazio próprio de delegação, sem pressão.

**Fatia 2a.** Esqueleto do MESMO launcher/guardião C, single thread e digest pinado: protocolo v1/fuzz, admissão/preflight, lease/registro final, clone3+exec de ELF trivial, cgroup.kill e janitor/XN12. Revisão independente do binário fora do sandbox e mutantes próprios: primeira causa trocada, comando tardio aceito, limpeza dupla, kill sem identidade, fd privado herdado e substituição do digest devem morrer por asserção, sem setup inválido. Nenhum workload de pressão nesta fatia.

**Fatia 2b.** No mesmo esqueleto já revisado, limites e XN08–XN10, com revisão independente própria. A com quotas não usa attach tardio por Node e conserva ownerIndependent=false enquanto startup/lifetime dependerem do JS. Não juntar2a/2b numa só aprovação; respeitar o limite de retrabalho por fatia.

**Fatia 3.** No mesmo binário/topologia, acrescentar pidfd e deadlines nativos de startup/lifetime, validar dono parado e janitor/XN11. Qualifica a independência, mas publicar B/ownerIndependent=true exige também a política obrigatória da fatia4 aplicada; sem reescrever o mecanismo das fatias2a/2b.

**Fatia 4.** Seccomp compilado no helper do X02 e prova v2, XN01–XN07; tmpfs/quota XN13; regressões e mutantes atuais. Strict B só é observado com a política requerida aplicada; nenhum consumidor real recebe filtro ELF.

**Fatia 5.** Qualificação host/CI/imagem corrente, XN14/XN15, relatório de capacidades com lacunas explícitas. Nenhum certificado ou capacidade de produção é concedido pela integração local.

Cada fatia tem claim, fonte congelada, prova positiva/negativa, mutante válido, cleanup e revisão independente. No máximo dois retrabalhos conforme0380; rejeições excedentes voltam para planejamento. Uma mudança de grant, perfil de produção ou denominador requer sua decisão própria.

## 7. Decisões T3 para Ricardo — propostas

| ID    | Decisão concreta                                                                             | Recomendação e consequência                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X3-D1 | Manter shm, listagens raiz/dev e IOCTL_DEV sem grant?                                        | **Sim.** Registrar incompatibilidade com workloads que os exigem; não conceder acesso por conveniência. Perfil estrito que exija prova de IOCTL usa ABI≥5; X02 mínimo3 não muda globalmente |
| X3-D2 | Introduzir seccomp por perfil e arquitetura, começando em ELF de teste?                      | **Sim**, compilado no helper X02, x86_64 sem x32/i386 e KILL_PROCESS; manifesto/digest/protocolo v2 revisados antes de executar. Node/MCP/LSP ficam fora                                    |
| X3-D3 | Cgroupv2 delegado obrigatório para perfil com CPU/memória/pids?                              | **Sim**, sem sudo e sem fallback para rlimits por UID ou A. Host deve fornecer raiz exclusiva; ausência recusa antes do payload                                                             |
| X3-D4 | Separar A com quotas e B independente, exigindo guardião/pidfd para B?                       | **Sim**, com topologia e guardião único da seção4, containment versionado/espelhos alargados e admission_refused; XN11 obrigatório. Mudança pública de tipos explícita                      |
| X3-D5 | Aprovar pressão somente em recursos exclusivos com os orçamentos da seção5 e guarda externa? | **Sim.** Nenhum stress no host/UID compartilhado; fork sempre finito e cgroup primeiro                                                                                                      |
| X3-D6 | Exigir teto de tmpfs e quota agregada verificável do workspace para declarar disco limitado? | **Sim.** RLIMIT_FSIZE é complementar; sem quota, disco permanece não qualificado e não fecha o cartão por CPU/memória/pids                                                                  |
| X3-D7 | Manter imagem de produção sem bwrap/helper, PROCESS unavailable (D-C)?                       | **Sim.** Qualificar dev/CI e a recusa da imagem; execução em produção segue SPEC separada/U10 e gate próprio                                                                                |

A decisão deve ligar respostas ao SHA-256 exato desta SPEC e às condições escolhidas. **Próxima ação:** DF confere esta R2 contra os quatro P2/seis P3 da re-revisão e apresenta ao Ricardo SOMENTE o SHA revisto da R2. O parecer07 sobre a R1 permite apresentar o gate T3, não executar a BUILD. Guardião/protocolo/fuzz/pin/FDs, ContainmentV1, manifesto seccomp e unit/preflight ainda exigem freeze/revisão antes das respectivas fatias executáveis. Respostas dos achados são propostas do autor, não fechamento independente. Freeze do manifesto seccomp e aceites por fatia continuam necessários; BUILD não admitido, PAR-X03 aberto e produção NO_GO.
