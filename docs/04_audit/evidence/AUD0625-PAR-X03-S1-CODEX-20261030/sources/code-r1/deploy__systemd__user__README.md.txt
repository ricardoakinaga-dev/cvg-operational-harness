# Diagnóstico de delegação — SPEC0294 fatia1

O template e a entrada são artefatos para revisão. Não são instalados, habilitados
ou iniciados automaticamente. A entrada não aceita payload; observa a própria
unit e termina. `candidate`, exit0, significa somente pré-requisitos observados:
`qualified` permanece false. Não conserva uma unit capaz de receber workloads.

O operador precisa conferir o recibo human26, a SPEC0294 R2 SHA256
`551f477ac2bcf1a531c719ac6a660b1dbaae3ef9ce7998ced9cbfef70465dc1e`, o freeze
técnico e o parecer não autor desta fatia. O piso documental do template é
systemd254 por DelegateSubgroup; a disponibilidade real dos controladores
continua necessária. [Referência systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html#DelegateSubgroup=).

Empacotamento antes de eventual ativação operadora: compilar a fonte revisada
com Node22/TypeScript do lockfile; conservar `sandbox/process-service/`
`cgroup-preflight.js` e `errors.js` (e qualquer dependência efetiva emitida)
sob `%h/.local/libexec/cvg/`, ao lado de `qualification-entry.mjs`. A unit
usa `%h/.local/libexec/cvg/node22`, não o PATH. O manifesto de instalação deve
vincular hashes do Node22 exato, entrada, módulos compilados, package.json de
tipo module e template ao commit revisado. Não há instalador nem manifesto de
binário efetivamente instalado nesta fatia. Arquivo faltante deve falhar; não
usar módulo global como substituto. Nenhuma verificação estática prova esse
empacotamento ou a ativação no host.

O preflight exige o ControlGroup próprio com processo na folha supervisor,
raiz vazia, filesystem cgroup2, identidade/ownership/ausência de symlinks,
controladores nos ancestrais e RuntimeDirectory da instância privado em tmpfs.
Ele não habilita controllers, escreve limites ou cria filhos. Pode recusar uma
unit em que o administrador ainda não preparou a distribuição dos controllers.
Lstat/read são observação sujeita a mudança posterior; admissão nativa futura
precisa de dirfds/identidade/probes próprios e não pode confiar neste resultado.

Um teste de criar/ler/remover **filho vazio exclusivo** só poderá ocorrer numa
unit própria ativada após revisão operadora do provisionamento, sem substituir
a raiz pelo user manager compartilhado. Nesta rodada é NOT_RUN. Clone3/pidfd,
guardião, leases, seccomp, payloads e pressão dependem das próximas fatias e
freezes próprios. Não inferir B ou ownerIndependent:true destes arquivos.

Não alterar Delegate/sysctl do user manager nem instalar bwrap/helper na imagem
de produção. KillMode=control-group só limita uma parada externa da unit;
ela não é prova de cleanup de um workload. Produção permanece NO_GO.
