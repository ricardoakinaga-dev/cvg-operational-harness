# PROD-04 — Relatório do builder (ApprovalStore durável / `ApprovalAuthority`)

- Programa: `PROD-20260913`; task: `PROD-04`; decisão: `D01 = C` + variante **A2** autorizada pelo prompt.
- Status: **IMPLEMENTED** (builder). Não é `VERIFIED`: revisão por crítico fresco independente é obrigatória e não foi feita.
- Spec: [adendo PROD-04](../../../02_spec/prod20260913_prod04_addendum.md) substitui o **mecanismo** da §6 do [contrato de composição](../../../02_spec/aaa_composition_contract.md) (rota A/DurableApprovalStorePort); a **aceitação** permanece inalterada.
- Ambiente: Node `v22.23.2`; PostgreSQL 16.15 em `127.0.0.1:55481` (`cvg_prod`, trust); banco descartável `prod04_0c9ca84c`; porta 5432 nunca usada.
- Nenhum dado real, efeito real, canal, provider, IdP, deploy ou produção; D02–D05 `PENDING`; produção `NO-GO`.

## 1. O que foi construído (A2)

- `packages/approval-engine/src/authority.ts`: tipo `ApprovalAuthority` com métodos maybe-async (`T | Promise<T>`); `ApprovalEngine` satisfaz estruturalmente, sem tocar `engine.ts`/`store.ts`.
- `packages/persistence/src/runtime-approval-store.ts`: `PostgresApprovalAuthority` — carrega registro(s) `FOR UPDATE` em uma transação tenant-scoped (`withTenantTransaction`), semeia `InMemoryApprovalStore` scratch, executa o método síncrono do engine e persiste com CAS `(revision, status, reservation_id, reservation_generation)`; `revision` incrementa. Nenhuma decisão duplicada em SQL/adapter. `expireStale` (cross-tenant) rejeitado com `invalid_action`; leituras `get`/`list`/`listPending`/`getByOperationKey` são SELECTs simples sob `withTenantContext`; `getByOperationKey` devolve candidatos (chave não única).
- `packages/persistence/migrations/0015_runtime_approval_store.sql`: tabela `runtime_approvals` aditiva, 11 estados com `CHECK`, PK `(tenant_id, approval_id)`, índices `(tenant_id,status,reservation_expires_at)` e `(tenant_id,operation_key)`, RLS `ENABLE/FORCE`, policy única, `REVOKE ALL FROM PUBLIC`, comentários.
- Fiação de tipos: `agent-runtime` (`contracts.ts`, `runtime.ts`, `index.ts`) usa `ApprovalAuthority` com os `await` necessários; `apps/worker/src/sweeps.ts` idem; comportamento e decisões inalterados.
- Testes SQL reais: `packages/persistence/src/__tests__/runtime-approval-store-postgres.test.ts` (11 testes, aceite a–h + transição de expiração e rejeição de `expireStale`) + probes RED/GREEN.

## 2. Arquivos e hashes (sha256)

