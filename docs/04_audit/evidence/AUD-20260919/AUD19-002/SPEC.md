# SPEC — AUD19-002 — Identidade do candidato + PostgreSQL obrigatório Phase 4A

- programa: `AUD-20260919-REMEDIATION`; onda: `W0`; gate de entrada: `G0`
  (aprovado) + `AUD19-001` VERIFIED.
- aprovação técnica: prompt humano de 2026-09-19; nenhuma decisão externa
  adicional (escopo local/sintético/descartável, reversível, fail-closed).

## F-03 — autoridade canônica de digest

- Autoridade única de computação: `scripts/lib/certification-rules.mjs`
  (`collectCandidateFiles` + `computeCandidateId` + `CANDIDATE_EXCLUDED_*`).
  Nenhuma nova função de hash de candidato será criada; o novo gate importa
  dessa autoridade.
- Âncora histórica congelada: `certification/phase10-result.json`
  `candidateId = 6185c586e3820665faa5b735ec27f7395d01fa15c1e9199263023bb52dbba73e`
  (run `run-6185c586e382-mu44ygfz`).
- Invariante: `docs/phase4a/PHASE_4_HANDOFF.md` e
  `docs/phase4a/GATE_VALIDATION.md` devem citar o mesmo digest, igual à
  âncora congelada. Verificação automática em
  `scripts/phase4a-gate-identity.mjs` (npm `verify:phase4a:identity`),
  com funções puras exportadas (`extractCandidateDigests`, `checkGateIdentity`)
  e saída JSON + exit code.
- Correção documental: `GATE_VALIDATION.md:15` cita
  `6185c586e382d9f7…` (divergente da âncora e do HANDOFF) → corrigir para a
  âncora + nota de errata com supersessão (aditiva, sem reescrever histórico).

## F-04 — PostgreSQL obrigatório (fail-closed, sem skip silencioso)

- Política: todo gate Phase 4A marcado obrigatório falha (exit ≠ 0) quando o
  recorte PostgreSQL não executar; `SKIP` nunca é `PASS`.
- `packages/conversation/src/__tests__/postgres-conversation.integration.test.ts`:
  quando `PHASE4A_PG_REQUIRED=1` e (`TEST_DATABASE_URL` ausente ou
  `PHASE4A_DISPOSABLE_PG != '1'`), registrar teste que falha com
  `MISSING_DISPOSABLE_PG` em vez de `it.skip`. Sem o flag, mantém `skip`
  (não quebra `npm test` ad-hoc sem PG).
- `package.json` `test:phase4a`: prefixar `PHASE4A_PG_REQUIRED=1`.
- `scripts/phase4a-verify.mjs`: propagar `PHASE4A_PG_REQUIRED=1` ao vitest
  filho + rejeitar qualquer `skipped` na saída (fail-closed de zero-skip).
- `scripts/phase4a-certify.mjs`: sem `pgAvailable`, decisão `FAIL` + exit 1
  (registro `postgresql.status=SKIPPED` permanece honesto, mas o gate falha).
- `.github/workflows/verify.yml`: step PostgreSQL passa a exportar
  `PHASE4A_DISPOSABLE_PG: '1'` + novo step Phase 4A
  (`test:phase4a`, `verify:phase4a`, `verify:phase4a:identity`) com
  `TEST_DATABASE_URL` + `PHASE4A_DISPOSABLE_PG=1`.

## Critérios de aceite (congelados)

1. `verify:phase4a:identity` PASS no tree atual; teste negativo (docs com
   digest divergente) FAIL.
2. `test:phase4a` sem env PG → FAIL (não skip silencioso); com PG
   descartável → PASS com zero skips.
3. `verify:phase4a` sem env PG → FAIL; com PG → PASS zero skips.
4. `phase4a-certify` sem PG → decisão FAIL/exit 1 (ensaio seco permitido
   apenas como prova negativa, sem publicar evidência de certificação).
5. CI contém o flag e o step Phase 4A (verificação estática do YAML).
6. `format:check`, `typecheck`, `lint` PASS após as mudanças.

## Arquivos (congelados)

- novos: `scripts/phase4a-gate-identity.mjs`,
  `tests/phase4a-gate-identity.test.ts` (negativos/positivos da identidade);
- editados: `docs/phase4a/GATE_VALIDATION.md` (digest + errata),
  `packages/conversation/src/__tests__/postgres-conversation.integration.test.ts`,
  `package.json` (`test:phase4a` + `verify:phase4a:identity`),
  `scripts/phase4a-verify.mjs`, `scripts/phase4a-certify.mjs`,
  `.github/workflows/verify.yml`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-002/`
