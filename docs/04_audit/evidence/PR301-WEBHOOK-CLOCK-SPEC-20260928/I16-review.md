# I16 — crítica independente fresh-context da SPEC 0162

- Data: 29/09/2026.
- Claim: SPEC-PR301-WEBHOOK-CLOCK-I16-CRITIQUE-001, ativo.
- Candidato: `docs/02_spec/0162_webhook_clock_highwater_marker.md`, SHA-256 `c36b5fbdbee42605269bd04a54839f4b910665d32fc78f075d626b77be0da06f` antes da leitura e inalterado na checagem pré-escrita.
- I15 vinculado: review `cc0f28babe9fc0e41adb63f10253384a2c2eff8ca60f796376b63bb9cd57faab`; proof `759affe3272f52479591ba99366ef5eeccfb6287a4322165cf2a1799af078afb`; resposta `e70db220c37b647025c59e6e4cff88775309554c454dc47dc189802904271cee`; response proof `0c189b3d755d4d704382e2ebb359d421ff92b280c7e142257480bcdd533f427d`.
- Veredito: **REVISE** — 0 P0, 0 P1, 2 P2. Confiança alta na existência das lacunas documentais; média no impacto operacional.
- Método: revisão documental read-only somente do candidato e dos quatro artefatos I15 vinculados. Nenhum teste, SQL, migration, banco, runtime, carga ou BUILD foi executado.

## Achados

### P2-01 — relógio de dispatch do worker sem contrato verificável

A seção temporal define `utc_upper = utc_estimate + U_domain` a partir de fonte aprovada para runtime e witness e chama esses dois de autoridades de timeliness ([SPEC, linha 53](../../../02_spec/0162_webhook_clock_highwater_marker.md#L53)). O worker, porém, deve decidir no dispatch usando `utc_upper_worker` e iniciar I/O somente antes do deadline ([SPEC, linha 61](../../../02_spec/0162_webhook_clock_highwater_marker.md#L61)). Não está definido que o worker usa fonte aprovada, como calcula/limita `U_worker`, a frescura da amostra nem como seu estado de relógio/geração é invalidado. O `EFFECT_ENABLE` one-use restringe worker/coorte/epoch, mas não substitui uma prova temporal válida no instante do dispatch.

Se o worker usar relógio atrasado, stale ou sem bound, pode aceitar um enable antigo e iniciar I/O depois de `deadline_utc_lower`; isso deixa incompleto o fechamento documental do I15 P2-01. Definir o worker como veto local fail-closed, com fonte aprovada, bound e horizonte de erro, freshness, boot/clock-generation vinculados e recusa quando qualquer prova estiver ausente ou stale.

### P2-02 — reuso de `operation_id` após limpeza permitida

A PK e a imutabilidade de `webhook_clock_operations` impedem reuso enquanto a linha existe; a SPEC também declara que o identificador não pode ser reutilizado ([SPEC, linha 39](../../../02_spec/0162_webhook_clock_highwater_marker.md#L39), [linha 41](../../../02_spec/0162_webhook_clock_highwater_marker.md#L41)). A mesma cláusula permite limpeza depois do receipt terminal e da expiração máxima de attestations, sob política D-06. Após a remoção, a PK/tombstone já não impõe a proibição. Não há regra de emissão globalmente única nem registro witnessado durável que rejeite o identificador reapresentado. Um novo pedido com o mesmo ID pode, portanto, parecer novo ao ledger SQL.

Definir a origem/namespace e unicidade vitalícia do ID, ou manter um tombstone/digest durável que sobreviva à retenção da linha operacional; incluir o conflito pós-limpeza no critério de implementação. Até isso estar especificado, a garantia de idempotência/terminalidade só vale dentro da retenção declarada.

## Disposições I15 e demais invariantes

- **I15 P2-01 — parcial.** O candidato fixa um deadline absoluto derivado do ingresso, permite runtime/witness comparar bounds UTC conservadores, proíbe comparar relógio/elapsed PostgreSQL ao prazo e preserva COMMIT tardio sem efeito/2xx ([SPEC, linhas 51](../../../02_spec/0162_webhook_clock_highwater_marker.md#L51), [53](../../../02_spec/0162_webhook_clock_highwater_marker.md#L53), [59](../../../02_spec/0162_webhook_clock_highwater_marker.md#L59)). A checagem final do worker continua sem bound/frescura normativos (P2-01 acima).
- **I15 P2-02 — fechado documentalmente.** Retry, serving e resolver compartilham advisory xact lock por operação; o resolver faz leitura READ COMMITTED em instrução posterior no primary/system_identifier/timeline/HA epoch autorizado, mantém UNKNOWN_COMMIT em estados ambíguos e só grava tombstone após a barreira e prazo conservador ([SPEC, linhas 67](../../../02_spec/0162_webhook_clock_highwater_marker.md#L67), [69](../../../02_spec/0162_webhook_clock_highwater_marker.md#L69), [71](../../../02_spec/0162_webhook_clock_highwater_marker.md#L71)). Readback, fence WAL, replay e receipt precedem conclusão witnessada; `max_prepared_transactions=0` é preflight obrigatório ([linhas 79](../../../02_spec/0162_webhook_clock_highwater_marker.md#L79), [95](../../../02_spec/0162_webhook_clock_highwater_marker.md#L95)).
- **I15 P3 — fechado.** Cabeçalho e histórico identificam I15 respondido e I16 requerido; não encontrei o estado stale I14_REQUIRED apontado em I15 ([SPEC, linhas 5](../../../02_spec/0162_webhook_clock_highwater_marker.md#L5), [204](../../../02_spec/0162_webhook_clock_highwater_marker.md#L204)).
- **Clock generation/step — descrito, execução não verificada.** Step planejado fecha ingress, revoga/fence leases, drena, incrementa generation witnessada e requer novas amostras/reconciliação; step inesperado fecha gate e invalida attestations antigos ([SPEC, linha 55](../../../02_spec/0162_webhook_clock_highwater_marker.md#L55)).
- **Imutabilidade, retry e HA — descritos, com limite de retenção acima.** COMMITTED e tombstone são append-only e mutuamente exclusivos; o resolver mantém UNKNOWN_COMMIT diante de backend ativo, prepared tx, failover ou identidade/timeline ambíguos. A linha não prova implementação ou durabilidade real.

## Limitações e gate

Esta é crítica documental. Configuração real de relógio, exclusão de `CAP_SYS_TIME`, comparação de geração, advisory locks, semântica de snapshots, fencing de HA, readback/WAL/replay e bloqueio de prepared transactions não foram executados nem observados. Carga permanece não medida. I15-response-proof registra as correções documentais; não é prova executável. Aprovação humana T3 para este SHA continua ausente; migration 0028/BUILD não autorizados e produção `NO_GO`.