| Arquivo                                                                      | Estado  | sha256                                                             |
| ---------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `docs/02_spec/prod20260913_prod04_addendum.md`                               | novo    | `fefcc64eb05b98c05eaf7a5da09186cfcdc4a0b172ad977dc68db524451c29c5` |
| `packages/approval-engine/src/authority.ts`                                  | novo    | `e6f23aac59bcd33e883af79e2f4c094f2d95cd070f7f84e1bca2af968bf293a0` |
| `packages/approval-engine/src/index.ts`                                      | editado | `f36cb7e08a125891209864823c442c4f0972442aa8779495e0c899f29f782be7` |
| `packages/persistence/migrations/0015_runtime_approval_store.sql`            | novo    | `062dff6309c457e75fafe3c71a36ee40c81f67cccd74d2adb6d6bc4956b5f396` |
| `packages/persistence/src/postgres.ts`                                       | editado | `ad0e5d360fc450fdccbb6e2300877072f4fc00f26b1aa5624cce8a712bd6c30a` |
| `packages/persistence/src/runtime-approval-store.ts`                         | novo    | `cbb61a7ce07afbf3f5c280ef014807c2d08bfa3536515ebd1ea0e3a375be737f` |
| `packages/persistence/src/index.ts`                                          | editado | `593e8d775bad43e1cacb28ac10e0f3850108bcfa424fbaa91eff9e9b75aff63e` |
| `packages/persistence/src/__tests__/runtime-approval-store-postgres.test.ts` | novo    | `5ffeb1bd8c9b64cb22f71ff7987486afec8472316fef0fde4a9ca7fd8d4c355a` |
| `packages/agent-runtime/src/contracts.ts`                                    | editado | `f4a67fe8eed2970e469dc22f8f986ca0fd840a45182d061406b517b44ff8cb47` |
| `packages/agent-runtime/src/runtime.ts`                                      | editado | `67ec1f6a50f605f68de5fceb297a091509a1d1a47e003fb183d8f069240ccf8e` |
| `packages/agent-runtime/src/index.ts`                                        | editado | `5a2f3c3d92121f9cea50ccc41a13858d6c2c7117bc47ec2649e256cc682772da` |
| `apps/worker/src/sweeps.ts`                                                  | editado | `dd97b64f2263ebcbaa18826eb4e242979d3f2a95b192f2814b8ecf877089b515` |
| `package.json`                                                               | editado | `edda78681280d956aaab3e692cb3977c99dff16cb3527d2860280b7d980846b6` |
| `probes/probe-cas-red.ts`                                                    | novo    | `c3519ec8f50d719663755547dceed7febcdf1122304549d834f629ce8fbef070` |
| `probes/probe-restart-red.ts`                                                | novo    | `97f161f349127693c70ca5e643a4529b7a97fb0cd14f9c28e58d04123d97a928` |
| `probes/probe-cas-green.ts`                                                  | novo    | `56ee7a51d060c60ae38399a11f14753935c8c0d12a8257d79fd5e77d0735d68e` |
| `probes/probe-restart-green.ts`                                              | novo    | `5795abde61804670a6edcf2e24f271cf7566b5c5fa0b7964f1ca4fed4f68505d` |

Digest do conjunto alterado: `898108915aa0afe177849bcad0ad99245181f5ac2ef71a84afd250a34e068baf` (sha256 sobre as linhas `sha256  path` ordenadas). Hashes pré-edição dos 8 arquivos pré-existentes estão no `manifest.json`; nenhum arquivo fora do file plan foi tocado por este builder.

## 3. Aceitação (a–h) — resultados

Comando base: `TEST_DATABASE_URL=postgresql://cvg_prod@127.0.0.1:55481/prod04_0c9ca84c npx vitest run --testTimeout=60000 packages/persistence/src/__tests__/runtime-approval-store-postgres.test.ts` → **exit 0**, 11/11 (`final-new-suite.log`); a suíte roda também em `npm run test:postgres` (20 arquivos/174 testes) e `npm test` (248/1775), ambos `exit 0`.

| #   | Critério                                                                                                           | Teste                                                                                                                         | Resultado |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| a   | 0015 aditiva sobre 0014, checksum guard, RLS forçada                                                               | "ships the additive runtime approval migration with forced RLS" + "applies 0015 additively over 0014 with the checksum guard" | PASS      |
| b   | restart mantém proposta/reserva (hash, geração, expiry)                                                            | "keeps proposal and reservation across an adapter restart" + `GREEN-restart-persistence.log`                                  | PASS      |
| c   | duas conexões reservam: 1 vencedor, erro natural, 1 geração                                                        | "serializes a two-connection reserve to exactly one winner" + `GREEN-cas-two-connection.log`                                  | PASS      |
| d   | fencing de gerações e predicado CAS no SQL                                                                         | "fences generations and ships the SQL compare-and-set predicate" (`RecordingPool` captura o texto do UPDATE)                  | PASS      |
| e   | crash antes do efeito: `no_effect` → APPROVED, reserva limpa, geração retida                                       | "releases an expired RESERVED approval with no_effect evidence"                                                               | PASS      |
| f   | crash após efeito: ausente/`effect_possibly_started` → UNCERTAIN; 2º sweep não muda; `effect_confirmed` → EXECUTED | "keeps an EXECUTING approval UNCERTAIN until explicit reconciliation"                                                         | PASS      |
| g   | RLS com papel real `NOSUPERUSER NOBYPASSRLS`                                                                       | "isolates rows for a non-BYPASSRLS runtime role" (vê 1 própria; 0 de outro tenant; 0 sem contexto)                            | PASS      |
| h   | `getByOperationKey` com 2 candidatos da mesma chave; `listPending` correto                                         | "returns operation-key candidates and filters pending approvals"                                                              | PASS      |

## 4. Gates

