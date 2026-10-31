# PAR-C03 BUILD — fatia 3 (SPEC 0293 R2): `spill.read`, cota, apagamento a pedido e varredura

Task `AUD0625-PAR-C03-D9-20261030`, branch `claude/aud0625-par-c03-build-d9`, sobre `9be2d8bdb`. Recibo `human-decisions-25` (por nome). Local, sintético, sem push. Produção `NO_GO`.

## O que entrou

- **`spill.read`** (`harness/src/spill/read-tool.ts`, `createSpillReadTool`): capacidade da casa, somente leitura (`risk LOW`, `sideEffect READ`, sem aprovação), que passa por política, orçamento e contagem de chamadas como qualquer ferramenta.
  Entrada estrita (`locator`, `offset`, `length` ≤ `readMaxBytes`, chaves desconhecidas recusadas). Lê com o tenant e a **sessão do turno**: `ToolExecutionContext` ganhou `sessionId` opcional, preenchido pelo pipeline. Tenant ou sessão errados e localizador
  desconhecido respondem `NOT_FOUND`; validade vencida responde `EXPIRED`; falha do depósito responde só `spill.read is unavailable` (sem detalhe). `availableBytes` opcional encurta a leitura ao contexto que o anfitrião ainda pode dar e a recusa quando não há nenhum.
- **Resultado fora do spill (I11)**: o laço iterativo mostra o resultado de `spill.read` inteiro (até 32 KiB), emoldurado, sem novo `put` e sem prévia. A isenção vale **só** para a definição feita pela fábrica (`isSpillReadTool`, um `WeakSet` privado):
  uma ferramenta comum que apenas use o id `spill.read` é guardada e vira prévia como qualquer outra.
- **Validade visível ao modelo**: o bloco de prévia de um objeto guardado ganha `expiraEm=<ISO>`; o objeto vencido responde `EXPIRED` ao `spill.read`, e uma observação nova nunca mostra `armazenado=sim` para ele.
- **Cota (I5, D8)**: 256 objetos por sessão e 256 MiB por tenant, contando só objetos vivos; `SpillQuotaExceeded` (não repetível, uma tentativa) vira `armazenado=não`, nunca expulsa um objeto existente, e a repetição idempotente de um objeto já guardado segue respondendo.
  No PostgreSQL a escrita de um tenant é serializada por `pg_advisory_xact_lock` (conta, depois grava) e, sob 10 escritores concorrentes em dois pools, entram exatamente os 3 permitidos.
- **Apagamento a pedido**: `purgeSession({tenantId, sessionId})` nos dois depósitos (opcional no contrato `SpillStore`): remove todos os objetos de uma sessão de um tenant e mais nada.
- **Varredura por validade, todos os tenants**: `PostgresSpillSweeper` conectado como membro do papel `cvg_spill_sweeper` (a migração 0037 o cria `NOLOGIN` quando tem `CREATEROLE`; senão o operador cria e a varredura fica indisponível até lá). Duas políticas de linha (`SELECT` e `DELETE`)
  só deixam esse papel ver e apagar linhas **vencidas**; sem `INSERT`/`UPDATE`, linha viva fora de alcance, e quem não é membro (o papel de execução) apaga 0. O worker (`apps/worker/src/sweeps.ts`) ganhou a porta opcional `spill` no tique de varredura e a métrica
  `worker_sweep_spill_purged_total`; a ligação à composição real do worker (esquema, papel, intervalo) fica para a integração.
- Um `put` sobre uma cópia vencida e ainda não varrida a substitui (o depósito em memória agora faz o mesmo que o PostgreSQL), nunca a reaviva.

## Achados

1. **Um item do motor de contexto acima do orçamento some inteiro** (`DefaultContextEngine`, 4 000 tokens por padrão). Uma leitura de 32 KiB (~8 200 tokens) não cabe no padrão: o item sai de `contextItems` e o prompt do orquestrador híbrido cai no `summary` de 300 caracteres. Para `spill.read` ser útil o anfitrião
   precisa dar ao motor um orçamento compatível (o RED usa 20 000) ou limitar a leitura com `availableBytes`. É o mesmo cartão de acompanhamento ligado à 0224 já registrado no 0380; a SPEC não muda.
2. **A varredura entre tenants precisa de um papel dedicado**: uma política com uma variável de sessão deixaria qualquer papel com `DELETE` ler conteúdo vencido de outros tenants; testei e, sem política de `SELECT`, o `DELETE ... WHERE` apaga 0 linhas. A solução por papel é a que mantém RLS por tenant para o resto.
3. **Preexistente (DF), registrado no 0380**: no prompt do `HybridOrchestrator` as demais linhas `- [fonte/tipo] <summary>` seguem sem moldura; fora do escopo da C03.
4. O localizador do depósito em memória continua aleatório (não derivável), então um `put` repetido depois da validade gera outro localizador; no PostgreSQL ele é o mesmo (derivado). Diferença só de fixture.

## Gates

- harness+contracts+orchestrator: 783 testes (+2 `it.fails` esperados, ambos da fatia 4); cobertura por arquivo 100% em `contracts/src/{spill,observation-text}.ts`, `harness/src/spill/*`, `context-engine.ts`, `iterative-dispatch.ts`, `kernel/pipeline.ts`, `orchestrator/src/hybrid-orchestrator.ts`.
- PostgreSQL 16.15 descartável: 29/29; sem `TEST_DATABASE_URL`: 29 pulados = `expectedSkippedTests` (`SKIP-PG-C03-001`, `sourceSha256` reatado). `packages` + `apps`: 4281 verdes.
- Mutantes: unidade `mutations-slice3-unit.json` 19/19 mortos (E9 precisou ajustar o texto do mutante); PostgreSQL `mutations-slice3-pg.json` 7 mortos e 1 equivalente declarado (F8: o `DELETE` do varredor sem filtro de validade segue inofensivo porque a política de linha o limita).
  Equivalentes sob RLS já declarados na fatia 2 seguem valendo.
- typecheck, eslint, prettier, `docs:check-links`, `skip:governance`.

## Resta (fatia 4)

Poda do prefixo no controle de compactação da C01 (mensagens `tool` do prefixo enviadas ao resumidor como bloco + localizador; `sourceDigest` sobre o texto enviado; estabilidade com localizador expirado) e a sobreposição com o padrão `ModelCallView`/`coreHook` da onda 5 (`2166df7dd`). São os 2 `it.fails` que restam.
