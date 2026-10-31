# PAR-C03 BUILD — fatia 2 (SPEC 0293 R2): armazenamento durável em PostgreSQL (migração 0037)

Task `AUD0625-PAR-C03-D9-20261030`, branch `claude/aud0625-par-c03-build-d9`, sobre `0d28c8521` (fatia 1). Recibo `human-decisions-25` (por nome). Local, sintético, sem push.
Produção `NO_GO`. Com esta fatia existe um armazenamento durável entre processos; o `spill.read`, a cota e o `purge` por pedido são da fatia 3.

## Decisão técnica registrada (DF, sem T3 novo): localizador por HMAC

`locator = "spill_" + base64url( HMAC-SHA256(chave do servidor, tenant ‖ sessão ‖ operationKey ‖ sha256 do conteúdo) )` — 256 bits (43 caracteres), sem tenant, sessão ou conteúdo visíveis.
O banco guarda **só o `sha256(locator)`**. Como o localizador é derivável, o `put` repetido reencontra a mesma linha (I6) sem guardar o texto do localizador. A chave vem da composição do
anfitrião por uma **porta de segredo** (`locatorKey`), nunca do banco nem do ambiente de um processo filho; sem chave, ou com menos de 32 bytes, o `put` lança `SpillKeyUnavailable`
(não repetível) e a política mostra `armazenado=não` (I14, fail-closed). Limites registrados: trocar a chave muda o localizador de uma mesma saída (uma segunda cópia até a primeira vencer;
sem rotação com dupla chave nesta fatia); o fixture em memória continua guardando o localizador em claro por ser só de teste.

## O que entrou

- **Migração `0037_tool_output_spill.sql`** (opt-in em esquema dedicado, como a 0028; comentário em `postgres-migrations.ts`): tabela `spill_objects` com chave `(tenant, sessão, locator_hash)`, `byte_length` com
  CHECK contra `octet_length(content)` (limite físico de 16 MiB), validade `expires_at > created_at`, **RLS por tenant com FORCE** (mesmo molde de `session_events`), gatilho que **recusa todo UPDATE**
  (conteúdo e validade são imutáveis; a validade não se estende) e `TRUNCATE`; só `DELETE` retira uma linha (varredura ou apagamento).
- **`packages/persistence/src/spill-store-postgres.ts`** (exportado pelo barrel): `runSpillMigrations`, `PostgresSpillStore` (`durability: 'shared'`), `put` idempotente e atômico, `read` por intervalo de bytes
  (limitado por `readMaxBytes`), `purgeExpired(limit)` por validade. Um `put` sobre uma cópia vencida e ainda não varrida a substitui (mesmo localizador, validade nova); um `put` sobre uma viva nunca
  renova. Tenant vinculado na construção; tenant ou sessão errados, localizador malformado ou ausente = `SpillNotFound` (I4); `COMMIT` perdido = `SpillCommitUnknown`; banco fora = `SpillStorageUnavailable`
  (repetível); cancelamento antes da escrita = `SpillCancelled`, nada gravado (I7).
- **Erros novos** no harness: `SpillKeyUnavailable`, `SpillCancelled`.
- **Teste de PostgreSQL** `aud0625-par-c03-spill-postgres.test.ts` (17 testes, `SKIP-PG-C03-001` no catálogo, na lista de `test:postgres`): ida e volta de bytes UTF-8, o localizador nunca aparece na tabela, idempotência entre
  armazenamentos e pools, 10 gravações concorrentes = uma linha, sem chave nada é gravado, isolamento por tenant e sessão, RLS contra consulta direta, imutabilidade (nem o dono estende a validade; o papel de
  execução nem tem `UPDATE`), intervalos de leitura, limite de tamanho, validade e varredura (só o próprio tenant, só vencidos, dentro do limite), cancelamento, falhas do banco e `COMMIT` perdido, composição com o renderizador.

## Gates

- PostgreSQL 16.15 descartável (contêiner próprio): 17/17. Sem `TEST_DATABASE_URL`: 17 pulados = `expectedSkippedTests`.
- Mutantes `mutations-slice2.json`: 23/23 mortos (HMAC sem cada componente, localizador em claro, chave curta ou ausente, limites de validade, varredura, renovação, `DO UPDATE`, intervalo, teto de leitura, tenant, cancelamento,
  `COMMIT` perdido, limite de tamanho; e na migração: gatilho, RLS, CHECKs, `TRUNCATE`). B23 sobreviveu na 1ª rodada e morreu com o teste do CHECK de validade.
- Equivalentes sob RLS, declarados e não testados como mutantes: o filtro de tenant da varredura e a checagem de tenant na leitura (a política de linha já impede o efeito), e o regex do localizador (o hash não acharia a linha).
- harness+contracts: 725 testes; `contracts/src/spill.ts` e `harness/src/spill/*` em 100% por arquivo. `packages` + `apps`: 4244 verdes; um teste do SDK (`stdio`, timeout de 2 s) falhou uma vez sob carga e passa isolado (71/71).
- typecheck, eslint, prettier, `docs:check-links`, `skip:governance` verdes.

## Para as fatias seguintes

Fatia 3: `spill.read` (resultado fora do spill e da poda), cota (256 objetos por sessão, 256 MiB por tenant → `SpillQuotaExceeded` → `armazenado=não`), `purge(tenant, sessão)` a pedido e o trabalho de varredura no worker
(hoje só o método). Observação ligada à 0224 (pedida pelo DF): o orçamento de 4 000 tokens do `DefaultContextEngine` descarta itens de baixa prioridade inteiros; deve virar cartão de acompanhamento junto à 0224, sem mudança agora.
