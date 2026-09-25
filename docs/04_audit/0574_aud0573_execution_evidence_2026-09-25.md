# 0574 — Execução do roadmap AUD-0573 — 2026-09-25

- Ciclo: AUD-0573. Fonte: [0573](0573_repository_audit_executed_gates_2026-09-24.md),
  [roadmap 0350](../03_build/0350_audit0573_roadmap.md) e
  [backlog 0351](../03_build/0351_audit0573_backlog.md).
- HEAD ao encerrar: `cc416b7`. Worktree limpa. Produção `NO_GO`.
- Ambiente: Node `22.23.2` (`.nvmrc`), PostgreSQL `16.15` descartável em
  `127.0.0.1:5434` (`cvg_test`), dados sintéticos, nenhum provider/canal/IdP.

## O que foi executado

| Item    | Onda | Estado              | Evidência                                                                                                                                                                                                                                                   |
| ------- | ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RA25-01 | D0   | `COMPLETED`         | 5 commits: `c791ee4` 154, `9102333` 62, `8b7cf88` 1057, `e671ed5` 113, `8922d16` 9 arquivos; varredura de segredos antes do stage                                                                                                                           |
| RA25-02 | D0   | `COMPLETED`         | 21 arquivos formatados; os 3 hash-congelados (0028, 0128, 0129) excluídos via `.prettierignore` com justificativa; `format:check` exit 0 e 3 hashes conferidos com `sha256sum -c`                                                                           |
| RA25-03 | D1   | `COMPLETED`         | `scripts/check-doc-links.mjs` com `maskSource`/`maskCodeSpans` e destino `[^)\n]+`; [SPEC-DOC-002](../02_spec/0130_doc_link_checker_extraction.md); `docs:check-links` exit 0, `broken 0`, `unallowlisted 0`                                                |
| RA25-05 | D2   | `BLOCKED_BY_C1M`    | inalterado; exige decisão humana hash-bound + I1/Final Critic                                                                                                                                                                                               |
| RA25-06 | D3   | `COMPLETED`         | [SPEC-OPS-001](../02_spec/0131_worker_startup_error_redaction.md); `redactSensitiveText` passou a redigir credencial em URL (`[redacted-credentials]`); boundary `apps/worker/src/startup-error.ts`; teste negativo + entrypoint spawnado; commit `e17c244` |
| RA25-07 | D3   | `NOT_EXECUTED`      | ver “Não executado”                                                                                                                                                                                                                                         |
| RA25-08 | D0   | `COMPLETED`         | `LICENSE` ISC; `npm run sbom` exit 0 (378 componentes); `licenses:check` exit 0 (0 denied)                                                                                                                                                                  |
| RA25-09 | D2   | `COMPLETED`         | 6 gates com `exit 0`; relatórios datados em `certification/logs/historical/2026-09-25-raid25/`; rodada 2026-09-22 arquivada antes de qualquer reescrita                                                                                                     |
| RA25-10 | D4   | `POLICY_REGISTERED` | [POL-EVIDENCE-001](../08_runtime/0801_evidence_retention_policy.md); aplicação pendente de aprovação humana da lista R2                                                                                                                                     |
| RA25-04 | D1   | `NOT_EXECUTED`      | ver “Não executado”                                                                                                                                                                                                                                         |

## Gates desta rodada

| Gate                                                                                 | Resultado                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `npm run verify`                                                                     | exit 0 — 323 arquivos / 2 287 testes                    |
| `npm test` (após RA25-06)                                                            | exit 0 — 324 arquivos / 2 293 testes                    |
| `npm run test:coverage`                                                              | exit 0 — St 92,6 / Br 87,71 / Fn 94,95 / Li 93,58       |
| `npm run typecheck`, `lint`, `format:check`                                          | exit 0                                                  |
| `npm run test:postgres`                                                              | exit 0 — 35 arquivos / 258 testes                       |
| `npm run test:chaos`                                                                 | exit 0 — 3 arquivos / 20 testes                         |
| `npm run test:restore`                                                               | exit 0 — digest, outbox e isolamento preservados        |
| `npm run test:load`                                                                  | exit 0 — 10 000 eventos, perda 0, duplicata 0, 680,19/s |
| `npm run test:evals`                                                                 | exit 0 — 2 arquivos / 11 testes                         |
| `npm run audit:security`                                                             | 0 vulnerabilidades                                      |
| `npm run docs:check-links`, `evidence:check-hygiene`, `diff:check`, `licenses:check` | exit 0                                                  |

## Não executado

- **RA25-07** (`NOT_EXECUTED`): a extração de fatias de `apps/api/src/server.ts`
  (5 857 linhas), `packages/persistence/src/postgres.ts` (3 354),
  `packages/agent-runtime/src/runtime.ts` (2 603) e
  `packages/harness/src/iterative-runtime.ts` (2 455) exige uma task e um gate
  de BUILD por fatia, com revisão de contratos públicos. O orçamento de
  execução do ciclo terminou antes de abrir a primeira fatia. Nenhuma linha
  desses arquivos foi tocada; não há drift de baseline atribuível a
  RA25-07. Fica como próxima task de BUILD, com SPEC própria.
- **RA25-04** (`NOT_EXECUTED`): a reconciliação com AUD53/C1M de
  [0344](../03_build/0344_reaudit_m07_backlog.md) e a troca dos ponteiros
  (`README.md`, `docs/README.md`, `docs/99_operational_index.md`) foram
  deliberadamente adiadas para o fim da fila pelo próprio roadmap e não
  couberam no orçamento. Os ponteiros continuam apontando para 2026-09-24;
  esta seção é a referência mais nova.

## Bloqueio de certificação (pré-existente)

`npm run certification:verify` e `npm run certify` continuam vermelhos por
motivo **anterior a esta rodada**:

- o registry de fechamento `docs/04_audit/evidence/AUD-20260921/REM21-019/finding-closure.json`
  fixa o candidato `8a889682…`, e o candidato atual é `012ff293…`;
- 20 arquivos do candidato têm mtime entre o último `certify`
  (2026-09-22T13:29:50Z) e o início desta rodada (2026-09-24T23:41Z), entre
  eles `docs/04_audit/0568_…_2026-09-23.md`, `0571_c1j_…_2026-09-24.md` e
  `docs/08_runtime/checkpoint_2026-09-24_ra24.md`;
- no commit `05d1f33` o manifesto casava 28/29 artefatos; o conteúdo pré-sessão
  commitado em `e671ed5` já trazia 3 divergências de 37.

`npm run certify` aborta em `findings_closure_invalid:candidate_id_mismatch`.
O re-bind exige reescrever evidência travada por `sha256sums.txt`, o que seria
forjar evidência de auditoria; a ação correta é uma nova rodada de auditoria
(AUD53/C1M), a mesma decisão humana hash-bound que bloqueia RA25-05.

## Limites declarados

- Revisão independente e humana das SPECs 0130 e 0131: `NOT_RUN`. Os BUILD
  correram sob instrução explícita do usuário; este registro não é aprovação.
- `certification:verify` / `certify`: vermelhos pelo motivo acima, não por
  regressão desta rodada.
- Nenhum dado real, provider, canal, IdP, deploy ou ação clínica/financeira.
  Produção permanece `NO_GO`.
