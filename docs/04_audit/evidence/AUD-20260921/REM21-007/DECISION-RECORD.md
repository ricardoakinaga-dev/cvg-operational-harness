# REM21-007 — decision record

## Decisão

Usar `budget_key` HMAC estável como identidade do budget e `key_version` +
`key_digest` como projeção versionada da chave operacional. Em capacidade cheia,
falhar fechado em vez de remover qualquer bucket ativo.

## Alternativas rejeitadas

- armazenar somente `key` plaintext: viola privacidade e permite correlação
  direta no banco/logs;
- trocar apenas o HMAC ativo sem uma identidade estável: a rotação criaria
  uma nova linha e resetaria o orçamento;
- eviction do menor `reset_at`: já reproduziu o reset por churn;
- permitir cardinalidade ilimitada: transforma churn em retenção sem limite.

## Consequências

O namespace HMAC precisa ser preservado durante o rollout. Sua troca não é uma
rotação transparente e requer uma migração explícita do estado efêmero. O
advisory lock constante reduz paralelismo apenas na decisão curta de criação de
bucket, preservando a atomicidade distribuída e a segurança do orçamento.

## Estado

`CONTROLLED_BUILD_AUTHORIZED`; nenhum ambiente real ou produção foi liberado.
