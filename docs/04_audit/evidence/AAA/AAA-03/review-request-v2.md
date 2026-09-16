# AAA-03 revisão 2 — pedido de revisão final (Agente 3)

- Contrato: `docs/02_spec/aaa_execution_contract.md`
- Hash desta revisão: `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7`
- Revisão anterior: `db75899f…` (parecer `AAA-03-REVIEW-AGENT-3`, APPROVE com condições). O parecer **não** se transfere automaticamente para o novo hash.
- Contraparte reconciliada: `aaa_data_api_contract.md` (AAA-05, Agente 2), observado em `200c2bc3…`; nenhum dos dois documentos foi editado pelo revisor.

## Condições e onde foram fechadas

| Condição                                          | Onde                                          |
| ------------------------------------------------- | --------------------------------------------- |
| `AAA03-R3-F01` identidade runtime × canal         | §2.1 R-ID-1..R-ID-6; §8.1 E-1..E-7; T-17/T-20 |
| `AAA03-R3-F02` `verifyAndConsume` fora do runtime | §4; T-16                                      |
| `AAA03-R3-F03` sweep de reservas                  | §4; T-18                                      |
| `Q1` orçamento por turno                          | §9                                            |
| `Q2` negação de adapter real                      | §10; T-19                                     |
| `Q4` migração do caminho governado                | §4; T-16                                      |
| `Q5` TTL parametrizado/injetável + prova PG       | §4; T-18; AAA-16                              |

## O que o revisor deve tentar refutar

1. Alguma rota permite efeito antes de `journal.reserve` ou de aprovação confirmada?
2. O mapeamento `operationKey ↔ idempotencyKey` preserva replay e rejeita colisão nos dois boundaries?
3. `maxSteps=1`, deadline, cancelamento e resposta tardia param antes da etapa seguinte?
4. Draft continua separado de confirmação/remarcação real e nenhum adapter real é composto sem AAA-21?
5. Algum item da revisão 1 ficou sem fechamento ou foi apenas "declarado"?

## Regras

- Não editar o contrato; apontar achados com severidade e `closeWith`.
- Veredicto por hash (`APPROVE` / `APPROVE_WITH_CONDITIONS` / `REJECT` / `BLOCKED`), sem autorizar BUILD ou produção.
- Se houver mudança de bytes, o hash muda e nova revisão é necessária.
