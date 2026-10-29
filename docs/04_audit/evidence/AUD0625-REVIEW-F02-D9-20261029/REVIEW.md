# Revisão independente — F02 / SPEC 0275 (perfil imutável do PROCESS), commit `f4e799b80`

Revisora: sessão Claude D9. Revisão do **commit** `f4e799b805c92ec4ce81e00678c79c24608ae00e` (pai `3e1602f49`, branch `codex/aud0625-sandbox-build-20261029`) numa cópia detached; a working tree do Codex não foi tocada. Node 22.23.2, `--maxWorkers=2`, bubblewrap real do host (`/usr/bin/bwrap`), carga 9–13 (a rodada de testes começou em 12,9). Sem PG/Docker. Sem push. Produção segue `NO_GO`; F05 global, K08 e X01 seguem abertos. A SPEC 0275 (sha `bf49ad63…`) e o recibo `human-decisions-6` foram a referência.

## Veredito: APPROVE (sem obrigatórios; 2 P3 de teste e 4 observações)

O PROCESS agora roda com raiz vazia (`--tmpfs /`), só com os arquivos do manifesto (por FD), o workspace por FD, ambiente declarado e perfil capturado pelo host; sem perfil recusa. Não achei falha de contenção nem asserção enfraquecida. Os dois commits de docs depois do F02 (`75915eca`, `5f310fef`) tocam **só `docs/`**: `git diff --name-only f4e799b80 5f310fef2` não lista nenhum arquivo de runtime, teste ou helper.

## Foco pedido

**(a) A migração dos 7 callers não enfraqueceu asserção.** Comparei antes e depois de cada arquivo:
- `pdsh-011-sandbox-local` (4 casos), `pdsh-013-shell-tool` (2), `pdsh-013-shell-integration`, `pare100-public-controls`: só o comando mudou (de `/bin/echo`, `/bin/sleep`, `/usr/bin/seq`, `/bin/sh -c`, `/bin/true` para `process.execPath -e …`), mais `processProfile` e o `workspaceRoot` real no `handle`; as asserções ficaram as mesmas (stdout, `timeout`, truncamento a 1024 bytes com exit 0, escrita visível fora do namespace, status do harness).
- O teste de rede mudou de "não contém `eth0`" para "toda interface visível é `lo`"; é **mais forte** quando o host tem NIC (o mutante sem `--unshare-net` morre, Z5). Ressalva P3: num host em que só existe `lo`, a lista vazia dá `every` verdadeiro e o teste não distingue.
- `aud0625-contained-preabort`: trocou o backend falso "owned-backend" por um Node real sob o perfil. Continua afirmando o marcador de lançamento ausente no pré-abort e presente no controle positivo; o marcador agora é escrito pelo payload real. É mais forte, não mais fraca.
- `aud0625-process-containment-red`: os dois `it.fails` do F02 viraram `it` e passam; `aud0625-shell-cancellation-red` ganhou o caso X6 (runner lança depois do abort) que eu tinha pedido.
- Resultado: 12 arquivos, **239 testes passam** ([base-tests.txt](proofs/base-tests.txt)).

**(b) PROCESS não lê fora do workspace nem herda o ambiente.** Sonda com payload Node real sob o perfil ([probe1-payload-view-out.txt](proofs/probe1-payload-view-out.txt)): o arquivo sentinela fora do workspace dá `ENOENT`; `process.env` só tem `HOME, LANG, LC_ALL, PATH, PWD, TMPDIR, TZ` e a variável do pai (`REVIEW_F02_PARENT_SECRET`) está ausente; `/etc/passwd` dá `ENOENT`; o arquivo do workspace é lido; a raiz mostra só `dev, home, lib, lib64, mnt, proc, tmp` (os pais dos caminhos do manifesto, só nomes de diretório). Nenhum FD de **diretório** sobra no payload (a raiz do workspace e os arquivos de runtime são fechados pelo bwrap), então não existe fuga por `/proc/self/fd/N/..`. Mutações: raiz do host (`--ro-bind / /`, Z3, 3 falhas), sem `--unshare-net` (Z5), sem `--unshare-pid` (Z16), sem `--die-with-parent` (Z14), cwd fora do perfil (Z15) mortas; ambiente herdado do pai (`env: process.env`, Z1) e `--clearenv` removido (Z2) **sobrevivem cada um sozinho** (duas camadas de defesa), mas as duas juntas morrem (2 falhas).

