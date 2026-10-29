# PAR-K03 f3 — adapter opt-in `resultStorage:{version:1}` (SPEC 0225)

- `operational-execution-postgres.ts`: porte **à mão** do patch do WIP `7e4ed139f` (o `git apply` não aplica; o arquivo
  atual não tem o fence da 0217). Sem fence/`guardWrite` (J13 diferido para 0217/K01).
  - construtor: `options.resultStorage` só aceita `{version:1}` exato (sem getter/chaves extras), senão `JOURNAL_STORAGE_MODE`;
    ausente = modo 0 (legado, comportamento anterior byte a byte);
  - `run()` verifica a prontidão **na conexão real do tenant**, sem cache (`verifyJournalResultStorage`);
  - reserve v1 grava `result_storage_version=1`; confirm grava só o envelope (coluna `result` fica NULL), atômico com o
    UPDATE de estado; confirm igual é idempotente, diferente = `JOURNAL_RESULT_CONFLICT`; linha v0 é recusada no modo 1
    (`JOURNAL_STORAGE_MODE`, ou `LEGACY_RESULT_UNKNOWN` para CONFIRMED sem resultado); leitura limitada a 1 398 616 bytes
    por CASE antes do driver; `mapEffect` valida versão/estado/payload e decodifica uma vez.
- `operational-effect-result-guard.ts` e `-readiness.ts` vêm para **esta** fatia (o adapter importa a prontidão; antes
  estavam previstos na f4). Adaptações à cadeia atual: migration `0033_complete_tool_result_journal`, `search_path =
  pg_catalog, pg_temp` no guard e na verificação, e a lista de migrações exigidas sem a `0029_controlled_published_kernel`
  (fence da 0217, que não existe na cadeia).
- Teste novo `complete-effect-result-journal-postgres.test.ts` (47 casos, SKIP-PG-045): J01/J02 (15 valores, instância
  nova), J03 (1 MiB exato e +1 sem rebaixar), J04 (8 adulterações + controle íntegro), J05 do lado do adapter, J08/J12
  (idempotente, conflito, tentativa fenciada, CONFIRMED não rebaixa, rollback), modo×prontidão (legado recusado em schema
  ativado e v1 recusado em schema não ativado).
- Ficam para a **f4**: preflight do worker (`postgres-role-preflight`), cutover de credencial (J06/J07) e roteamento no
  deploy. Modo desligado por padrão; nada é ligado na composição publicada (J13 pendente).
- Evidência: `test:postgres` completo 416 passam; 3 estouros de 60/90 s sob I/O alto (approval-decision-atomicity,
  trusted-replay-distributed, capability-postgres) passam isolados (31/31). Typecheck, eslint, prettier, `skip:governance`.
  Armadilha registrada: o teste revoga CREATE/TEMPORARY de PUBLIC no banco e devolve só TEMPORARY (devolver CREATE quebra o
  limite de papel das suítes seguintes).
