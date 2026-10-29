# SPEC0278 — Ferramentas fs recusam arquivo com mais de um hardlink

R0, 29/10/2026. Task `AUD0625-F03B-F08E-SPECS-DF-20261029`, follow-up
AUD0625-F03b (dono Claude DF) da [SPEC0270](0270_fs_tools_handle_and_directory_identity.md),
achado F03 da [auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: fronteira do sandbox de arquivos.
**Sem BUILD até revisão humana explícita deste documento.**

## 1. Evidência atual

Base: `claude/aud0625-wave2` @ `e2a4d518`, que já contém a 0270.

- A 0270 fecha o caminho por nome: cada componente é aberto a partir do
  descritor do diretório pai, com `O_NOFOLLOW`, e o arquivo final é lido pelo
  descritor aberto (`packages/sandbox/src/fs-tools.ts`, `readBodyAt`). Ela
  registrou o hardlink como limite residual (§ "Limites residuais"): um hardlink
  criado dentro do workspace para um arquivo de fora continua legível.
- Hardlink não é symlink: o nome dentro do workspace aponta para o mesmo inode
  do arquivo de fora, e nenhuma travessia sai da raiz. `readBodyAt` faz
  `fstat` e confere só `isFile()` e o tamanho.
- Prova (fase 1, `aud0625-f03b-hardlink.test.ts`): com `link(outside/secret,
workspace/link.txt)`,
  - `fs.read` devolve `SUCCEEDED` com o conteúdo de fora;
  - `fs.edit` lê o conteúdo de fora, grava o resultado editado dentro do
    workspace por `rename` atômico e registra a escrita no journal.
- `fs.write` sobre o nome com hardlink troca a entrada do diretório
  (`rename`) e não toca o inode de fora. É seguro hoje, e vira controle.
- Quem cria o hardlink: precisa de escrita no workspace e acesso ao arquivo de
  origem no mesmo sistema de arquivos. Com `fs.protected_hardlinks=1` (padrão
  do Linux), só arquivos do próprio usuário ou com leitura e escrita. O
  processo do serviço é dono dos próprios segredos, então a origem possível
  inclui configuração e chaves do serviço. Depois da 0275 (F02), o processo
  `PROCESS` não enxerga mais o lado de fora; o hardlink pode ter sido criado
  antes, por outro processo do host ou por outra ferramenta.

## 2. Invariantes

1. Nenhuma ferramenta fs devolve, edita ou registra no journal conteúdo de um
   inode que tenha outro nome além do aberto (`nlink > 1`).
2. A recusa é decidida pelo `fstat` do descritor já aberto, nunca por um nome,
   então não abre janela de troca entre a conferência e a leitura.
3. A recusa vem antes de qualquer efeito: em `fs.edit`, antes do journal e
   antes do arquivo temporário.
4. `fs.write` continua substituindo a entrada por `rename` sem ler nem alterar
   o inode antigo.

## 3. Mudança proposta

- Em `readBodyAt`, depois de `isFile()`: se `stats.nlink > 1`, devolve
  `REJECTED` com a mensagem constante `file has more than one hard link`.
  `fs.read` e `fs.edit` passam por `readBodyAt`, então os dois herdam a recusa.
- `fs.list` não muda: devolve nome e tipo, sem conteúdo.
- `fs.write` não muda.
- Sem opção de configuração nesta rodada (D1).

## 4. Critérios de pronto

- [ ] `fs.read` de hardlink para fora: `REJECTED`, sem o conteúdo de fora no
      resultado.
- [ ] `fs.edit` do mesmo: `REJECTED`, journal vazio, workspace sem o conteúdo
      editado e o arquivo de fora intacto.
- [ ] Arquivo com dois nomes dentro do workspace: `REJECTED` (D1).
- [ ] Controles: arquivo com um link lê; `fs.write` sobre o nome com hardlink
      substitui a entrada e não toca o arquivo de fora; depois de remover o
      nome de fora, o arquivo tem um link e lê (limite aceito, §6).
- [ ] Mutações mortas: sem a conferência; `>= 1` no lugar de `> 1`; conferência
      depois da leitura; recusa como `FAILED`.
- [ ] Regressão: `packages/sandbox` inteiro, `aud0625-fs-handle-dir-identity`
      e `pdsh-012-fs-tools`, com Node 22 e `--maxWorkers=2`; typecheck e lint.

## 5. Testes

- Fase 1: `packages/sandbox/src/__tests__/aud0625-f03b-hardlink.test.ts`, com
  três `it.fails` (leitura para fora, edição para fora e dois nomes dentro) e
  três controles. Sem a inversão, os três falham por
  `expected 'SUCCEEDED' to be 'REJECTED'`.
- BUILD: os `it.fails` viram `it`, mais as mutações do §4.

## 6. Fora de escopo e limites aceitos

- Se o nome de fora for removido antes do `fstat`, o inode passa a ter um link
  só e é lido. O conteúdo ficou só dentro do workspace, e quem o removeu tinha
  escrita no diretório de fora.
- Bind mount dentro do workspace é assunto do isolamento de processo (0275/X01),
  não das ferramentas fs.
- Arquivo que ganha um segundo link depois do `fstat`: a leitura é do inode já
  aberto, que estava só dentro do workspace no momento da conferência.

## 7. Decisões pedidas ao Ricardo

- **D1.** Recusar todo arquivo com `nlink > 1`, inclusive quando os dois nomes
  estão dentro do workspace. Não há como saber onde está o outro nome sem
  varrer o disco. Custo: workspaces com hardlinks legítimos ficam ilegíveis
  pelas ferramentas fs, como clone local do git em `.git/objects` e
  `node_modules` de gerenciador que usa hardlink. Recomendado: sim, recusar
  tudo. A alternativa seria uma opção de configuração desligada por padrão, o
  que deixa a fronteira dependendo de configuração.
