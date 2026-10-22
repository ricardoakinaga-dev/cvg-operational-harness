# Correções da revisão de código r1 — SPEC0251

Revisão: [review.md](review.md) (REVISE, 1 obrigatório, 6 opcionais, sem premissa nova), sobre o commit `acbec9f49`. Correções no commit `0fd6307e0`.

| ID | Decisão | O que mudou |
| -- | ------- | ----------- |
| M1 | Corrigido | A S2 PostgreSQL termina como a S1: revoga o grant de OperatorA no caso X e exige `pageInfo` com `total` 0, itens vazios e `no-store` em `/v1/tasks` e `/v1/approvals` (`case-scope-tasks-approvals-postgres.test.ts`). Mutante novo M13 (tirar `a.status = 'ACTIVE'` do predicado da lista PostgreSQL) morre na S2. |
| O1 | Corrigido | Hook `onSend` em `server.ts`, restrito às oito rotas da §4.3 por método + URL da rota, põe `cache-control: no-store` também nas respostas produzidas antes do handler (corpo inválido 400, 413, 415, recusa de origem 403). A S7 prova 400 de JSON inválido e 415 de media type. Mutante novo M12 (hook sem o cabeçalho) morre na S7. O 414 de alvo também recebe o cabeçalho quando o caminho casa uma das oito rotas; só o 404 do roteador (nenhuma rota casada) fica fora (correção de redação da r2, R2-O3). |
| O2 | Corrigido | O bloco de validação da S7 usa OperatorB/ApproverB sem vínculo em X: um 404 apareceria se o caso fosse consultado antes da validação; o teste exige 400. |
| O3 | Corrigido | `setTaskMessage(null)` junto de `setApprovalMessage(null)` nos dois pontos de troca de identidade/escopo de `App.tsx`. |
| O4 | Para o lead | A SPEC0251 e a evidência da task não estão versionadas nos commits locais (arquivos criados pelo lead antes do BUILD); versionar no mesmo PR antes de publicar. |
| O5 | Registro | S6 legado em 0000–0027: `0028_session_events` é opt-in de schema dedicado e recusa o schema de runtime; registrado em `first-red.json` e no relatório. |
| O6 | Registro | Variantes da regra (a) sem afrouxar asserção (leitura de auditoria limitada antes do grant; grant pela porta em `journey-routes-coverage`) estão descritas em `adjusted-tests.json`. |
