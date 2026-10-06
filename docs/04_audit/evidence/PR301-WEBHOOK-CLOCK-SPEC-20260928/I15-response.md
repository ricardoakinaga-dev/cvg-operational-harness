# Resposta I15 — deadline absoluto e resolução terminal de aborto

- Data: 29/09/2026.
- Candidato de entrada: SPEC 0162, SHA-256 `27d75256040419d8e8cda4145764ce837c447d3d646a07602e8977249507b6f5`.
- Crítica: [I15](I15-review.md), SHA-256 `cc0f28babe9fc0e41adb63f10253384a2c2eff8ca60f796376b63bb9cd57faab`; prova [I15-proof.json](I15-proof.json), SHA-256 `759affe3272f52479591ba99366ef5eeccfb6287a4322165cf2a1799af078afb`.
- Candidato após resposta: [SPEC 0162](../../../02_spec/0162_webhook_clock_highwater_marker.md), SHA-256 `c36b5fbdbee42605269bd04a54839f4b910665d32fc78f075d626b77be0da06f`.
- Estado: resposta apenas documental aos achados I15, pronta para crítica independente I16. Não declara os achados aceitos e não autoriza BUILD.

## P2-01 — deadline entre domínios de relógio

O prazo começa no ingresso HTTP e não é renovado. O runtime ancora esse instante em `CLOCK_BOOTTIME` e publica um limite UTC inferior conservador. Runtime, witness e worker avaliam bounds UTC superiores próprios contra esse mesmo limite absoluto. A latência de transporte consome o prazo; nenhum orçamento de duração é transferido entre runtime, witness e PostgreSQL.

PostgreSQL não decide se a requisição ainda está no prazo e não compara `decision_at - sampled_at` com monotônico ou UTC externo. Usa seus timestamps para A.1/A.2, ordem e high-water. Um COMMIT já iniciado pode terminar tarde e preservar o estado; `DECISION_COMMIT` tardio é não autorizante, a outbox continua sem dispatch e não há 2xx/efeito. O worker valida o limite próprio no instante de dispatch e não inicia I/O externo depois do deadline. `CLOCK_BOOTTIME` local também precisa permanecer antes do prazo para resposta ou habilitação.

A witness usa sua expiração monotônica local somente para coleta de recursos. Ela não prova por si só o deadline original nem autoriza cancelar um slot. A transição terminal requer que seu limite UTC superior alcance o deadline conservador e uma prova linearizável de ausência no head atual. Assim, o atraso de transporte não estende a validade recebida pela witness.

## P2-02 — ausência terminal após `UNKNOWN_COMMIT`

Todas as rotas serving de escrita, retry e resolução tomam primeiro o advisory xact lock exclusivo derivado de `operation_id`. Cada COMMIT serving grava, na mesma transação do marker e da intenção, uma linha imutável `COMMITTED` em `webhook_clock_operations`. A transação resolver usa `READ COMMITTED` no mesmo primary, `system_identifier`, timeline e HA epoch; depois de obter o mesmo lock, uma instrução posterior lê o resultado. Timeout, operação ativa, prepared transaction, divergência ou failover sem prova da timeline original mantêm `UNKNOWN_COMMIT`.

Somente após o deadline conservador e a leitura ausente sob essa barreira, o resolver grava e commita `SAMPLE_ABORTED_PENDING_FENCE` para o `operation_id`, ainda sob o lock. O tombstone impede retry posterior mesmo se o receipt witness ainda estiver pendente. O resolver faz readback e fence/replay desse COMMIT antes de a witness anexar `SAMPLE_ABORTED` por CAS. ACK incerto retoma o mesmo digest. Falha do observer, witness, quórum ou timeline deixa tombstone/slot/gate fechados; ausência em standby promovida não prova aborto. `max_prepared_transactions=0` é preflight obrigatório.

PostgreSQL documenta que locks advisory de transação são liberados ao terminar a transação; o resolver usa essa barreira para esperar o writer original antes do readback. [`pg_xact_status`](https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-TXID-SNAPSHOT) é evidência auxiliar, não a prova terminal: um estado ausente/inconclusivo não substitui o lock, o readback e a identidade da timeline. Configuração de prepared transactions também é bloqueada e verificada via [`pg_prepared_xacts`](https://www.postgresql.org/docs/16/view-pg-prepared-xacts.html) e [documentação de PREPARE TRANSACTION](https://www.postgresql.org/docs/16/sql-prepare-transaction.html). Referências: [locks advisory](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS).

## P3 — metadado

O cabeçalho e histórico da SPEC agora dizem que I14/I15 foram respondidos e que I16 é obrigatória. A revisão de I15 permanece `REVISE`; esta atualização apenas remove o texto stale apontado como P3.

## Registro de decisão e limites

- Decisão: manter o prazo independente dos timestamps PostgreSQL; permitir persistência tardia sem autorização de efeito; exigir tombstone SQL para finalizar aborto e impedir reuso do identificador.
- A resposta altera contrato de schema (`webhook_clock_operations`), domínio de autorização/tempo e testes requeridos. Continua T3. Uma crítica I16 deve validar o hash exato, e depois ainda será necessária nova aprovação humana explícita antes de qualquer migration 0028.
- Não foram executados testes de aplicação, SQL, migration, PostgreSQL, runtime, carga ou BUILD. Não houve uso de dados reais, push, deploy nem acesso a produção.
- O novo schema, tombstone, configuração de relógio, comportamento do worker e desempenho continuam sendo requisitos propostos, sem comprovação executável. B3/D-06/IdP/provider, integração root/PR-L04 e os demais gates 0160 continuam abertos; produção permanece `NO_GO`.
