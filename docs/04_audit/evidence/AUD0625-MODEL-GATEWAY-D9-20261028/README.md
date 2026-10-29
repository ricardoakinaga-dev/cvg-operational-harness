# AUD0625-MODEL-GATEWAY-D9-20261028 — evidência da fase 1 (SPEC 0267 + caracterização)

Base: origin/main 61e5cf8f. Branch claude/aud0625-model-gateway-d9. Sem correção de código.

| Comando | Exit | Resultado | Arquivo |
| --- | --- | --- | --- |
| `npx vitest run packages/model-gateway/src/__tests__/aud0625-binding-classification-usage.test.ts` | 0 | 10 passed + 11 expected fail (21) | focused-green-output.txt |
| mesmo arquivo com `it.fails`→`it` (cópia temporária, removida) | 1 | RED esperado: 11 failed, 10 passed; cada falha pela razão do defeito | red-output.txt |
| `npx vitest run packages/model-gateway` | 0 | 10 arquivos; 153 passed + 11 expected fail (164) | package-vitest-output.txt |
| `npm run typecheck` | 0 | — | typecheck-output.txt |
| `npm run lint` | 0 | — | lint-output.txt |

Razões do RED (ver red-output.txt): system B resolve em vez de recusar (x2); `system`/`promptBinding` ausentes; CLINICAL+INTERNAL alcança o externo (x3, incl. default de schema e substituição local); adapter devolve 0/0 sem usage; gateway rejeita uso ausente com provider_malformed_response; meter 0 e orçamento 0 (esperado 1.5) quando a saída é recusada.
