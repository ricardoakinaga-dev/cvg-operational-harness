# REM21-003 — SPEC

## Alteração de composição

Em `buildServer`, no hook trusted que atualmente faz o pre-check distribuído:

1. se não houver `x-cvg-operator-token`, não tocar no store e deixar a rota
   aplicar sua própria política;
2. se houver token, chamar o `operatorIdentityResolver(request.headers)` antes
   de extrair qualquer `jti` para o store; o resolver deve exigir `iss` igual a
   `cvg-operator` além de assinatura, audience e janela temporal;
3. se o resolver lançar, responder `401` sem `claim`;
4. somente após retorno de uma identidade tenant-bound, usar o decoder seguro
   apenas para obter `jti`/`exp` já autenticados no mesmo objeto de headers, ou
   uma saída equivalente do resolver, e chamar `tokenReplayStore.claim`;
5. manter a memoização do resolver efetivo por headers para que a rota não
   consuma o replay local novamente;
6. store error/false segue `401` e não chama handler.

A implementação deve remover a dependência do hook em claims não verificados
como autoridade. O decoder não verificado pode permanecer somente se não for
usado para decidir o claim sem uma autenticação anterior; preferencialmente
renomear/documentar sua função de inspeção não autoritativa.

## Testes obrigatórios

Adicionar cobertura em `apps/api/src/__tests__/identity-composition-wiring.test.ts`:

- token com assinatura forjada e `jti` válido: `401`, `claim` não chamado;
- token com issuer ausente ou divergente: `401`, `claim` não chamado;
- dois servidores trusted com store sintético compartilhado e o mesmo token:
  exatamente um `200` e um `401`, dois claims observados;
- resolver/store failure: `401`, sem handler autorizado.

Preservar os testes de wrong audience, expired, replay e memoização existentes.

## Invariantes de segurança

- não derivar autorização de `x-operator-id`, `x-operator-role` ou
  `x-tenant-id` em trusted mode;
- não reservar `jti` com parse de payload, mesmo que o formato do `jti` seja
  válido;
- não executar rede externa, segredo real ou banco persistente nesta etapa.

## Gate SPEC

O SPEC é limitado a REM21-003 e ao gate `G21-1`. Após BUILD, a auditoria deve
inspecionar o diff e os testes; só então a task pode ser marcada localmente
verificada. `G21-3`, I1, `G21-5` e `G21-6` continuam separados.
