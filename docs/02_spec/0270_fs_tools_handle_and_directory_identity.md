# SPEC0270 — Ferramentas `fs`: raiz concedida pelo handle e identidade de diretório

R1, 28/10/2026. Task `AUD0625-FS-TOOLS-DF-20261028`. Achados F03 e F04 da
[auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Delta da [SPEC0197](0197_pdsh012_fs_tool.md) (PDSH-012). Estado
`IMPLEMENTED_LOCAL` (BUILD local e sintético; revisão humana T3 aprovada em
28/10/2026 sobre o texto de sha256 `86f5178b…`, ver §9). T3: segurança e
comportamento de export público (`createFsTools` em `@cvg/sandbox`). Não trata F01 (capability-boundary), F02 (runner
de processo) nem F05 (cancelamento do shell); esses continuam com os titulares
do Codex.

## 1. Evidência atual

Fonte main `8429019b36f150828bfccef0080fdeff4a635fed`, igual à da auditoria
(`61e5cf8f`) em `packages/sandbox`.

- **F03, raiz da fábrica sem conferir a concessão.** `createFsTools` captura
  `root = realpathSync(options.workspaceRoot)` uma vez
  (`packages/sandbox/src/fs-tools.ts:189`), e o `execute(input, context)` das
  quatro ferramentas ignora `context.sandboxHandle`
  (`fs-tools.ts:270`, `:294`, `:337`, `:384`). A auditoria entregou a `fs.read`
  um handle que concede o workspace A a uma ferramenta configurada para B, e a
  ferramenta leu a sentinela de B. O kernel repassa o handle validado ao corpo
  da ferramenta desde o PARE100 (`packages/harness/src/kernel/pipeline.ts:441`
  e `:511`). A frase da 0197 §1 ("o `SandboxHandle` não é repassado ao corpo
  da tool") ficou desatualizada. O shell já exige o handle `PROCESS` e confere
  se a raiz configurada está dentro da concessão
  (`packages/sandbox/src/shell-tool.ts:179–208`).
- **F04, escrita pelo caminho nominal depois do journal.** `prepareWrite`
  confina o caminho com `realpath` (`fs-tools.ts:211`). Depois `fs.write` e
  `fs.edit` aguardam `journal.record` (`:349`, `:410`) e só então gravam em
  `prepared.abs` pelo nome (`writeAtomic`, `:141–151`). Se um diretório do
  caminho for trocado por um symlink durante essa espera, a escrita sai do
  workspace. A auditoria reproduziu isso com uma pasta sintética:
  `SUCCEEDED` e o arquivo foi gravado fora da raiz. O rename atômico do arquivo
  final, sozinho, não fecha a janela, porque o diretório pai é resolvido de
  novo pelo nome.
- Sonda original: `docs/04_audit/evidence/AUD-SCORE-20261028/audit0625-sandbox.test.ts.txt`.

## 2. Invariantes

1. Nenhuma ferramenta `fs` lê, lista ou grava fora da raiz concedida pelo
   handle que o kernel entregou àquela chamada.
2. Sem handle válido, a ferramenta recusa (`REJECTED`), da mesma forma que o
   shell. Não há caminho de compatibilidade que dispense o handle.
3. Toda operação fica presa à identidade (inode) dos diretórios abertos no
   início da operação. Trocar um diretório por symlink, ou renomeá-lo, durante
   a espera do journal não muda o diretório onde o arquivo é gravado. Se a
   troca for detectada, a operação falha sem gravar.
4. Nenhum componente do caminho pode ser symlink, nem mesmo um que aponte para
   dentro do workspace. A raiz em si pode ser symlink: ela é resolvida uma vez,
   na fábrica.
5. Continuam valendo os limites, o gate de intenção, o journal antes da
   mutação e o namespace reservado de temporários da 0197.

## 3. Mudança proposta

### 3.1 F03: raiz efetiva vem do handle

Em cada `execute`, antes de tocar no disco:

- Exigir `context.sandboxHandle` com `mode` igual a `WORKSPACE` ou `PROCESS`
  e `workspaceRoot` string absoluta, sem NUL. Com `deadlineMs`, valer a mesma
  validação do shell. Sem isso: `REJECTED` com
  `a valid governed WORKSPACE sandbox handle is required`.
- Calcular `grantedRoot = realpath(handle.workspaceRoot)` e exigir que seja
  diretório.
- Exigir que a raiz configurada esteja dentro de `grantedRoot` (igual ou
  descendente, por segmento de caminho). Se não estiver: `REJECTED` com
  `configured workspace root is outside the sandbox grant`.
- A raiz efetiva continua sendo a raiz configurada (a mais estreita). O handle
  limita; ele não amplia.

A validação reaproveita a do shell, extraída para uma função interna comum em
`packages/sandbox/src/`, sem novo export público.

### 3.2 F04: operações relativas a descritores de diretório

Node 22 não expõe `openat`/`renameat`. A implementação usa os caminhos
`/proc/self/fd/<fd>/<nome>`, que o kernel Linux resolve a partir do inode do
descritor, e não do nome:

1. No início da operação, abrir a raiz configurada como descritor
   (`O_RDONLY | O_DIRECTORY`).
2. Descer componente por componente com
   `open('/proc/self/fd/<pai>/<componente>', O_RDONLY | O_DIRECTORY | O_NOFOLLOW)`.
   Symlink no meio do caminho gera `ELOOP` ou `ENOTDIR` e vira `REJECTED`.
3. Leitura: abrir o arquivo final relativo ao descritor do pai, com
   `O_RDONLY | O_NOFOLLOW`. Conferir `fstat` (arquivo regular, tamanho) e ler
   pelo descritor.
4. Listagem: `readdir` e `lstat` pelos caminhos relativos ao descritor.
5. Escrita e edição:
   - Manter o descritor do diretório pai aberto durante a espera do journal.
   - Depois do journal, conferir que o caminho nominal ainda leva ao mesmo
     `dev`/`ino`. Se não levar, `FAILED` com
     `workspace directory changed during the operation`, sem gravar.
   - Criar o temporário relativo ao descritor com
     `O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW`, gravar e fazer `fsync`.
   - Fazer o `rename` do temporário para o nome final, os dois relativos ao
     mesmo descritor. Em erro, remover o temporário pelo mesmo descritor.
   - O alvo final pode já existir. Se for symlink, o `rename` o substitui sem
     segui-lo.
6. Fechar todos os descritores em `finally`.
7. A fábrica confere no boot se `/proc/self/fd` existe. Sem ele (fora do
   Linux), `createFsTools` lança erro e falha fechada no boot. O destino de
   produção é Linux, numa imagem distroless.

`confinePath` continua igual (o shell também o usa) e segue como primeira
barreira, só textual: escape, absoluto, NUL e temporário reservado.

## 4. Compatibilidade

- Comportamento de export público muda:
  - Chamadas diretas sem handle passam a ser recusadas.
  - Symlinks internos ao workspace, antes aceitos, passam a ser recusados.
  - Fora do Linux, a fábrica falha no boot.
- Nenhum host de produção usa `createFsTools` hoje: só testes e o teste de
  superfície pública (`tests/consumers-public-surface.test.ts`).
- Os testes `pdsh-012` passam a enviar um handle `WORKSPACE`.
- Enquanto F01 não for corrigido, uma ferramenta `fs` registrada pelo caminho
  `capabilities` não recebe handle e é recusada. Isso é fechamento na direção
  segura, e não regressão.

## 5. Critérios de pronto

- [ ] F03: handle A com raiz configurada B → `REJECTED`. Sem handle →
      `REJECTED`. Handle igual à raiz, ou ancestral dela → `SUCCEEDED`. Vale
      para as quatro ferramentas.
- [ ] F04: troca de diretório por symlink durante o journal → `FAILED`, sem
      arquivo fora da raiz e sem temporário órfão. O mesmo para `fs.edit`.
      Controle: escrita normal com journal → `SUCCEEDED`, arquivo dentro da
      raiz.
- [ ] Symlink em componente intermediário ou final → `REJECTED`, para dentro
      ou para fora da raiz.
- [ ] Todos os testes atuais de `pdsh-012` passam, ajustados só para enviar o
      handle. A integração `pdsh-012-fs-integration` passa com o gate local.
- [ ] Os testes `it.fails` desta SPEC viram `it` normais e passam.
- [ ] Com Node 22: `npm run typecheck`, `npm run lint`, `npm test` e
      `test:postgres` conforme o T3. E2E só com claim próprio.
- [ ] A SPEC0197 §1 recebe uma nota apontando para esta SPEC.

## 6. Testes

`packages/sandbox/src/__tests__/aud0625-fs-handle-dir-identity.test.ts`:

- `it.fails` com o comportamento-alvo. Hoje falham pela razão do defeito: F03
  com handle divergente ou ausente; F04 com troca durante o journal em
  `fs.write` e `fs.edit`; symlink interno.
- Controles que passam hoje e depois da correção: handle igual à raiz, escrita
  normal com journal, symlink para fora recusado.

## 7. Riscos e fora de escopo

- `/proc/self/fd` depende do Linux. O teste de boot cobre a falha fechada. Não
  se adiciona dependência nativa nem se altera o lockfile.
- O custo extra é de um `open` por componente do caminho, desprezível perto
  do journal.
- Concorrência de conteúdo no `fs.edit` (o arquivo muda entre a leitura e a
  escrita) é outro tema e fica fora.
- F01, F02, F05, o runner de processo e o kernel não mudam aqui.

## 8. Decisões pedidas ao Ricardo

- **D1.** Handle obrigatório nas ferramentas `fs`, recusando sem handle.
  Recomendado: sim.
- **D2.** Recusar qualquer symlink dentro do workspace, mesmo apontando para
  dentro. Recomendado: sim, porque é a forma simples de "não atravessar
  symlink" pedida pela auditoria.
- **D3.** Resolução por `/proc/self/fd`, com falha no boot fora do Linux.
  Recomendado: sim.

## 9. Notas de fechamento (BUILD local, 28/10/2026)

- **Aprovação:** o Ricardo aprovou "como está" as decisões D1, D2 e D3
  ([recibo](../04_audit/evidence/USER-DECISIONS-20261028/human-decisions-2.json)),
  vinculadas ao sha256
  `86f5178b79e7bf1cdd024fe3e7a1c397e9ea6ca92fa53cd90336978e4fd2375f` das §1–§8.
  Esta seção e a linha de estado foram acrescentadas depois do BUILD.
- **Código:** `packages/sandbox/src/fs-tools.ts` e o módulo interno novo
  `packages/sandbox/src/dir-fd.ts`, sem export público novo.
- **Desvio deliberado da §3.1:** a validação do handle ficou em `fs-tools.ts`
  e não foi extraída para uma função comum com `shell-tool.ts`. O
  `shell-tool.ts` está na frente F05 do Codex, e esta fatia não o altera. As
  regras e as mensagens são as do shell, com o modo `WORKSPACE` também aceito.
  A unificação fica para o titular do shell.
- **Detalhe de plataforma:** com `O_DIRECTORY | O_NOFOLLOW`, o Linux devolve
  `ENOTDIR`, e não `ELOOP`, para symlink de diretório. O `lstat` relativo ao
  descritor distingue symlink de arquivo comum.
- **Ordem preservada da 0197:** com o diretório pai inexistente, `fs.write`
  ainda grava o journal antes de falhar (`file could not be written`). Symlink
  no caminho é recusado antes do journal.
- **Testes:** os 8 casos que falhavam pelo defeito
  ([saída RED](../04_audit/evidence/AUD0625-FS-TOOLS-DF-20261028/red-output.txt))
  passam. Somam-se 4 controles e 4 casos de fronteira: boot fora do Linux,
  symlink final interno, handle `PROCESS` aceito e `NONE` recusado, e nenhum
  temporário órfão. Os testes `pdsh-012` mudaram só para enviar um handle
  `WORKSPACE` que concede o diretório temporário. Gates com Node 22 em
  [build-gates.txt](../04_audit/evidence/AUD0625-FS-TOOLS-DF-20261028/build-gates.txt).
- **Fora do local:** `test:postgres` e E2E não rodaram aqui. Nenhum teste de PG
  ou de E2E importa as ferramentas `fs`, e a barra da CI os executa no PR.

### 9.1 Revisão independente AUD0625-REVIEW-0270-D9 (REVISE pequeno) e correções

Revisor não autor: sessão Claude D9, relatório em
`docs/04_audit/evidence/AUD0625-REVIEW-0270-D9-20261028/REVIEW.md` (branch
própria). Nenhuma brecha de segurança encontrada. Correções aplicadas:

- **P2, symlink final em `fs.write`.** O §3.2 item 5 dizia que o `rename`
  substitui um symlink final; o invariante 4, o §5 e a decisão D2 aprovada
  pedem recusa. Vale a decisão aprovada: `fs.write` agora recusa (`REJECTED`)
  symlink final antes do journal, como já faziam `fs.read` e `fs.edit`. A
  frase do §3.2 item 5 fica superada por esta nota.
- **P3, testes.** Novos casos: concessão que é só prefixo irmão da raiz
  (`/ws` × `/ws2`), contagem de descritores em sucesso e erro nas quatro
  ferramentas, campos inválidos do handle, symlink intermediário em
  `fs.list`/`fs.write`/`fs.edit` e symlink final em `fs.write`. As três
  mutações que antes sobreviviam (prefixo sem separador, `fs.list` sem fechar
  o descritor, escrita trocando o symlink) agora são mortas.
- **P3, identidade.** `dev`/`ino` comparados como `bigint`.
- **P3, leitura limitada.** A leitura para em `maxBytes + 1` bytes mesmo se o
  arquivo crescer depois do `fstat`; antes, lia até o EOF.

Limites residuais, aceitos e registrados:

- O `fsync` do arquivo é síncrono e pode segurar o event loop com o disco
  ocupado (o revisor mediu 0,4 s e 2,5 s). O diretório não recebe `fsync`
  depois do `rename`. As escritas da 0197 já eram síncronas.
- A raiz configurada é aberta pelo nome, com `O_NOFOLLOW` só no último
  componente. Os ancestrais da raiz são do host, não do workspace.
- Um processo externo com escrita dos dois lados pode mover o diretório pai
  para fora entre a conferência e o `rename`. Não há `await` nesse intervalo,
  então isso não acontece dentro do próprio processo.
- Um hardlink criado dentro do workspace para um arquivo de fora continua
  legível, como antes. Recusar `nlink > 1` fica como follow-up AUD0625-F03b.
