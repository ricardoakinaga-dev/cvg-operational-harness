# PAR-K03 f4 — preflight do worker e cutover de credencial (SPEC 0225)

- `apps/worker/src/postgres-role-preflight.ts`: portado do WIP (o patch aplicou limpo) com as adaptações da cadeia atual:
  migration `0033_complete_tool_result_journal`, `search_path=pg_catalog, pg_temp`, helpers `functionBody` /
  `migrationFunctionBody` (que no WIP vinham da 0217). O worker **sem opt-in** recusa readiness (antes do primeiro
  claim/modelo/corpo) se o journal estiver ativado ou em forma desconhecida; corpo inativo = o da 0033. Também fecha o
  `client.release` sem engolir a falha original.
- `apps/worker/src/__tests__/journal-result-preclaim-readiness.test.ts` (45 testes, UNIT instrumentado, não é prova nativa):
  do WIP, ajustado ao inventário atual de políticas (`TENANT_SCHEMA_INVENTORY`), 0033 e pg_temp.
- J06/J07 nativos de PG, no `complete-effect-result-journal-postgres.test.ts` (agora 55 casos incl. o de fronteira):
  credencial antiga sem grant = 42501; login herdado que ainda lê a tabela reprova a ativação; principal não qualificado
  (superuser) não serve a v1; outro papel não insere v1 e o principal ativo não insere v0 (GUC forjado não ativa); o dono
  não reescreve nem apaga linha v1 confirmada (23514 / 42501).
- `complete-effect-result-activation-boundary.test.ts` (novo, não-PG): `renderJournalResultActivation` só devolve texto
  (sem conexão, congelado, rejeita identificadores fora da gramática) e nenhum código de runtime a usa além do guard e da
  readiness, que só compara o corpo (`.body`), nunca executa `.sql`. A ativação da v1 é passo de operador.
- J13 (composição bound com triggers/fence 0029 e ordem de lock) continua **diferido** para 0217/K01; nada é ligado na
  composição publicada.
- Verificação: vitest PG 50/50 (preflight, worker, homolog, migration), journal PG + fronteira 55/55, unit 45/45;
  typecheck, eslint, prettier, `skip:governance` (SKIP-PG-045 religado: 44 pulados sem PG).
