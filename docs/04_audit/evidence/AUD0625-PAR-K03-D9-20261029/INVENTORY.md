# PAR-K03 — inventário do WIP `7e4ed139f` e plano do BUILD da SPEC 0225

Task `AUD0625-PAR-K03-D9-20261029` (Claude D9, Sonnet 5.5). Reatribuição do DF (o Codex informou que não é
titular do K03). Base: `claude/aud0625-wave3` @ `1597a2c25` (já tem `0030_api_creation_receipts` e
`0031_channel_effect_retry_not_before`). Só leitura e plano nesta etapa; nenhum código novo. Sem push.
Produção `NO_GO`.

## 1. Autoridade vigente

- SPEC 0225 sha256 `04b92ba4…`, `APPROVED_WITH_ADJUSTMENTS` em 16/10/2026
  ([spec-gates.json](../USER-DECISIONS-20261016/spec-gates.json)). Ajustes: corte exclusivo com parada,
  **teto de armazenamento menor que 8 MiB (alinhado ao contexto da 0224 com folga) ou medido**, primeiro BUILD
  **sem J14 e sem o drill completo do J15** (manter J01–J04, J05–J07 mínimos, J08–J12), reservar número de
  migration e claim, e registrar que a 0225 não resolve NUL em outros campos JSONB nem fecha a rota publicada
  (0226).
- Nota 0225b (`TECHNICAL_REVIEW_APPROVED`): a migration passa de `0030` para **`0033`**. O corpo da SPEC não
  muda.
- O WIP já aplica o ajuste do teto: o resultado lógico máximo é **1 MiB** (`JOURNAL_RESULT_MAX_BYTES =
  1048576`, `data` ≤ 1 398 104 caracteres, envelope ≤ 1 398 616 bytes), em vez dos 8 MiB do texto da SPEC.
  Pergunta ao DF/Ricardo no §6.

## 2. O que o WIP é

`7e4ed139f` (18/10/2026, "wip: implement opt-in journal storage and native component probes"), filho de
`2f0cc11f7` (linha PARE100, **não** ancestral da onda 3; ancestral comum com ela: `31dc1c389`). 11 arquivos,
+2930/−41.

| Arquivo | Linhas WIP | Estado na onda 3 | Situação |
| --- | --- | --- | --- |
| `persistence/src/operational-effect-result-codec.ts` | 236 | ausente | reaproveitável; depende de `@cvg/harness-contracts` `canonicalizeCompleteJson`/`CompleteJsonError` (**ausentes**, ver §3) |
| `persistence/src/operational-effect-result-guard.ts` | 99 | ausente | reaproveitável (binding do principal ativo); revisar `search_path` |
| `persistence/src/operational-effect-result-readiness.ts` | 318 | ausente | reaproveitável; conferir contra o `postgres-role-preflight` atual |
| `persistence/migrations/0030_complete_tool_result_journal.sql` | 71 | ausente | renumerar para 0033; **corrigir `search_path`** (ver §5) |
| `persistence/src/operational-execution-postgres.ts` | +225/−34 | existe, **689 add/783 del** desde a base do WIP | **portar à mão**: o arquivo foi reescrito na cadeia principal; o patch não aplica |
| `persistence/src/postgres-migrations.ts` | +2/−1 | existe, mudou | trivial (registrar a 0033) |
| `worker/src/postgres-role-preflight.ts` | +96/−6 | existe, 150/303 mudadas | **portar à mão** |
| testes: `complete-effect-result-codec.test.ts` (499), `…postgres.integration.ts` (476), `fixtures/journal-result-process.ts` (361), `worker/…/journal-result-preclaim-readiness.test.ts` (547) | 1883 | ausentes | reaproveitáveis após ajustar imports; mais de uma chamada usa assinaturas antigas (`Expected 1 arguments, but got 2`) |

Prova de compilação (cópia dos arquivos novos sobre a onda 3, `tsc` raiz): 11 erros, todos de três causas:
(a) `canonicalizeCompleteJson`/`CompleteJsonError` ausentes em `@cvg/harness-contracts`; (b) o teste de
integração importa `../../dist/operational-effect-result-*.js` (build); (c) chamadas com assinatura antiga
no teste/fixture. Nada na migration ou no guard falhou ao compilar.

## 3. Dependências que o WIP assume e que NÃO estão na onda 3

1. **SPEC 0224 (resultado completo no contexto), BUILD da linha PARE100 nunca integrado.** O codec usa o
   canonicalizador de `packages/contracts/src/complete-json.ts` (138 linhas, puro, mais seu teste). O restante
   do BUILD da 0224 (`complete-tool-context.ts` 205, `complete-checkpoint.ts` 748,
   `complete-decision-admission.ts` 410, `complete-tool-results.ts` 326, mais edições em
   `iterative-runtime.ts` 2557 linhas, `iterative-dispatch.ts`, `operational-step-postgres.ts` e
   `execution-v2.ts`) também está só em `2f0cc11f7`. A 0224 foi **aprovada pelo Ricardo** (sha
   `f3bc9a61…`, 16/10); o que falta é integrar o BUILD dela. Os testes **J09–J11** da 0225 (retomada fim a fim,
   SIGKILL entre journal e checkpoint, resultado acima do contexto) exigem esse BUILD.
