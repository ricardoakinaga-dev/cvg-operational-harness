# Revisão independente do freeze — R1

**CHANGES_REQUESTED — 0 P1, 1 P2, 0 P3.** Parecer do plano técnico anterior à implementação. Não é revisão ou aceite de BUILD, provisionamento, capacidade B ou produção.

Artefato: [TECHNICAL-FREEZE.md](../../TECHNICAL-FREEZE.md), SHA-256 `ed576494b88e13e141394254e7430d96e4968c2b31233c14e8bfde86266dfe4c`.

Base: `9a8ab4c7a8980b8de61e2cfc5c56b1e6f902c5f2`. A [SPEC R2](../../sources/0294_par_x03_native_containment_resource_limits.md.txt) tem SHA-256 `551f477ac2bcf1a531c719ac6a660b1dbaae3ef9ce7998ced9cbfef70465dc1e`; o [human26](../../sources/human-decisions-26.json.txt) tem SHA-256 `ae6a077850f8db3aa8d2b01f10055a1917814e9389677577f941a415245acef1`. O hash da SPEC coincide com o vínculo do recibo, linhas 15–23. Os sete arquivos de código inventariados em findings.json coincidem, por Git blob, com essa base.

## F01 — P2 — S1-06 inclui execução de payload fora da fatia autorizada

**Anchors:** freeze:7, freeze:153–159 (em especial 158); human26:22; `packages/sandbox/src/__tests__/par-x02-landlock-helper.test.ts:20,92,112`; `tests/par-x01-process-service.test.ts:26,72`; `tests/par-x01-process-persistent.test.ts:57`; `tests/par-x02-landlock-launch.test.ts:37,80`.

S1-06 exige “suite sandbox + root process/service/launch/persistent”, sem uma seleção que exclua execução nativa. Esses arquivos existentes não são somente testes puros: o helper testa disponibilidade do compilador no topo do módulo, compila C e executa `/bin/sh`; os testes de serviço/persistent criam pedidos com `process.execPath -e` e os lançam em bubblewrap. A suíte de launch também compila e usa o helper real. A inclusão desses arquivos pode produzir efeitos já na coleta, antes de selecionar um caso por nome.

Isso contradiz tanto “sem payload” do próprio freeze quanto o grant explícito de human26. Usar somente dados sintéticos ou preservar o caminho A não elimina a execução de payload. O problema é do procedimento proposto, não uma alegação de que alguém já executou esses testes nesta rodada.

**Correção necessária:** restringir S1-06 a uma allowlist de arquivos puros, novos testes com spawn/observer seams e revisão estática dos consumidores nativos migrados. Excluir da coleta os arquivos que compilam, fazem probes por subprocesso ou executam payload; um filtro de nome isolado não basta. Registrar as regressões nativas como `NOT_RUN` nesta fatia e encaminhá-las ao gate de execução correspondente, sem apresentá-las como regressões verdes. Alternativamente, uma ampliação de escopo exigiria autorização própria; ela não é necessária para implementar somente contratos e diagnóstico readonly.

**Fecho objetivo:** plano de comandos/arquivos que permita cumprir S1-01..07 sem compilar/executar helper, lançar payload, ativar unit ou escrever cgroup. Não exige executar gates das fatias 2+ para fazer diagnóstico readonly.

## Avaliação dos demais contratos e critérios

