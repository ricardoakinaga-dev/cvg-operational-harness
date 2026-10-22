# Correções da r3 sobre a revisão r2 da SPEC0251

Obrigatórios:

- **R2-M1 (ajustes de teste).** §6: (a) passa a registrar o vínculo da execução pelo port (`registerExecutionLink`) antes do `grantCase` quando a execução foi criada direto no store, e diz como o teste de `apps/worker` obtém a fixture; novo ajuste (d) para o esquema legado sem 0029 (Operator/Approver esperam 503; o efeito persistido passa ao Supervisor quando a role permite ou a uma asserção equivalente no esquema com 0029).
- **R2-M2 (cadeia de erro).** I7: o ramo `CaseAuthorityError → toSafeCaseError` entra à frente do mapeamento existente de cada rota, sem substituí-lo; na runtime approval a cadeia `ApprovalError`/`OperationalExecutionError` continua. S7 ganha guarda de regressão (403 de self-approval, 409, 400 de transição) e um mutante.

Opcionais aceitos: O1 (roles por rota na S5/S6), O2 (`requireAuthenticatedMutations: true` na S3), O3 (`no-store` em todas as respostas das oito rotas), O4 (dependências da jornada obrigatórias), O5 (corpo não-objeto → 400), O6 (Supervisor no tenant B → 404, mutante sem filtro de tenant), O7 (S7 sem 413/415), O8 (seção nova da runtime approval na SPEC0107), O9 (ajuste (c) cobre sondas que esperam 503), O10 (`journeys-api-postgres` no inventário, fixture do worker), O11 (por que `list`/`findById` ficam), O12 (origem do 404 e reuso de `readExecutionForCaller`), O13 (risco da execução independente) e O14 (limite de taxa não é efeito).