2. **SPEC 0217 (composição publicada), `ControlledPublishedDatabaseFence` e as triggers da
   `0029_controlled_published_kernel`**, nunca integradas (candidatos fora de ref `a72422bee`/`14acc7861`).
   O WIP passa `options.fence` ao journal e o **J13** da 0225 exige essas triggers. Sem a 0217 o J13 não pode
   ser provado; o ajuste de 16/10 não o dispensou (só J14 e o drill J15).

## 4. K01 é pré-requisito?

O cartão PAR-K03 declara dependência de PAR-K01 (`IN_PROGRESS`, "um só pipeline para API, worker e execução
publicada", depende do PAR-G01). Em código: **não existe composição publicada na onda 3** (0217 não
integrada). Leitura:

- As camadas de armazenamento do journal (codec, migration, adaptador opt-in, guard, readiness, J01–J08,
  J12) **não dependem do K01**: vivem em `packages/persistence` e no preflight do worker.
- O J13 (fence da composição publicada) e a ligação do opt-in na composição publicada **dependem do K01/0217**.
  A SPEC já proíbe ligar o modo novo implicitamente no worker comum ou na composição publicada, então o BUILD
  pode entregar o recurso desligado por padrão e provado isoladamente, como a SPEC prevê.

## 5. Pontos de atenção técnica para o BUILD

- **`search_path`.** O guard do WIP usa `SET search_path = pg_catalog` e é `SECURITY INVOKER`. O P1 da 0034
  mostrou que função que lê tabela sem `pg_temp` por último pode ser sombreada. A 0033 fixará
  `pg_catalog, <schema>, pg_temp` com `pg_temp` por último em toda função que leia tabela, com teste que cria
  uma tabela/função sombra em `pg_temp` e prova que ela não é usada.
- **Barra REM21.** Se a 0033 entrar em `POSTGRES_MIGRATIONS`, o `scripts/rem21-010-postgres-proof.ts` move:
  a 0031 vai para `preRollForwardMigrations`, a 0033 vira `rollForwardMigration` e entra o
  `rollForwardRollbackSql` do que ela cria (colunas, constraints, função e trigger). A cadeia
  `operator-session/` é outra e não conta.
- **Migrations ocupadas:** 0029, 0030, 0031 (cadeia principal); 0032 retida (0217/K01); 0033 esta SPEC; 0034 a
  S01 (07).
- **Catálogos.** `operational-execution-postgres.ts` e os testes PG novos podem entrar no `skip-catalog`;
  rebind no mesmo commit. O mutation-manifest só muda se tocar uma das fontes listadas (nenhuma é desta frente
  hoje; reconferir a cada fatia).

## 6. Plano em fatias e perguntas ao DF

| Fatia | Conteúdo | Testes da 0225 | Depende de |
| --- | --- | --- | --- |
| 0 | `contracts/src/complete-json.ts` (+ teste) portado byte a byte de `2f0cc11f7`, exportado pelo contracts | — | **resposta do DF (P1)** |
| 1 | codec do journal (`operational-effect-result-codec.ts`) e seus testes | J01–J04 | fatia 0 |
| 2 | migration `0033` (expansão aditiva, guard que nega a versão 1 para todos, `search_path` com `pg_temp`), `POSTGRES_MIGRATIONS`, `rem21-010` | J05 | — |
| 3 | adaptador opt-in `resultStorage:{version:1}` em `operational-execution-postgres.ts` (portado à mão): reserva V1, confirm atômico, projeção limitada, recusa de V0 | J08, J12 | fatias 1–2 |
| 4 | guard com binding do principal, readiness e `postgres-role-preflight`; corte de credencial | J06, J07 | fatia 3 |
| 5 | mutações, regressão, campanha PG, ledgers | — | todas |
| (diferida) | J09–J11 fim a fim; J13 com fence | J09–J11, J13 | **BUILD da 0224** (P1) e **0217/K01** (P2) |

Perguntas:

1. **P1.** Posso portar `complete-json.ts` (a parte pura e autocontida do BUILD aprovado da 0224) na fatia 0?
   Ele é pré-requisito do codec em qualquer cenário. E o resto do BUILD da 0224 (checkpoint/admissão/
   tool-results, que toca `iterative-runtime.ts` e conflita com o F18) entra antes de J09–J11, depois delas,
   ou fica como pendência explícita do K03? Recomendo: fatia 0 agora; J09–J11 só depois de um plano de
   integração da 0224 aprovado por você.
2. **P2.** J13 (fence publicado) fica diferido até a 0217/K01, com o recurso entregue desligado por padrão?
3. **P3.** Confirmar o teto: manter **1 MiB** do WIP (atende o ajuste "menor que 8 MiB") em vez dos 8 MiB do
   texto da SPEC. Se preferir medir antes, é uma tarefa à parte.
