# Crítico R2 — AUD0621-AUTH-BUILD-0176 (fresh context, não-fork, só leitura)

Alvo: commit `a9861469d6e214f342597c24a9754483e50acbef` sobre
`6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9`, lido só por objetos git.

Veredito: **APPROVE** (sem blocker nem should-fix).

Confirmado: S1 (link de conclusão degrada para "sem vínculo" quando o papel não
tem 0029), S2 (teste trusted do Operator com grant/revoke/re-grant/desativação;
F01 trusted exige `[503,503,503]`), N1, N2, N4, N8 corrigidos; N3 parcial; N5
corrigido sem teste. Autorização em todos os readers, 404 estático, 503 em
outage, CAS, escritas atômicas, RLS/FK/linhagem, DTO por allowlist e manuseio de
conexão sem vazamento de contexto: sem defeito.

## Nits registrados como resíduo (sem mudança de código após R2)

1. Preflight de trigger compara a função por nome, não por oid/schema; não
   verifica `tgqual`/`tgattr` nem rejeita triggers extras (exige DDL de dono;
   defesa em profundidade).
2. Link de conclusão confia no `sessionId` do outbox; não confere que a sessão
   pertence ao `conversationId` da mensagem (sem vazamento de conteúdo: o DTO
   limitado oculta payload).
3. Link de conclusão do worker só tem teste negativo (sem privilégio).
4. Guard N5 (principal sintético fora de `NODE_ENV=test`) sem teste.
5. Corrida pequena: grant do caso core verificado em snapshot separado antes do
   `submitWith`; a resposta revalida e devolve só o ack.
6. Respostas de mutação com DTO v2 sem `cache-control: no-store`.
7. Backfill em memória ordena com `localeCompare` e faz checkpoint com `>`
   (memória, nunca executado).

Nota operacional: `buildServerFromEnv` não liga `casePrincipalAuthority` e não
existe produtor SPEC0152; uma composição trusted real responde 503 em todos os
readers de caso e no registro, inclusive Supervisor/Admin (fail-closed, sem
release concedido).
