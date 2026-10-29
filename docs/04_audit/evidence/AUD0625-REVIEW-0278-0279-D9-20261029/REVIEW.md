# Revisão independente — SPEC 0278 (F03b, hardlink) e SPEC 0279 (F08e, expiração), BUILD `879b4e034`

Branch `claude/aud0625-f03b-f08e-df`, fase 1 `abbe84e04`, BUILD `879b4e0346e6b4602e022c3b956c7cf996b8683f` (base `claude/aud0625-wave2` @ `e2a4d518`). Revisora: sessão Claude D9, cópia detached; o worktree do DF não foi tocado. Node 22.23.2, `--maxWorkers=1/2`; PG 16.15 em contêiner próprio (removido), carga 9–17 (a rodada de PG começou em 9,8 e subiu depois que o contêiner subiu). Sem push. Produção segue `NO_GO`.

## Veredito: APPROVE das duas SPECs como escritas; 1 achado P2 fora do escopo da 0278 (F03c) e 2 observações

- **0278 (fs tools):** correta no que cobre. Mas **existe outro caminho de leitura de conteúdo do workspace que ignora o hardlink**: o upload de exames (`exam.upload`). Provado abaixo. Recomendo tratá-lo como follow-up F03c antes de chamar o F03 de fechado.
- **0279 (expiração):** correta, sem achados. A matriz dos cinco chamadores e a passada PG confirmam o que a SPEC afirma.

Os testes dos dois itens passam: approval-engine + sandbox + runtime-approval-store.unit, **16 arquivos, 228 testes** ([base-tests.txt](proofs/base-tests.txt)); PG `runtime-approval-store-postgres` **13/13** ([pg-runtime-approval-store.txt](proofs/pg-runtime-approval-store.txt)).

## 0278 — hardlink

- **`readBodyAt` é o único `readSync` do pacote sandbox** (`grep` em `packages/sandbox/src`): a recusa `nlink > 1` vem do `fstat` do descritor já aberto, depois de `isFile()` e antes do limite de tamanho e de qualquer byte lido. `fs.read` e `fs.edit` passam por ele; `fs.list` só faz `lstat` (nome e tipo, sem conteúdo); `fs.write` troca a entrada por `rename` e não lê.
- **Ordem no `fs.edit`:** `readBodyAt` roda antes de `recordWrite` (journal) e de `commitWrite` (arquivo temporário), então a recusa não deixa journal nem temp; o teste afirma `journaled == []` e o workspace sem o conteúdo de fora.
- Mutações mortas: sem a conferência (H1, 3 falhas), `>= 1` (H2), recusa como `FAILED` (H3, 3 falhas). Controles: um link lê; `fs.write` sobre o nome com hardlink não toca o arquivo de fora.
- **F03c (P2): `exam.upload` envia o conteúdo de um hardlink para o host de exames.** `packages/channel-gateway/src/exam-egress.ts` lê o arquivo por `confinePath` (resolução por caminho) e `readUpload`, que só usa `O_NOFOLLOW` no último componente e confere `isFile()`; não confere `nlink`. Com `link(arquivo-de-fora, workspace/report.pdf)`, `exam.upload` devolveu `SUCCEEDED` e o corpo enviado ao host permitido foi `OUTSIDE-SERVICE-SECRET` ([exam-upload-hardlink-probe-out.txt](proofs/exam-upload-hardlink-probe-out.txt)). É a mesma fronteira (`sandbox: 'WORKSPACE'`) e pior do que a leitura: sai da máquina. Exige aprovação e host na allowlist, mas a invariante 1 da 0278 ("nenhuma ferramenta ... devolve conteúdo de inode com outro nome") não vale para ele. Correção sugerida: o mesmo `fstat.nlink > 1` em `readUpload` (uma linha) e um teste espelho.
- **Observação 1:** o `shell.run` (PROCESS) continua podendo ler, dentro do workspace, o conteúdo de um hardlink pré-existente: é o mesmo inode sob o diretório ligado. A 0278 não o cobre (e diz que isso é do isolamento de processo); não testei aqui porque o perfil do F02 não está nesta base. Vale registrá-lo junto do F03c.
- **Observação 2:** a D1 (recusar todo `nlink > 1`, também com os dois nomes dentro) é o custo declarado; `.git/objects` de clone local e `node_modules` com hardlink deixam de ser legíveis pelas ferramentas fs.

