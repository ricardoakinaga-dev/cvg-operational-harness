# AUD0625-F12B-EXAM-EGRESS-D9-20261028 — evidência da fase 1 (SPEC 0273)

Base `ba965eab` (ponta da 07, com a semântica 0268). Node v22.23.2. Sem correção de código.

| Comando | Resultado |
| --- | --- |
| `npx vitest run packages/channel-gateway/src/__tests__/aud0625-f12b-exam-egress-uncertain.test.ts` | exit 0: 10 passam + 4 `it.fails` |
| mesmo arquivo com `it.fails`→`it` (cópia temporária removida) | RED esperado: 4 falhas `expected 'FAILED' to be 'UNCERTAIN'`, 10 passam ([red-output.txt](red-output.txt)) |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `npx vitest run packages/channel-gateway` | exit 0: 17 arquivos; 195 passam + 4 expected fail |

Resumo da caracterização: no upload, 5xx depois do envio é gravado FAILED ("provider rejected"); conexão perdida, deadline e corpo acima do teto do transporte são UNCERTAIN; FAILED faz replay sem reenvio, então não há reenvio automático. O defeito é o estado, não o reenvio. Download não tem o defeito (GET). Detalhes e decisões na SPEC 0273.
