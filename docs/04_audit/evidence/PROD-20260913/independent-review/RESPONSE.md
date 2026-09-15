# Resposta à revisão independente — M1 (PROD-20260913)

- Fonte da revisão: `REVIEW.md` neste diretório (verificador fresco com execução, 2026-09-13).
- Veredicto da revisão: `REWORK` — C1–C5 confirmados por reprodução independente; F1 P1 de typecheck; F2–F7 P3 de evidência/contrato. Nenhum P0.
- Esta resposta foi produzida pelo builder; a revalidação do delta exige novo verificador (registrada em `revalidation.md` quando executada).

## F1 (P1) — typecheck falhava no fake pool do teste de preflight

- Causa: `pool` fake sem campos de `QueryResult`; o typecheck foi registrado antes da última edição do teste.
- Correção: cast explícito para `Parameters<typeof assertPostgresWorkerPreflight>[0]`.
- Verificação: `npm run typecheck` exit 0 nos bytes finais; `npm test` final 234 arquivos/1625 testes PASS.

## F2 (P3) — `prettier --check` falhava em `aaa_decision_brief.md`

- Correção: `npx prettier --write` no arquivo (apenas alinhamento de tabela).
- Verificação: `npx prettier --check` nos arquivos do lote PASS.

## F3 (P3) — 3 hashes desatualizados no manifest PROD-01

- Causa: tracking JSONs evoluíram na rodada e `readiness-probe.ts` foi ajustado após a primeira geração.
- Correção: manifests PROD-01 e M1 regenerados após o congelamento dos bytes; nenhuma outra divergência de hash relatada.

## F4 (P3) — manifest PROD-05 dizia 8/8 com execução de 10/10

- Correção: veredicto atualizado para 10/10 e regenerado.

## F5 (P3) — limpeza pós-COMMIT podia gerar erro após mutação commitada

- Causa: reset do contexto de tenant ocorria depois do `COMMIT`.
- Correção: reset e verificação (`current_setting('cvg.tenant_id', true)` vazio) agora acontecem dentro da transação, antes do `COMMIT`; falha de limpeza provoca `ROLLBACK` e o chamador recebe erro sem mutação persistida. O contrato já descrevia essa ordem; a implementação foi alinhada.
- Verificação: jornadas 2 arquivos/32 testes PASS; teste de contexto do pool PASS.

## F6 (P3) — contrato divergia do mecanismo do preflight/leituras lazy

- Correção: contrato M1 atualizado (preflight com contexto explícito na mesma conexão e limpeza verificada; leituras com expiração lazy justificadas na transação). Novo sha256 do contrato registrado nos manifests.

## F7 (P3/NOT_VERIFIED) — hunks fora do escopo M1 em `server.ts`/`package.json`

- Esclarecimento: são alterações preexistentes de outras frentes do working tree, preservadas. `PROD-01/baseline-drift.json` mostra 0 fontes de produto alteradas em relação ao manifesto da auditoria (2525/2531 arquivos idênticos; as 6 exceções são docs de registro). As mudanças desta rodada em `server.ts` limitam-se a: `journeyAuditContext`, `auditContext` nas rotas de jornada, probes de readiness e `evaluateReadinessWithProbes`. Em `package.json`, apenas o inventário de `test:postgres`.

## Revalidação pendente

- Um novo verificador fresco deve reexecutar: `npm run typecheck`, `npm test` (ou os arquivos do lote), `npm run test:postgres`, `prettier --check` do lote, os probes de atomicidade/UI/readiness e a conferência de hashes dos seis manifests. Sem esse passo, os estados permanecem `IMPLEMENTED`/`REVIEW`.
