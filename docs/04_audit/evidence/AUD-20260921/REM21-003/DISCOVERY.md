# REM21-003 — Discovery

## Objetivo

Corrigir `A21-F02`: o claim distribuído de `jti` não pode ocorrer antes de a
assinatura, issuer/audience, janela temporal e identidade tenant-bound serem
validados. Escopo exclusivamente local/sintético/descartável sob `G21-1`.

## Evidência observada

- `apps/api/src/server.ts` registra um hook `onRequest` que chama
  `decodeTrustedOperatorTokenClaims` e reserva `operator-jti:${jti}` antes de
  `requireOperatorIdentity`/resolver validarem a assinatura.
- `apps/api/src/operator-identity.ts` contém a validação completa no resolver,
  mas também expõe um decoder explicitamente não verificado para o hook.
- O resolver efetivo já memoiza identidade por objeto de headers, permitindo
  autenticar uma vez no hook e reutilizar a identidade na rota sem consumir o
  replay local duas vezes.
- A revisão independente detectou um residual: o envelope HMAC não possuía
  `iss` explícito. Portanto a ordem do claim foi corrigida, mas a task não pode
  ser fechada até o issuer esperado ser parte do contrato e de seus negativos.
- Há testes de audience/expiração/replay, mas não há prova dirigida de que um
  token com `jti` válido e assinatura forjada não alcança o store, nem uma
  prova concorrente entre duas instâncias com um store compartilhado.

## Critérios de aceitação descobertos

- `AC-01`: token forjado que reutiliza um `jti` formalmente válido é rejeitado
  antes de qualquer chamada ao `tokenReplayStore`.
- `AC-02`: token assinado com claims válidos autentica antes do claim e uma
  segunda instância não consegue reutilizar o mesmo `jti` no store compartilhado.
- `AC-03`: falha do resolver ou do store permanece `401`/fail-closed, sem
  executar a rota protegida.
- `AC-04`: rotas sem token continuam podendo seguir para a própria política de
  autenticação; nenhum fallback simulado é criado em trusted mode.
- `AC-05`: typecheck, lint e testes focados passam em Node `v22.23.2`.
- `AC-06`: token com issuer ausente ou divergente é rejeitado antes do claim.

## Limitações

Não usar IdP, chave real, provider, canal, banco real, produção ou dados de
paciente. PostgreSQL distribuído é responsabilidade da prova posterior/REM21-019;
esta task usa apenas store sintético descartável para a ordem de chamadas.
