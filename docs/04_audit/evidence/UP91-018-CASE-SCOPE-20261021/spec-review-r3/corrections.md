# Correções da r4 sobre a revisão r3 da SPEC0251

Obrigatórios:

- **R3-M1 (sessão semeada sem root).** §6, ajuste (a): quando a conversa ou a sessão foi semeada direto no banco, o teste cria o root antes do grant (`app.caseAuthority.backfillCoreRoots` ou `ensureCoreConversationRootInTransaction` na semente). Exemplo citado: `seedSession` de `task-approval-postgres.test.ts`.
- **R3-M2 (linha impossível).** S3: a linha de Supervisor no tenant B fica só nas rotas de approval (decisão e criação); nas de task o Supervisor recebe 403 antes. O mutante "`taskCase`/`approvalRequestCase` sem filtro de tenant" passa a morrer num teste direto do snapshot, em memória e PostgreSQL.

Opcionais aceitos: R3-O1 (`requireAuthenticatedMutations: true` na S5), R3-O2 (legado com migrações até 0028 na S6), R3-O3 (S4 com `WAITING_APPROVAL` e 202), R3-O4 (`no-store` da jornada no conjunto de escrita do legado), R3-O5 (SQL novo em `case-authority-postgres.ts`, `postgres.ts` não muda), R3-O6 (efeito no `rem21-014` registrado nos gates), R3-O7 (`critical-flows` citado no ajuste (a)) e R3-O8 (first red da S7).
