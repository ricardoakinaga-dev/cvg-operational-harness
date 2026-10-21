<!-- Crítico independente da SPEC0249, rodada 2 (mesmo agente da r1, sem fork, somente leitura). Texto do relatório preservado. -->
# Crítica r2 da SPEC0249: APPROVE, sem obrigatórios

Hash revisado: `f88732dd578e53e9ddd5a1717cf4215af67ca8dc72a9935250dfcad911e52306` (conferido com sha256sum), contra a base `6c9fc6517f…` na worktree sem alterações.

(a) R1-01 fechado. Com o mutante M6 (insert sem transação), o insert 1 commita antes de o trigger rejeitar o insert 2; a nova checagem da AC12 (zero linhas `kernelAudit` do `ledgerId` depois do turno 1, ainda com o trigger) encontra essa linha, então M6 morre. Com o lote transacional, o rollback deixa zero linhas e o aceite passa.

(b) Os onze P3 estão corretos contra a base e não introduzem defeito:
- P3-01: com 18 dígitos o token fica abaixo de 2^63−1; um id ≥10^18 seria recusado (fail-closed), o que na prática não acontece.
- P3-02, P3-03, P3-04: corretos; `PostgresOutboxContext` é exportado e `tenant-scoped-postgres.ts` está no escopo.
- P3-05: consistente com `continuous-worker.test.ts:851` (monkeypatch de `heartbeatClaim` devolvendo `findById`); o token visível enquanto `processing` faz a checagem passar.
- P3-06: correto; o único consumidor da lista é o harness (`execution-spine.ts:1293–1295`, só sinais); o claim já exclui `FAILED_TERMINAL` e a AC10 confere estado.
- P3-08: correto.
- P3-09: 15000 ms com batida de 10 s elimina a oscilação; o firing pós-parada chega em ~16 s, dentro de 60 s; `positiveInteger` aceita (`apps/api/src/stop-alert-monitor.ts:66`); nenhum outro check depende do limiar de 3 s.
- P3-10: `GREATEST` com `lease_until > agora` correto, nunca encurta; M3 continua morto por AC07 e AC08.
- P3-11: `leaseMs` 2000 e heartbeat 250 ms aceitos pela validação do tuning.

(c) Nenhum obrigatório novo.

P3 (opcionais):
1. P3-07, texto: `operational_effect_journal` não tem varredura de expiração; com `EFFECT_STARTED`, o harness rejeita a próxima tentativa com `unknown_effect` e exige reconciliação explícita (`packages/harness/src/effect-journal.ts:323–333`). Trocar "regras próprias de expiração e reconciliação" por "reconciliação explícita" e registrar que, com crash na última tentativa permitida, o motivo terminal passa de `unknown_effect` para `retry_exhausted`, mantendo a linha `EFFECT_STARTED` como evidência.
2. F26: o smoke reinicia a API (`production-stack-smoke.ts:681`) e o monitor novo começa vazio; se a API antiga parou com `worker_down` em firing, o resolve nunca chega e a espera estoura (fail-closed, improvável com 15 s). Daria para tratar como "não firing" a ausência de `worker_down` depois do último start da API.
3. Com `GREATEST`, a AC07 precisa renovar com `leaseMs` ≥ ao do claim, senão `lease_until` não avança por razão de teste.

Migração: continua concordando que não é necessária.
