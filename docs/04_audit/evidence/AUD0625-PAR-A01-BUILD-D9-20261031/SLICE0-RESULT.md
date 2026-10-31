# PAR-A01 BUILD fatia 0 — `revalidateOperatorSession` extraída do gancho (SPEC 0296 A10, D10)

Branch `claude/aud0625-par-a01-build-d9`, base `claude/aud0625-wave5-pr` @ `97f81204d` com a SPEC 0296 R3 e o RED trazidos por cherry-pick (os três ledgers ficaram com a versão da onda 5; a linha do PAR-A01 entra por âncora).

- Novo `apps/api/src/operator-session-revalidation.ts`: `revalidateOperatorSession(deps, sessionId)` devolve `valid` (com o registro), `revoked` (registro ausente, expirado, inclusive em `expiresAt == agora`, ou revisão do principal velha) ou `unavailable` com `source: 'store' | 'principal'` (falha do armazenamento de sessões, do principal ou versão de autoridade ausente). Lê o armazenamento de sessões a cada chamada; não recebe nem lê os caches por requisição (`sessionIdentityByHeaders`), único modo de uma revogação ser vista dentro de um stream longo. O relógio é injetável.
- `operator-session-hook.ts` passa a usar a função; comportamento externo idêntico (mesmos 401 com cookie retirado, mesmos 503 e mensagens, mesmas exceções para `/v1/session` e `/v1/session/logout`). As suítes existentes do gancho passam (24 testes).
- Testes `aud0625-par-a01-slice0.test.ts` (9): válido, leitura a cada chamada (registro removido depois de um válido = revogado), id repassado, expirado e expirado exatamente agora, expira durante a leitura do principal, revisão velha, falha do armazenamento, falha do principal e versão ausente, relógio real.
- Gates: typecheck, eslint, prettier; cobertura 100% do arquivo novo; mutantes 6 de 7 mortos. O sobrevivente (B, `<=` trocado por `<` no primeiro teste de expiração) é equivalente em resultado: a segunda conferência, depois da leitura do principal, revoga do mesmo modo; o primeiro teste só evita a leitura do principal de uma sessão já expirada.

Produção NO_GO; dados sintéticos; sem push.
