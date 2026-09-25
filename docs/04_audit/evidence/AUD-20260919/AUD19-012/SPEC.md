# SPEC — AUD19-012 — Reconciliar documentação e plano de controle

- programa: `AUD-20260919-REMEDIATION`; onda: `W0`; gate de entrada: `G0`
  (aprovado) + `AUD19-001`/`AUD19-002` VERIFIED. Fecha W0/`G1`.
- aprovação técnica: prompt humano de 2026-09-19; escopo documental +
  script de checagem de links (sem produto, sem dados reais).
- tipo: BUILD documental + AUDIT (sem código de produto).

## O que / onde / como

1. **README.md**: adicionar seção datada `## Estado atual — 2026-09-20`
   reconciliando V1/V2/Phase 4/Phase 4A controlados + programa
   `AUD-20260919-REMEDIATION` em execução + produção `NO_GO`; atualizar a
   linha final de postura (AAA-21 → programa atual) sem apagar histórico.
2. **Índices BUILD** (`0300`, `0301`, `0302`): status `WAITING_HUMAN_APPROVAL`
   → `IN_PROGRESS` (G0 aprovado), primeira promoção registrada.
3. **Links**: novo `scripts/check-doc-links.mjs` + npm `docs:check-links`;
   escopo de zero-quebra: `README.md`, `docs/03_build/`, `docs/phase4*/`,
   `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`,
   `docs/99_runtime_state.md`, `docs/07_agents/AGENTS.md`.
   Corrigir quebrados no escopo; fora do escopo, registrar como residual.
4. **Política de dados**: `docs/02_spec/0109_dados_e_persistencia.md:63`
   (normativo vivo) → explicitar proibição de dados reais inclusive
   anonimizados; `docs/04_audit/0490_audit_report.md:60` e
   `docs/04_audit/0491_runtime_evidence.md:78` (artefatos históricos) →
   notas aditivas datadas `AUD19-012` sem reescrever o original.
5. **Críticos Phase 4A** (F-15): novo
   `docs/phase4a/evidence/critics/INDEX.md` reconciliando os 3 relatórios
   APPROVE com `RESULT.json` (sha256/bytes), commit `05d1f33`, e declarando
   honestamente os campos de proveniência ausentes (sessão, timestamp,
   pacote selado, sentinel por revisão, raw) como limitação — sem fabricar.
   Explicar o texto `critics=PENDING` como estado pré-relatório.
6. **Mapa de autoridade**: `AUTHORITY_MAP.md` nesta evidência.

## Critérios de aceite (congelados)

1. `npm run docs:check-links` → zero quebrados no escopo.
2. README narra estado atual coerente; índices sem `WAITING_HUMAN_APPROVAL`
   obsoleto; estados oficiais usados.
3. Cada aprovação Phase 4/4A rastreável a pacote/sessão/sentinel ou com
   ausência declarada (INDEX dos críticos).
4. `format:check` + `git diff --check` PASS.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-012/`
