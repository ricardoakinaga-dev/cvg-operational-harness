# Confirmação do O1/P3 da fatia 1 e revisão das fatias 2 e 3 da SPEC 0257 (F07)

Branch `claude/aud0625-0257-07`: fatia 1 em `774ee789` (diff `15381179..774ee789`), fatias 2 e 3 em `fdf6601e` (diff `774ee789..fdf6601e`). Revisora: Claude D9, cópia detached, Node 22.23.2, `--maxWorkers=1/2`; PG 16.15 em contêiner próprio, carga 11–12 nas rodadas PG. Sem push. Produção segue `NO_GO`.

## 1) Fatia 1: O1 e P3 — CONFIRMADO

- **O1 fechado.** `production-bootstrap-postgres-own.test.ts` e `support/oidc-postgres-fixture.ts` usam `tenantRuntimeGrantPrivileges(table)`. Os cinco arquivos (`api-creation-memory`, `api-creation-postgres`, `production-bootstrap-postgres-own`, `oidc-login-postgres`, `oidc-login-entrypoint-postgres`): **5 arquivos, 53/53** ([confirm-slice1-tests.txt](proofs/confirm-slice1-tests.txt)); antes eram 16 falhas.
- **P3-a fechado:** `#critical` captura todas as coleções (`{ ...live }`); a mutação que volta ao subconjunto morre (2 falhas).
- **P3-b e MEM8 fechados:** teste de troca do ponteiro inteiro, de coleção não escrita e de sessão de outro tenant na aprovação; MEM1 e MEM8 agora morrem.
- **Chave da task** (`assertCreationKey` por rota): a task mantém a regra do corpo (8-200, texto livre) e a aprovação a estrita do header; a mutação "task estrita" morre.
- **Ainda aberto (P3, não bloqueia):** o modo `rollback-fails` foi adicionado ao pool falho do teste PG mas **nenhum teste o usa** (PG7 continua sobrevivendo: um `ROLLBACK` que falha ainda poderia devolver o client ao pool sem teste que perceba); também não foram tocados PG10, TRUNCATE, UNIQUE de task/audit e FK do audit ([confirm-slice1-mutations.txt](proofs/confirm-slice1-mutations.txt)).

## 2) Fatias 2 e 3 — APPROVE (sem obrigatórios; 4 P3 de teste, 2 observações)

Não achei defeito de código. `apps/api/src/__tests__/api-creation-http.test.ts` + console + `app.test.tsx`: 3 arquivos, 35/35; `api-creation-postgres-http` (PG): 2/2 ([slice2-pg-http.txt](proofs/slice2-pg-http.txt)).

**API.**
- **Header.** `readCreationKey` conta as ocorrências em `rawHeaders` (sem diferenciar maiúsculas): duplicado (mesmo com valores válidos), ausente, vírgula, espaço, fora de 8-200 `[A-Za-z0-9._:-]` ou não ASCII dão `validation_failed`, sem criar nada. Mutação que aceita duplicado morre.
- **Depois da authz.** A leitura do header fica depois de `requireIdentity`, de `authorizeCaseMutation` e do corpo; a sonda ([slice2-authz-probe-out.txt](proofs/slice2-authz-probe-out.txt)) confirma: sem identidade 401, operador sem grant 404, tanto sem header quanto com header inválido (nunca 400). **Mas nenhum teste fixa isso**: mover a leitura para antes da authz sobrevive (S1, P3-1).
- **Replay e 409.** O digest do approval não inclui `id` nem `createdAt` (só sessão, ação, resumo, risco, ator e rota), então o retry com o mesmo corpo devolve o mesmo id (200, `no-store`), e um corpo diferente com a mesma chave é 409 `conflict` sem ecoar a chave. Uma chave nova cria uma segunda aprovação. Task: replay pelo corpo e 409 com corpo alterado.
- **503 sem porta.** Sem `apiCreation` os dois POSTs dão 503 antes de qualquer escrita (a mutação que cai no caminho antigo morre).
- **Controle negativo do F07 por HTTP (PG).** Falha do audit deixa 0 aprovações, 0 recibos e 0 eventos (500); o retry converge (200) e o replay devolve o mesmo id, também em instância nova do servidor (recibo durável).
- **Ator autenticado.** O ator do evento e do digest é o `requester` (export de audit), a identidade, ou `System/api`. **Nenhum teste HTTP autenticado fixa isso**: usar sempre `System/api` sobrevive nas duas rotas (S6, S7, P3-2).

**Console.** `beginLogicalOperation` grava a chave **antes** do primeiro `fetch` (com leitura de volta), reutiliza a chave pendente em 500, recarga e novo clique, e só renova depois de uma resolução 2xx; a falha de storage bloqueia o envio com mensagem de recuperação. Mutações mortas: chave sempre nova, chave mantida depois do sucesso, sem leitura de volta, escopo sem operador ou sem tenant, falha de storage que despacha, sucesso que não resolve, chave diferente da registrada. Sobrevivem: o guard síncrono contra duplo clique (W6, o teste de duplo clique passa só pelo estado do botão) (P3-3), e a leitura do header sem distinção de maiúsculas e a checagem do padrão na rota (S3, S4): a persistência revalida a chave e `rawHeaders` entrega o nome como foi enviado, então um par `Idempotency-Key` + `idempotency-key` só é pego pelo `toLowerCase` e **não há teste com nomes em caixas diferentes** (P3-4).

## Observações

- **O1:** se `resolveLogicalOperation` falhar depois de um 2xx (cota de storage), a operação fica `pending` com a mesma chave e o próximo clique "novo" devolve a mesma aprovação (replay) sem avisar. O comentário do código assume o risco; vale uma mensagem.
- **O2:** um valor corrompido no `sessionStorage` (JSON truncado) faz `read` lançar `LogicalOperationStorageError` e bloqueia o envio do escopo até fechar a aba, sem caminho de limpeza. Só o JSON inválido; um JSON de forma errada vira "sem registro".
- O console só testa o 500 como falha incerta (o `timeout` e o erro de rede usam o mesmo caminho do `catch`, sem teste próprio) e um 4xx definitivo deixa a operação pendente com a mesma chave (inofensivo, o corpo é determinístico).

Nota de método: as mutações da API rodaram contra `api-creation-http.test.ts` e `case-scope-tasks-approvals.test.ts`; "nenhum teste fixa" vale para esses dois arquivos, não para a suíte inteira da API.

## Pedido (nenhum obrigatório)

P3-1 teste do header depois da authz (401/403/404 com header ausente e inválido); P3-2 teste autenticado do ator no evento e do 409 entre atores; P3-3 duplo clique síncrono (dois cliques no mesmo `act`); P3-4 duplicado em caixas diferentes; e, da fatia 1, o teste do `rollback-fails`.
