# Manifesto de verificação — AUD19-002

- task: `AUD19-002`; onda: `W0`; status: `VERIFIED`.
- runtime: Node `v22.23.2`, npm `10.9.8`; PostgreSQL descartável
  `postgres:16-alpine` (container `aud19-pg`, porta 5434, dados sintéticos).
- autorização: prompt humano de 2026-09-19 (gate `G0`); escopo
  local/sintético/descartável; sem commit/push, sem produção.

## F-03 — identidade (digest único, checagem automática)

| Prova                                 | Resultado                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run verify:phase4a:identity`     | PASS — `phase4a.gate_identity.pass`, âncora `6185c586…dbba73e` compartilhada por HANDOFF + GATE_VALIDATION |
| `tests/phase4a-gate-identity.test.ts` | 5/5 PASS (1 âncora viva + 4 negativas fail-closed)                                                         |
| Correção `GATE_VALIDATION.md:15`      | `6185c586e382d9f7…` → âncora `6185c586e3820665…dbba73e` + errata aditiva `AUD19-002`                       |

## F-04 — PostgreSQL obrigatório (zero skip silencioso)

| Prova                                       | Resultado                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run test:phase4a` sem env              | FAIL exit 1 — `MISSING_DISPOSABLE_PG` (`test-phase4a-negative.txt`)                                                  |
| `npm run test:phase4a` com PG descartável   | PASS 13 arquivos / 78 testes, zero skips (`test-phase4a-positive.txt`)                                               |
| `npm run verify:phase4a` sem env            | FAIL exit 1 — `phase4a.verify.failed`                                                                                |
| `npm run verify:phase4a` com PG descartável | PASS + `phase4a.verify.completed` (`verify-phase4a-positive.txt`)                                                    |
| `node scripts/phase4a-certify.mjs` sem PG   | decisão `FAIL`, `postgresql.status=SKIPPED`, exit 1                                                                  |
| Restauração pós-ensaio do certify           | `RESTORE_BYTE_IDENTICAL` (18 arquivos, tar sha em `/tmp/opencode/aud19-002/`)                                        |
| CI `.github/workflows/verify.yml`           | `PHASE4A_DISPOSABLE_PG=1` + step Phase 4A (`test:phase4a && verify:phase4a && verify:phase4a:identity`); YAML válido |

## Gates estáticos

| Comando                | Resultado |
| ---------------------- | --------- |
| `npm run typecheck`    | PASS      |
| `npm run lint`         | PASS      |
| `npm run format:check` | PASS      |
| `git diff --check`     | PASS      |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `test-phase4a-positive.txt`,
`test-phase4a-negative.txt`, `verify-phase4a-positive.txt`,
`identity-positive.txt`, `identity-tests.txt`, `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`,
`disposable-pg-image.txt`.

## Limitações declaradas

- O ensaio negativo do certify reescreveu `docs/phase4a/evidence/` e foi
  restaurado byte-a-byte; nenhuma evidência de certificação nova foi publicada.
- `certification:verify` global segue com `CANDIDATE_DRIFT` (re-freeze final em
  `AUD19-016`).
- Container `aud19-pg` é descartável e local; produção `NO_GO`.
