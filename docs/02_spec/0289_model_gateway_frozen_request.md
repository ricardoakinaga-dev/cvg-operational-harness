# SPEC 0289 — Requisição congelada antes do adaptador (PAR-M02)

R1, 29/10/2026. Task `AUD0625-PAR-M02-D9-20261029`, cartão PAR-M02 da [0380](../03_build/0380_backlog_paridade_100_deepseek.md)
(P2, tamanho P, depende do M01). Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: contrato de eventos e superfície de
`@cvg/model-gateway`. **Sem BUILD até revisão humana explícita deste documento.**
Base: `claude/aud0625-par-c02-df` @ `2aad7d0b7` (M01 + C02: eventos por tentativa).

## 1. Evidência atual

Prova de fase 1: `packages/model-gateway/src/__tests__/aud0625-par-m02-frozen-request.test.ts` (3 controles e 6 `it.fails`).

- O gateway monta, por tentativa, um objeto `providerRequest` simples (`gateway.ts`, em `#runCandidate`). Só `input` é
  congelado (SPEC 0267, `renderGovernedInput`). `model`, `maxTokens`, `temperature`, `timeoutMs`, `promptSha256` e o
  próprio objeto são graváveis.
- **`metadata` é o objeto do chamador, e `promptBinding` é o mesmo objeto para todas as tentativas e para todos os
  candidatos do fallback.** Um adaptador que grava neles vaza a gravação para a tentativa seguinte e para o fallback.
  Efeitos observados: (a) `metadata.a` reescrito na tentativa 1 chega ao fallback; (b) uma gravação em
  `promptBinding.renderedInputSha256`/`instructionSha256` faz o próprio gateway recusar a nova tentativa (a checagem de
  prompt aprovado, `#assertPromptStillApproved`, compara com o mesmo objeto), isto é, um adaptador defeituoso envenena a
  tentativa seguinte em vez de falhar sozinho.
- O log não identifica o que foi enviado: `model.call.started` traz `projectedInputTokens` (estimativa) e nada do pedido.
  Não há digest, nem tamanho, nem como reconstruir os bytes que o adaptador recebeu.
- O que já vale: o `input` renderizado é congelado fundo; os adaptadores reais verificam o `promptBinding` contra o
  `input` antes do fio (SPEC 0267). A SPEC não muda isso; acrescenta o congelamento do restante e a identidade no log.

## 2. Objetivo e limites

1. O adaptador recebe uma requisição **imutável de ponta a ponta** (objeto, `metadata`, `promptBinding`, `input`).
2. Cada tentativa recebe uma cópia nova congelada; nada que um adaptador faça vaza para a tentativa seguinte nem para o
   fallback.
3. O log (eventos do gateway) identifica a requisição **byte a byte**: digest e tamanho sempre; os bytes, só quando a
   gravação estiver ligada (D1).
4. Fora de escopo: um adaptador malicioso que envia ao fio algo diferente do que recebeu (o gateway não vigia o fio; isso
   é a verificação de binding já existente e o teste de transporte); estado interno do `AbortSignal`; mudar o schema de
   `ModelGatewayRequest`; contagem de tokens.

## 3. Mudança proposta

### 3.1 Congelamento

Por tentativa, o gateway constrói `ProviderRequest` com cópias próprias de `metadata` e `promptBinding` e chama
`Object.freeze` em cada nível (objeto, `metadata`, `promptBinding`; `input` já vem congelado). `signal` fica fora da
identidade (objeto vivo do host); o campo é só leitura no objeto congelado. Em módulo ES (modo estrito) a escrita de um
adaptador lança `TypeError`; em modo frouxo é ignorada. Nos dois casos o valor não muda. O `TypeError` é tratado como
qualquer exceção de adaptador (D2).

### 3.2 Forma canônica `frozen-request-v1`

`JSON.stringify` de, nesta ordem fixa de chaves: `v:'frozen-request-v1'`, `requestId`, `tenantId`, `correlationId`,
`model`, `temperature`, `maxTokens`, `timeoutMs`, `promptSha256`, `promptBinding` (6 campos, ordem fixa),
`structuredSchemaName` (ou `null`), `metadata` (lista de pares `[chave, valor]` ordenada por chave, ou `null`) e `input`
(`system` e `messages` com `role`,`content`). Sem `signal`. É uma extensão da forma `literal-v1` do binding, que só
cobre o `input`. `requestSha256` = SHA-256 em hex da string em UTF-8; `requestBytes` = comprimento em bytes.

### 3.3 Eventos

`model.call.started` ganha `requestSha256` e `requestBytes` (sempre) e, com a opção `recordFrozenRequests: true`,
`frozenRequest` (a string canônica). Reconstruir: ler `frozenRequest`, conferir o digest e o tamanho; sem a gravação, o
digest permite apenas verificar uma cópia obtida por outro meio. O digest é calculado uma vez por candidato e é igual em
todas as tentativas dele; o fallback (outro `model`) tem outro digest. Uma requisição recusada antes do despacho (prompt
divergente, janela, orçamento) não gera `model.call.started` nem identidade.

### 3.4 O que não muda

Sem export novo no barrel além do campo opcional da opção e dos campos de evento; `ModelGatewayRequest` e
`ProviderRequest` mantêm os campos. Providers existentes continuam compatíveis (a requisição é só mais restrita).

## 4. Critérios de pronto

- Os 6 `it.fails` viram `it`; os 3 controles seguem verdes.
- Mutantes: cópia sem congelar `metadata`; sem congelar `promptBinding`; sem congelar o objeto; compartilhar o binding
  entre tentativas; digest calculado sobre o objeto errado (sem `metadata`); ordem das chaves; gravação ligada por
  padrão; `frozenRequest` emitido com a gravação desligada; evento antes do congelamento.
- Caminho de streaming (`profile.streaming`) recebe a mesma requisição congelada (teste).
- `model-gateway` inteiro e `tests/` que consomem o gateway verdes; typecheck, eslint, prettier, `docs:check-links`.

## 5. Decisões pedidas ao Ricardo

- **D1. Bytes da requisição no log.** (A, recomendado) `recordFrozenRequests` desligado por padrão; o digest e o tamanho
  sempre; quem liga a gravação a faz com o sink de eventos protegido por tenant e retenção definida, porque o pedido
  contém dado do paciente. (B) Sempre gravar: reconstrução sempre possível, mas conteúdo clínico em todo log de evento.
  (C) Só digest: o log não reconstrói os bytes (não cumpre o aceite literal do cartão; a reconstrução dependeria do
  histórico da sessão).
- **D2. Exceção do adaptador por escrita bloqueada.** (A, recomendado) tratar como qualquer erro do adaptador (hoje
  inesperado/não retentável, sem mudar a classificação); (B) classe de erro própria `request_mutation` auditada, mais
  barulhenta e um código novo na superfície.
- **D3. Digest por tentativa ou por candidato.** (A, recomendado) por candidato, repetido nos eventos de cada tentativa;
  (B) digest por tentativa incluindo o número da tentativa, o que impede comparar tentativas.
