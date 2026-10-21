# AUD0621-AUTH-BUILD-0176-20261020 — texto proposto para os ledgers

Fonte: candidata `/mnt/dados/cvg-work/cvg-aud0621-auth0176-20261020`, commit
`a9861469d6e214f342597c24a9754483e50acbef` sobre a base
`6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9`. Evidência nesta pasta. Esta frente
não editou ledgers nem `docs/02_spec/`; o lead promove.

## docs/99_runtime_state.md

- `last_completed_action`: AUD0621-AUTH-BUILD-0176 — BUILD local da SPEC0176
  (sha `869a03de4f5451dc7988c9d11dcc265cbf3db35ba1b16bca731f7afc5f349723`,
  aprovado pelo usuário em 20/10/2026) no commit de candidata `a9861469`:
  migração 0029 (cinco tabelas `case_*`, RLS forçado, triggers de linhagem,
  imutabilidade e CAS com `search_path` fixo), autoridade de caso em memória e
  PostgreSQL (unidade de leitura READ ONLY REPEATABLE READ), readers por
  atribuição, registro `/v1/cases*`, endpoint de auditoria harness e DTO de
  execução v2/ack nas quatro mutações. F01 corrigido na candidata.
- `next_action`: integrar `a9861469`; aplicar
  `proposed-out-of-scope-tests.patch` (quatro testes de `apps/worker` e
  `tests/e2e/critical-flows.test.ts` que codificam leitura sem atribuição);
  incluir o teste PG novo em `test:postgres`; decidir o produtor verificado de
  `case_principals` (SPEC0152/UP91-025) antes de uma composição trusted servir
  leitura de caso.
- `status`: READY_FOR_NEXT_STEP (integração do lead).

## docs/20_master_execution_log.md

`2026-10-20 — AUD0621-AUTH-BUILD-0176 (Claude Code, frente da task-mãe
AUD0621-REMEDIATION-20261020).` Inputs re-congelados: o sha da SPEC confere, e
os deltas entre o CURRENT da SPEC e o código estão em `refreeze.json`.

Nenhum delta exigiu decisão nova de produto. Os achados da recon:

- produtor de raiz harness inexistente;
- OIDC não ligado à composição;
- produtor de `COMPLETED` com saída bruta de ferramenta;
- invisibilidade cross-tenant sob RLS.

First red: `case-read-authorization-f01.test.ts` falha na base, com 200 e o
marcador privado na lista, na timeline e na auditoria, em simulação e em sessão
trusted. O mesmo arquivo final falha contra as fontes da base e passa em
`a9861469`.

Gates:

- prettier, lint e typecheck verdes;
- suíte sem PG: 3073/3077, com quatro falhas fora do escopo cobertas pelo
  patch proposto;
- PG: 295/299 + 11 por timeout de hook sob carga (`runtime-approval-store`,
  11/11 em duas reexecuções isoladas);
- testes focais 63/63;
- 9/9 mutantes mortos;
- gitleaks 0.

Crítico fresh R1 pediu mudanças (sem blocker). Um reparo agrupado foi feito, e
R2 aprovou com nits registrados. Commit só na candidata, sem push.

## docs/30_backlog_master.md e backlog dono

- 0621 F01 → `FIXED_IN_CANDIDATE` (`a9861469`), pendente de integração.
- [UP91-018](../../../03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-018),
  delta AUTH-01. Aceites provados em memória e PostgreSQL:
  - AUTH01–AUTH03;
  - AUTH04, sem o cenário de crash/reconciliação além do CAS replay;
  - AUTH05, AUTH06 e AUTH07;
  - AUTH08 e AUTH09;
  - AUTH10 e AUTH11;
  - AUTH12 parcial: migração aditiva, sem grant histórico e backfill
    idempotente com checkpoint;
  - AUTH13 parcial: outage 503, deadlines e logs sem conteúdo.

  Abertos:

  - AUTH12: flag e drenagem de build misto; executor operacional do backfill;
  - AUTH13: EXPLAIN e contagem de queries; métricas allow/deny por
    operação e role;
  - AUTH14: UI de grant/revoke, E2E de browser e PUT no CORS.
- [UP91-025](../../../03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-025):
  dependência explícita. O produtor verificado de `case_principals`
  (`PrincipalProvisioningPort.applyVerifiedPrincipalState`) precisa ser ligado
  ao login OIDC/MFA. Sem ele, a composição trusted responde 503 em todos os
  readers de caso e no registro, inclusive para Supervisor/Admin.
- Pendências para os donos, registradas e não implementadas aqui:
  - vincular à sessão os eventos de auditoria das rotas de tasks e approvals
    (`server.ts`, outras frentes) e dos produtores harness e agent-runtime. Até
    lá, aparecem só no leitor full `/v1/observability/audit-evidence`;
  - atualidade do principal nos leitores `audit:view_full` (exceção de escopo
    S3);
  - preflight do worker (exigir 0029 e privilégios `case_*`);
  - produtor de raiz `harness_conversation` em `packages/conversation`;
  - `presentationResponse` na origem do harness, para liberar a resposta em
    COMPLETED com ferramenta, NEEDS_USER_INPUT e APPROVAL_REQUIRED (N10);
  - GET `/v1/tasks` e `/v1/approvals` seguem tenant-wide para
    Operator/Approver (fora da lista de readers da SPEC);
  - nits do R2 (`critic-r2.md`).
