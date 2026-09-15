# AAA-03 revisão 2 — parecer adicional — agent-3

- Veredicto: `APPROVE` (escopo: hash `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7` do contrato `docs/02_spec/aaa_execution_contract.md`).
- Revisor: `agent-3`; não é autor do contrato. Parecer anterior (`db75899f…`, revisão 1) preservado e superado por bytes novos; não se transfere.
- Pedido: `docs/04_audit/evidence/AAA/AAA-03/review-request-v2.md`.

## Condições fechadas

| Condição (revisão 1)                              | Onde                                     | Resultado |
| ------------------------------------------------- | ---------------------------------------- | --------- |
| `AAA03-R3-F01` identidade runtime × canal         | §2.1 R-ID-1..6, §8.1 E-1..E-7, T-17/T-20 | FECHADA   |
| `AAA03-R3-F02` `verifyAndConsume` fora do runtime | §4, T-16                                 | FECHADA   |
| `AAA03-R3-F03` sweep de reservas                  | §4, T-18                                 | FECHADA   |
| `Q1` orçamento por turno                          | §9                                       | FECHADA   |
| `Q2` negação de adapter real                      | §10 `effectScope`, T-19                  | FECHADA   |
| `Q4` migração do caminho governado                | §4, T-16                                 | FECHADA   |
| `Q5` TTL parametrizado/injetável + prova PG       | §4, T-18, AAA-16                         | FECHADA   |

## Tentativas de refutação (5 desafios do pedido)

1. **Efeito antes de reserva/aprovação?** Não. Ordem normativa §5.2: revalidação de policy → `approval.reserve` (CAS) → `journal.reserve` → `markExecuting` → `markEffectStarted` → ferramenta. Nenhum caminho alternativo encontrado.
2. **`operationKey ↔ idempotencyKey` preserva replay e rejeita colisão?** Sim: R-ID-1 fixa `idempotencyKey := operationKey` para o emissor governado; R-ID-3/R-ID-4 definem hash divergente como `idempotency_key_reuse` nos dois boundaries; E-5/E-7 cobrem envio e reentrega. Observação P3: a normalização de `<capability>.executed` precisa ser canônica no BUILD para não criar namespace distinto por alias.
3. **Limites param antes da próxima etapa?** Sim: §9 com semântica por turno explícita; deadline/cancelamento/descarte tardio definidos; T-09/T-10/T-11 são executáveis.
4. **Draft separado de real?** Sim: §10 valida capability × `resource.type`; confirmação/remarcação sem grant; `effectScope` nega `real_authorized` sem autorização e T-12/T-13/T-19 cobrem.
5. **Item da revisão 1 apenas declarado?** Não. Cada condição tem teste de aceitação identificado (T-16..T-20). Permanece apenas a prova executável, que pertence ao BUILD das tasks donas.

## Observações não bloqueantes

- `AAA03-R3-OBS1` (P3): T-18 exige que o sweep nunca execute efeito; o teste deve provar também concorrência entre sweep e turno ativo (fencing).
- `AAA03-R3-OBS2` (P3): T-20 deve incluir colisão de namespace com a mesma `operationKey` em capability diferente.

## Limitações

- Revisão estática de prosa; nenhum schema executável existe ainda.
- `APPROVE` expira se os bytes do contrato mudarem; o hash desta revisão está acima.
- Não é signoff humano nem autoriza BUILD/produção.
