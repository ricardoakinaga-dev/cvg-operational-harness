# REM21-003 — PRD

## Problema

O replay store recebe um `jti` extraído de um token não autenticado. Um atacante
pode apresentar uma assinatura inválida com o `jti` de um token legítimo e
reservar esse identificador antes que a requisição legítima seja verificada,
causando negação de serviço e quebrando a ordem de confiança.

## Resultado esperado

No modo trusted, toda tentativa com token presente deve passar pelo resolver
completo antes de tocar no store distribuído. O resultado autenticado deve ser
reutilizável pela rota no mesmo request; nenhum token inválido/expirado ou
tenant-less deve reservar replay.

## Regras de produto

1. Assinatura HMAC/key-ring, issuer explícito `cvg-operator`, audience,
   `iat`, `exp`, `jti` e tenant são pré-condições do claim.
2. A reserva distribuída continua fail-closed: erro do store ou resposta
   negativa retorna `401` e não executa o handler protegido.
3. O claim continua vinculado ao TTL do `exp` e ao prefixo
   `operator-jti:`; não aceitar uma chave derivada de campos não autenticados.
4. A concorrência entre instâncias deve admitir no máximo uma requisição para
   o mesmo token.
5. O escopo não altera a autorização clínica/financeira, não executa agenda
   real e não cria capacidade de produção.

## Não objetivos

- mudar o formato de token;
- reescrever a store PostgreSQL;
- validar IdP externo;
- resolver SSRF, frontend, worker ou outros achados REM21.

## Critérios de sucesso

- testes negativos dirigidos a forged-valid-jti e store-failure;
- teste negativo para issuer ausente/divergente;
- teste concorrente sintético entre duas instâncias;
- regressão dos testes existentes de audience, expiração e replay;
- evidência com sequência observável `resolver -> store.claim -> handler`.
