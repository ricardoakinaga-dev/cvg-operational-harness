A base é a `main` depois do merge do PR da segunda onda AUD0625. Todo o código foi feito e testado localmente, só com dados sintéticos. Produção continua `NO_GO`: este PR não concede release, deploy nem acesso a dado real.

## Em uma frase

Terceira onda da auditoria 0625. Um upload de exame não lê mais arquivo com mais de um hardlink. Um 429 do provedor passa a respeitar o `Retry-After`, e as tentativas de reenvio têm teto. A migration 0021 deixa de travar bancos com eventos de atendimento anteriores a ela. O console avisa o operador quando não consegue guardar o registro de uma operação e descarta um registro corrompido.

## As frentes

Cada frente segue a mesma ordem: achado, SPEC e recibo, o que mudou, SHAs locais, testes (Node 22), revisão independente e testes antigos ajustados.

### 1. SPEC 0281, `exam.upload` recusa arquivo com mais de um hardlink (F03c)

- **Achado:** achado novo da revisão das SPECs 0278 e 0279. O `exam.upload` (`readUpload`) lia um hardlink dentro do workspace para um arquivo de fora e enviava o conteúdo ao host permitido.
- **SPEC e recibo:** 0281, sha256 `3a2eaa50…`. Recibo `docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-8.json`: D1 = recusa total.
- **O que mudou:** uma linha em `readUpload`. Depois de `isFile()` e antes do limite de tamanho, `nlink > 1` lança. O `catch` existente devolve o `FAILED` de sempre, antes do hash, do journal e da rede. A união de resultados e a mensagem pública não mudam.
- **SHAs:** fase 1 `868ff63e`, BUILD `076c160f` (D9).
- **Testes:** `packages/channel-gateway` mais o teste de hardlink do sandbox: 24 arquivos, 239/239. Os 3 `it.fails` da fase 1 viraram `it`, e há um teste de ordem que prova que a recusa vem antes de qualquer byte lido e segue o descritor aberto, não o nome. Mutações U1–U5 mortas.
- **Revisão independente (DF, `83e5d062`):** APPROVE, sem achados.
- **Limite aceito (vale também para a 0278):** um escritor concorrente do workspace que **remove o nome entre o `open` e o `fstat`** deixa o inode aberto só com o nome de fora (`nlink` 1) e a conferência passa; foi reproduzido. A regra fecha o hardlink já existente, não vence esse escritor. A defesa real é o isolamento do PROCESS (F02/X01), que continua aberto.

### 2. SPEC 0282, o 429 respeita o `Retry-After` e as tentativas têm teto (F12c)

- **Achado:** um 429 devolvia o registro a `PENDING` e o reenvio saía na hora, sem teto: nove chamadas faziam nove requisições e o registro chegava a `attempt 9`.
- **SPEC e recibo:** 0282, sha256 `0d84cd2c…`. Recibo `docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-9.json`: D1 = teto 5, D2 = `Retry-After` cortado em 5 min (sem cabeçalho, o reenvio continua imediato, limitado pelo teto) e D3 = A (com a migration 0031).
- **O que mudou:**
  - Teto primeiro: com `attempt >= maxAttempts` (padrão 5), o registro vira `FAILED attempts_exhausted`, responde como replay e não vai à rede.
  - Depois, o "não antes de": uma reserva antes do prazo devolve `retry_later` com o tempo restante, sem lease, sem rede e sem incrementar o `attempt`. O takeover zera o prazo.
  - Os adaptadores Chatwoot e Evolution leem o `Retry-After` em segundos e em data HTTP; ausente, zero, negativo ou ilegível não bloqueia. O corte de 5 min vale no adaptador e no gateway.
  - Os journals de memória, arquivo e PostgreSQL (incluindo o `#decideReserve` privado) seguem a mesma regra. Registro antigo de arquivo, sem o campo, lê como sem espera.
  - Migration `0031_channel_effect_retry_not_before`: coluna `bigint` anulável, aditiva e forward-only; registrada onde a 0030 está. O inventário do tenant-schema não muda.
- **SHAs:** fase 1 `ab790b1c`, BUILD `49bf28e5` (D9).
- **Testes:** `packages/channel-gateway` mais o journal PG: 24 arquivos, 287/287. PostgreSQL 16.15: journal 16/16 (4 novos, incluindo a espera que sobrevive a outra conexão e instância), modo PG, inventário e outbox 86/86. Mutações mortas; Q14 (espera malformada) é equivalente.
- **Revisão independente (DF, `83e5d062`):** APPROVE, sem achados.
- **Testes antigos ajustados:** a lista esperada de migrations em `postgres-persistence-mode` ganhou a 0031; o journal PG ganhou timeout explícito de 60 s no `beforeAll`.

### 3. SPEC 0271, o pré-check da migration 0021 só conta o que o índice deduplica (F15)

- **Achado:** o pré-check agrupava `approval_decision` por `approvalId`/`decision` mesmo quando os dois são `NULL`. Dois eventos de atendimento do mesmo tenant (que usam `approvalRequestId`/`status`) formavam o grupo `NULL/NULL` e abortavam a migration com `23505`, embora o índice, que trata `NULL` como distinto, nunca os rejeitasse. Reproduzido em PostgreSQL 16 com histórico misto. Um banco assim também ficava sem as migrations 0022 a 0031. A produção é instalação nova, então o defeito estava dormente lá; afetava bancos de homologação e ensaio.
- **SPEC e recibo:** 0271 R1, sha256 `17c69d1b…`. Recibo `docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-10.json`: D1 = A e D2 = não nesta SPEC.
- **O que mudou:**
  - O pré-check ganha `AND payload->>'approvalId' IS NOT NULL AND payload->>'decision' IS NOT NULL`. Índice, validação de definição e mensagem não mudam.
  - Uma migration de guarda não resolveria (o pré-check roda antes de qualquer migration posterior), e editar a 0021 quebraria por `checksum mismatch` todo banco que já a aplicou. Por isso `supersededMigrationChecksums` aceita o checksum anterior da 0021 (`038de370…`), num ponto único (`isAcceptedMigrationChecksum`) usado pelo runner, pelo `assertTenantIsolationMigrationState` e pelo preflight do worker. Nada é regravado no banco.
