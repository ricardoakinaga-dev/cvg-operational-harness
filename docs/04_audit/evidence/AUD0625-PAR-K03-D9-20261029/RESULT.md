# PAR-K03 fase 1 — RESULT (SPEC 0225, tarefa AUD0625-PAR-K03-D9-20261029)

Estado: **PARTIAL**. Fase 1 (f0–f5) entregue localmente em `claude/aud0625-par-k03-d9`, sem push; produção `NO_GO`.
J09–J11 (integração do BUILD 0224 completo) = cartão **PAR-K03b**, ainda sem decisão humana; **J13** (composição
bound com fence/triggers 0029 da 0217) **diferido** para 0217/K01; J14 e o drill J15 completo fora desta fase.
A v1 vem **desligada**: nada a ativa na composição publicada, e a ativação num banco é passo de operador.

## Fatias (SHA)

| Fatia | SHA | Conteúdo | Revisão DF |
|---|---|---|---|
| inventário | `aac9f439e` | reconciliação WIP `7e4ed139f` × cadeia atual, plano em fatias | — |
| f2 | `a8f2e2659` | migration 0033 (expansão aditiva fechada), rem21-010, tenant-preflight | APPROVE (+ conferência Codex) |
| f0 | `e1e856ecd` | `complete-json.ts` + teste byte a byte de `2f0cc11f7` (recibo 17) | APPROVE |
| f1 | `e516477e1` | codec do journal (envelope base64 limitado), 165 testes | APPROVE |
| f3 | `946f0def6` | adapter opt-in `resultStorage:{version:1}` + guard + readiness + J01–J05/J08/J12 PG | APPROVE |
| f4 | `d2672b146` | preflight do worker, cutover de credencial J06/J07, fronteira de ativação | APPROVE |
| f4 P2 | `52a9fa40d` | `to_regclass` qualificado por `current_schema()` (TEMP homônima) | APPROVE |
| f5 | este commit | mutações, testes de limites e de readiness, campanha PG, ledgers, este RESULT | — |

## Cobertura dos testes J (SPEC 0225)

J01–J04 nativos pelo adapter (`complete-effect-result-journal-postgres.test.ts`) e componente do codec; J05 (migração e
adapter); J06/J07 (credencial antiga, login herdado, principal não qualificado, papéis cruzados, GUC forjado, dono não
reescreve v1, TEMP homônima); J08/J12 (confirm atômico, idempotente, conflito, sem rebaixar CONFIRMED, rollback).
Não feitos nesta fase: J09–J11 (K03b), J13 (0217/K01), J14, J15 completo, J16 além das regressões abaixo.

## Mutações

- f2: 15/15 mortos (`mutation-results-f2.json`).
- f5: 33 mutantes (`mutations-f5-codec/-adapter.json`): 22 mortos de saída; 9 sobreviveram e 4 foram mortos com testes
  novos (C2 teto +1 e C4 fórmula do tamanho: `complete-effect-result-codec-bounds.test.ts`, que prova recusa antes de
  alocar buffer; R5 login que alcança a tabela e R9 corpo ativado para outro principal: testes PG de readiness) →
  `mutation-results-f5-retest.json` 4/4. Equivalentes/redundantes documentados:
  C1 (piso `decodedBytes<1`: o resultado vazio é recusado depois pelo JSON/escaneamento, mesma recusa),
  C3 (comprimento do sha: a regex `^[0-9a-f]{64}$` já o impõe), R7 (guard inativo em modo 1: o corpo comparado em R9 o
  recusa), R10 (contagem de constraints: a checagem `Set.size` já reprova), R6 (ver limite abaixo).
- f4 P2: T3 (as duas queries de catálogo sem schema) morto; T1/T2 isolados redundantes entre si.

## Campanha PostgreSQL e gates

- `test:postgres` completo (PG 16.15 próprio): 420 passam, 10 pulam, 1 arquivo (`journeys-api-postgres`) estourou o
  hook de 10 s sob I/O e passa isolado (10/10). Rodadas anteriores tiveram 3 estouros de 60/90 s que também passam
  isolados. Ambiente, não regressão.
- Preflight e worker PG focados 50/50; unit da readiness 45/45; fronteira de ativação 3/3; codec 165 + limites 5.
- typecheck, eslint, prettier, `skip:governance` (SKIP-PG-044/045 novos; SKIP-PG-004/019 religados), `mutation:guard`,
  `docs:check-links`, REM21 proof 0031→0033 (f2).
- Armadilha: o teste do adapter revoga CREATE/TEMPORARY de PUBLIC no banco e devolve só TEMPORARY no fim.

## Limites registrados

1. **`other_client_sessions` é cego para o principal servidor.** `pg_stat_activity` mascara `datname`/`backend_type` das
   sessões de outros usuários para quem não tem `pg_read_all_stats`, e o principal tem de ter zero memberships. A garantia
   contra credencial antiga fica nas checagens de ACL (`other_table_acl`, `other_login_access`, com teste); a **verificação
   de sessões vivas é passo do operador na ativação**, junto do runbook. Teste de caracterização incluído.
2. As queries SQL legadas do adapter resolvem `operational_effect_journal` pelo `search_path`; a readiness recusa uma
   relação que não esteja em `current_schema()` (inclui TEMP), mas o REVOKE TEMP de PUBLIC é o complemento esperado.
3. Teto de armazenamento 1 MiB (valor do WIP; a SPEC fala em 8 MiB); abaixo do teto de contexto da 0224 (32 768 bytes) só
   depois do K03b, que decide o contexto. O 1 MiB é do journal, não do contexto do modelo.
4. J13 continua diferido; a lista de migrações exigidas pela readiness não inclui a `0029_controlled_published_kernel`.

## Superfície pública nova e recibos que a cobrem

| Superfície | Onde | Recibo |
|---|---|---|
| `canonicalizeCompleteJson`, `CompleteJsonError`, tipos `CompleteJsonValue`/`CompleteJsonLimits`/`CompleteJsonErrorCode` | `@cvg/harness-contracts` | human-decisions-17 (`3c79a02d…`), sobre o BUILD isolado da 0224 (`017124bc…`) |
| opção `resultStorage:{version:1}` do construtor de `PostgresOperationalEffectJournal` | `@cvg/persistence` (classe já exportada) | spec-gates de 16/10 (`282c8e6b…`) + nota 0225b |
| `renderJournalResultActivation`, readiness, guard, codec | **internos**: não entram no barrel de `@cvg/persistence` (testado: só guard e readiness os referenciam) | spec-gates de 16/10 |

`complete-tool-context.ts` contém só os 3 tipos necessários (K03b o substitui pelo completo).

## Para o PR da fase 1

Entra antes da migration 0034 (S01). Depende de: f2 (migration, já no inventário), contracts (f0). Não altera lockfile.
