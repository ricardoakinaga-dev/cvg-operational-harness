# BUILD local da SPEC0251 — escopo por caso em tasks e approvals

Task `UP91-018-CASE-SCOPE-20261021`. SPEC0251 r4 (sha256 `ef409b12…0d50e`, inalterada), base `24cdb463`. Worktree detached, commits locais `acbec9f49` (BUILD), `0fd6307e0` (correções da revisão r1) e `1937337dd` (provas dos opcionais da r2). Sem push, PR, deploy, produção, dado real nem `certify`. Detalhes em [build.json](build.json).

## O que mudou

- **Persistência (§4.1).** O snapshot de caso ganha `taskCase`, `approvalRequestCase`, `listTasks` e `listApprovalRequests`, em memória e em PostgreSQL.
  - O tenant vem de `conversations.tenant_id`, com ramo legado sem 0029.
  - As listas usam uma instrução (COUNT + LATERAL). No escopo `assigned`, o `EXISTS` filtra antes de COUNT/offset/limit.
  - `postgres.ts` não muda; o DTO é o mesmo do `listPage` (paridade provada na S2).
- **API (§4.2/§4.3).** Novo `authorizeCaseMutation`, que reaproveita `readExecutionForCaller` no alvo de execução. Novo `mapCaseMutationError` (I7), com o ramo de caso à frente do mapeamento de cada rota.
  - As duas listas passam pelo snapshot.
  - PATCH, as duas criações de task, criação e decisão de approval e a decisão de runtime approval chamam o helper depois da validação e antes da escrita.
  - Um hook `onSend` restrito às oito rotas garante `no-store`.
  - `listPage` saiu de `RuntimePersistence`.
- **Jornada.** Valida `sessionId` (1–160) e recebe o helper e o mapeador pela injeção do servidor.
- **Web (§4.4).** Um 404 em decisão ou status recarrega a fila e mostra "Este item não está mais disponível para você." O painel de tarefas ganha a linha `role="status"`.
- **Contrato (§4.5).** Adendo na SPEC0107.

## Provas S1–S8

First red na base: 19 de 19 falham pelos motivos da SPEC, inclusive com os testes finais ([first-red.json](first-red.json)). Depois do BUILD, todas verdes.

| Prova | Teste | Resultado |
| --- | --- | --- |
| S1 | `case-scope-tasks-approvals.test.ts` (memória) | verde (era: OperatorA recebe 65) |
| S2 | `case-scope-tasks-approvals-postgres.test.ts` (role NOSUPERUSER NOBYPASSRLS) | verde; 7 instruções por requisição, constantes, uma de lista; EXPLAIN e paridade de DTO em [postgres/s2-postgres-lists.json](postgres/s2-postgres-lists.json); revogação → total 0 |
| S3 | memória, 6 testes, inclusive o snapshot direto | verde (era: 200 e efeito) |
| S4 | runtime approval, memória | verde (era: 202 aplicado) |
| S5 | PostgreSQL, seis mutações + snapshot com e sem RLS | verde (era: 200) |
| S6 | memória (revogação, desativação, trusted, outage) + PostgreSQL legado 0000 e 0000–0027 | verde (era: 200) |
| S7 | memória: no-store, 400 antes do caso, mapeamento anterior (400/409/403/409), outage | verde (era: 2xx sem no-store) |
| S8 | `case-scope-unavailable-item.test.tsx` | verde (era: estado de falha) |

## Mutantes

24 de 24 mortos ([mutants.json](mutants.json), runner em [mutants-runner.py](mutants-runner.py)).
- **M01–M11:** os mutantes do §7, com uma variante por rota/adaptador.
- **M12–M15:** acrescentados para as correções das revisões (hook, ACTIVE no SQL, conjunto de rotas, validação antes do snapshot).

## Gates (Node 22, logs em `logs/`, `HEAD=` no topo)

