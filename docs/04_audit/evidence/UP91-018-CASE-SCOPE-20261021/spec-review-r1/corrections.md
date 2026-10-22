# Correções da r2 sobre a revisão r1 da SPEC0251

Obrigatórios:

- **M1 (alvo de execução).** §2 e §4.2: o alvo `execution` segue o algoritmo de `readExecutionForCaller`. No escopo `assigned`, vínculo + grant; existência pelo store de execução para todas as roles; no escopo `tenant`, não consulta `executionCase`. S4 ganha execução inexistente; S6 cobre Supervisor no esquema legado; mutante "consultar `executionCase` no escopo `tenant`".
- **M2 (testes e conjunto de escrita).** §6: os ajustes de teste passam a ser definidos por regra (três situações e três ajustes permitidos, sem afrouxar asserção). O conjunto de escrita inclui `apps/worker/**/__tests__`. O inventário inicial soma os arquivos apontados na r1, e o BUILD registra a lista final. As sondas trusted trocam para uma rota protegida sem escopo de caso (`GET /v1/observability/audit-evidence` para Supervisor).
- **M3 (500 na jornada).** I7 e §4.3: o servidor injeta o helper e o mapeador em `registerSecretaryJourneyRoutes`, e o `catch` da rota usa esse mapeador. A §6 permite essas linhas no legado. A S7 cita a rota.

Opcionais aceitos: 1 (§1, runtime approval e `assumed`/`rejected`, perda do freio de rejeição), 2 (§2, precisão de simulação/trusted e de âncoras), 3 (I3), 4 (ordem nas duas rotas), 5 (`not found` inalcançável depois do helper), 6 (`listPage` sai da composição), 7 (mensagem no painel de tarefas), 8 (provas adicionais), 9 (timing aceito, I3), 10 (uma instrução), 11 (I4 e janela), 12 (imutabilidade pelo código, root monotônico), 13 (padrão de mapeamento), 14 (adendo à SPEC0107 e versionamento) e 15 (tenant por `conversations.tenant_id`).
