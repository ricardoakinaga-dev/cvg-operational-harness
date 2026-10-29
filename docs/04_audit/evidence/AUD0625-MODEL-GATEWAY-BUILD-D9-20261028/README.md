# AUD0625-MODEL-GATEWAY-BUILD-D9-20261028 — evidência do BUILD da SPEC 0267

Node v22.23.2. Base: merge de origin/main 8429019b na branch claude/aud0625-model-gateway-d9.

| Comando | Resultado |
| --- | --- |
| `npx vitest run packages/model-gateway tests/model-fault-server.test.ts` | exit 0; 11 arquivos, 212 testes (171 do pacote + 41 do servidor de falhas), 0 expected fail |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` (completo, primeira execução, 2.586 s) | 494 arquivos passaram, 28 pulados; 6 falhas, todas em `tests/model-fault-server.test.ts` (ver existing-tests-adjusted.md). Saída: npm-test-first-run-output.txt |
| `npx vitest run tests/model-fault-server.test.ts` depois do ajuste | 41/41 |

O `npm test` completo não foi repetido depois do ajuste do fixture (43 min); o único arquivo que falhou foi reexecutado e passa, e nenhuma outra fonte mudou depois da execução. Sem test:postgres, E2E, certify, Docker, lockfile.

Os 11 `it.fails` da fase 1 viraram `it` e passam. Testes antigos ajustados e justificativas: existing-tests-adjusted.md.