| Gate           | Comando                                                        | Exit | Resultado                            | Log                   |
| -------------- | -------------------------------------------------------------- | ---- | ------------------------------------ | --------------------- |
| Typecheck      | `npm run typecheck`                                            | 0    | PASS                                 | `final-typecheck.log` |
| ESLint         | `npx eslint <10 arquivos alterados>`                           | 0    | PASS                                 | `final-eslint.log`    |
| Prettier       | `npx prettier --check --ignore-unknown <alterados + 0015.sql>` | 0    | PASS (SQL pulado: sem parser)        | `final-prettier.log`  |
| Suíte nova     | `npx vitest run ... runtime-approval-store-postgres.test.ts`   | 0    | 11 testes, 0 skips                   | `final-new-suite.log` |
| PostgreSQL     | `npm run test:postgres`                                        | 0    | 20 arquivos / 174 testes / 0 skips   | `final-postgres.log`  |
| Suíte integral | `npm test`                                                     | 0    | 248 arquivos / 1775 testes / 0 skips | `final-full-test.log` |
| Worker startup | `npm run test:worker:startup`                                  | 0    | PASS                                 | `final-startup.log`   |
| Build          | `npm run build`                                                | 0    | PASS                                 | `final-build.log`     |

Skips: **0** nos gates (ambos `npm test`/`test:postgres` com `TEST_DATABASE_URL`). A suíte nova usa `describeWithPostgres` (skip condicional) apenas quando `TEST_DATABASE_URL` está ausente — mesmo padrão das demais suítes PostgreSQL do repositório.

## 5. Evidência RED/GREEN (negative-first)

- RED executado **antes** do wiring do adapter; logs `*-prewiring.log` preservados. Após o prettier, os probes foram relançados para ligar os logs aos bytes finais dos scripts (comportamento idêntico).
- RED CAS (`probe-cas-red.ts`): `exit 1` — duas conexões observam `APPROVED` e ambas reportam sucesso no UPDATE sem CAS (`1 + 1 = 2`) → lost update invisível. `RED-cas-two-connection.log`.
- RED restart (`probe-restart-red.ts`): `exit 1` — engine novo sobre store in-memory não vê a aprovação/reserva anterior (`not_found`). `RED-restart-persistence.log`.
- GREEN CAS (`probe-cas-green.ts`): `exit 0` — 1 fulfilled, 1 `already_reserved`, geração 1, 1 token consumido, predicado CAS presente no SQL. `GREEN-cas-two-connection.log`.
- GREEN restart (`probe-restart-green.ts`): `exit 0` — `proposalHash`, `reservationId`, `reservationGeneration` e `reservationExpiresAt` idênticos após novo adapter/pool. `GREEN-restart-persistence.log`.

## 6. Limitações e débitos

1. Nenhum dado real/efeito real; fixtures sintéticas rotuladas (`data_classification = 'synthetic'`); D02–D05 pendentes; produção `NO-GO`.
2. `expireStale` rejeitado no adapter durável (`DomainError('invalid_action')`): sweep do engine é cross-tenant; produção usa `releaseExpired` por tenant.
3. Restart provado na fronteira adapter+pool (mesmo processo). Reinício de processo/OS e composição HTTP→SQL→worker→kernel→efeito falso→audit ficam para `AAA-21`.
4. `proposalPayload` JSON `null` colapsa para ausente no round-trip jsonb (caso não usado pelo runtime; documentado).
5. Débito de dependência declarada: `packages/persistence` importa `@cvg/approval-engine` sem declará-lo em `package.json` — segue precedente existente (`@cvg/agent-runtime`, `@cvg/channel-gateway`); lockfile fora do file plan.
6. A suíte do `approval-engine` tem 105 testes (o prompt citava 427); `engine.ts`/`store.ts` intactos e os 105 verdes.
7. O caminho maybe-async do runtime é coberto por typecheck + suíte integral (com `ApprovalEngine` síncrono) e pelos testes SQL da autoridade durável; o exercício com autoridade verdadeiramente assíncrona no caminho composto pertence a `AAA-21`.

## 7. Bloqueios

Nenhum bloqueio para PROD-04. `D02–D05` e a composição `AAA-21` permanecem fora do escopo e pendentes; produção segue `NO-GO`.

## 8. Observação de concorrência

`docs/01_prd/aaa_decision_brief.md`, `docs/02_spec/prod20260913_decision_packet.md` e `docs/03_build/tracking/aaa_execution_ledger.json` tiveram mtime posterior ao início desta sessão; **não** foram tocados por este builder (lane concorrente/orquestrador). Nenhuma alteração preexistente foi revertida.