| Critério | Parecer estático do plano | Evidência e limite |
| --- | --- | --- |
| S1-01 | Coerente, ainda não implementado | Freeze:11–16,35–51 importa a união da SPEC:77–181, alarga os espelhos e centraliza sua derivação. Migrar ambos os produtores atuais: service.ts:169 e :456, além de types.ts:81 e index.ts:47. O perfil A continua executor owner, independência false e recursos/seccomp not_required. |
| S1-02 | Regra suficientemente explícita | Freeze:17–22 exige B→admission_refused/qualification_missing antes de slot/preparo/spawn e inválido→invalid_request. Os pontos atuais são service.ts:148–154,198,222; o cache é run.ts:168–178. O teste futuro deve cobrir A→B→A no mesmo cache e serviço, com B sem efeito. Nenhuma recusa implementada é aceita aqui. |
| S1-03 | Correção planejada aplicável | Freeze:23–25,42–44 exige validar versão/estado/espelhos antes de mapear saída. run.ts:143–149 hoje pode devolver exitCode 0 sem consultar cleanup. O plano trata esse ponto sem trocar a causa; a recusa pré-launch permanece sem outcome inventado. |
| S1-04 | Diagnóstico readonly bem delimitado | Freeze:55–85 separa fatos/leitor, sempre qualified:false, sem token de admissão. Lstat/read e fixtures não provam defesa TOCTOU, clone3, pidfd, aplicação de limites ou cgroup qualificado. Um resultado candidate não pode habilitar B nem alterar capacidades de lançamento. Ausência/incerteza recusa; abort é cancelamento. |
| S1-05 | Desenho revisável; artefatos por produzir | Freeze:89–108 fixa caminhos/argumentos, entry somente diagnóstica, oneshot sem permanência e nenhuma instalação/start. Template, entry, módulos compilados, manifesto de instalação e runbook ainda precisam de inspeção quando existirem. Não é aprovação antecipada desses arquivos nem de ativação. |
| S1-06 | CHANGES_REQUESTED | F01: a seleção de regressões precisa respeitar o grant sem payload. Mutantes dos novos contratos/preflight podem usar seams puros. |
| S1-07 | Plano adequado, evidência de BUILD pendente | Freeze:159–165 distingue pins/receipts, evidências e full wave5. Os hashes de inputs foram conferidos nesta revisão; não houve T1 executável, cobertura, suíte, mutante ou commit final realizado pelo crítico. |

IOCTL_DEV permanece coerente com o helper atual: `native/cvg-landlock-exec.c:101–108` só trata o bit 15 a partir do ABI5. A derivação prevista pelo freeze:44–46 deve conservar ausência de grant e não afirmar negação provada em ABI3/4. Não há motivo para modificar o ruleset C nesta fatia.

## Condições e limites preservados

- O único bloqueio identificado neste freeze é F01. Não se exige implementar guardião, seccomp, lease, janitor ou qualificação nativa para implementar o diagnóstico readonly.
- Freeze:112–147 é compromisso prospectivo, condicionado a novas revisões/digests. Schema completo e corpus de frames antecedem o primeiro filho da fatia2a; FDs efetivos, CLOEXEC, identidade de binário, lease e prova v2 precisam do gate próprio. A lista seccomp só admite ELF estático de teste sem libc, nunca Node/MCP/LSP. Não é manifesto executável aprovado agora.
- A entry que termina não fornece serviço utilizável para workloads. `KillMode=control-group` não comprova cleanup de lançamento; `RuntimeDirectoryPreserve=yes` não comprova lease/consumo de prova. Não substituir a raiz nomeada por user@1000.service. Manifesto e hashes da instalação precisam abranger os módulos compilados necessários antes de qualquer ativação.
- Filho cgroup vazio real, clone3/pidfd, pertencimento nativo, limites aplicados, owner parado, pressão, seccomp e nível B continuam `NOT_RUN`. Nada neste parecer concede produção, integração global ou encerramento de PAR-X03.

## Método e continuidade

Revisão direta, sem delegação. Leitura estática de freeze, SPEC, recibo, tipos, serviço, erros, adaptador, helper C, parser Landlock, exports e trechos dos testes consumidores. Foram usados somente leitura/listagem/hash local e Git de leitura; nenhum teste, import de aplicação, compilador, helper, systemd, PG/Docker, rede ou carga de recursos foi executado. Não foram consumidos resultados de testes do builder como prova desta revisão.

Lidos os AGENTS da raiz compartilhada e da candidate, a constituição `docs/07_agents/AGENTS.md` da raiz compartilhada (ausente na candidate reduzida), trechos de runtime/log/backlog e as regras/claims pertinentes de coordenação. A restrição expressa de escrita prevalece: nenhum claim, fonte, freeze ou ledger foi alterado; somente os dois arquivos desta revisão. Os hashes do freeze, SPEC, recibo e sete fontes coincidiram antes e depois da inspeção (reconferência em 2026-10-30T23:35:26Z). GBrain não foi consultado nem atualizado porque rede e escritas externas estão fora deste handoff; pendência de sincronização entregue ao responsável, sem alegar sincronização.

Próxima ação: o responsável restringe o procedimento S1-06 em nova revisão do freeze, preservando o artefato revisado; depois dispõe a implementação da fatia1 sob human26. Implementação permanece não aceita e produção `NO_GO`.