## 0279 — expiração

- **Cinco chamadores de `#assertNotExpired`**,: matriz com cada estado vencido × cada chamador ([expiry-matrix-out.txt](proofs/expiry-matrix-out.txt)):
  - `REQUESTED`, `PENDING`, `APPROVED` vencidos continuam virando `EXPIRED` com `approval.expired` em `submit`, `approve`/`reject` (quando o estado exige) , `verifyAndConsume` e `reserve`.
  - `REJECTED`, `CANCELLED`, `FAILED`, `UNCERTAIN`, `RESERVED`, `EXECUTING` e `EXECUTED` de uso único **nunca mudam de status nem emitem evento** em nenhum dos cinco chamadores; respondem `invalid_state`, `already_reserved`, `uncertain` ou `already_executed`, que são os caminhos próprios deles. `EXECUTED` reutilizável vencido continua expirando (as mutações E3/E4 matam a condição `singleUse`).
  - `approve`/`reject` passam antes por `#replayDecision`, então a mudança só altera o código de erro em estados que não eram decididos de forma idêntica (de `expired` para `invalid_state`, sem gravar).
- **Adaptador PG:** `#mutateRecord` só persiste o que o motor alterou; como o motor não altera mais esses estados, nada é gravado. PG 13/13, e a mutação "guarda sempre age" (E6) falha 2 testes na passada PG.
- **Quem dependia de virar `EXPIRED`:** `git grep` em `apps` e `packages` (sem testes): nenhum consumidor de produção depende de `REJECTED`/`RESERVED`/`EXECUTING` virarem `EXPIRED`. O worker tem `EXPIRED` só na recuperação do F08b (0274) e na lista de estados do seletor; a UI usa `expired` só para sessão e rascunhos de jornada. `releaseExpired` (reserva) é governado pelo TTL da reserva e não mudou. Efeito prático: um `REJECTED`/`CANCELLED`/`FAILED` vencido agora fica no status em que terminou, então qualquer relatório que contasse "expirados" a partir deles passa a ver menos linhas (não achei nenhum).
- **0274/F08b:** a recuperação de `EXPIRED` antigos segue valendo para os dados que já foram reescritos, e o estado novo é mais simples (um `FAILED` ou `REJECTED` agora mantém o status que a decisão deixou); `EXPIRED` com `approved_at` vem de `APPROVED` ou de `EXECUTED` reutilizável vencidos.
- Mutações mortas (9 de 9): conjunto sem `APPROVED` (E1), com `REJECTED` (E2), `EXECUTED` sem a condição `singleUse` (E3), `EXECUTED` nunca (E4), retorno antecipado que lança `expired` (E5), guarda que sempre age (E6, 11 falhas), `expireStale` mais largo (E7), sem emitir o evento (E8), sem lançar (E9, 7 falhas).
- **Observação 3:** a varredura `expireStale` não inclui `EXECUTED` reutilizável (só a guarda o expira); isso é anterior à 0279 e a SPEC o preserva ("o último já expira hoje"), mas a lista não é literalmente a mesma. Se a intenção for igualar, é outra decisão.
- **Observação 4:** na matriz, a linha "EXECUTED reutilizável" que montei com `verifyAndConsume` ficou em `APPROVED` (o caminho reutilizável não muda o status); o estado `EXECUTED` reutilizável é exercitado pelos testes do DF e pelas mutações E3/E4, não pela minha matriz.

## Pedido

Nenhuma correção obrigatória nas duas SPECs. Peço que o DF registre o **F03c** (`nlink > 1` em `readUpload` + teste espelho, e o item do PROCESS) antes de dar o F03 por fechado.