- **Formato e governança:** prettier dos 35 arquivos tocados OK; `lint` 0; `typecheck` 0; `skip:governance` PASS (SKIP-PG-040 novo, quatro sha atualizados); `docs:check-links` OK.
- **`test:postgres`:** 40 arquivos, 330 testes verdes.
- **Cobertura como o CI** (`CVG_TEST_SCOPE=core`, com `TEST_DATABASE_URL`, como o job verify):
  - 490 arquivos e 6407 testes verdes, 1 pulado.
  - Total 94,25 statements / 90,92 branches / 95,97 funções / 95,10 linhas.
  - Arquivos tocados: `server.ts` 94,46/87,19; `case-routes.ts` 96,16/89,54; `case-authority.ts` 97,36/95,36; `api-routes.ts` 96,66/86,48.
- **Suítes dentro desse run:**

  | Suíte | Arquivos | Testes |
  | --- | --- | --- |
  | `apps/api` | 85 | 669 |
  | `apps/web` | 29 | 99 |
  | `apps/worker` | 34 | 178 |
  | `packages/persistence` | 40 | 236 |
  | `legacy/.../secretary-journeys` | 3 | 34 |

- **`coverage:critical`:** PASS (rls 97,19). Sem banco, o grupo rls (`tenant-preflight.ts`, não tocado) fica em 83,51 e reprova. O CI roda com banco.
- **`mutation:guard`:** PASS, 10 de 10.
- **E2E:**
  - `critical-flows`: 1/1.
  - `rem21-014`: PASS, 18/18 (chromium, firefox e webkit), depois de `test:e2e:prepare`. O dev server precisa de `packages/shared/dist`.
  - Efeito da §8 registrado em [logs/rem21-014-panels-probe.json](logs/rem21-014-panels-probe.json). Na mesma composição (trusted, sem autoridade de principal), `/v1/tasks` e `/v1/approvals` respondem 503 para as quatro roles, como `/v1/conversations`. Fora do teste de roles, os painéis ficam em estado de falha. As asserções do E2E não dependem deles.

## Testes ajustados

22 arquivos, sem afrouxar asserção ([adjusted-tests.json](adjusted-tests.json)):

| Regra | Arquivos |
| --- | --- |
| (a) | 16 |
| (b) | 4 |
| (c) | 4 |
| (d) | 1 (`postgres-persistence-mode`) |

`journeys-api-postgres` está no inventário e não precisou de ajuste.

## Revisão de código independente

| Rodada | Veredito | Tratamento |
| --- | --- | --- |
| r1 | REVISE, 1 obrigatório | M1 (S2 sem revogação) corrigido; O1–O3 feitos ([corrections.md](code-review-r1/corrections.md)) |
| r2 | APPROVE, sem obrigatórios | R2-O1, R2-O3, R2-O4 e R2-O5 feitos ([corrections.md](code-review-r2/corrections.md)) |

Sem premissa nova nas duas rodadas.

## Desvios e pontos para o lead

1. **S6 legado.** Usa 0000 (criação de approval pelo Supervisor, R4-O1) e 0000–0027. `0028_session_events` é opt-in de schema dedicado e recusa o schema de runtime, então o legado sem 0029 termina em 0027.
2. **Jornada sem identidade.** A validação de `sessionId` também roda sem identidade, só em teste: o 400 passa de `invalid_action` para `validation_failed`, com o mesmo status. O helper continua só com identidade, como diz a §4.3.
3. **Escolha de implementação da I7.** O `no-store` fora do handler vem de um hook `onSend` restrito às oito rotas, opção prevista na R3-O4/R4-O6, no conjunto de escrita.
   - Resíduo: os `HEAD` automáticos das duas listas ficam fora; não têm corpo (R2-O2).
4. **Versionamento.** A SPEC0251 e a evidência criadas pelo lead (spec-approval, decisões, revisões de SPEC) não estão nos commits locais. O adendo da SPEC0107 aponta para a SPEC0251; é preciso versionar tudo no mesmo PR (r1 O4).
5. **SPEC0107.** O adendo foi escrito; a promoção fica com o lead (§4.5).
6. **Ledgers, cartões e coordenação** não foram tocados. `certify` não foi executado.
7. **Artefatos regenerados pelos gates** (`certification/skip-inventory.json`, `critical-coverage.json`, `mutation-guard.json`): cópias guardadas em `logs/`; os arquivos rastreados foram restaurados.