- **SHAs:** fase 1 `43deb9de`, BUILD `5692dc57` (D9).
- **Testes:** PostgreSQL 16, 9 arquivos, 146/146. Cobrem: o banco que aplicou a 0021 antiga segue sem erro, com o checksum antigo intacto, e aplica 0022 a 0031; o banco parado aplica 0021 a 0031 numa rodada; checksum desconhecido ou ausente continua erro; duplicata real continua bloqueando. Mutações Q1–Q9 mortas.
- **Revisão independente (DF, `2cc9f86c`):** APPROVE, sem achados. O desvio da SPEC §3.2 está registrado e correto: o `baselineLegacyPostgresMigration` só calcula o checksum da `0000_initial`; o terceiro comparador real é o preflight do worker.
- **Testes antigos ajustados:** `postgres-role-preflight.test.ts` ganhou um teste do checksum anterior da 0021. Os hashes da 0021 em `certification/` já estavam defasados e são regenerados pelo `certify`.

### 4. Console, observações O1 e O2 da 0257 (T2)

- **Achado:** na revisão da SPEC 0257. O1: se o registro local falhasse depois de um 2xx, o próximo clique devolvia a mesma aprovação sem avisar. O2: um JSON corrompido no `sessionStorage` bloqueava o escopo até fechar a aba.
- **O que mudou:**
  - O1: aviso ao operador, mantendo a chave. O clique seguinte reenvia a mesma solicitação e o servidor devolve a mesma aprovação, sem duplicar. Uma chave nova não ajudaria, porque a gravação seguinte também falharia.
  - O2: o registro corrompido é descartado e regenerado. Um storage ilegível continua bloqueando o envio.
- **SHA:** `20f0040d` (D9).
- **Testes:** 4 novos, vermelhos antes da correção; `apps/web` inteiro: 34 arquivos, 174/174. Mutações mortas (2 equivalentes documentadas).
- **Revisão independente (DF, `2cc9f86c`):** APPROVE, sem achados.

### 5. F02, complementos de teste do Codex AUD0625

- **Achado:** dois P3 da revisão do F02: tirar o `launch.close()` do `finally` não quebrava nenhum teste (vazava 10 FDs por lançamento), e aceitar `allowNetwork` não era detectado.
- **O que mudou:** só o teste novo `tests/aud0625-process-profile-lifecycle.test.ts`, sem mudar runtime.
- **SHA:** `47611886` (Codex).
- **Testes:** 2 novos; os dois mutantes morrem (os FDs vão de 33 para 43, 53 e 63).
- **Revisão independente (D9, `4aa4d764`):** APPROVE, sem achados; o único arquivo fora de `docs/` é o teste.

### 6. Reconciliação de CI

- **Catálogo de skips (SPEC 0138):** `scripts/skip-catalog.json` guarda o hash e a contagem de cada teste PG que pula sem banco. Religado em `b401779a` (onda 2) e em `f38bfafc` (SKIP-PG-004 e SKIP-PG-023), e nos commits da 0271 (SKIP-PG-019, 16 para 17, e SKIP-PG-043, novo, 9). `skip:governance` dá PASS.
- **Manifesto de mutação:** `scripts/mutation-manifest.json` liga cada mutação ao hash da fonte; `ssrf.ts` (0263) e `engine.ts` (0279) mudaram e foram religados em `0aa35a4c`. `tests/mutation-guard.test.js` dá 3/3.
- **Recibos copiados byte a byte:** 8, 9 e 10 (`human-decisions-8`, `-9`, `-10`).
- **Livros:** bloco da terceira onda em `99_runtime_state`, `20_master_execution_log` e `30_backlog_master`.

## Gates locais

Typecheck 0, `docs:check-links` (DOC_LINKS_OK e EVIDENCE_HYGIENE_OK), `prettier`, `skip:governance` PASS, `mutation-guard` 3/3 e `gitleaks` 8.28.0 sem achados. A suíte completa com PostgreSQL ainda não rodou (janela de disco pedida pelo cvg-claw); o resultado e a triagem entram aqui antes de abrir o PR.

## Fica para depois

- **0262 (U04/F16, revogação de sessão):** em BUILD pela sessão 07. A fatia 1 e a 2a foram revisadas (APPROVE); a fatia 2 (2b runtime approval e 2c journey task) também (APPROVE, `829bdc10`), com um P2 de integração com esta onda (testes F08b e rebind do catálogo) e 2 P3 que a sessão 07 vai tratar antes de entrar.
- **Acompanhamentos:** F08c (opcional); a corrida remoção-entre-`open`-e-`fstat` das SPECs 0278 e 0281 (defesa no isolamento F02/X01); F05 global, K08 e X01.
- **Com o Codex:** F13, F18 (fase 1, SPEC 0280) e F19.
- **Com o Ricardo e o hospital:** servidor (U10), IdP (U09) e piloto (U23).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
