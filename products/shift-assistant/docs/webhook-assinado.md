# Webhook assinado do Assistente de Plantão

Contrato de entrada do produto, por decisão do usuário em 05/11/2026 (protocolo
próprio; [SPEC 0317 §7](../../../docs/02_spec/0317_security_guardrails.md#7-g6--webhook-autenticado-do-assistente-de-plantão-p1-produto),
item `SEC-SHIFT-WEBHOOK-20261105` do [backlog](backlog.md)). Não libera canal
real, piloto nem produção.

## Requisição

`POST /webhooks/<provider>`, com `<provider>` igual a `SHIFT_PROVIDER`, sem query
string, com o corpo do provider inalterado e estes cabeçalhos, cada um uma vez:

| Cabeçalho                   | Valor                                                 |
| --------------------------- | ----------------------------------------------------- |
| `x-cvg-webhook-tenant`      | Tenant atendido: `[a-z0-9][a-z0-9._-]{0,63}`          |
| `x-cvg-webhook-key-id`      | Identificador da chave, no mesmo alfabeto             |
| `x-cvg-webhook-timestamp`   | Unix em segundos, dez dígitos                         |
| `x-cvg-webhook-delivery-id` | ID único da entrega: `[A-Za-z0-9._:-]{8,128}`         |
| `x-cvg-webhook-signature`   | `v1=` seguido do HMAC-SHA256 em hexadecimal minúsculo |

A assinatura cobre os bytes abaixo. Os cinco campos não admitem quebra de linha,
e o corpo bruto vem depois da última, sem normalização:

```txt
cvg-shift-webhook-v1\n
<provider>\n
<tenant>\n
<key-id>\n
<timestamp>\n
<delivery-id>\n
<bytes do corpo>
```

Um envelope futuro será outro prefixo e outra versão de `x-cvg-webhook-signature`.
Versão desconhecida é recusada; não há negociação. `signWebhook` em
`src/webhook-auth.ts` é o assinante de referência, e
`scripts/webhook-replay-proof.mjs` tem uma implementação independente.

## Verificação

A ordem é fixa, e nenhum passo recusado chega ao seguinte:

1. Query string presente é recusada, mesmo com assinatura válida. O valor não é
   lido nem registrado. `?secret=` deixou de existir.
2. Envelope, tenant, janela e chave são conferidos antes de ler o corpo.
3. O corpo é lido com os limites de sempre: até quatro leituras simultâneas,
   teto de bytes e prazo total.
4. O HMAC é conferido sobre os bytes originais, em tempo constante, antes de
   qualquer parse.
5. A entrega é reservada de forma durável.
6. Só então há parse, parser do provider e admissão. O ACK continua depois da
   gravação no journal.

A janela é de 5 minutos para mais ou para menos, medida pelo relógio do
servidor. O cabeçalho é uma alegação, não uma fonte de tempo; mantenha o host
sincronizado por NTP.

| Situação                                    | Resposta                                   |
| ------------------------------------------- | ------------------------------------------ |
| Falha de autenticação de qualquer tipo      | 401 `unauthorized`, igual para todas       |
| Mesmo ID e mesmo corpo, já admitido         | 200 `{accepted:false,duplicate:true}`      |
| Mesmo ID com outro corpo                    | 409 `delivery_conflict`, nada é alterado   |
| Reserva impossível (disco, hold de leitura) | 503 `storage_unavailable`, nada é admitido |
| Corpo grande ou lento                       | 413 `too_large` ou corte no prazo          |

O motivo da recusa vai só para o log, como código em `shift.webhook.refused`.
URL, cabeçalhos, corpo e chaves nunca são registrados.

## Replay

A reserva é o evento `webhook_delivery_reserved` no journal do produto, gravado
com `fsync` antes do parse, com provider, tenant, ID da entrega e SHA-256 do
corpo. O corpo não é copiado. O journal é o documento de registro (D4): a reserva
sobrevive a reinício, entra no backup e na projeção comparada no restore, e não
expira. Não há janela em que o ID possa ser reutilizado.

Entre a verificação e a admissão não há `await`, então entregas concorrentes do
mesmo ID ficam em série no processo e a primeira reserva decide. Isso vale para o
único escritor do journal: não rode duas réplicas sobre o mesmo volume.

Um processo que morre entre a reserva e a admissão não perde a mensagem. O
reenvio encontra a reserva com o mesmo hash, segue até `admit()`, que é idempotente
por ID de mensagem, e conclui a primeira entrega. Pelo mesmo motivo, 503 de fila
cheia pode ser reenviado com o mesmo ID.

Quem reenvia depois da janela assina de novo com timestamp novo e o mesmo ID. A
assinatura não entra no hash da entrega, então isso converge.

Um backup anterior a esta versão continua restaurável. Um journal com reservas
não é lido por uma versão anterior, que falha fechada no tipo de evento
desconhecido: rollback do programa exige restaurar um volume anterior ou manter
esta versão.

## Chaves

`SHIFT_WEBHOOK_TENANT` é o tenant do processo. `SHIFT_WEBHOOK_KEYS` é uma lista
JSON, em uma linha, de 1 a 32 chaves:

```json
[
  {
    "provider": "waha",
    "tenant": "synthetic-tenant",
    "keyId": "2026-11-a",
    "secret": "<32+ bytes aleatórios em base64url>",
    "notBefore": "2026-11-01T00:00:00Z",
    "notAfter": "2027-02-01T00:00:00Z"
  }
]
```

Gere o material com `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`. A
partida falha, sem repetir valores, com lista malformada, chave abaixo de 32
bytes, ID repetido, material repetido entre entradas ou ausência de chave viva
para o provider e tenant configurados.

- **Rotação:** adicione a chave nova e dê à antiga um `notAfter` próximo. Duas
  chaves do mesmo provider e tenant não podem coexistir por mais de 7 dias; a
  partida falha se a lista permitir isso. A validade é conferida pelo relógio do
  servidor.
- **Revogação:** troque a entrada por `"revoked": true`, retire `secret` e
  reinicie. A chave é recusada mesmo dentro da validade.

`SHIFT_WEBHOOK_SECRET` foi aposentado e sua presença impede a partida em qualquer
ambiente. Não há fallback para segredo estático em query ou cabeçalho.

## Canal real: bloqueado

Nenhum provider produz este envelope: ele é um protocolo próprio do produto, e
WAHA ou Evolution não conseguem falar com este endpoint por conta própria. As
capacidades de assinatura de cada provider não foram avaliadas nesta entrega, e o
produto não presume compatibilidade. Uma assinatura nativa, se houver e estiver
documentada, é insumo para o ingresso autenticar o provider, não substitui o
envelope.

`SHIFT_CHANNEL_MODE` é obrigatório. Esta versão só parte com `synthetic`; o valor
`real` termina em `CHANNEL_REAL_BLOCKED`, porque a composição abaixo não existe.
O valor `synthetic` é uma declaração do operador, sem meio técnico de distinguir
um WAHA real de um simulador. O que barra o provider real na entrada é a
assinatura: sem assinante, ele recebe 401.

Para liberar o canal real, é necessário construir e aprovar, nesta ordem:

1. **Ingresso dedicado** que autentique o provider por um meio próprio e
   documentado, reassine a entrega neste envelope e seja o único detentor da
   chave. Ele gera o ID da entrega de forma estável por entrega do provider, para
   que um reenvio dele converja, e preserva os bytes do corpo.
2. **Rede sem bypass:** só o ingresso alcança a porta do webhook. O WAHA ou a
   Evolution deixam a rede `cvg-shift-backend` para entrega de entrada e falam
   apenas com o ingresso; a saída do assistente até o provider continua restrita
   pelo filtro de egress. Prova: requisição direta do provider falha na rede.
3. **Mudança de código** que retire o bloqueio de `real` em `src/config.ts`,
   exigindo a composição, com negativos próprios.
4. **Gate T4** do canal, com candidato congelado e decisão humana registrada.
   A barra 0368 e D1–D4 continuam valendo.

Suporte de gateway é decisão do produto. Nada disso entra no núcleo do harness.

## Limite conhecido

Um cliente sem chave só é recusado depois da leitura do corpo se apresentar um
envelope plausível com chave conhecida, porque o HMAC cobre os bytes. Essa leitura
fica limitada pelos quatro slots, pelo teto de bytes e pelo prazo, mas o `key-id`
não é segredo: quem alcança a porta pode ocupar os slots. O ingresso e a rede
fechada são a defesa contra isso.