**(c) O default sem perfil recusa.** `runContained` sem `processProfile` devolve `spawn_failed` com `process_profile_qualified_profile_required`; a chamada "legada" (`/bin/echo` + `bwrapPath` explícito, sem perfil) também; o runner default do `shell.run` sem perfil devolve `FAILED containment failed … process_profile_qualified_profile_required` ([probe2-out.txt](proofs/probe2-out.txt)). Perfil copiado ou objeto qualquer é recusado (o perfil só vale como a referência emitida pelo host, guardada em um `WeakMap`), o shell recusa `env`, `mounts`, `profile`, `processProfile`, `bwrapPath`, `runtimeFiles` e `executablePaths` vindos do modelo (Z11, 7 falhas), executável fora do manifesto (Z8), runtime com bytes trocados (Z7), nome do workspace trocado (Z6) e digest que ignora o backend (Z10, 13 falhas) morrem.

**(d) Limites que o F02-RESULT admite.** Confirmei os dois, sem estender a promessa:
- *Host imutável.* O manifesto é conferido por estampa + sha256 na hora da preparação; um arquivo reescrito **depois** é outro conteúdo para o mesmo inode.
- *O FD não congela o inode.* Provado na sonda: arquivo do manifesto reescrito no mesmo inode **depois** de `prepareProcessLaunch` e antes do `spawn`, o payload leu `TAMPERED` ([probe2-out.txt](proofs/probe2-out.txt), linha (d)). Quem pode fazer isso é um processo do host com escrita naquele arquivo, nunca o payload (os arquivos entram `ro-bind`). Consequência prática: o perfil de produção tem que apontar para runtime que só o root escreva; o helper de teste usa o Node e as libs do usuário (em `~/.nvm`), que são graváveis por ele.

## P3 (testes)

- **P3-1 (Z12): vazamento de descritores no pai.** Se o `launch.close()` do `finally` de `run.ts` for removido, **nenhum teste percebe**: cada lançamento deixa 10 descritores abertos no processo do host (medi 23 → 53 em 3 lançamentos; no código atual ficam em 23). O teste existente só confere o fechamento no caminho de recusa. Um teste que conte `/proc/self/fd` antes e depois de alguns `runContained` fecha o ponto.
- **P3-2 (Z13):** recusar um `handle` com `allowNetwork` verdadeiro é redundante com o `--unshare-net` (mutante sobrevive); só vale um teste se a recusa for contratual.

## Observações (não bloqueiam)

- **O1:** o FD do **binário** do `bwrap` continua aberto no payload (`fd12 => /usr/bin/bwrap`, arquivo de 72 KB, legível). É um arquivo público e somente leitura, sem diretório, então não abre fuga; mas é descritor herdado que poderia ser fechado antes do `exec` do payload.
- **O2:** a raiz do sandbox expõe os nomes dos diretórios pais dos caminhos do manifesto e do workspace (`/home`, `/mnt`, o nome do usuário do host quando o Node mora em `~/.nvm`); só nomes, sem conteúdo.
- **O3:** o descriptor do `shell.run` ganha `version = v1:<digest do perfil>`, então o fingerprint de composição muda por perfil. É o desenho da SPEC (liga a versão ao perfil imutável), só vale avisar o PR.
- **O4:** sem `seccomp` e sem `--unshare-user` explícito: a contenção é por namespace de PID/IPC/UTS/rede e raiz vazia, como o recorte da SPEC; o que falta é X01 (supervisão nativa), já declarado.

Pode integrar. Nada aqui exige correção do Codex.
