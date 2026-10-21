# AUD0621-PERSISTENCE-0249 — texto proposto para os ledgers

Texto para o lead integrar. Esta frente não editou `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, `docs/08_runtime/agent_coordination.md` nem `docs/02_spec/`.

## Para `docs/99_runtime_state.md` (entrada no topo)

```md
# AUD0621-PERSISTENCE-0249 — SPEC0249 aprovada e BUILD local concluído — 21/10/2026

- `status: READY_FOR_NEXT_STEP` (integração pelo lead). Frente filha de `AUD0621-REMEDIATION-20261020`; achados F05, F06, F17, F19, F20 e F26 do [relatório 0621](04_audit/0621_critical_production_audit_2026-10-20.md).
- `last_completed_action`: SPEC0249 r2 (`f88732dd…`) aprovada por crítico independente em duas rodadas (r1 REVISE com um obrigatório de prova, r2 APPROVE), sem migração. BUILD local no commit `0e91b96b` da candidata detached `/mnt/dados/cvg-work/cvg-aud0621-persistence0249-20261020` sobre `6c9fc651`: 30 testes novos falharam na base pelo defeito e passam; 13 mutantes mortos; typecheck, lint e prettier verdes; suítes afetadas 503/503; `test:postgres` 314/314; prova `rem21-010` PASS. Crítico de código APPROVE nas duas rodadas, sem obrigatórios. [Evidência](04_audit/evidence/AUD0621-PERSISTENCE-0249-20261020/promotion.json).
- `next_action`: lead promove `materialized/0249_persistence_worker_integrity.md.txt` para `docs/02_spec/0249_persistence_worker_integrity.md` incorporando o [adendo do inventário](04_audit/evidence/AUD0621-PERSISTENCE-0249-20261020/spec-addendum-lead-inventory.md), integra o commit numa candidata própria com as demais frentes, roda a certificação integral e testa a 0029 da frente SPEC0176 contra o preflight do worker. Nenhum release, deploy ou dado real.
```

## Para `docs/20_master_execution_log.md` (entrada no topo)

```md
# AUD0621-PERSISTENCE-0249 — fencing do outbox, recuperação limitada, cadeia de auditoria e oracle — 20–21/10/2026

- SPEC0249 (T3, sem migração): token de claim = `outbox_attempts.id` (identity da 0010), obrigatório no ack/fail/renovação do PostgreSQL e conferido sob o lock do evento (dono, tentativa, outcome, nenhuma tentativa mais nova), imune ao ABA do requeue; `renewClaim`/`heartbeatClaim` com CAS e `null` quando o claim não é mais o vivo; exaustão de tentativas também na recuperação do outbox (dead_letter, até 25 por claim) e da execution spine (`FAILED_TERMINAL retry_exhausted`); preflight do worker sobre todo o inventário canônico de tenant e prerequisitos do kernel com RLS/FORCE/política; predicado de tenant no sweep do effect journal; trilha de auditoria do kernel com cursor por ledger, lotes transacionais e reconciliação; oracle do smoke de produção correlacionado à parada.
- Provas: first red na base (30 testes), verde no commit `0e91b96b`, 13 mutantes mortos, role mínimo sem SUPERUSER/BYPASSRLS nos testes PG. Gates: typecheck, lint, prettier, suítes afetadas 503/503, `test:postgres` 314/314, `rem21-010` PASS. Críticos independentes: SPEC r1 REVISE → r2 APPROVE; código r1 APPROVE → r2 APPROVE.
- Instabilidades observadas sob carga da máquina (load ~10), sem relação com o delta e verdes na reexecução isolada: hook de 10 s do `kernel-composition-postgres` (AAA-21) e três mutações do preflight de replay da API (`postgres-persistence-mode`, timeout de 60 s). Registradas em `build/`.
- Não executado: smoke de produção (Docker/imagem/rede), certify, E2E, SBOM e licenças (ficam com o lead).
```

## Para `docs/30_backlog_master.md` (entrada no topo)

```md
# AUD0621 — persistência e worker (F05, F06, F17, F19, F20, F26) — 21/10/2026

- F05, F06, F17, F19, F20 e F26: `DONE_LOCAL` na candidata `0e91b96b` (frente AUD0621-PERSISTENCE-0249); aceite final depende da integração e da certificação do lead.
- Continuidade (sem cartão novo concorrente):
  - store em memória da execution spine (`packages/harness/src/execution-spine.ts`, `recoverExpired`) continua sem teto na recuperação; o pacote é da frente AUD0621-RUNTIME-0248 — encaminhar a ela ou ao cartão do harness que o lead indicar;
  - runbook de implantação: com a lista do worker derivada do inventário, um worker mais novo que o banco (por exemplo, sem a 0029 quando as `case_*` entrarem no inventário) recusa a partida; o `depends_on` do compose já cobre; registrar uma linha para implantações fora do compose;
  - execução real do `scripts/production-stack-smoke.ts` com o novo oracle (limiar `CVG_STOP_ALERT_WORKER_STALE_MS=15000`, espera de 60 s) na próxima qualificação da imagem.
```

## Cartões HISO/PISO/UP

Nenhum cartão HISO, PISO ou UP existente cobre estes achados; o handoff da auditoria (`docs/08_runtime/handoffs/aud_critical_20261020.md`) pede para não criar backlog concorrente. As linhas acima entram no master. Se o lead preferir um dono no backlog do harness, o candidato natural é o cartão de qualificação de produção do núcleo (plano 0374), item de worker/persistência.

## Limites e interpretações registrados

- `heartbeatClaim` do dublê em memória devolve `null` com token divergente (não lança): é a semântica da §3.3 itens 3 e 5; o "recusam com conflict" da §3.2 item 7 vale para `ack` e `fail`.
- A checagem "nenhuma tentativa mais nova" é defesa em profundidade: pelos invariantes, não há estado alcançável em que só ela recuse; o mutante que a remove junto com a de outcome morre na AC05.
- §3.4 item 3 da SPEC, texto: `operational_effect_journal` não tem varredura de expiração; uma linha `EFFECT_STARTED` exige reconciliação explícita. Com crash na última tentativa permitida, o motivo terminal passa de `unknown_effect` (tentativa extra de antes) para `retry_exhausted`, e a linha `EFFECT_STARTED` continua como evidência. O lead pode ajustar a frase ao promover.
- O preflight do worker não exige a última migração em `schema_migrations` (pedido opcional do lead); a checagem de catálogo sobre o inventário inteiro já recusa um banco sem as tabelas de uma migração nova do inventário.
