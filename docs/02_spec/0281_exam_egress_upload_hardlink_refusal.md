# SPEC0281 — O upload de exames recusa arquivo com mais de um hardlink

R0, 29/10/2026. Task `AUD0625-F03C-D9-20261029`, follow-up AUD0625-F03c (dona
Claude D9) da [SPEC0278](0278_fs_tools_hardlink_refusal.md), achado da
revisão D9 das 0278 e 0279 (commit `af3d8cb03`, branch `claude/aud0625-review-0278-0279-d9`),
achado F03 da [auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: fronteira do sandbox de arquivos e
saída de dados. **Sem BUILD até revisão humana explícita deste documento.**

## 1. Evidência atual

Base: `879b4e0346e6b4602e022c3b956c7cf996b8683f`, que já contém a 0278.

- A 0278 recusa `nlink > 1` em `readBodyAt`, o único `readSync` do pacote
  `sandbox`, mas a ferramenta `exam.upload` não passa por ele.
  `packages/channel-gateway/src/exam-egress.ts` resolve o caminho com
  `confinePath` e abre o arquivo em `readUpload` com `O_NOFOLLOW` só no último
  componente, conferindo apenas `isFile()` e o tamanho.
- `exam.upload` é declarada `sandbox: 'WORKSPACE'`, risco `HIGH`,
  `sideEffect: 'EXTERNAL'` e exige aprovação. Lê o conteúdo do workspace e o
  envia a um host da allowlist HTTPS.
- Prova (revisão D9, sonda reaproveitada na fase 1): com
  `link(arquivo-de-fora, workspace/report.pdf)`, `exam.upload` devolveu
  `SUCCEEDED` e o corpo enviado ao host permitido foi o conteúdo do arquivo de
  fora. A leitura de um hardlink por `fs.read` já é recusada pela 0278; o
  upload leva o mesmo conteúdo para fora da máquina.
- Quem cria o hardlink: o mesmo da 0278 (§1): escrita no workspace e acesso ao
  arquivo de origem no mesmo sistema de arquivos; com
  `fs.protected_hardlinks=1`, só arquivos do próprio usuário ou com leitura e
  escrita. A origem possível inclui configuração e chaves do serviço.
- `exam.download` não lê o destino: grava um temporário (`wx`) e faz `rename`
  sobre o nome, então não toca o inode de fora. É seguro hoje e vira controle.
- A recusa atual de arquivo ilegível no upload é `FAILED` com a mensagem
  `source unreadable, changed or exceeds maxFileBytes`, antes de reservar o
  journal e antes de qualquer saída de rede.

## 2. Invariantes

1. `exam.upload` nunca envia, nem registra no journal ou no hash do payload,
   conteúdo de um inode que tenha outro nome além do aberto (`nlink > 1`).
2. A recusa é decidida pelo `fstat` do descritor já aberto, nunca por um nome,
   então não abre janela de troca entre a conferência e a leitura.
3. A recusa vem antes de qualquer efeito: antes do cálculo do hash, da reserva
   no journal, da resolução final do host e de qualquer chamada de rede.
4. `exam.download` continua substituindo a entrada por `rename`, sem ler nem
   alterar o inode antigo.

## 3. Mudança proposta

- Em `readUpload`, depois de `isFile()` e antes de `stat.size`: se
  `stat.nlink > 1`, lança um erro. O `catch` existente do executor devolve o
  `FAILED` atual (`source unreadable, changed or exceeds maxFileBytes`), antes
  do journal. Não muda a união de resultados nem a mensagem pública.
- `exam.download` não muda.
- Sem opção de configuração nesta rodada (D1).

## 4. Critérios de pronto

- [ ] `exam.upload` de hardlink para arquivo de fora: resultado diferente de
      `SUCCEEDED`, `fetchImpl` não chamado e nenhum byte de fora no resultado.
- [ ] A recusa não reserva o journal: depois dela, a mesma identidade ainda
      pode ser reservada.
- [ ] Arquivo com dois nomes dentro do workspace: recusado (D1).
- [ ] Controles: arquivo com um link envia o corpo certo uma vez;
      `exam.download` sobre o nome com hardlink substitui a entrada e não toca
      o arquivo de fora; depois de remover o nome de fora, o arquivo tem um
      link e envia (limite aceito, §6).
- [ ] Mutações mortas: sem a conferência; `>= 1` no lugar de `> 1`; conferência
      depois da leitura; conferência por nome (`lstat`) em vez do descritor.
- [ ] Regressão: `packages/channel-gateway` inteiro e
      `packages/sandbox/src/__tests__/aud0625-f03b-hardlink.test.ts`, com Node
      22 e `--maxWorkers=2`; typecheck, eslint e prettier.

## 5. Testes

- Fase 1: `packages/channel-gateway/src/__tests__/aud0625-f03c-exam-hardlink.test.ts`,
  com três `it.fails` (envio para fora, reserva do journal e dois nomes
  dentro) e quatro controles. Sem a inversão, os `it.fails` falham por
  `expected 'SUCCEEDED' not to be 'SUCCEEDED'` e pela chamada de rede feita.
- BUILD: os `it.fails` viram `it`, mais as mutações do §4.

## 6. Fora de escopo e limites aceitos

- **`shell.run` (PROCESS).** Um hardlink pré-existente dentro do workspace
  também é legível por um payload do PROCESS, porque é o mesmo inode sob o
  diretório ligado. Isso não se corrige em `exam-egress` nem nas ferramentas
  fs: pertence ao isolamento de processo e à supervisão nativa, ligado ao
  F02 ([SPEC0275](0275_aud0625_process_filesystem_environment.md)) e ao X01.
  Registrado aqui para não se perder; não foi testado na base desta SPEC, que
  não inclui o perfil do F02.
- Se o nome de fora for removido antes do `fstat`, o inode passa a ter um link
  só e é enviado. O conteúdo ficou só dentro do workspace, e quem o removeu
  tinha escrita no diretório de fora.
- Arquivo que ganha um segundo link depois do `fstat`: a leitura é do inode já
  aberto, que estava só dentro do workspace no momento da conferência.
- Bind mount dentro do workspace é assunto do isolamento de processo.
- `exam.download` e a política de URL não mudam.

## 7. Decisões pedidas ao Ricardo

- **D1.** Recusar todo arquivo com `nlink > 1` no upload, inclusive quando os
  dois nomes estão dentro do workspace, como na 0278 (D1). Custo: um exame que
  seja hardlink legítimo dentro do workspace deixa de poder ser enviado e tem
  de ser copiado. Recomendado: sim, pela mesma razão da 0278 (não há como saber
  onde está o outro nome sem varrer o disco).
