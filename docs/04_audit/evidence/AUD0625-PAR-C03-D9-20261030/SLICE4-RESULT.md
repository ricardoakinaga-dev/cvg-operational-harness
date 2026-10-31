# PAR-C03 BUILD — fatia 4 (SPEC 0293 R2): poda do prefixo da compactação da C01

Task `AUD0625-PAR-C03-D9-20261030`, branch `claude/aud0625-par-c03-build-d9`, sobre `8925c645c`. Recibo `human-decisions-25` (por nome). Local, sintético, sem push. Produção `NO_GO`.
Com esta fatia os 9 `it.fails` da fase 1 / R2 são `it` e passam: **nenhum `it.fails` restante** no arquivo de prova do C03.

## O que entrou

- `createModelCompactionControl` ganhou a opção `spill` (a mesma composição do laço iterativo: depósito, política, `allowProcessLocal`, `classificationOf`). Com ela, as mensagens de papel `tool` do **prefixo** que vai ao resumidor e que passam do limiar
  viram o mesmo bloco de prévia de um resultado novo (cabeça, cauda, bytes, sha256, `armazenado`, locator) e o conteúdo exato é gravado. Sem a opção, o prefixo segue como era.
  Só mensagens `tool` acima do limiar (em bytes) são tocadas; `system` governado e pins nunca entram no prefixo; mensagens de outros papéis, ainda que enormes, passam intactas.
- `pruneToolMessages` (`harness/src/spill/prune.ts`) é função pura do conteúdo, da política e do escopo (tenant, sessão): operação do `put` = `compaction:<sha256 do conteúdo>` (idempotente), marcador **determinístico** (`deterministicBlockMarker`),
  **sem expiração no bloco** (`hideExpiry`). Assim o mesmo histórico dá o mesmo texto em toda passagem, mesmo depois de o objeto vencer e ser regravado, e o `sourceDigest` da C01 é calculado **sobre o texto enviado** ao resumidor, não sobre a saída crua (I13).
  Falha do depósito, depósito de um só processo fora de teste e limite de 64 localizadores por turno dão `armazenado=não`, de forma determinística; a compactação segue.
- Cancelamento: a poda recebe o sinal do turno (nenhuma escrita começa depois do aborto) e o controle confere o cancelamento depois dela, antes de pagar o resumo; nada é gravado nem enviado.
- A poda fica dentro do manipulador do controle, **sem mudar o registro dos ganchos**: a adaptação da onda 5 (`2166df7dd`, `coreHook('model/before-call')` e `coreHook('model/overflow')`) continua sendo a mesma troca de duas linhas.
  Teste de fusão feito com `git merge-tree` contra `claude/aud0625-wave5`: `model-compaction.ts` e `kernel/pipeline.ts` fundem sem conflito; os conflitos são só de ledgers, `package.json`, `skip-catalog.json`, o barrel e a lista de migrações da persistência (renumeração/ordem, resolução mecânica).

## Refinamento de I12 registrado

A SPEC pede marcador por bloco de CSPRNG. Para o **prefixo da compactação** isso quebraria a estabilidade (I13): o texto mudaria a cada passagem e o digest com ele. O marcador ali é derivado do hash do próprio conteúdo e do escopo; um conteúdo não consegue trazê-lo de antemão
(precisaria conter o hash de si mesmo) e, se por azar o contiver, o contador avança. Resultados novos na chegada continuam com marcador aleatório e a forma decidida uma vez.

## Gates

- harness+contracts+orchestrator: sem `it.fails`; cobertura por arquivo 100% em `harness/src/spill/*`, `model-compaction.ts`, `compaction.ts`, `context-engine.ts`, `iterative-dispatch.ts`, `kernel/pipeline.ts`. `packages` + `apps`: 4298 testes verdes (PostgreSQL pulado: 29 do C03, catálogo inalterado nesta fatia).
- Mutantes `mutations-slice4.json`: 15/15 mortos (poda desligada, digest sobre o cru, papéis, limiar e bytes, marcador aleatório, validade no bloco, chave de operação instável, contagem por turno, bandeira de processo único, cancelamento, sinal, escopo do marcador, classificação, execução).
- typecheck, eslint, prettier, `docs:check-links`, `skip:governance`.

## Estado do cartão

Fatias 1–4 do BUILD feitas e revisadas pelo DF até a 2 (a 3 e a 4 vão à Codex). Pendências já registradas fora do cartão: orçamento de 4 000 tokens do motor de contexto (0224), linhas sem moldura do prompt do `HybridOrchestrator`, e a ligação do varredor à composição real do worker.
