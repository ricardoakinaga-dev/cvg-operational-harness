# Ledger delta proposto — AUD0621-RUNTIME-0248 (SPEC0248 + BUILD)

Texto proposto para o lead integrar; esta frente não edita ledgers. Commit na candidata detached `/mnt/dados/cvg-work/cvg-aud0621-runtime0248-20261020`: `920048717308893182d1e564ef2bd26a89e172f0` sobre a base `6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9`. Evidência: `docs/04_audit/evidence/AUD0621-RUNTIME-0248-20261020/`.

## docs/02_spec (promoção pelo lead)

- Promover `materialized/0248_runtime_budget_cancel_limits.md.txt` para `docs/02_spec/0248_runtime_budget_cancel_limits.md` sem mudar bytes (r3, sha256 `d4392f0b056d469db74f819b7ec746c59d0847e41d12eb2f9a763fcdcd9ec39e`).

## docs/99_runtime_state.md (entrada no topo)

- `task`: `AUD0621-RUNTIME-SPEC-0248-20261020` e `AUD0621-RUNTIME-BUILD-0248-20261020` (sob `AUD0621-REMEDIATION-20261020`).
- `status`: `READY_FOR_NEXT_STEP`.
- `last_completed_action`: SPEC0248 r3 aprovada pelo crítico independente (r1 e r2 REQUEST_CHANGES, verificação do reparo da r2 APPROVE); BUILD local no commit `92004871` da candidata própria. Fecha F02, F03, F04, F13, F14 e o núcleo do F21 (transporte de modelo como subconjunto da D011 e canais Evolution/Chatwoot). Gates Node 22: first red 54/83 na base (canais 17/17), focais 87/87, 19/19 mutantes mortos, cobertura 100% por arquivo em `iterative-runtime.ts` e `hybrid-orchestrator.ts`, grupo channel 97,28% de ramos, suítes afetadas 1916/1919 (3 skips de PG rodados à parte), PostgreSQL próprio 272/273 + Phase4A 1/1, produto 37/37 só para detecção, lint/typecheck/prettier verdes, gitleaks sem achado. Crítico de código: r1 REQUEST_CHANGES (3 obrigatórios), reparo agrupado, r2 APPROVE.
- `next_action`: lead integra o commit e a SPEC promovida na candidata de integração, roda certify/E2E/SBOM/licenças no conjunto das frentes e abre o PR para revisão do usuário. Sem push, deploy ou produção nesta frente.

## docs/20_master_execution_log.md (entrada)

- 20/10/2026 — AUD0621-RUNTIME-0248 (Claude Code, CONT-20261018-D9EF). SPEC0248 (orçamento da decisão, cancelamento e limites de recepção) escrita com recon da base `6c9fc651`, revisada em duas rodadas e uma verificação restrita (r3 `d4392f0b…`). BUILD na candidata detached: porta de orçamento da decisão (`DecisionModelGate`) com reserva e contabilização pelo kernel, uso validado em cópia e preservado em falha, contexto e decisão sob `race` do kernel, cancelamento revalidado antes do despacho; gateway com pré-abort, backoff cancelável e teto de custo request/perfil; transporte de modelo com corte por chunk e prioridade de status (subconjunto D011); Evolution/Chatwoot com prazo do DNS ao fim do corpo e teto passado ao transporte. Commit `920048717308893182d1e564ef2bd26a89e172f0`; evidência em `docs/04_audit/evidence/AUD0621-RUNTIME-0248-20261020/` (gates.json, promotion.json, críticas, runs).

## docs/30_backlog_master.md (linhas de continuidade)

- AUD0621 F02/F03/F04 (runtime/orchestrator): BUILD local feito (SPEC0248); aceite final depende da integração e certify do lead.
- AUD0621 F13/F14 (model-gateway): BUILD local feito (SPEC0248 §3.4, subconjunto da D009). Fica aberto na HISO-011: causa do prazo do gateway (`TimeoutError` → `provider_timeout`, R15) e preservação da primeira causa.
- AUD0621 F21 núcleo: BUILD local feito (SPEC0248 §3.5). Fica aberto na HISO-011 o restante da D011 (stream com backpressure, cabeçalhos, compressão, validação de B, teto padrão do transporte, cancelamento de 3xx no guard, R01–R15). Parte do produto continua na frente do produto (SPEC0180/PISO).

## docs/03_build/0370_harness_product_isolation_backlog.md (cartão dono)

- HISO-011 — Progresso 20/10/2026 (`AUD0621-RUNTIME-BUILD-0248-20261020`, SPEC0248): subconjunto da D011 entregue na candidata `92004871` — o transporte vinculado de modelo corta o corpo 2xx no chunk que cruza o teto (erro no corpo, fetch não rejeitado), não lê `content-length` acima do teto, preserva status e headers de não 2xx e 3xx com corpo nulo; OpenAI-compatible e Ollama passam o teto ao transporte e leem com `readBoundedText` sob teto e sinal, mantendo "Provider response exceeded <B> bytes". Do D009: pré-abort antes de budget e provider, revalidação por candidato e após backoff, sinal do provider herda estado e reason do caller. Não fecha o cartão: seguem abertos stream com backpressure Q, teto H de cabeçalhos, compressão, validação de B, teto padrão do transporte, cancelamento de 3xx no guard, causa do prazo do gateway (MF02) e R01–R15. Estado continua `TODO` → sugerido `IN_PROGRESS`.

## Nota de compatibilidade (SPEC0248 §7 e crítica de código r2)

- Além da §7: `turn.usage === null` no sucesso passa a dar `MODEL_FAILURE` "Orchestrator reported invalid model usage." (antes contava como vazio). O tipo público não admite null; nenhum código do repositório devolve null; mais restritivo (C2-02).
- Residuais registrados: C1-07 (timer do `sleep` injetável continua armado após abort, sem efeito), C1-10 (adaptador falso de canal sem stream pula a drenagem), C2-01 (fallback sem stream de `readBoundedText` sem os bytes na mensagem, inalcançável hoje).
